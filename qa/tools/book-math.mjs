// The Book row's expected figures for qa/tools/dashboard-book.mjs (#58 DR5-03/04, QA D2 on #65), recomputed by
// QA from the page's unrounded data (the `/dashboard` loader data the page renders from: each row's value in
// base currency and each holding's stored metric values), never from the rounded 1-decimal weights or cells on
// screen. Spec §9: Σ MVᵢ·mᵢ / Σ MVᵢ over the valued holdings that have a figure (a dash is left out, not
// counted as zero); coverage = Σ MV with a figure / Σ MV of every valued holding. The EPS chip's book figure is
// the weighted 1y EPS growth (D9). Kept free of app imports on purpose: an independent recomputation.

/** Book figure source per chip (D9: the EPS chip weights EPS growth). */
export const BOOK_SOURCE = { eps_1y: "eps_g_1y" };

/** rows: [{ symbol, value }] (base currency, unrounded); metrics: { [symbol]: { coverage, metrics: { [key]: { value, status } } } }. */
export function expectedBookFigure(rows, metrics, chip) {
  const source = BOOK_SOURCE[chip] ?? chip;
  const valued = rows.filter((r) => typeof r.value === "number" && Number.isFinite(r.value) && r.value > 0);
  const total = valued.reduce((s, r) => s + r.value, 0);
  let covered = 0;
  let weighted = 0;
  const included = [];
  for (const r of valued) {
    const view = metrics[r.symbol];
    const cell = view?.coverage === "covered" ? view.metrics?.[source] : undefined;
    const v = cell?.status === "ok" && cell.value !== null && cell.value !== undefined ? Number(cell.value) : NaN;
    if (!Number.isFinite(v)) continue;
    covered += r.value;
    weighted += r.value * v;
    included.push(r.symbol);
  }
  return { value: covered > 0 ? weighted / covered : null, coverage: total > 0 ? covered / total : null, included };
}

/** The figure as the page prints it: "62.6% · 8% covered" (whole-% coverage, never 0% / 100% unless exact), or "—". */
export function bookText({ value, coverage }) {
  if (value === null || coverage === null) return "—";
  const p = Math.round(coverage * 100);
  const cov = coverage < 1 ? Math.min(99, coverage > 0 ? Math.max(1, p) : 0) : 100;
  const fixed = (value * 100).toFixed(1).replace(/^(-?)(\d+)/, (_, s, d) => s + d.replace(/\B(?=(\d{3})+(?!\d))/g, ","));
  return `${fixed}% · ${cov}% covered`;
}

const parse = (text) => {
  const m = /^(-?[\d,]+\.\d)% · (\d+)% covered$/.exec(text);
  return m ? { value: Number(m[1].replace(/,/g, "")), coverage: Number(m[2]) } : null;
};

/**
 * Shown vs expected at display precision: the same text, or (for a value sitting on a rounding edge) within half
 * a unit of the last shown digit, 0.05 points for the figure and 0.5 points for the coverage (plus float noise).
 */
export function matchesAtDisplayPrecision(shown, expected) {
  const want = bookText(expected);
  if (shown === want) return true;
  const s = parse(shown);
  if (!s || expected.value === null) return false;
  const p = Math.round(expected.coverage * 100);
  const cov = expected.coverage < 1 ? Math.min(99, expected.coverage > 0 ? Math.max(1, p) : 0) : 100;
  return Math.abs(s.value - expected.value * 100) <= 0.05 + 1e-9 && (s.coverage === cov || Math.abs(s.coverage - expected.coverage * 100) <= 0.5 + 1e-9);
}
