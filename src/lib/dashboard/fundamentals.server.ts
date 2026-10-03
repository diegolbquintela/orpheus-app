/**
 * Fundamentals ingest (spec §5, §7, §8; ticket T08 #16). Server-only.
 *
 * - `FundamentalsSource` is the one adapter a paid source could replace later (spec §7 "Recommendation").
 *   `createSecFundamentalsSource()` implements it with SEC EDGAR: the ticker map
 *   `https://www.sec.gov/files/company_tickers_exchange.json` and
 *   `https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json`.
 * - SEC fair access: every request carries `User-Agent: OrpheusWisdom/1.0 (orpheus-app dashboard;
 *   <SEC_CONTACT_EMAIL>)`. The contact address comes only from the owner-set env var
 *   `SEC_CONTACT_EMAIL` (no address in the repo); without it the job makes no SEC request at all and says
 *   so in its summary (the SEC refuses requests without a declared contact). Requests are spaced at
 *   least 200 ms apart (≤ 5 per second, half the SEC's 10/s).
 * - Coverage (§7): a US listing matches the SEC ticker directly. A CA or EU listing (e.g. `RY.TO`) is
 *   matched by stripping the venue suffix (`RY`) and confirming the company name against the SEC
 *   filer's name; no ticker or a different name (e.g. `MC.PA` vs Moelis & Co) = **not covered**, which
 *   is a normal outcome, not an error. A filer with no companyfacts (HTTP 404) is not covered either.
 * - `refreshFundamentals()` runs in the daily job (cron, preview button) and the new-holding backfill,
 *   only for held symbols never checked or checked more than 7 days ago. Annual facts go to
 *   `fundamentals_annual` (one row per symbol, fiscal year end and concept; tag changes are stitched by
 *   taking, per year, the most recently filed fact among the concept's tags). Not-covered symbols get
 *   `metric_values` rows with status `not_covered` for every metric (DASH-21). A failure for one symbol
 *   is recorded in `instruments.fundamentals_error` and the run carries on.
 * - Pages never call this module's fetchers; they read `metricViews()` (Postgres only).
 */
import { computeStoredMetrics, symbolsMissingMetrics } from "./metric-compute.server.ts";
import { METRIC_KEYS } from "./metrics.ts";
import type { Queryable } from "./store.server.ts";

// ------------------------------------------------------------------ adapter

export type AnnualFact = {
  fiscalYearEnd: string;
  concept: string;
  value: string;
  unit: string;
  sourceTag: string;
  accession: string | null;
  filed: string | null;
};

export type ListingForCoverage = { symbol: string; region: "US" | "EU" | "CA"; name: string | null };

export interface FundamentalsSource {
  /** "sec" (stored in instruments.fundamentals_source). */
  id: "sec";
  /** The source's company id for a listing, or null when the source doesn't cover it. */
  resolve(listing: ListingForCoverage): Promise<{ id: string; name: string } | null>;
  /** Annual facts for a covered company; null when the source has no facts for it (not covered). */
  annualFacts(id: string): Promise<AnnualFact[] | null>;
  /** The filer's SIC code (T10), or null when unknown. */
  sic?(id: string): Promise<number | null>;
}

// ------------------------------------------------------------------ SEC EDGAR

export const SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers_exchange.json";
export const SEC_FACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts";
/** Filer profile (T10: the SIC code, for the bank/insurer rule of ROIC). */
export const SEC_SUBMISSIONS_URL = "https://data.sec.gov/submissions";
/** Spacing between SEC requests: ≤ 5 per second. */
export const SEC_MIN_INTERVAL_MS = 200;
/** A symbol's facts are refreshed when older than this (spec §7). */
export const FUNDAMENTALS_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const EMAIL = /^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+$/;

