// #176 Y10: captures the #157 export outputs that PFU-09 / PFU-10 compare against. It was run once at 3f59104 (before
// #176) to write 3f59104.json:
//   node --experimental-strip-types src/lib/finance/export-golden/capture.ts > src/lib/finance/export-golden/3f59104.json
// The test re-runs `goldenCases()` on the current code and compares the parts the spec says are unchanged.
import { createHash } from "node:crypto";
import { chartData } from "../chart.ts";
import { buildPdf, buildPng, dataJson } from "../export.ts";
import { STORAGE_KEY, type Line } from "../expenses.ts";
import { MONTHS_KEY } from "../months.ts";
import { OVERVIEW_KEY } from "../overview.ts";
import { readPdf, readPng } from "../../../../qa/tools/export-parse.mjs";

const L = (id: string, amount: string, category = "", account = ""): Line => ({ id, name: id, amount, per: "month", equity: "", account, currency: "", rate: "", category });
/** The #157 test record (export.server.test.ts), ASCII names only. */
export const GOLDEN_RECORD = {
  [STORAGE_KEY]: JSON.stringify({
    fixed: [L("rent", "1000", "Home", "Chequing")],
    variable: [],
    accounts: ["Chequing"],
    categories: ["Home"],
    deletedCategories: [{ name: "Travel", from: "2026-06" }],
    deletedAccounts: [{ name: "Amex", from: "2026-06" }],
  }),
  [MONTHS_KEY]: JSON.stringify({
    "2020-01": { fixed: [L("rent", "900", "Home", "Chequing")], variable: [L("t", "100", "Travel", "Amex")], people: [] },
    "2026-03": { fixed: [L("rent", "1000", "Home", "Chequing")], variable: [L("t", "200", "Travel", "Amex")], people: [] },
    "2026-09": { fixed: [L("rent", "1000", "Home", "Chequing")], variable: [], people: [] },
  }),
  [OVERVIEW_KEY]: JSON.stringify({ start: "10000", growth: "", future: false, years: 1, months: { "2025-01": { expenses: "500", income: "800" }, "2025-03": { expenses: "500", income: "700" } } }),
};
export const GOLDEN_NOW = new Date("2026-10-16T16:00:00Z");
const M = (id: string) => ({ kind: "metric" as const, id });
export const GOLDEN_CASES = {
  net: { series: [{ kind: "category" as const, id: "Travel" }, M("expenses"), M("net-assets")], range: { from: "2024-11", to: "2025-10" }, chart: "line" as const },
  bar: { series: [{ kind: "group" as const, id: "all" }], range: { preset: "12m" as const }, chart: "bar" as const },
};

export function goldenCases() {
  const out: Record<string, unknown> = {};
  for (const [k, q] of Object.entries(GOLDEN_CASES)) {
    const d = chartData(q as any, GOLDEN_RECORD as any, GOLDEN_NOW, "saved");
    const meta = { name: "Default", generatedAt: GOLDEN_NOW.toISOString(), range: q.range };
    const pdf = readPdf(buildPdf(d, meta));
    const png = readPng(buildPng(d, meta));
    out[k] = {
      pdfText: pdf.text,
      pdfPages: pdf.pages,
      mediaBox: /\/MediaBox \[([^\]]*)\]/.exec(buildPdf(d, meta).toString("latin1"))?.[1],
      png: [png.width, png.height],
      dataJsonSha256: createHash("sha256").update(dataJson(d)).digest("hex"),
    };
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(JSON.stringify({ commit: "3f59104", ...goldenCases() }, null, 2));
