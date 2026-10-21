/**
 * #123 EU fundamentals from ESEF xBRL-JSON at filings.xbrl.org (attachments/dashboard-esef-fundamentals-design.md).
 * Server-only; runs in the daily job / new-holding backfill through `refreshFundamentals()`, never from a page.
 *
 * - Ticker → LEI: `PINNED_LEI` first, then GLEIF (legal-name completion, accepted only on the same company and the
 *   venue's country).
 * - Filings: `/api/entities/<LEI>/filings`, the newest document per fiscal year (≤ 6), xBRL-JSON.
 * - N6 rules: the fiscal year comes from the facts (latest duration end), never from the index's `period_end`; per
 *   (concept, fiscal year end) the newest filing wins; a missing concept is absent (`n/m` on the page).
 * - Free, no key: a polite User-Agent and ≥ 1 s between requests to a host.
 */
import { type AnnualFact, CONCEPTS, type FundamentalsSource, type ListingForCoverage, sameCompany } from "./fundamentals.server.ts";

export const ESEF_BASE = "https://filings.xbrl.org";
export const GLEIF_BASE = "https://api.gleif.org/api/v1";
export const ESEF_USER_AGENT = "OrpheusWisdom/1.0 (orpheus-app dashboard; +https://github.com/diegolbquintela/orpheus-app)";
export const ESEF_MIN_INTERVAL_MS = 1000;
export const ESEF_MAX_DOCUMENTS = 6;

/** Pinned ticker → LEI (wins over GLEIF). */
export const PINNED_LEI: Record<string, { lei: string; name: string }> = {
  "RMS.PA": { lei: "969500Y4IJGHJE2MTJ13", name: "HERMES INTERNATIONAL" },
};

/** Venue suffix → ISO country of the legal address (ESEF issuers). */
export const VENUE_COUNTRY: Record<string, string> = {
  PA: "FR", AS: "NL", DE: "DE", F: "DE", MI: "IT", MC: "ES", BR: "BE", LS: "PT", HE: "FI", ST: "SE", CO: "DK", IR: "IE", VI: "AT", OL: "NO",
};
export const venueCountry = (symbol: string): string | null => VENUE_COUNTRY[symbol.split(".").at(-1) ?? ""] ?? null;

// ------------------------------------------------------------------ parse (pure)

type XFact = { value: string; dimensions: Record<string, string> };
export type XbrlJson = { facts: Record<string, XFact> };
export type EsefDocument = { url: string; processed: string; doc: XbrlJson };

const CORE_DIMS = new Set(["concept", "entity", "period", "unit", "language"]);
const dayBefore = (iso: string) => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};
const days = (a: string, b: string) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000;
const unitOf = (u: string | undefined) => (u ?? "").replace(/iso4217:/g, "").replace(/xbrli:/g, "");

/** Q-E1: the source tag stored for diluted shares derived as net income ÷ diluted EPS. */
export const DERIVED_SHARES_TAG = "derived:net_income/eps_diluted";

/** Q-E5: ESEF-only fallback tags (last in their concept), e.g. Hermès tags only the broad IFRS purchase line. */
export const ESEF_EXTRA_TAGS: Record<string, string[]> = {
  capex: ["ifrs-full:PurchaseOfPropertyPlantAndEquipmentIntangibleAssetsOtherThanGoodwillInvestmentPropertyAndOtherNoncurrentAssets"],
};

type Row = { concept: string; tag: string; rank: number; end: string; value: number; unit: string; kind: "duration" | "instant" };