/** The SEC User-Agent from the owner-set contact; null when the contact is missing or not an address. */
export function secUserAgent(env: Record<string, string | undefined> = process.env): string | null {
  const contact = (env.SEC_CONTACT_EMAIL ?? "").trim();
  return EMAIL.test(contact) ? `OrpheusWisdom/1.0 (orpheus-app dashboard; ${contact})` : null;
}

/** HTTP status from the SEC (404 = no data for that company). */
export class SecHttpError extends Error {
  status: number;
  constructor(status: number, url: string) {
    super(`SEC request failed (HTTP ${status}) for ${url.replace(/^https:\/\/[^/]+/, "")}`);
    this.name = "SecHttpError";
    this.status = status;
  }
}

export type SecGet = (url: string, headers: Record<string, string>) => Promise<{ status: number; text: string }>;

const liveGet: SecGet = async (url, headers) => {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  return { status: res.status, text: res.status === 200 ? await res.text() : "" };
};

/** Concept → XBRL tags (spec §8 fixed lists). Earlier tags win a tie on the same filing. */
/**
 * Version of the concept list / parser. Stored per instrument (`fundamentals_parser_version`, 0007); a
 * covered symbol stored by an older version is refetched regardless of the 7-day window, and metrics that
 * need newer concepts are not computed from its rows until then (T10 QA F2).
 * 1 = T08 (null in the database). 2 = T10: lease-inclusive debt fallbacks, debt tags ranked before filing date.
 */
export const FUNDAMENTALS_PARSER_VERSION = 2;

/** `rankFirst`: the tag order beats the filing date (T10 F1: fallback-only tags never replace a primary tag). */
export const CONCEPTS: Record<string, { kind: "duration" | "instant"; tags: string[]; rankFirst?: boolean }> = {
  revenue: {
    kind: "duration",
    tags: [
      "us-gaap:Revenues",
      "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax",
      "us-gaap:RevenueFromContractWithCustomerIncludingAssessedTax",
      "us-gaap:SalesRevenueNet",
      "us-gaap:SalesRevenueGoodsNet",
      "ifrs-full:Revenue",
      "ifrs-full:RevenueFromContractsWithCustomers",
    ],
  },
  cost_of_revenue: {
    kind: "duration",
    tags: ["us-gaap:CostOfRevenue", "us-gaap:CostOfGoodsAndServicesSold", "us-gaap:CostOfGoodsSold", "ifrs-full:CostOfSales"],
  },
  gross_profit: { kind: "duration", tags: ["us-gaap:GrossProfit", "ifrs-full:GrossProfit"] },
  operating_income: { kind: "duration", tags: ["us-gaap:OperatingIncomeLoss", "ifrs-full:ProfitLossFromOperatingActivities"] },
  pretax_income: {
    kind: "duration",
    tags: [
      "us-gaap:IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
      "us-gaap:IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
      "ifrs-full:ProfitLossBeforeTax",
    ],
  },
  income_tax: { kind: "duration", tags: ["us-gaap:IncomeTaxExpenseBenefit", "ifrs-full:IncomeTaxExpenseContinuingOperations"] },
  eps_diluted: { kind: "duration", tags: ["us-gaap:EarningsPerShareDiluted", "ifrs-full:DilutedEarningsLossPerShare"] },
  equity_incl_nci: {
    kind: "instant",
    tags: ["us-gaap:StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest", "ifrs-full:Equity"],
  },
  equity_parent: { kind: "instant", tags: ["us-gaap:StockholdersEquity", "ifrs-full:EquityAttributableToOwnersOfParent"] },
  short_term_borrowings: { kind: "instant", tags: ["us-gaap:ShortTermBorrowings", "ifrs-full:ShorttermBorrowings"] },
  commercial_paper: { kind: "instant", tags: ["us-gaap:CommercialPaper"] },
  other_short_term_borrowings: { kind: "instant", tags: ["us-gaap:OtherShortTermBorrowings"] },
  // T10: the *AndCapitalLeaseObligations* tags are fallbacks for filers (e.g. KO since FY2024) that tag
  // their balance-sheet debt lines only that way; they include finance leases (operating leases are never used).
  long_term_debt_current: {
    kind: "instant",
    rankFirst: true,
    tags: ["us-gaap:LongTermDebtCurrent", "ifrs-full:CurrentPortionOfLongtermBorrowings", "us-gaap:LongTermDebtAndCapitalLeaseObligationsCurrent"],
  },
  long_term_debt_noncurrent: {
    kind: "instant",
    rankFirst: true,
    tags: ["us-gaap:LongTermDebtNoncurrent", "ifrs-full:LongtermBorrowings", "us-gaap:LongTermDebtAndCapitalLeaseObligations"],
  },
  long_term_debt: {
    kind: "instant",
    rankFirst: true,
    tags: ["us-gaap:LongTermDebt", "us-gaap:LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities"],
  },
  current_borrowings_total: { kind: "instant", tags: ["ifrs-full:CurrentBorrowingsAndCurrentPortionOfNoncurrentBorrowings"] },
  cash: { kind: "instant", tags: ["us-gaap:CashAndCashEquivalentsAtCarryingValue", "ifrs-full:CashAndCashEquivalents"] },
};

