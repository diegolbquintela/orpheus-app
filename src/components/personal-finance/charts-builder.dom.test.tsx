// #161 (spec 46; PFCB-04, PFCB-06, PFCB-10..PFCB-17): the report builder in jsdom with the real component and a fake API.
import { dom } from "../../test/dom-setup";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ChartsBuilder, type BuilderApi } from "./charts-builder";
import { STORAGE_KEY } from "@/lib/finance/expenses";
import { MONTHS_KEY } from "@/lib/finance/months";
import type { ChartData, ReportItem, Result } from "@/lib/finance/charts-api";
import type { Report } from "@/lib/finance/report";

let root: Root | undefined;
let container: HTMLElement | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
});
const legacy = dom.window.HTMLElement.prototype as unknown as Record<string, unknown>;
legacy.attachEvent ??= () => {};
legacy.detachEvent ??= () => {};
async function type(field: Element, value: string) {
  const el = field as HTMLInputElement | HTMLSelectElement;
  const select = el.tagName === "SELECT";
  const proto = select ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
  await act(async () => {
    el.dispatchEvent(new dom.window.FocusEvent("focusin", { bubbles: true }));
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new dom.window.Event(select ? "change" : "input", { bubbles: true }));
    el.dispatchEvent(new dom.window.Event(select ? "change" : "keyup", { bubbles: true }));
    el.dispatchEvent(new dom.window.FocusEvent("focusout", { bubbles: true }));
  });
}
const click = async (el: Element) => act(async () => (el as HTMLElement).click());
const tick = (ms = 5) => act(async () => new Promise((r) => setTimeout(r, ms)));
const q = (el: ParentNode, id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const qa = (el: ParentNode, id: string) => [...el.querySelectorAll(`[data-testid="${id}"]`)] as HTMLElement[];
const pick = (el: ParentNode, kind: string, id: string) => el.querySelector(`[data-testid="pf-builder-pick"][data-kind="${kind}"][data-id="${id}"]`) as HTMLInputElement;

const NOW = new Date("2026-10-16T16:00:00Z");
const RECORD = {
  [STORAGE_KEY]: JSON.stringify({
    fixed: [{ id: "l-rent", name: "Rent", amount: "1000", per: "month", equity: "", account: "Amex", category: "Home" }],
    variable: [],
    accounts: ["Amex"],
    categories: ["Home"],
  }),
};
const item = (id: string, name: string, report: Report, def = false): ReportItem => ({ id, name, default: def, report, missing: [], deleted: [], labels: report.series.map((s) => s.id), created_at: null, updated_at: null });
const chartOf = (q: { series: Report["series"]; chart: Report["chart"] }): ChartData =>
  ({ chart: q.chart, mixed_axes: false, source: "request", labels: q.series.map((s) => s.id), series: q.series.map((s) => ({ ...s, axis: "flow", stack: false, values: [1, 2] })), rows: [{ month: "2026-09", label: "Sep", partial: false, values: q.series.map(() => 1) }, { month: "2026-10", label: "Oct", partial: true, values: q.series.map(() => 2) }] }) as unknown as ChartData;

function fakeApi(over: Partial<BuilderApi> = {}) {
  const calls: { op: string; arg?: unknown; arg2?: unknown }[] = [];
  const log = <T,>(op: string, v: T, arg?: unknown, arg2?: unknown) => (calls.push({ op, arg, arg2 }), v);
  const api: BuilderApi = {
    record: async () => log("record", RECORD),
    list: async () => log("list", { ok: true, status: 200, data: { limit: 20, reports: [item("r-00000001", "Spend", { series: [{ kind: "group", id: "all" }], range: { preset: "12m" }, chart: "line" })] } }),
    get: async (id) => log("get", { ok: false, status: 404, code: "not_found", error: "Report not found." } as Result<ReportItem>, id),
    chart: async (qq) => log("chart", { ok: true, status: 200, data: chartOf(qq as never) }, qq),
    create: async (b) => log("create", { ok: true, status: 201, data: item("r-0000abcd", b.name, b.report) }, b),
    update: async (id, b) => log("update", { ok: true, status: 200, data: item(id, (b as { name?: string }).name ?? "Default", b.report, id === "default") }, id, b),
    ...over,
  };
  return { api, calls, ops: () => calls.map((c) => c.op) };
}
async function render(props: Parameters<typeof ChartsBuilder>[0]) {
  container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<ChartsBuilder now={NOW} debounceMs={0} {...props} />));
  await tick();
  return container;
}

