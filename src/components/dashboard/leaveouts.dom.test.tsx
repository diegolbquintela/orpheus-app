// Leave-outs (#59, epic #53 ticket 6, spec §0.3, DR6-01..05): the real HoldingsSection in jsdom, with the list,
// a detail open, Edit open and the metrics sheet, checked with the same rules as the browser tool
// (qa/tools/leaveouts-rules.mjs): no Connect broker, no K/M/B (a seven-figure value shows every digit), no
// ownership toggle, no download / export, no paragraph other than the kept data lines, and the wording rule.
// jsdom has no CSS, so every rendered node counts (stricter than the browser, which reads visible text only).
import { dom } from "../../test/dom-setup";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { act, type ComponentProps } from "react";
import type { Root } from "react-dom/client";
import { leaveOutFindings, type LeaveOutSnapshot } from "../../../qa/tools/leaveouts-rules.mjs";
import { HoldingsSection } from "./holdings";

const { createRoot } = await import("react-dom/client");

type Props = ComponentProps<typeof HoldingsSection>;
let container: HTMLElement;
let root: Root;

const ok = (value: string) => ({ value, status: "ok", fiscalYearEnd: "2025-12-31" });
const row = (symbol: string, value: number | null, weight: number | null, extra: object = {}) => ({
  symbol, value, cost: null, returnAmount: null, returnPct: null, weight, rates: [], sessionDate: value === null ? null : "2026-10-01", fallback: false,
  status: value === null ? "price_pending" : "ok", ...extra,
});
const PAGE = (holdings = true): Props => ({
  holdings: holdings
    ? [
        { id: 1, symbol: "KO", shares: "17500.000000", avgCost: "52.125000" },
        { id: 2, symbol: "MC.PA", shares: "1.000000", avgCost: null },
        { id: 3, symbol: "RY.TO", shares: "5.000000", avgCost: "150.000000" },
      ]
    : [],
  prices: {
    KO: { close: "70", currency: "USD", sessionDate: "2026-10-01", pending: false, name: "Coca-Cola Co" },
    "MC.PA": { close: "1234.500000", currency: "EUR", sessionDate: "2026-10-01", pending: false, name: "LVMH" },
    "RY.TO": { close: null, currency: null, sessionDate: null, pending: true, name: null },
  },
  baseCurrency: "CAD",
  valuation: {
    base: "CAD",
    rows: holdings
      ? [
          row("KO", 1689187.5, 99.9, { cost: 1257802.81, returnAmount: 431384.69, returnPct: 34.29, rates: [{ from: "USD", to: "CAD", rate: "1.3789", date: "2026-10-01" }] }),
          row("MC.PA", 961.8, 0.1),
          row("RY.TO", null, null),
        ]
      : [],
    total: holdings ? 1690149.3 : 0,
    totalCost: null,
    totalReturn: null,
    totalReturnPct: null,
    excluded: holdings ? ["RY.TO"] : [],
    pricesAsOf: "2026-10-01",
    fxAsOf: "2026-10-01",
  },
  freshness: { lastGoodRun: "2026-10-02", stale: false },
  metricColumns: ["rev_g_1y", "roic_1y", "share_of_book", "eps_1y", "gross_margin_1y"],
  metrics: {
    KO: { coverage: "covered", metrics: { rev_g_1y: ok("0.019"), roic_1y: ok("0.174"), eps_1y: { ...ok("3.04"), currency: "USD" }, eps_g_1y: ok("0.236") } },
    "MC.PA": { coverage: "not_covered", metrics: {} },
    "RY.TO": { coverage: "covered", metrics: {} },
  },
  portfolio: {
    rev_g_1y: { value: 0.019, coverage: 0.999, source: "rev_g_1y", included: ["KO"] },
    roic_1y: { value: 0.174, coverage: 0.999, source: "roic_1y", included: ["KO"] },
    eps_1y: { value: 0.236, coverage: 0.999, source: "eps_g_1y", included: ["KO"] },
    gross_margin_1y: { value: null, coverage: 0, source: "gross_margin_1y", included: [] },
  },
  storage: "ok",
  onChanged: () => {},
});