const ANNUAL_FORMS = new Set(["10-K", "10-K/A", "20-F", "20-F/A", "40-F", "40-F/A", "10-KT"]);

type Fact = { start?: string; end: string; val: number; accn?: string; fy?: number; fp?: string; form?: string; filed?: string };
type CompanyFacts = { facts?: Record<string, Record<string, { units?: Record<string, Fact[]> }>> };

const days = (a: string, b: string) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000;

/**
 * Annual facts from a companyfacts document (pure; tests use recorded files).
 * - Annual = from a 10-K/20-F/40-F (or amendment) with fp "FY". Durations must span 365 ± 30 days
 *   (SEC frames convention, §8); instants count only on a fiscal year end seen in those durations.
 * - One unit per concept: the unit of the concept's latest fiscal year.
 * - Per (concept, fiscal year end): the most recently filed fact among the concept's tags (this stitches
 *   tag changes, e.g. KO's SalesRevenueGoodsNet → Revenues); ties go to the earlier tag in the list.
 *   For `rankFirst` concepts (debt) the tag order decides first and the filing date only breaks ties, so a
 *   lease-inclusive fallback tag is used for a fiscal year end only when no primary tag exists for it.
 */
export function annualFactsFromCompanyFacts(doc: CompanyFacts): AnnualFact[] {
  type Cand = Fact & { tag: string; unit: string; rank: number };
  const byConcept = new Map<string, Cand[]>();
  for (const [concept, def] of Object.entries(CONCEPTS)) {
    const cands: Cand[] = [];
    def.tags.forEach((qualified, rank) => {
      const [tax, tag] = qualified.split(":");
      const units = doc.facts?.[tax]?.[tag]?.units ?? {};
      for (const [unit, facts] of Object.entries(units))
        for (const f of facts) {
          if (!ANNUAL_FORMS.has(f.form ?? "") || f.fp !== "FY" || typeof f.val !== "number" || !f.end) continue;
          if (def.kind === "duration") {
            if (!f.start) continue;
            const span = days(f.start, f.end);
            if (span < 335 || span > 395) continue;
          } else if (f.start) continue;
          cands.push({ ...f, tag: qualified, unit, rank });
        }
    });
    byConcept.set(concept, cands);
  }
  const fiscalYearEnds = new Set<string>();
  for (const [concept, cands] of byConcept)
    if (CONCEPTS[concept].kind === "duration") for (const c of cands) fiscalYearEnds.add(c.end);

  const out: AnnualFact[] = [];
  for (const [concept, all] of byConcept) {
    const cands = CONCEPTS[concept].kind === "instant" ? all.filter((c) => fiscalYearEnds.has(c.end)) : all;
    if (!cands.length) continue;
    const latest = cands.reduce((a, b) => (b.end > a.end || (b.end === a.end && (b.filed ?? "") > (a.filed ?? "")) ? b : a));
    const best = new Map<string, Cand>();
    const rankFirst = CONCEPTS[concept].rankFirst === true;
    for (const c of cands) {
      if (c.unit !== latest.unit) continue;
      const cur = best.get(c.end);
      const byFiled = (c.filed ?? "").localeCompare(cur?.filed ?? "");
      const byRank = cur ? cur.rank - c.rank : 0; // > 0: c's tag comes earlier in the list
      const byAccn = (c.accn ?? "").localeCompare(cur?.accn ?? "");
      const better = !cur
        ? true
        : rankFirst
          ? byRank > 0 || (byRank === 0 && (byFiled > 0 || (byFiled === 0 && byAccn > 0)))
          : byFiled > 0 || (byFiled === 0 && (byRank > 0 || (byRank === 0 && byAccn > 0)));
      if (better) best.set(c.end, c);
    }
    for (const c of [...best.values()].sort((a, b) => a.end.localeCompare(b.end)))
      out.push({
        fiscalYearEnd: c.end,
        concept,
        value: String(c.val),
        unit: c.unit,
        sourceTag: c.tag,
        accession: c.accn ?? null,
        filed: c.filed ?? null,
      });
  }
  return out;
}

