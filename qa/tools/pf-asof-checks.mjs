// #171 (spec 42; added 2026-10-17, QA early findings on 1ca3c3d): the net-assets expectations shared by pf-series-api
// (PFS-18 / PFS-20) and pf-export-api (PFX-06/07). They follow the account's STORED overview (asOf, start), read via
// the record API. as-of.server.test.ts imports these same functions and replays them through the real handlers.

const OVERVIEW_KEY = "orpheus.finance.overview.v1";
/** @param {Record<string,string>|null} record @returns {Record<string, unknown>} */
const overviewOf = (record) => {
  try {
    const o = JSON.parse(record?.[OVERVIEW_KEY] ?? "{}");
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
};

/** The usable stored as-of month (a real yyyy-mm from 2020-01), or null (none → the old anchoring). @param {Record<string,string>|null} record */
export function storedAsOf(record) {
  const v = overviewOf(record).asOf;
  const a = typeof v === "string" ? v.trim() : "";
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(a) && a >= "2020-01" ? a : null;
}

/** Starting net assets as stored (`10,000` → 10000; empty / bad → 0, the page's rule). @param {Record<string,string>|null} record */
export function storedStart(record) {
  const t = String(overviewOf(record).start ?? "").replace(/[,\s]/g, "");
  const n = t === "" ? 0 : Number(t);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * PFS-18 / PFS-20 on a /series (or /chart) reply. `na` / `sur`: the net-assets and surplus values; `start`: storedStart.
 * - pfs20: values start at or before net_assets_from (Q-AG1 back-fill), and at the anchor month itself the value is
 *   non-null and equals the anchor value (start + that month's surplus); the month before it, when shown, is the start.
 * - pfs18: never null after the first value; each month = the one before + its own surplus (none → flat).
 * @param {{ months: string[], net_assets_from: string|null }} j @param {(number|null)[]} na @param {(number|null)[]} sur @param {number} start
 */
export function seriesNetChecks(j, na, sur, start) {
  /** @param {number|null} a @param {number|null} b */
  const near = (a, b) => a !== null && b !== null && Math.abs(a - b) <= 0.005;
  const from = j.net_assets_from ?? null;
  const months = j.months ?? [];
  const idx = !from || from > (months.at(-1) ?? "") ? -1 : from < months[0] ? 0 : months.indexOf(from);
  const exact = from !== null && months.includes(from) ? months.indexOf(from) : -1;
  const firstVal = na.findIndex((v) => v !== null);
  const anchorOk = exact < 0 || (near(na[exact], start + (sur[exact] ?? 0)) && (exact === 0 || na[exact - 1] === null || near(na[exact - 1], start)));
  const pfs20 = (idx < 0 || (firstVal >= 0 && firstVal <= idx)) && anchorOk;
  let pfs18 = true;
  if (firstVal >= 0)
    for (let i = firstVal + 1; i < na.length; i++) if (na[i] === null || !near(na[i], (na[i - 1] ?? 0) + (sur[i] ?? 0))) pfs18 = false;
  return { pfs20, pfs18, idx, firstVal, anchorOk };
}

/**
 * PFX-06/07's net-assets lines on the PDF text (newlines flattened), following the stored as-of month: none → the
 * 36.11 caveat and no as-of note; set → `Net assets from: <asOf> (as-of month)` and the note, no caveat.
 * @param {string} flat @param {string|null} asOf @param {{ caveat: string, suffix: string, note: string }} c
 */
export function exportNetAssetsCheck(flat, asOf, c) {
  const cav = flat.includes(c.caveat.slice(0, 60));
  const anyNote = flat.includes(c.suffix) || flat.includes(c.note.slice(0, 60));
  const note = asOf !== null && flat.includes(`Net assets from: ${asOf} ${c.suffix}`) && flat.includes(c.note.slice(0, 60));
  return { ok: flat.includes("Net assets from:") && (asOf === null ? cav && !anyNote : note && !cav), cav, anyNote, note };
}
