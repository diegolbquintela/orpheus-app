// #285: the PF Overview's average-window labels as the harness expects them. Pure (no Playwright) so
// scripts/pf-window-harness.test.mjs can pin it. `now` is REQUIRED and must be the instant the PAGE sees:
// personal-finance-e2e pins the browser clock to TODAY (page.clock.setFixedTime), so the expected labels
// must come from TODAY, never from the runner's wall clock (the cause of #285: Aug–Oct expected on Nov 1,
// the pinned page correctly showed Jul–Sep). Same rule as the app (src/lib/finance/overview.ts, C7 / #140):
// complete months only, read in the household timezone.
export const HOUSEHOLD_TZ = "America/Toronto";

const need = (now) => {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new TypeError("pf-window: pass the page's pinned date (TODAY)");
  return now;
};

/** `yyyy-mm` of `now` in the household timezone. */
export const householdMonth = (now) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: HOUSEHOLD_TZ, year: "numeric", month: "2-digit" }).format(need(now)).slice(0, 7);

/** The `n` complete household months before `now`, oldest first (`yyyy-mm`). */
export const completeMonths = (now, n) => {
  const [y, m] = householdMonth(now).split("-").map(Number);
  const out = [];
  for (let back = n; back >= 1; back--) {
    const d = new Date(Date.UTC(y, m - 1 - back, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
};

const short = (key) => {
  const [y, m] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
};
const range = (keys) => `${short(keys[0])}\u2013${short(keys[keys.length - 1])}`;

/** C7: `3-month average (Jul–Sep)`. */
export const avg3Label = (now) => `3-month average (${range(completeMonths(now, 3))})`;

/** #140 / #141 Q-T1: `12-month average (Oct–Sep)`, or `(N of 12 months)` with fewer than 12 data months. */
export const avg12Label = (now, withData = 12) =>
  withData < 12 ? `12-month average (${withData} of 12 months)` : `12-month average (${range(completeMonths(now, 12))})`;