/** Non-dimensional, mapped facts of one document (period ends converted from end-exclusive). */
export function esefRows(doc: XbrlJson): Row[] {
  const byTag = new Map<string, { concept: string; rank: number; kind: "duration" | "instant" }>();
  for (const [concept, def] of Object.entries(CONCEPTS)) [...def.tags, ...(ESEF_EXTRA_TAGS[concept] ?? [])].forEach((t, rank) => t.startsWith("ifrs-full:") && byTag.set(t, { concept, rank, kind: def.kind }));
  const rows: Row[] = [];
  for (const f of Object.values(doc.facts ?? {})) {
    const d = f.dimensions ?? {};
    const hit = byTag.get(d.concept ?? "");
    if (!hit || Object.keys(d).some((k) => !CORE_DIMS.has(k)) || !d.period) continue;
    const value = Number(f.value);
    if (!Number.isFinite(value)) continue;
    const [a, b] = d.period.split("/");
    if (hit.kind === "duration") {
      if (!b) continue;
      const span = days(a.slice(0, 10), b.slice(0, 10));
      if (span < 335 || span > 396) continue;
      rows.push({ ...hit, tag: d.concept, end: dayBefore(b), value, unit: unitOf(d.unit) });
    } else {
      if (b) continue;
      rows.push({ ...hit, tag: d.concept, end: dayBefore(a), value, unit: unitOf(d.unit) });
    }
  }
  return rows;
}

/** A document's own fiscal year end: the latest duration end among its facts (N6), or null. */
export function ownFiscalYearEnd(rows: Row[]): string | null {
  return rows.filter((r) => r.kind === "duration").reduce<string | null>((m, r) => (m === null || r.end > m ? r.end : m), null);
}

/**
 * Annual facts from ESEF documents (pure; tests use the recorded fixture). Newest document per own fiscal year;
 * then per (concept, FY end) the value from the newest document that has it (ties: the earlier tag); instants only on
 * a fiscal year end; one unit per concept (the latest year's). Diluted shares = net income ÷ diluted EPS when the
 * filing tags no share count (Q-E1).
 */
export function annualFactsFromEsef(docs: EsefDocument[]): AnnualFact[] {
  const parsed = docs.map((d) => ({ ...d, rows: esefRows(d.doc) })).map((d) => ({ ...d, fy: ownFiscalYearEnd(d.rows) }));
  const newest = new Map<string, (typeof parsed)[number]>();
  for (const d of parsed) {
    if (!d.fy) continue;
    const cur = newest.get(d.fy);
    if (!cur || d.processed > cur.processed) newest.set(d.fy, d);
  }
  const kept = [...newest.values()].sort((a, b) => (a.fy! < b.fy! ? 1 : -1)); // newest fiscal year first
  const fyEnds = new Set(kept.flatMap((d) => d.rows.filter((r) => r.kind === "duration").map((r) => r.end)));
  const best = new Map<string, Row & { doc: (typeof kept)[number] }>();
  kept.forEach((doc) => {
    for (const r of doc.rows) {
      if (r.kind === "instant" && !fyEnds.has(r.end)) continue;
      const key = `${r.concept}|${r.end}`;
      const cur = best.get(key);
      // kept is newest first: the first document seen wins; within one document the earlier tag wins.
      if (!cur || (cur.doc === doc && r.rank < cur.rank)) best.set(key, { ...r, doc });
    }
  });
  const out: AnnualFact[] = [];
  const unitByConcept = new Map<string, string>();
  for (const r of [...best.values()].sort((a, b) => (a.end < b.end ? 1 : -1))) if (!unitByConcept.has(r.concept)) unitByConcept.set(r.concept, r.unit);
  for (const r of best.values()) {
    if (r.unit !== unitByConcept.get(r.concept)) continue;
    out.push({ fiscalYearEnd: r.end, concept: r.concept, value: String(r.value), unit: r.unit, sourceTag: r.tag, accession: r.doc.url, filed: r.doc.processed.slice(0, 10) });
  }
  // Q-E1: derived diluted shares where no share tag exists.
  const at = (c: string, end: string) => out.find((f) => f.concept === c && f.fiscalYearEnd === end);
  for (const ni of out.filter((f) => f.concept === "net_income")) {
    if (at("diluted_shares", ni.fiscalYearEnd)) continue;
    const eps = at("eps_diluted", ni.fiscalYearEnd);
    if (!eps || !(Number(eps.value) > 0)) continue;
    out.push({ ...ni, concept: "diluted_shares", value: String(Math.round(Number(ni.value) / Number(eps.value))), unit: "shares", sourceTag: DERIVED_SHARES_TAG });
  }
  return out.sort((a, b) => a.concept.localeCompare(b.concept) || a.fiscalYearEnd.localeCompare(b.fiscalYearEnd));
}

