/**
 * #221 (personal-finance-spec 57, AC PFPJ; CFO business-user spec 2026-10-22): the one month step of a net-assets
 * projection, shared by the scenario screen (`scenario.ts`) and the Overview's Future projection (`overview.ts`).
 * - Monthly rate: r_m = (1 + annual)^(1/12) − 1 (never annual ÷ 12, never the annual rate each month).
 * - Each month: if N > 0 then N = N × (1 + r_m); then N = N + surplus (a negative surplus subtracts). No growth on
 *   N ≤ 0 (#215 Q-SC3, kept; CFO Q-b 2026-10-22: the Overview's Future projection follows the same rule).
 * Pure; nothing is written.
 */

/** r_m for an annual growth rate in percent (9 → ≈ 0.7207 %). */
export const monthlyRate = (annualPercent: number): number => Math.pow(1 + annualPercent / 100, 1 / 12) - 1;

/** One month: growth on a positive opening balance only, then the month's surplus. */
export const stepNet = (net: number, surplus: number, rM: number): number => (net > 0 ? net * (1 + rM) : net) + surplus;

/** Month 0 (the start, once) then `months` monthly steps: `months + 1` values. */
export function projectNet(start: number, surplus: number, annualPercent: number, months: number): number[] {
  const rM = monthlyRate(annualPercent);
  const out = [start];
  let net = start;
  for (let i = 0; i < months; i++) {
    net = stepNet(net, surplus, rM);
    out.push(net);
  }
  return out;
}