// Words that differ between a listing's name and the SEC filer name without changing the company.
const NAME_NOISE = new Set([
  "the", "inc", "incorporated", "corp", "corporation", "co", "company", "companies", "ltd", "limited", "plc",
  "nv", "sa", "se", "ag", "asa", "ab", "spa", "oyj", "sca", "as", "a", "s", "n", "v", "holding", "holdings",
  "group", "of", "and", "de", "the", "llc", "lp", "trust", "publ", "kgaa", "bhd", "co",
]);

/** Company name tokens for comparison: accents, punctuation, "/ON/"-style state tags and legal words removed. */
export function nameTokens(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\/[a-z]{2,3}\//g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t && !NAME_NOISE.has(t));
}

/** Same company? Equal tokens, or one token list starting with the other when it has 2+ tokens. */
export function sameCompany(a: string, b: string): boolean {
  const x = nameTokens(a);
  const y = nameTokens(b);
  if (!x.length || !y.length) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length === long.length) return short.every((t, i) => t === long[i]);
  return short.length >= 2 && short.every((t, i) => t === long[i]);
}

/** The SEC ticker to try for a listing: US as is; CA/EU without the venue suffix (RY.TO → RY). */
export function secTickerFor(symbol: string, region: ListingForCoverage["region"]): string {
  return region === "US" ? symbol : symbol.replace(/\.[A-Z]{1,4}$/, "");
}