// ------------------------------------------------------------------ source (live)

export type EsefGet = (url: string) => Promise<{ status: number; text: string }>;
const liveGet: EsefGet = async (url) => {
  const res = await fetch(url, { headers: { "User-Agent": ESEF_USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
  return { status: res.status, text: res.status === 200 ? await res.text() : "" };
};

export type EsefSourceOptions = { get?: EsefGet; minIntervalMs?: number; sleep?: (ms: number) => Promise<void>; now?: () => number };

type Filing = { attributes: { json_url?: string; processed?: string; date_added?: string; period_end?: string } };

export function createEsefSource(options: EsefSourceOptions = {}): FundamentalsSource & { requests: () => number } {
  const get = options.get ?? liveGet;
  const gap = options.minIntervalMs ?? ESEF_MIN_INTERVAL_MS;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = options.now ?? (() => Date.now());
  const last = new Map<string, number>();
  let count = 0;
  async function request(url: string): Promise<{ status: number; text: string }> {
    const host = new URL(url).host;
    const wait = (last.get(host) ?? -Infinity) + gap - now();
    if (wait > 0) await sleep(wait);
    last.set(host, now());
    count += 1;
    try {
      return await get(url);
    } catch {
      throw new Error(`ESEF request failed (network) for ${url.replace(/^https:\/\/[^/]+/, "")}`);
    }
  }
  async function json<T>(url: string): Promise<T | null> {
    const r = await request(url);
    if (r.status === 404) return null;
    if (r.status !== 200) throw new Error(`ESEF request failed (HTTP ${r.status}) for ${url.replace(/^https:\/\/[^/]+/, "")}`);
    return JSON.parse(r.text) as T;
  }
  return {
    id: "esef",
    requests: () => count,
    covers: (listing: ListingForCoverage) => listing.region === "EU",
    async resolve(listing) {
      if (listing.region !== "EU") return null;
      const pinned = PINNED_LEI[listing.symbol];
      if (pinned) return { id: pinned.lei, name: pinned.name, source: "esef" };
      const country = venueCountry(listing.symbol);
      if (!listing.name || !country) return null;
      const q = encodeURIComponent(listing.name.slice(0, 80));
      const fc = await json<{ data?: { relationships?: { "lei-records"?: { data?: { id?: string } } } }[] }>(
        `${GLEIF_BASE}/fuzzycompletions?field=entity.legalName&q=${q}`,
      );
      for (const c of (fc?.data ?? []).slice(0, 3)) {
        const lei = c.relationships?.["lei-records"]?.data?.id;
        if (!lei) continue;
        const rec = await json<{ data?: { attributes?: { entity?: { legalName?: { name?: string }; legalAddress?: { country?: string } } } } }>(
          `${GLEIF_BASE}/lei-records/${lei}`,
        );
        const e = rec?.data?.attributes?.entity;
        if (e?.legalName?.name && e.legalAddress?.country === country && sameCompany(listing.name, e.legalName.name))
          return { id: lei, name: e.legalName.name, source: "esef" };
      }
      return null;
    },
    async annualFacts(lei) {
      const list = await json<{ data?: Filing[] }>(`${ESEF_BASE}/api/entities/${encodeURIComponent(lei)}/filings`);
      const filings = (list?.data ?? [])
        .map((f) => f.attributes)
        .filter((a) => a.json_url)
        .sort((a, b) => ((a.processed ?? a.date_added ?? "") < (b.processed ?? b.date_added ?? "") ? 1 : -1))
        .slice(0, ESEF_MAX_DOCUMENTS);
      if (!filings.length) return null;
      const docs: EsefDocument[] = [];
      for (const f of filings) {
        const doc = await json<XbrlJson>(`${ESEF_BASE}${f.json_url}`);
        if (doc) docs.push({ url: f.json_url!, processed: f.processed ?? f.date_added ?? "", doc });
      }
      const facts = annualFactsFromEsef(docs);
      return facts.length ? facts : null;
    },
  };
}
