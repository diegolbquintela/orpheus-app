// The leave-out rules (#59, spec §0.3, DR6-01..05 and DR0-07) on a snapshot of a page: its visible text, its
// visible controls ({tag, role, type, name, href, download, pressed}) and its visible paragraphs ({text, alert}).
// Used by qa/tools/dashboard-leaveouts.mjs in the browser and by npm test (src/components/dashboard/
// leaveouts.dom.test.tsx) on the rendered dashboard, so both apply the same rules. Returns, per rule, what broke it.

/** The kept single data lines (spec §0.2): the only paragraphs allowed on the dashboard. */
export const KEPT_LINES = [
  /^Signed in as \S+$/,
  /^Prices as of .+ close( · FX .+)?$/,
  /^Prices are out of date\..{0,80}$/,
  // The one total, with the excluded-holdings line inside the same paragraph (either order).
  /^Total ?(\d+ holdings? without a price excluded ?)?(—|[\d,]+\.\d{2} (CAD|USD|EUR))( ?\d+ holdings? without a price excluded)?$/,
  /^\d+ holdings? without a price excluded$/,
  /^Database: .{0,60}$/,
  /^Add a holding$/,
  // Preview only (the refresh panel, `PreviewRefresh` in holdings.tsx; never on production): the last run line,
  // with every status `refresh_runs.status` can hold (running while a run is in flight, then ok / partial /
  // failed), or "No run yet." with no run; and the deterministic notes after a click on the button.
  /^Last run: \d{4}-\d{2}-\d{2} \(UTC\) · (running|ok|partial|failed)$/,
  /^No run yet\.$/,
  /^Refresh (ok|partial|failed): \d+ ticker\(s\), \d+ new close\(s\)(, \d+ error\(s\))?\.$/,
  /^A refresh is already running\. Try again in a minute\.$/,
  /^Refresh failed \(\d{3}\)\.$/,
];

const BROKER = /\bbroker|plaid|snaptrade|wealthsimple|questrade|connect (an? )?(account|brokerage)/i;
const BROKER_HOST = /plaid\.com|snaptrade|yodlee|wealthsimple|questrade|interactivebrokers/i;
const KMB = /(?<![\w.])\d+(?:[.,]\d+)?\s?[KMB]\b/;
const OWNERSHIP = /\bown(ed|ership|er)\b|% owned/i;
const DOWNLOAD = /\bdownload|\bexport|\bcsv\b|\.xlsx?\b/i;
const ADVICE = /\b(buy|sell|hold|rating|target|undervalued|overvalued|recommend(ation|ed|s)?)\b|not a recommendation/i;

/** Numbers of 4+ integer digits without separators, leaving out dates (2026-10-02) and 4-digit years. */
function unseparated(text) {
  const t = text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ").replace(/(?<![\d.,])(19|20)\d{2}(?![\d.,])/g, " ");
  return [...t.matchAll(/(?<![\d,.])\d{4,}(?:\.\d+)?(?![\d,])/g)].map((m) => m[0]);
}

export function leaveOutFindings({ text, controls = [], paragraphs = [] }) {
  const names = controls.map((c) => c.name ?? "");
  const all = [text, ...names];
  const hits = (re) => all.filter((s) => re.test(s)).map((s) => s.match(re)[0]);
  return {
    "DR6-01 no Connect broker": [...hits(BROKER), ...controls.filter((c) => c.href && BROKER_HOST.test(c.href)).map((c) => c.href)],
    "DR6-02 no K/M/B, full digits": [...hits(KMB), ...unseparated(text)],
    "DR6-03 no ownership toggle": [
      ...hits(OWNERSHIP),
      ...controls.filter((c) => c.role === "switch" || c.role === "checkbox" || c.type === "checkbox").map((c) => `${c.role ?? c.type}: ${c.name}`),
      ...controls.filter((c) => c.pressed != null && !/^(Holdings|Metrics)$/.test(c.name)).map((c) => `toggle: ${c.name}`),
    ],
    "DR6-04 no download / export": [
      ...hits(DOWNLOAD),
      ...controls.filter((c) => c.download || (c.href && /^blob:|\.(csv|xlsx?)(\?|$)/i.test(c.href))).map((c) => c.href ?? c.name),
    ],
    "DR6-05 no instructions (kept lines only)": paragraphs.filter((p) => !p.alert && !KEPT_LINES.some((re) => re.test(p.text))).map((p) => p.text.slice(0, 120)),
    "DR0-07 no buy / sell wording or disclaimer": hits(ADVICE),
  };
}
