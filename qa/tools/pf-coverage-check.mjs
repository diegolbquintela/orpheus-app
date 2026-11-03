// #312 (spec §90.4, AC PFAV2-05 amended 2026-11-03): the pure decision behind pf-scenario-e2e.mjs's PFAV2-05 check.
// No network, no browser, no account: the inputs are what the tool read from the page. A missing Future toggle, 1-year
// button or coverage note is SKIP (coverage not computed), never PASS; a present note is checked strictly.
// Pinned by scripts/qa-pf-coverage-check.test.mjs.

export const COVERAGE_BASIS = "(held at this month's figures, like the projection chart).";

/** @returns {{ verdict: "skip", status: string } | { verdict: "pass" | "fail", share: string | null, totals: string | null }} */
export function coverageVerdict({ toggle, year1, note, text, totals }) {
  const missing = [!toggle && "no Future toggle", !year1 && "no 1y button", !note && "no pf-coverage-rate-note"].filter(Boolean);
  if (missing.length) return { verdict: "skip", status: missing.join(", ") };
  const t = text ?? "";
  const share = t.match(/covers ([\d.,]+%)/)?.[1] ?? null;
  const tot = totals ?? null;
  const ok = share !== null && tot !== null && share === tot && t.endsWith(COVERAGE_BASIS);
  return { verdict: ok ? "pass" : "fail", share, totals: tot };
}