async function render(props: Props) {
  globalThis.fetch = (async () => new Response('{"columns":[]}', { status: 200 })) as typeof fetch;
  container = dom.window.document.createElement("main");
  dom.window.document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<HoldingsSection {...props} />));
}
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
const $ = (sel: string) => container.querySelector(sel) as HTMLElement | null;
const click = (el: Element) => act(async () => void el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
const squash = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** Every text node joined by spaces (jsdom has no innerText), every control and every paragraph. */
function snapshot(): LeaveOutSnapshot {
  const walker = dom.window.document.createTreeWalker(container, dom.window.NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) parts.push(n.nodeValue ?? "");
  const controls = [...container.querySelectorAll("a, button, input, select, textarea, [role=switch], [role=button], [role=checkbox], [aria-pressed]")].map((e) => ({
    tag: e.tagName.toLowerCase(),
    role: e.getAttribute("role"),
    type: e.getAttribute("type"),
    name: squash(e.getAttribute("aria-label") || e.getAttribute("title") || e.textContent || e.getAttribute("value")),
    href: e.getAttribute("href"),
    download: e.hasAttribute("download"),
    pressed: e.getAttribute("aria-pressed"),
  }));
  const paragraphs = [...container.querySelectorAll("p")].map((p) => ({ text: squash(p.textContent), alert: !!p.closest("[role=alert]") }));
  return { text: parts.join(" "), controls, paragraphs };
}
const none = (state: string) => {
  for (const [rule, found] of Object.entries(leaveOutFindings(snapshot()))) assert.deepEqual(found, [], `${state}: ${rule}`);
};

describe("leave-outs (#59, DR6-01..05)", () => {
  it("list, detail, Edit and the metrics sheet: nothing from the leave-out list, kept lines only", async () => {
    await render(PAGE());
    none("list");
    // DR6-02: a seven-figure value and total show every digit with separators.
    assert.equal(squash($('[data-testid="holdings-total"]')!.textContent), "1,690,149.30 CAD");
    assert.match(squash($('[data-testid="holding-row"][data-symbol="KO"] [data-testid="holding-value"]')!.textContent), /^1,689,187\.50 CAD/);
    await click($('[data-testid="holding-row"][data-symbol="KO"] [data-testid="holding-row-toggle"]')!);
    none("detail open");
    // Shares, average cost and last close keep their stored decimals and gain separators (no K/M/B, no rounding).
    assert.equal(squash($('[data-testid="holding-row"][data-symbol="KO"] [data-testid="holding-shares"]')!.textContent), "17,500 shares");
    assert.equal(squash($('[data-testid="holding-row"][data-symbol="KO"] [data-testid="holding-avg-cost"]')!.textContent), "52.125 USD");
    await click($('[data-testid="holding-row"][data-symbol="MC.PA"] [data-testid="holding-row-toggle"]')!);
    assert.match(squash($('[data-testid="holding-row"][data-symbol="MC.PA"] [data-testid="holding-close"]')!.textContent), /^1,234\.5 EUR ?2026-10-01 close$/);
    none("two details open");
    const edit = [...container.querySelectorAll('[data-testid="holding-row"][data-symbol="KO"] button')].find((b) => squash(b.textContent) === "Edit")!;
    await click(edit);
    none("editing");
    // The edit field keeps the raw number (it is parsed back as typed).
    assert.equal((container.querySelector('[aria-label="Shares of KO"]') as HTMLInputElement).value, "17500");
    await click($('[data-testid="sheet-switch-metrics"]')!);
    none("metrics sheet");
  });

  it("empty account: one line, nothing from the leave-out list", async () => {
    await render(PAGE(false));
    assert.equal(squash($('[data-testid="holdings-empty"]')!.textContent), "Add a holding");
    none("empty");
  });

  it("no compact notation, download attribute, broker or ownership code in the dashboard sources", () => {
    const files = [
      "src/routes/dashboard.tsx",
      ...readdirSync("src/components/dashboard").filter((f) => f.endsWith(".tsx") && !f.includes(".test.")).map((f) => join("src/components/dashboard", f)),
      "src/lib/dashboard/format.ts",
    ];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      assert.doesNotMatch(src, /notation:\s*["']compact["']|compactDisplay|\bdownload[=:{]|\.csv\b|text\/csv|createObjectURL/, f);
      assert.doesNotMatch(src, />[^<]*\b(Connect broker|ownership|% owned)\b/i, f);
    }
  });
});
