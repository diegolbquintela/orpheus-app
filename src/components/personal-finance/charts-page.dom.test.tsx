// #160 (spec 45; PFCL-02..PFCL-12): the Charts reports list in jsdom with the real component.
import { dom } from "../../test/dom-setup";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ChartsPage } from "./charts-page";
import { deletedLabel } from "@/lib/finance/expenses";
import { CHARTS_MESSAGES, listReports, type ReportItem, type ReportList, type Result } from "@/lib/finance/charts-api";

let root: Root | undefined;
let container: HTMLElement | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
});

const item = (id: string, over: Partial<ReportItem> = {}): ReportItem => ({
  id, name: id, default: false, report: { series: [], range: { preset: "12m" }, chart: "line" },
  missing: [], deleted: [], labels: [], created_at: "2026-10-01T12:00:00Z", updated_at: "2026-10-01T12:00:00Z", ...over,
});
const DEFAULT = item("default", { name: "Default", default: true, created_at: null, updated_at: null });
const named = (n: number) => Array.from({ length: n }, (_, i) => item(`r-${String(i).padStart(8, "0")}`));
const ok = (list: ReportList): Result<ReportList> => ({ ok: true, status: 200, data: list });

async function render(props: Parameters<typeof ChartsPage>[0]) {
  container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<ChartsPage {...props} />));
  return container;
}
const q = (el: ParentNode, id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const qa = (el: ParentNode, id: string) => [...el.querySelectorAll(`[data-testid="${id}"]`)] as HTMLElement[];
const counting = (...answers: Result<ReportList>[]) => {
  const calls = { n: 0 };
  const load = async () => answers[Math.min(calls.n++, answers.length - 1)];
  return { calls, load };
};

describe("#160 Charts reports list", () => {
  it("PFCL-02: one load call on mount; PFCL-03 rows in server order with name, Toronto date, summary", async () => {
    const { calls, load } = counting(ok({ limit: 20, reports: [DEFAULT, item("Spend", { updated_at: "2026-10-18T03:30:00Z", labels: ["Rent", "Food", "Travel", "Amex"] }), item("All", { report: { series: [], range: { preset: "all" }, chart: "bar" }, labels: ["Net assets"] }), item("Custom", { report: { series: [], range: { from: "2025-01", to: "2025-12" }, chart: "stacked-bar" }, labels: [] })] }));
    const el = await render({ load });
    assert.equal(calls.n, 1);
    assert.deepEqual(qa(el, "pf-charts-name").map((n) => n.textContent), ["Default", "Spend", "All", "Custom"]);
    assert.deepEqual(qa(el, "pf-charts-date").map((n) => n.textContent), ["—", "2026-10-17", "2026-10-01", "2026-10-01"]);
    assert.deepEqual(qa(el, "pf-charts-summary").map((n) => n.textContent), ["Line · Last 12 months", "Rent, Food, Travel, +1 more · Line · Last 12 months", "Net assets · Bar · All data", "Stacked bar · 2025-01 to 2025-12"]);
  });
  it("PFCL-04: the default's date is — with the accessible name No date", async () => {
    const el = await render({ load: async () => ok({ limit: 20, reports: [DEFAULT] }) });
    const dash = q(el, "pf-charts-date")!.firstElementChild!;
    assert.equal(dash.getAttribute("aria-label"), "No date");
  });
  it("PFCL-06 (QA M1): deleted Travel → the server label Travel (deleted), unchanged", async () => {
    const el = await render({ load: async () => ok({ limit: 20, reports: [item("x", { deleted: [0], labels: [deletedLabel("Travel")] })] }) });
    assert.equal(deletedLabel("Travel"), "Travel (deleted)");
    assert.equal(q(el, "pf-charts-summary")!.textContent, "Travel (deleted) · Line · Last 12 months");
  });
  it("PFCL-07 / Q-AJ9: empty → No saved reports yet. + New report", async () => {
    const el = await render({ load: async () => ok({ limit: 20, reports: [] }) });
    assert.equal(q(el, "pf-charts-empty")!.querySelector("p")!.textContent, "No saved reports yet.");
    assert.ok(q(el, "pf-charts-new"));
    assert.equal(q(el, "pf-charts-list"), null);
  });
  for (const withDefault of [false, true]) {
    it(`PFCL-08 / Q-AJ6 / Q-AJ7 (EL M3): 19 named → disabled + Builder coming next (#161), no limit text; 20 → limit text${withDefault ? " (default present, not counted)" : ""}`, async () => {
      const pre = withDefault ? [DEFAULT] : [];
      let el = await render({ load: async () => ok({ limit: 20, reports: [...pre, ...named(19)] }) });
      assert.equal((q(el, "pf-charts-new") as HTMLButtonElement).disabled, true);
      assert.equal(q(el, "pf-charts-new-note")!.textContent, "Builder coming next (#161)");
      await act(async () => root?.unmount());
      container?.remove();
      el = await render({ load: async () => ok({ limit: 20, reports: [...pre, ...named(20)] }) });
      assert.equal((q(el, "pf-charts-new") as HTMLButtonElement).disabled, true);
      assert.equal(q(el, "pf-charts-new-note")!.textContent, "Limit of 20 reports reached.");
      assert.equal(q(el, "pf-charts-new")!.getAttribute("aria-describedby"), "pf-charts-new-note");
    });
  }
  it("PFCL-09 / Q-AJ8: Read grant → list shown, no New report", async () => {
    const el = await render({ readOnly: true, load: async () => ok({ limit: 20, reports: named(2) }) });
    assert.equal(qa(el, "pf-charts-row").length, 2);
    assert.equal(q(el, "pf-charts-new"), null);
    const empty = await render({ readOnly: true, load: async () => ok({ limit: 20, reports: [] }) });
    assert.equal(q(empty, "pf-charts-new"), null);
  });
  const viaClient = (...responses: (() => Response)[]) => {
    const calls: string[] = [];
    const load = () =>
      listReports(async (url, init) => {
        calls.push(`${init?.method} ${url}`);
        return responses[Math.min(calls.length - 1, responses.length - 1)]();
      });
    return { calls, load };
  };
  const json = (status: number, body: unknown) => () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  for (const [label, first, text] of [
    ["500 (platform, no JSON body)", () => new Response("boom", { status: 500 }), "HTTP 500"],
    ["500 with a JSON error", json(500, { error: CHARTS_MESSAGES.storage }), CHARTS_MESSAGES.storage],
    ["503 Storage not configured.", json(503, { error: CHARTS_MESSAGES.storage }), CHARTS_MESSAGES.storage],
  ] as const) {
    it(`PFCL-10 / Q-AJ10 (QA M4): ${label} → that text + Try again; one click = exactly one more GET; state kept`, async () => {
      const { calls, load } = viaClient(first, json(200, { limit: 20, reports: [item("Spend")] }));
      let signedOut = 0;
      const el = await render({ load, onSignedOut: () => signedOut++ });
      assert.deepEqual(calls, ["GET /api/personal-finance/reports"]);
      assert.equal(q(el, "pf-charts-error")!.querySelector("[role=alert]")!.textContent, text);
      assert.equal(q(el, "pf-charts-retry")!.textContent, "Try again");
      const section = q(el, "pf-charts")!;
      const back = q(el, "pf-charts-back")!;
      const href = dom.window.location.href;
      const retry = q(el, "pf-charts-retry")!;
      retry.focus();
      await act(async () => retry.click());
      assert.deepEqual(calls, ["GET /api/personal-finance/reports", "GET /api/personal-finance/reports"], "exactly one more GET");
      assert.equal(q(el, "pf-charts"), section, "same section node: no remount");
      assert.equal(q(el, "pf-charts-back"), back, "header kept");
      assert.equal(dom.window.location.href, href, "no navigation");
      assert.deepEqual(qa(el, "pf-charts-name").map((n) => n.textContent), ["Spend"]);
      assert.equal(q(el, "pf-charts-error"), null);
      assert.equal(signedOut, 0);
    });
  }
  it("Q-AJ10: a 401 follows the sign-in rule instead of an error", async () => {
    let signedOut = 0;
    const el = await render({ load: async () => ({ ok: false, status: 401, code: "unauthorized", error: "Sign in required." }), onSignedOut: () => signedOut++ });
    assert.equal(signedOut, 1);
    assert.equal(q(el, "pf-charts-error"), null);
  });
  it("PFCL-11: loading line while the GET is pending, list space reserved", async () => {
    let resolve!: (r: Result<ReportList>) => void;
    const el = await render({ load: () => new Promise((r) => (resolve = r)) });
    assert.equal(q(el, "pf-charts-loading")!.textContent, "Loading reports…");
    assert.equal(el.querySelector(".pf-charts-body")!.getAttribute("aria-busy"), "true");
    await act(async () => resolve(ok({ limit: 20, reports: named(1) })));
    assert.equal(q(el, "pf-charts-loading"), null);
  });
  it("PFCL-12 / Q-AJ11 / Q-AJ12: rows are not links; no rename/delete/export; no icons; back link", async () => {
    const el = await render({ load: async () => ok({ limit: 20, reports: [DEFAULT, ...named(2)] }) });
    assert.equal(q(el, "pf-charts-list")!.querySelectorAll("a, button, svg").length, 0);
    assert.equal(el.querySelectorAll("svg").length, 0);
    assert.equal(q(el, "pf-charts-back")!.getAttribute("href"), "/personal-finance");
  });
});
