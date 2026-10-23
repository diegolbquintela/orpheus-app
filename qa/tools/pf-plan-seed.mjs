// #247 follow-up BB1 (spec §72.6): the QA harness seeds the owner's missing FUTURE-month plans before the main-page
// checks, so the page's first-load plan backfill (#231, spec 65.2: every future month with lines and no plan gets one,
// then the page saves) does not PUT during PFSV-22 ("loading the main page writes nothing"). Pure; no network.
export const MONTHS_KEY = "orpheus.finance.months.v1";
export const PLANS_KEY = "orpheus.finance.plans.v1";

const parse = (text) => {
  try {
    const v = JSON.parse(text ?? "");
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
};
const count = (m, k) => (Array.isArray(m?.[k]) ? m[k].length : 0);
const hasLines = (m) => count(m, "fixed") + count(m, "variable") + count(m, "people") > 0;

/** The household (Toronto) month of `at`, yyyy-mm. */
export const torontoMonth = (at) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit" }).format(at).slice(0, 7);

/**
 * The record with a plan added for every future month (after `current`) that has lines and no plan, or null when
 * nothing is missing (no PUT needed). Existing plans and every other key are kept as they are.
 */
export function withSeededPlans(record, current, at) {
  if (!record || typeof record !== "object") return null;
  const months = parse(record[MONTHS_KEY]) ?? {};
  const plans = parse(record[PLANS_KEY]) ?? {};
  let changed = false;
  for (const k of Object.keys(months).sort()) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(k) || k <= current || k in plans || !hasLines(months[k])) continue;
    const m = months[k];
    plans[k] = { lines: { fixed: m.fixed ?? [], variable: m.variable ?? [], people: m.people ?? [] }, capturedAt: at.toISOString() };
    changed = true;
  }
  if (!changed) return null;
  const sorted = Object.fromEntries(Object.keys(plans).sort().map((k) => [k, plans[k]]));
  return { ...record, [PLANS_KEY]: JSON.stringify(sorted) };
}
