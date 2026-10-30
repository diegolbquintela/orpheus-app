// #267 (renaissance-spec section 6, AC RM-14..RM-18): the /renaissance page in jsdom with the real component, and the
// owner-only link on /account. The page makes no requests (the data comes from the route's server function).
import { dom } from "../../test/dom-setup";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AccountPage } from "@/components/access/account-page";
import type { AccountPageData } from "@/lib/access/gate";
import type { Entry, Pillar } from "@/lib/renaissance/model";
import { buildView } from "@/lib/renaissance/view";
import { NOT_CONFIGURED, pct, pts, signed } from "./format";
import { RenaissancePage } from "./renaissance-page";

let root: Root | undefined;
let container: HTMLElement | undefined;
async function render(node: ReactNode): Promise<HTMLElement> {
  container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(node));
  return container;
}
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
});
const q = (el: ParentNode, id: string) => el.querySelector(`[data-testid="${id}"]`);
const qa = (el: ParentNode, id: string) => [...el.querySelectorAll(`[data-testid="${id}"]`)];

const e = (date: string, item: string, o: Partial<Entry> = {}): Entry => ({
  date,
  item,
  pillar: (item === "industry" ? "industry" : item === "spiritual" ? "spiritual" : "health") as Pillar,
  target: null,
  actual: null,
  hit: null,
  note: null,
  picks: [],
  ...o,
});
const entries: Entry[] = [
  e("2026-10-28", "zyn", { actual: 16, target: 16, note: "Baseline" }),
  e("2026-10-28", "coffee", { actual: 7, target: 7 }),
  e("2026-10-29", "zyn", { target: 15, hit: false }),
  e("2026-10-29", "coffee", { target: 6, hit: false }),
  e("2026-10-29", "steps", { target: 8000, actual: 9100 }),
  e("2026-10-29", "spiritual", { hit: true }),
  e("2026-10-29", "industry", { hit: false }),
  e("2026-10-30", "zyn", { actual: 14, picks: ["Zyn ≤15", "Lift"] }),
  e("2026-10-30", "coffee", { actual: 4, picks: ["Zyn ≤15", "Lift"] }),
  e("2026-10-30", "coffee_noon", { hit: false, actual: 1, picks: ["Zyn ≤15", "Lift"] }),
  e("2026-10-30", "lift", { hit: true, picks: ["Zyn ≤15", "Lift"] }),
];
const view = buildView(entries, "2026-10-30");