describe("#161 Charts builder", () => {
  it("PFCB-10: no preview request with 0 series (`Pick at least one series.`); one /chart per settled change with the exact query", async () => {
    const f = fakeApi();
    const el = await render({ api: f.api });
    assert.equal(q(el, "pf-builder-problem")!.textContent, "Pick at least one series.");
    assert.equal(f.ops().filter((o) => o === "chart").length, 0);
    await click(pick(el, "group", "all"));
    await tick();
    const charts = f.calls.filter((c) => c.op === "chart");
    assert.deepEqual(charts.map((c) => c.arg), [{ series: [{ kind: "group", id: "all" }], range: { preset: "12m" }, chart: "line" }]);
    assert.equal(q(el, "pf-builder-figure")!.dataset.chart, "line");
    assert.equal(q(el, "pf-builder-legend")!.textContent, "All expenses");
  });
  it("PFCB-10: latest wins (two quick changes inside the debounce → one request, the last state)", async () => {
    const f = fakeApi();
    const el = await render({ api: f.api, debounceMs: 30 });
    await click(pick(el, "group", "all"));
    await click(pick(el, "metric", "income"));
    await tick(80);
    assert.deepEqual(f.calls.filter((c) => c.op === "chart").map((c) => c.arg), [{ series: [{ kind: "group", id: "all" }, { kind: "metric", id: "income" }], range: { preset: "12m" }, chart: "line" }]);
  });
  it("PFCB-10: latest wins when answers arrive out of order (a slow first answer never replaces a newer one)", async () => {
    const pending: ((r: Result<ChartData>) => void)[] = [];
    const sent: unknown[] = [];
    const f = fakeApi({ chart: (qq) => (sent.push(qq), new Promise((res) => pending.push(res))) });
    const el = await render({ api: f.api });
    await click(pick(el, "group", "all"));
    await tick();
    await click(pick(el, "metric", "income"));
    await tick();
    assert.equal(pending.length, 2, "two requests in flight");
    await act(async () => pending[1]({ ok: true, status: 200, data: chartOf(sent[1] as never) }));
    await act(async () => pending[0]({ ok: true, status: 200, data: chartOf(sent[0] as never) }));
    assert.equal(q(el, "pf-builder-figure")!.dataset.series, "2", "the newer (2-series) answer stays");
    assert.equal(q(el, "pf-builder-legend")!.textContent, "All expensesIncome");
  });
  it("PFCB-09 / PFCB-07: chart Line by default; Bar / Stacked bar and a custom range send the server's values", async () => {
    const f = fakeApi();
    const el = await render({ api: f.api });
    assert.equal((q(el, "pf-builder-chart") as HTMLSelectElement).value, "line");
    await click(pick(el, "line", "l-rent"));
    await type(q(el, "pf-builder-chart")!, "stacked-bar");
    await type(q(el, "pf-builder-range")!, "custom");
    await type(q(el, "pf-builder-from")!, "2025-01");
    await type(q(el, "pf-builder-to")!, "2025-12");
    await tick();
    assert.deepEqual(f.calls.filter((c) => c.op === "chart").at(-1)!.arg, { series: [{ kind: "line", id: "l-rent" }], range: { from: "2025-01", to: "2025-12" }, chart: "stacked-bar" });
    assert.equal(q(el, "pf-builder-legend")!.textContent, "Rent", "Q-AK3: the line's name, not its id");
  });
  it("PFCB-08: a custom range over 24 months shows the server text, no preview request", async () => {
    const f = fakeApi();
    const el = await render({ api: f.api });
    await click(pick(el, "group", "all"));
    await tick();
    const n = f.calls.filter((c) => c.op === "chart").length;
    await type(q(el, "pf-builder-range")!, "custom");
    await type(q(el, "pf-builder-from")!, "2024-01");
    await type(q(el, "pf-builder-to")!, "2026-01");
    await tick();
    assert.equal(q(el, "pf-builder-problem")!.textContent, "Range can't be longer than 24 months.");
    assert.equal(f.calls.filter((c) => c.op === "chart").length, n + 1, "only the 2026-10..2026-10 custom default previewed");
  });
  it("PFCB-06: 12 picked → the rest disabled + `Up to 12 series.`", async () => {
    const lines = Array.from({ length: 13 }, (_, i) => ({ id: `l-${i}`, name: `L${i}`, amount: "1", per: "month", equity: "", account: "", category: "" }));
    const f = fakeApi({ record: async () => ({ [STORAGE_KEY]: JSON.stringify({ fixed: lines, variable: [], accounts: [], categories: [] }) }) });
    const el = await render({ api: f.api });
    for (let i = 0; i < 12; i++) await click(pick(el, "line", `l-${i}`));
    assert.equal(q(el, "pf-builder-cap")!.textContent, "Up to 12 series.");
    assert.equal(pick(el, "line", "l-12").disabled, true);
    assert.equal(pick(el, "metric", "income").disabled, true);
    assert.equal(pick(el, "line", "l-0").disabled, false, "a picked one can be unpicked");
    assert.equal(q(el, "pf-builder-series-toggle")!.textContent, "Series (12)");
  });
  it("PFCB-11: a bad or taken name is blocked before sending", async () => {
    const f = fakeApi();
    const el = await render({ api: f.api });
    await click(pick(el, "group", "all"));
    for (const [v, text] of [["", "Name: 1 to 60 characters, no control characters."], ["x".repeat(61), "Name: 1 to 60 characters, no control characters."], ["default", "Name already used."], ["SPEND", "Name already used."]] as const) {
      await type(q(el, "pf-builder-name")!, v);
      await click(q(el, "pf-builder-save")!);
      assert.equal(q(el, "pf-builder-error-name")!.textContent, text, v);
    }
    assert.equal(f.ops().filter((o) => o === "create").length, 0);
  });
  it("PFCB-12 / PFCB-15: Save → POST body exactly { name, report }; 201 → edit URL, Update, Export PDF / PNG; a change hides Export; Update → PUT", async () => {
    const f = fakeApi();
    const urls: string[] = [];
    const el = await render({ api: f.api, replaceUrl: (p) => urls.push(p) });
    assert.equal(q(el, "pf-builder-export"), null, "not saved → no export");
    await click(pick(el, "metric", "net-assets"));
    await type(q(el, "pf-builder-name")!, "  Net worth  ");
    await click(q(el, "pf-builder-save")!);
    assert.deepEqual(f.calls.find((c) => c.op === "create")!.arg, { name: "Net worth", report: { series: [{ kind: "metric", id: "net-assets" }], range: { preset: "12m" }, chart: "line" } });
    assert.deepEqual(urls, ["/personal-finance/charts/r-0000abcd/edit"]);
    assert.equal(q(el, "pf-builder-save")!.textContent, "Update");
    assert.equal(q(el, "pf-builder-export-pdf")!.getAttribute("href"), "/api/personal-finance/reports/r-0000abcd/export?format=pdf");
    assert.equal(q(el, "pf-builder-export-png")!.getAttribute("href"), "/api/personal-finance/reports/r-0000abcd/export?format=png");
    assert.deepEqual([...q(el, "pf-builder-export")!.querySelectorAll("a")].map((a) => a.textContent), ["PDF", "PNG"], "no Email (#180)");
    await type(q(el, "pf-builder-chart")!, "bar");
    assert.equal(q(el, "pf-builder-export"), null, "unsaved changes → no export");
    await click(q(el, "pf-builder-save")!);
    const up = f.calls.find((c) => c.op === "update")!;
    assert.deepEqual([up.arg, up.arg2], ["r-0000abcd", { name: "Net worth", report: { series: [{ kind: "metric", id: "net-assets" }], range: { preset: "12m" }, chart: "bar" } }]);
    assert.ok(q(el, "pf-builder-export"), "clean again → export back");
  });
  it("PFCB-04 (#160 carry-over, Q-AK15): a create answered 409 shows exactly `Report limit reached.`; nothing saved", async () => {
    const urls: string[] = [];
    const f = fakeApi({ create: async () => ({ ok: false, status: 409, code: "limit", error: "Report limit reached." }) });
    const el = await render({ api: f.api, replaceUrl: (p) => urls.push(p) });
    await click(pick(el, "group", "all"));
    await type(q(el, "pf-builder-name")!, "One more");
    await click(q(el, "pf-builder-save")!);
    assert.equal(q(el, "pf-builder-error-general")!.textContent, "Report limit reached.");
    assert.deepEqual(urls, []);
    assert.equal(q(el, "pf-builder-save")!.textContent, "Save");
    assert.equal(q(el, "pf-builder-export"), null);
  });
  it("PFCB-14: server refusals show their text under their field (409 name, 400 report.range), 413 in general", async () => {
    for (const [r, where, text] of [
      [{ ok: false, status: 409, code: "name_taken", error: "Name already used.", field: "name" }, "name", "Name already used."],
      [{ ok: false, status: 400, code: "range_out_of_bounds", error: "Range can't end after the current month.", field: "report.range" }, "range", "Range can't end after the current month."],
      [{ ok: false, status: 400, code: "invalid", error: "Invalid value.", field: "report.series.0.id" }, "series", "Invalid value."],
      [{ ok: false, status: 413, code: "too_large", error: "Report too large." }, "general", "Report too large."],
      [{ ok: false, status: 400, code: "bad_json", error: "Body must be JSON." }, "general", "Body must be JSON."],
    ] as const) {
      const f = fakeApi({ create: async () => r as never });
      const el = await render({ api: f.api });
      await click(pick(el, "group", "all"));
      await type(q(el, "pf-builder-name")!, "Fresh");
      await click(q(el, "pf-builder-save")!);
      assert.equal(q(el, `pf-builder-error-${where}`)!.textContent, text, `${r.status} ${where}`);
      await act(async () => root?.unmount());
      container?.remove();
    }
  });
  it("PFCB-13 / Q-AK8: the default report edits with the name read-only `Default`; Update sends { report } only", async () => {
    const def = item("default", "Default", { series: [{ kind: "metric", id: "income" }], range: { preset: "all" }, chart: "line" }, true);
    const f = fakeApi({ get: async () => ({ ok: true, status: 200, data: def }) });
    const el = await render({ api: f.api, id: "default" });
    const name = q(el, "pf-builder-name") as HTMLInputElement;
    assert.equal(name.value, "Default");
    assert.equal(name.readOnly, true);
    assert.equal((q(el, "pf-builder-range") as HTMLSelectElement).value, "all");
    assert.ok(q(el, "pf-builder-export"), "saved and clean → export");
    await click(pick(el, "metric", "surplus"));
    await click(q(el, "pf-builder-save")!);
    const up = f.calls.find((c) => c.op === "update")!;
    assert.deepEqual([up.arg, up.arg2], ["default", { report: { series: [{ kind: "metric", id: "income" }, { kind: "metric", id: "surplus" }], range: { preset: "all" }, chart: "line" } }]);
  });
  it("QA P2: loading, the load error and the builder all render inside the one reserved area", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const f = fakeApi({ record: async () => (await gate, RECORD) });
    container = dom.window.document.createElement("div");
    dom.window.document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root!.render(<ChartsBuilder now={NOW} debounceMs={0} api={f.api} />));
    const area = q(container, "pf-builder-area")!;
    assert.ok(area.contains(q(container, "pf-builder-loading")), "loading inside the area");
    await act(async () => release());
    await tick();
    assert.equal(q(container, "pf-builder-area"), area, "the same area node: nothing above it moves");
    assert.ok(area.contains(q(container, "pf-builder")));
    await act(async () => root?.unmount());
    container.remove();
    const el = await render({ api: fakeApi().api, id: "r-ffffffff" });
    assert.ok(q(el, "pf-builder-area")!.contains(q(el, "pf-builder-load-error")));
  });
  it("QA Q1 / Q3: the picker renders `Travel (deleted)` and a month-line-only account (`Amex (deleted)`); `Visa` (unknown to the server) is not offered", async () => {
    const line = (id: string, name: string, category = "", account = "") => ({ id, name, amount: "200", per: "month", equity: "", account, currency: "", rate: "", category });
    const rec = {
      [STORAGE_KEY]: JSON.stringify({ fixed: [], variable: [], accounts: [], categories: ["Home"], deletedCategories: [{ name: "Travel", from: "2026-06" }], deletedAccounts: [{ name: "Amex", from: "2026-06" }] }),
      [MONTHS_KEY]: JSON.stringify({ "2026-03": { fixed: [line("l-trip", "Trip", "Travel", "Amex"), line("l-gym", "Gym", "Sport", "Visa")], variable: [], people: [] } }),
    };
    const f = fakeApi({ record: async () => rec });
    const el = await render({ api: f.api });
    const text = (kind: string) => [...el.querySelectorAll(`[data-testid="pf-builder-pick"][data-kind="${kind}"]`)].map((i) => i.parentElement!.textContent);
    assert.deepEqual(text("category"), ["Home", "Travel (deleted)"]);
    assert.deepEqual(text("account"), ["Amex (deleted)"], "only on a month line, still offered");
    assert.equal(pick(el, "account", "Visa"), null);
    await click(pick(el, "category", "Travel"));
    await click(pick(el, "account", "Amex"));
    await tick();
    assert.deepEqual((f.calls.filter((c) => c.op === "chart").at(-1)!.arg as { series: unknown }).series, [{ kind: "category", id: "Travel" }, { kind: "account", id: "Amex" }], "the plain id is sent, not the label");
  });
  it("edit: an unknown id shows the server's `Report not found.`", async () => {
    const el = await render({ api: fakeApi().api, id: "r-ffffffff" });
    assert.equal(q(el, "pf-builder-load-error")!.textContent, "Report not found.");
  });
  it("PFCB-16: a leave warning only while there are unsaved changes", async () => {
    const f = fakeApi();
    const el = await render({ api: f.api, replaceUrl: () => {} });
    const fire = () => {
      const e = new dom.window.Event("beforeunload", { cancelable: true });
      dom.window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    assert.equal(fire(), false, "clean");
    await click(pick(el, "group", "all"));
    assert.equal(fire(), true, "dirty");
    await type(q(el, "pf-builder-name")!, "Kept");
    await click(q(el, "pf-builder-save")!);
    assert.equal(fire(), false, "saved");
  });
  it("PFCB-17 / Q-AK13: Read grant: no Save / Update, name and controls read-only; export still offered on a saved report", async () => {
    const saved = item("r-00000001", "Spend", { series: [{ kind: "group", id: "all" }], range: { preset: "12m" }, chart: "line" });
    const f = fakeApi({ get: async () => ({ ok: true, status: 200, data: saved }) });
    const el = await render({ api: f.api, id: "r-00000001", readOnly: true });
    assert.equal(q(el, "pf-builder-save"), null);
    assert.equal((q(el, "pf-builder-name") as HTMLInputElement).readOnly, true);
    assert.ok(qa(el, "pf-builder-pick").every((c) => (c as HTMLInputElement).disabled));
    assert.equal((q(el, "pf-builder-range") as HTMLSelectElement).disabled, true);
    assert.equal((q(el, "pf-builder-chart") as HTMLSelectElement).disabled, true);
    assert.ok(q(el, "read-only"), "the read-only line");
    assert.equal(q(el, "pf-builder-export-pdf")!.getAttribute("href"), "/api/personal-finance/reports/r-00000001/export?format=pdf");
    assert.ok(f.ops().includes("chart"), "preview still works");
  });
  it("PFCB-18: mobile series toggle (closed by default, aria-expanded), back link to Charts", async () => {
    const el = await render({ api: fakeApi().api });
    const t = q(el, "pf-builder-series-toggle")!;
    assert.equal(t.getAttribute("aria-expanded"), "false");
    assert.equal(q(el, "pf-builder-series")!.dataset.open, "false");
    await click(t);
    assert.equal(t.getAttribute("aria-expanded"), "true");
    assert.equal(q(el, "pf-builder-series")!.dataset.open, "true");
    assert.equal(q(el, "pf-builder-back")!.getAttribute("href"), "/personal-finance/charts");
  });
});