export type SecSourceOptions = {
  userAgent: string;
  get?: SecGet;
  minIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

export function createSecFundamentalsSource(options: SecSourceOptions): FundamentalsSource & { requests: () => number } {
  const get = options.get ?? liveGet;
  const gap = options.minIntervalMs ?? SEC_MIN_INTERVAL_MS;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = options.now ?? (() => Date.now());
  let last = -Infinity;
  let count = 0;
  let tickers: Promise<Map<string, { cik: number; name: string }>> | null = null;

  async function request(url: string): Promise<string> {
    const wait = last + gap - now();
    if (wait > 0) await sleep(wait);
    last = now();
    count += 1;
    let res: { status: number; text: string };
    try {
      res = await get(url, { "User-Agent": options.userAgent, Accept: "application/json" });
    } catch {
      throw new Error(`SEC request failed (network) for ${url.replace(/^https:\/\/[^/]+/, "")}`);
    }
    if (res.status !== 200) throw new SecHttpError(res.status, url);
    return res.text;
  }

  function tickerMap() {
    tickers ??= request(SEC_TICKERS_URL).then((text) => {
      const doc = JSON.parse(text) as { fields: string[]; data: unknown[][] };
      const iCik = doc.fields.indexOf("cik");
      const iName = doc.fields.indexOf("name");
      const iTicker = doc.fields.indexOf("ticker");
      const map = new Map<string, { cik: number; name: string }>();
      for (const row of doc.data) {
        const t = String(row[iTicker] ?? "").toUpperCase();
        if (t && !map.has(t)) map.set(t, { cik: Number(row[iCik]), name: String(row[iName] ?? "") });
      }
      return map;
    });
    tickers.catch(() => (tickers = null)); // a failed download is retried by the next caller
    return tickers;
  }

  return {
    id: "sec",
    requests: () => count,
    async resolve(listing) {
      const hit = (await tickerMap()).get(secTickerFor(listing.symbol, listing.region));
      if (!hit) return null;
      if (listing.region !== "US" && !(listing.name && sameCompany(listing.name, hit.name))) return null;
      return { id: String(hit.cik).padStart(10, "0"), name: hit.name };
    },
    async sic(id) {
      try {
        const doc = JSON.parse(await request(`${SEC_SUBMISSIONS_URL}/CIK${id}.json`)) as { sic?: string | number };
        const sic = Number(doc.sic);
        return Number.isInteger(sic) && sic > 0 ? sic : null;
      } catch (err) {
        if (err instanceof SecHttpError && err.status === 404) return null;
        throw err;
      }
    },
    async annualFacts(id) {
      try {
        return annualFactsFromCompanyFacts(JSON.parse(await request(`${SEC_FACTS_URL}/CIK${id}.json`)) as CompanyFacts);
      } catch (err) {
        if (err instanceof SecHttpError && err.status === 404) return null;
        throw err;
      }
    },
  };
}

/** The live SEC source, or null when SEC_CONTACT_EMAIL isn't set (then no SEC request is made). */
export function secSourceFromEnv(env: Record<string, string | undefined> = process.env): FundamentalsSource | null {
  const userAgent = secUserAgent(env);
  return userAgent ? createSecFundamentalsSource({ userAgent }) : null;
}

// ------------------------------------------------------------------ the job

export type FundamentalsSummary = {
  /** Why nothing was fetched (no SEC contact configured); absent when the source ran. */
  skipped?: string;
  checked: number;
  covered: number;
  notCovered: number;
  rows: number;
  /** Held symbols with no instruments row yet (their listing comes with the price backfill). */
  waiting: number;
  deferred: number;
  /** Symbols whose metric values (T09+) were computed from stored facts in this call. */
  computed: number;
  errors: { symbol: string; error: string }[];
};

export type FundamentalsOptions = {
  nowMs?: number;
  /** Only these symbols (the new-holding backfill). */
  only?: string[];
  maxSymbols?: number;
  /** Stop starting new symbols after this many ms. */
  timeBudgetMs?: number;
  now?: () => number;
};

const message = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 300);

/**
 * Replace a symbol's `fundamentals_annual` rows with `facts` in ONE SQL statement (so it is atomic on
 * every driver, including the pooled Neon client where BEGIN/COMMIT could land on different connections):
 * upsert the new rows and delete the symbol's rows that are not in the new set. If any value fails, the
 * statement fails and the old rows stay exactly as they were (T10 QA).
 */