describe("/renaissance page (#267)", () => {
  it("RM-14 header: Day N, date, caps, lifts X/3, 7-day steps, streak, picks", async () => {
    const el = await render(<RenaissancePage data={{ status: "ok", view }} />);
    assert.equal(q(el, "rm-date")!.textContent, "Day 2 · Fri Oct 30");
    assert.equal(q(el, "rm-cap-zyn")!.textContent, "≤15");
    assert.equal(q(el, "rm-cap-coffee")!.textContent, "≤6, none after noon");
    assert.equal(q(el, "rm-lifts")!.textContent, "1/3");
    assert.equal(q(el, "rm-steps7")!.textContent, "9,100");
    assert.equal(q(el, "rm-picks")!.textContent, "Today's picks: Zyn ≤15 · Lift");
    assert.ok(el.querySelector("svg"), "the lyre mark");
  });
  it("RM-15 growth comes first: 1% line, per-pillar 7/30-day % with WoW/MoM, baseline change, bests", async () => {
    const el = await render(<RenaissancePage data={{ status: "ok", view }} />);
    const sections = [...el.querySelectorAll("section")].map((s) => s.getAttribute("data-testid"));
    assert.deepEqual(sections, ["rm-growth", "rm-grids", "rm-health", "rm-strips", "rm-log"]);
    const rows = qa(el, "rm-growth-row").map((r) => [...r.children].map((c) => c.textContent));
    assert.equal(rows.length, 3);
    assert.deepEqual(rows[2], ["Spiritual", pct(view.growth[2].r7), "—", pct(view.growth[2].r30), "—"]);
    assert.match(q(el, "rm-baselines")!.textContent!, /Zyn vs baseline 16: 14 \(−2, −13%\)/);
    assert.match(q(el, "rm-compound-actual")!.textContent!, /^\d\.\d{3}×$/);
    assert.ok(qa(el, "rm-bests")[0].children.length >= 4);
  });
  it("RM-16 three grids: shade by share, gray for no report, hover text with date, hits and picks, streaks", async () => {
    const el = await render(<RenaissancePage data={{ status: "ok", view }} />);
    const grids = qa(el, "rm-grid");
    assert.deepEqual(grids.map((g) => g.getAttribute("data-pillar")), ["health", "industry", "spiritual"]);
    const cell = (p: string, d: string) => el.querySelector(`[data-testid="rm-grid"][data-pillar="${p}"] [data-date="${d}"]`)!;
    assert.equal(cell("spiritual", "2026-10-29").getAttribute("data-level"), "all");
    assert.equal(cell("industry", "2026-10-29").getAttribute("data-level"), "none");
    assert.equal(cell("industry", "2026-10-30").getAttribute("data-level"), "unreported");
    assert.equal(cell("health", "2026-10-29").getAttribute("data-level"), "partial");
    assert.equal(cell("health", "2026-10-30").getAttribute("data-level"), "partial"); // zyn+coffee+lift hit, after-noon miss
    assert.match(cell("health", "2026-10-30").getAttribute("title")!, /^Fri Oct 30 · hit: coffee, lift, zyn · picks: Zyn ≤15; Lift$/);
    assert.equal(qa(el, "rm-grid-streak")[2].textContent, "Streak 1 d · best 1 d");
    assert.equal(qa(el, "rm-legend")[0].children.length, 4);
  });
  it("RM-17 health charts and the Industry/Spiritual strips with weekly %", async () => {
    const el = await render(<RenaissancePage data={{ status: "ok", view }} />);
    for (const id of ["rm-chart-zyn", "rm-chart-coffee", "rm-chart-steps", "rm-chart-lifts"]) assert.ok(q(el, id), id);
    assert.match(q(el, "rm-chart-coffee-summary")!.textContent!, /After noon: Oct 30\./);
    assert.match(q(el, "rm-chart-steps-summary")!.textContent!, /minimum 8,000, goal 10,000/);
    const strips = qa(el, "rm-strip");
    assert.deepEqual(strips.map((s) => s.getAttribute("data-pillar")), ["industry", "spiritual"]);
    assert.equal(strips[0].querySelectorAll("li.rm-cell").length, 3);
    assert.match(q(strips[1], "rm-strip-weeks")!.textContent!, /Week of Mon Oct 26: 50%/);
  });
  it("RM-18 log table filters by pillar (aria-pressed), newest first", async () => {
    const el = await render(<RenaissancePage data={{ status: "ok", view }} />);
    assert.equal(qa(el, "rm-log-row").length, entries.length);
    assert.equal(qa(el, "rm-log-row")[0].querySelector("td")!.textContent, "Fri Oct 30");
    const btn = (f: string) => el.querySelector(`[data-testid="rm-filter"][data-filter="${f}"]`) as HTMLButtonElement;
    await act(async () => btn("spiritual").click());
    assert.equal(btn("spiritual").getAttribute("aria-pressed"), "true");
    assert.equal(btn("all").getAttribute("aria-pressed"), "false");
    assert.deepEqual(qa(el, "rm-log-row").map((r) => r.getAttribute("data-pillar")), ["spiritual"]);
    await act(async () => btn("health").click());
    assert.equal(qa(el, "rm-log-row").length, 9);
    await act(async () => btn("all").click());
    assert.equal(qa(el, "rm-log-row").length, entries.length);
    for (const b of qa(el, "rm-filter")) assert.match(b.className, /pf-button/);
  });
  it("empty and not-configured states", async () => {
    const el = await render(<RenaissancePage data={{ status: "ok", view: buildView([], "2026-10-30") }} />);
    assert.ok(q(el, "rm-log-empty"));
    assert.equal(q(el, "rm-steps7")!.textContent, "—");
    await act(async () => root!.render(<RenaissancePage data={{ status: "not_configured" }} />));
    assert.equal(q(el, "rm-not-configured")!.textContent, NOT_CONFIGURED);
  });
  it("formatting helpers", () => {
    assert.equal(pct(null), "—");
    assert.equal(pct(66.6), "67%");
    assert.equal(pts(4.6), "+5 pts");
    assert.equal(pts(-3.2), "−3 pts");
    assert.equal(pts(0.2), "±0 pts");
    assert.equal(pts(null), "—");
    assert.equal(pts(-0.4), "±0 pts");
    assert.equal(signed(-12.5, "%"), "−13%");
    assert.equal(signed(12.5, "%"), "+13%");
  });
  it("RM-19 style: no tabular-nums / tnum, no gold, 44 px controls", () => {
    const css = readFileSync("src/styles.css", "utf8");
    const rm = css.slice(css.indexOf("/* #267 Renaissance Man dashboard"));
    assert.ok(!/tabular-nums|tnum/.test(rm));
    const src = ["src/components/renaissance/renaissance-page.tsx", "src/components/renaissance/health-charts.tsx"].map((f) => readFileSync(f, "utf8")).join("\n");
    assert.ok(!/tabular-nums|tnum|gold|#c9a227|#d4af37/i.test(src));
    assert.match(src, /pf-button/);
  });
});

const account: AccountPageData = {
  signedIn: true,
  name: "Diego",
  email: "owner@example.com",
  owner: true,
  mustChange: false,
  grants: { personal_finance: "read_write", dashboard: "read_write" },
  roles: ["Owner"],
  people: [{ id: "o", name: "Diego", email: "owner@example.com", owner: true, grants: { personal_finance: "read_write", dashboard: "read_write" } }],
  audit: null,
};

describe("RM-20 the owner-only link (/account)", () => {
  it("the owner sees Renaissance; a non-owner or a temporary password doesn't", async () => {
    const el = await render(<AccountPage data={account} />);
    const a = q(el, "account-renaissance-link") as HTMLAnchorElement;
    assert.equal(a.getAttribute("href"), "/renaissance");
    assert.equal(a.textContent, "Renaissance");
    assert.match(a.className, /min-h-11/);
    await act(async () => root!.render(<AccountPage data={{ ...account, owner: false, roles: ["CFO"] }} />));
    assert.equal(q(el, "account-renaissance-link"), null);
    await act(async () => root!.render(<AccountPage data={{ ...account, mustChange: true }} />));
    assert.equal(q(el, "account-renaissance-link"), null);
  });
  it("the site bar is unchanged (no Renaissance item for anyone)", () => {
    const site = readFileSync("src/lib/site/site.ts", "utf8");
    assert.ok(!/renaissance/i.test(site));
  });
});
