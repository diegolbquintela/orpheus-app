/**
 * #124: fund / ETF detection via the OpenFIGI mapping API (free, keyless; attachments/etf-detection-design.md).
 * Server-only. Runs in the daily job and the new-holding backfill, never from a page view. The result is stored on
 * `instruments.provider_ids.openfigi` (merged with `||`; no migration). Tests inject `post` with recorded answers.
 */
import { classifyFigi, type FigiResult, type InstrumentKind } from "./fund.ts";
import type { Queryable } from "./store.server.ts";

export { classifyFigi };
export const OPENFIGI_URL = "https://api.openfigi.com/v3/mapping";
/** Keyless: 25 requests a minute, up to 10 jobs a request. */
export const FIGI_JOBS_PER_REQUEST = 10;
export const FIGI_MIN_INTERVAL_MS = 2_500;
export const FIGI_MAX_REQUESTS_PER_RUN = 3;
/** Q-F1: a found result is rechecked after 30 days, a not-found one after 7. */
export const FIGI_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const FIGI_UNKNOWN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Q-F4: Yahoo suffix → OpenFIGI exchCode. No suffix = US. */
export const SUFFIX_EXCH: Record<string, string> = {
  TO: "CN", V: "CN", NE: "CN", CN: "CN",
  PA: "FP", AS: "NA", DE: "GY", F: "GF", MI: "IM", MC: "SM", BR: "BB", ST: "SS", HE: "FH", CO: "DC", VI: "AV", LS: "PL", IR: "ID",
};

export type FigiJob = { idType: "TICKER"; idValue: string; exchCode: string };

/** The OpenFIGI job for a Yahoo symbol, or null when the suffix is not mapped (no request). */
export function figiJob(symbol: string): FigiJob | null {
  const m = /^(.+?)\.([A-Z]{1,3})$/.exec(symbol);
  if (!m) return { idType: "TICKER", idValue: symbol.replace(/-/g, "/"), exchCode: "US" };
  const exch = SUFFIX_EXCH[m[2]];
  return exch ? { idType: "TICKER", idValue: m[1], exchCode: exch } : null;
}

export type FigiPost = (url: string, body: string, headers: Record<string, string>) => Promise<{ status: number; text: string }>;

const livePost: FigiPost = async (url, body, headers) => {
  const res = await fetch(url, { method: "POST", body, headers, signal: AbortSignal.timeout(20_000) });
  return { status: res.status, text: await res.text() };
};

export type OpenFigiSource = { map(jobs: FigiJob[]): Promise<FigiResult[]> };

export function createOpenFigiSource(options: { post?: FigiPost } = {}): OpenFigiSource {
  const post = options.post ?? livePost;
  return {
    async map(jobs) {
      // No API key header (keyless tier).
      const r = await post(OPENFIGI_URL, JSON.stringify(jobs), { "Content-Type": "application/json" });
      if (r.status !== 200) throw new Error(`OpenFIGI HTTP ${r.status}`);
      const data = JSON.parse(r.text) as unknown;
      if (!Array.isArray(data) || data.length !== jobs.length) throw new Error("OpenFIGI answer has the wrong shape");
      return data as FigiResult[];
    },
  };
}

export type StoredFigi = {
  kind: InstrumentKind;
  securityType: string | null;
  securityType2: string | null;
  figi: string | null;
  checkedAt: string;
};

export type ClassificationSummary = { checked: number; funds: number; unmapped: number; deferred: number; errors: string[] };

export type ClassifyOptions = {
  only?: string[];
  nowMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function refreshClassification(db: Queryable, source: OpenFigiSource, options: ClassifyOptions = {}): Promise<ClassificationSummary> {
  const nowMs = options.nowMs ?? Date.now();
  const sleep = options.sleep ?? defaultSleep;
  const summary: ClassificationSummary = { checked: 0, funds: 0, unmapped: 0, deferred: 0, errors: [] };
  const held = await db.query<{ symbol: string; figi: StoredFigi | null }>(
    `SELECT h.symbol, i.provider_ids -> 'openfigi' AS figi
       FROM (SELECT DISTINCT symbol FROM holdings) h JOIN instruments i ON i.symbol = h.symbol
      WHERE ($1::text[] IS NULL OR h.symbol = ANY($1::text[]))
      ORDER BY h.symbol`,
    [options.only ?? null],
  );
  const due: { symbol: string; job: FigiJob }[] = [];
  for (const h of held) {
    const f = h.figi;
    if (f?.checkedAt) {
      const age = nowMs - Date.parse(f.checkedAt);
      if (age < (f.kind === "unknown" ? FIGI_UNKNOWN_MAX_AGE_MS : FIGI_MAX_AGE_MS)) continue;
    }
    const job = figiJob(h.symbol);
    if (!job) {
      summary.unmapped += 1;
      continue;
    }
    due.push({ symbol: h.symbol, job });
  }
  for (let i = 0, n = 0; i < due.length; i += FIGI_JOBS_PER_REQUEST, n++) {
    const batch = due.slice(i, i + FIGI_JOBS_PER_REQUEST);
    if (n >= FIGI_MAX_REQUESTS_PER_RUN) {
      summary.deferred += batch.length;
      continue;
    }
    if (n > 0) await sleep(FIGI_MIN_INTERVAL_MS);
    let results: FigiResult[];
    try {
      results = await source.map(batch.map((b) => b.job));
    } catch (err) {
      // Q-F2: store nothing, stop for this run; the next run asks again.
      summary.errors.push(err instanceof Error ? err.message : String(err));
      summary.deferred += due.length - i;
      break;
    }
    const checkedAt = new Date(nowMs).toISOString();
    for (const [k, b] of batch.entries()) {
      const r = results[k];
      const first = r && "data" in r ? r.data?.[0] : undefined;
      const stored: StoredFigi = {
        kind: classifyFigi(r),
        securityType: first?.securityType ?? null,
        securityType2: first?.securityType2 ?? null,
        figi: first?.figi ?? null,
        checkedAt,
      };
      await db.query(
        `UPDATE instruments SET provider_ids = provider_ids || jsonb_build_object('openfigi', $2::jsonb), updated_at = now() WHERE symbol = $1`,
        [b.symbol, JSON.stringify(stored)],
      );
      summary.checked += 1;
      if (stored.kind === "fund") summary.funds += 1;
    }
  }
  return summary;
}