export async function replaceFundamentals(db: Queryable, symbol: string, facts: AnnualFact[]): Promise<void> {
  const rows = facts.map((f) => ({
    fye: f.fiscalYearEnd,
    concept: f.concept,
    value: f.value,
    unit: f.unit,
    source_tag: f.sourceTag,
    accession: f.accession,
    filed: f.filed,
  }));
  await db.query(
    `WITH input AS (
       SELECT * FROM jsonb_to_recordset($2::jsonb)
         AS x(fye date, concept text, value numeric, unit text, source_tag text, accession text, filed date)
     ), dropped AS (
       DELETE FROM fundamentals_annual f WHERE f.symbol = $1
         AND NOT EXISTS (SELECT 1 FROM input i WHERE i.fye = f.fiscal_year_end AND i.concept = f.concept)
     )
     INSERT INTO fundamentals_annual (symbol, fiscal_year_end, concept, value, unit, source_tag, accession, filed)
     SELECT $1, fye, concept, value, unit, source_tag, accession, filed FROM input
     ON CONFLICT (symbol, fiscal_year_end, concept) DO UPDATE SET value = EXCLUDED.value, unit = EXCLUDED.unit,
       source_tag = EXCLUDED.source_tag, accession = EXCLUDED.accession, filed = EXCLUDED.filed`,
    [symbol, JSON.stringify(rows)],
  );
}

/** Store facts for held symbols that are unchecked or older than 7 days. Never throws. */
export async function refreshFundamentals(
  db: Queryable,
  source: FundamentalsSource | null,
  options: FundamentalsOptions = {},
): Promise<FundamentalsSummary> {
  const now = options.now ?? (() => Date.now());
  const nowMs = options.nowMs ?? now();
  const started = now();
  const summary: FundamentalsSummary = { checked: 0, covered: 0, notCovered: 0, rows: 0, waiting: 0, deferred: 0, computed: 0, errors: [] };
  try {
    const held = await db.query<{
      symbol: string;
      region: "US" | "EU" | "CA" | null;
      name: string | null;
      checked: string | null;
      source: string | null;
      parser: number | null;
    }>(
      `SELECT h.symbol, i.region, i.name, i.fundamentals_checked_at::text AS checked,
         i.fundamentals_source AS source, i.fundamentals_parser_version AS parser
       FROM (SELECT DISTINCT symbol FROM holdings) h LEFT JOIN instruments i ON i.symbol = h.symbol
       WHERE ($1::text[] IS NULL OR h.symbol = ANY($1::text[]))
       ORDER BY i.fundamentals_checked_at ASC NULLS FIRST, h.symbol`,
      [options.only ?? null],
    );
    const due = held.filter((h) => {
      if (!h.region) {
        summary.waiting += 1;
        return false;
      }
      // Covered symbols stored by an older parser are refetched now (T10 QA F2), not after 7 days.
      const stale = h.source === "sec" && (h.parser ?? 1) < FUNDAMENTALS_PARSER_VERSION;
      return h.checked === null || stale || nowMs - Date.parse(h.checked) >= FUNDAMENTALS_MAX_AGE_MS;
    });
    // T09+: covered symbols stored before their metrics existed get them now (Postgres only, no SEC call).
    for (const symbol of await symbolsMissingMetrics(db)) {
      if (options.only && !options.only.includes(symbol)) continue;
      try {
        await computeStoredMetrics(db, symbol);
        summary.computed += 1;
      } catch (err) {
        summary.errors.push({ symbol, error: message(err) });
      }
    }
    if (!source) {
      if (due.length) summary.skipped = "SEC_CONTACT_EMAIL is not set; no SEC request made.";
      return summary;
    }
    const max = options.maxSymbols ?? 25;
    for (const [i, h] of due.entries()) {
      if (i >= max || now() - started > (options.timeBudgetMs ?? 60_000)) {
        summary.deferred += 1;
        continue;
      }
      try {
        const hit = await source.resolve({ symbol: h.symbol, region: h.region as "US" | "EU" | "CA", name: h.name });
        const facts = hit ? await source.annualFacts(hit.id) : null;
        const at = new Date(nowMs).toISOString();
        if (!hit || !facts) {
          await db.query(
            `UPDATE instruments SET fundamentals_source = 'none', sec_cik = NULL, fundamentals_checked_at = $2,
               fundamentals_error = NULL, fundamentals_parser_version = $3 WHERE symbol = $1`,
            [h.symbol, at, FUNDAMENTALS_PARSER_VERSION],
          );
          await db.query(
            `INSERT INTO metric_values (symbol, metric_key, value, status, fiscal_year_end, computed_at)
             SELECT $1, k, NULL, 'not_covered', NULL, $3 FROM unnest($2::text[]) AS k
             ON CONFLICT (symbol, metric_key) DO UPDATE SET value = NULL, status = 'not_covered',
               fiscal_year_end = NULL, computed_at = EXCLUDED.computed_at`,
            [h.symbol, METRIC_KEYS, at],
          );
          summary.notCovered += 1;
        } else {
          // Replace, not merge, in one statement (atomic): rows from an older parser must not survive,
          // and an interrupted refetch must never leave a partial set for the metrics to read.
          await replaceFundamentals(db, h.symbol, facts);
          // SIC (T10, ROIC's bank/insurer rule). A failed profile request keeps the stored code.
          let sic: number | null | undefined;
          try {
            sic = source.sic ? await source.sic(hit.id) : undefined;
          } catch {
            sic = undefined;
          }
          await db.query(
            `UPDATE instruments SET fundamentals_source = 'sec', sec_cik = $2, fundamentals_checked_at = $3,
               fundamentals_error = NULL, sic = CASE WHEN $4::boolean THEN $5::int ELSE sic END,
               fundamentals_parser_version = $6 WHERE symbol = $1`,
            [h.symbol, hit.id, at, sic !== undefined, sic ?? null, FUNDAMENTALS_PARSER_VERSION],
          );
          await db.query("DELETE FROM metric_values WHERE symbol = $1 AND status = 'not_covered'", [h.symbol]);
          await computeStoredMetrics(db, h.symbol);
          summary.computed += 1;
          summary.covered += 1;
          summary.rows += facts.length;
        }
        summary.checked += 1;
      } catch (err) {
        const error = message(err);
        summary.errors.push({ symbol: h.symbol, error });
        await db.query("UPDATE instruments SET fundamentals_error = $2 WHERE symbol = $1", [h.symbol, error]);
      }
    }
  } catch (err) {
    summary.errors.push({ symbol: "*", error: message(err) });
  }
  return summary;
}

// ------------------------------------------------------------------ page reads (Postgres only)

export type MetricCell = { value: string | null; status: string; fiscalYearEnd: string | null };
export type MetricView = { coverage: "covered" | "not_covered" | "pending"; metrics: Record<string, MetricCell> };

/** Coverage and stored metric values for the page's symbols (DASH-21). Reads Postgres only. */
export async function metricViews(db: Queryable, symbols: string[]): Promise<Record<string, MetricView>> {
  if (!symbols.length) return {};
  const inst = await db.query<{ symbol: string; source: string | null; checked: string | null }>(
    `SELECT s.symbol, i.fundamentals_source AS source, i.fundamentals_checked_at::text AS checked
     FROM unnest($1::text[]) AS s(symbol) LEFT JOIN instruments i ON i.symbol = s.symbol`,
    [symbols],
  );
  const out: Record<string, MetricView> = {};
  for (const r of inst)
    out[r.symbol] = {
      coverage: r.checked === null ? "pending" : r.source === "sec" ? "covered" : "not_covered",
      metrics: {},
    };
  const vals = await db.query<{ symbol: string; metric_key: string; value: string | null; status: string; fye: string | null }>(
    `SELECT symbol, metric_key, value::text AS value, status, fiscal_year_end::text AS fye
     FROM metric_values WHERE symbol = ANY($1::text[])`,
    [symbols],
  );
  for (const v of vals)
    if (out[v.symbol]) out[v.symbol].metrics[v.metric_key] = { value: v.value, status: v.status, fiscalYearEnd: v.fye };
  return out;
}
