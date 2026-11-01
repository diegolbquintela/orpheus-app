// #275 (attachments/pf-subnav-labels-spec.md; PFNL-01..PFNL-05): the Personal Finance sub-nav's visible labels are
// Report Builder / Yearly Ledger / Scenario Analysis; routes, test ids and storage stay as they were. Literal
// strings on purpose: an old label coming back (in the constants, the markup or a title) fails here.
import { dom } from "../../test/dom-setup";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { loadLocalStore } from "@/lib/finance/account-client";
import { HISTORY_LINK, HISTORY_PATH, HISTORY_TITLE } from "@/lib/finance/history";
import { PF_NAV_LABELS, PF_PAGE_TITLES, pfDocTitle, reportDocTitle } from "@/lib/finance/pf-nav";
import { CHARTS_PATH } from "@/lib/finance/reports-list";
import { SCENARIO_PATH, SCENARIO_TITLE } from "@/lib/finance/scenario";
import { PersonalFinancePage } from "./expenses-page";

let root: Root | undefined;
let container: HTMLElement | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  dom.window.localStorage.clear();
});
const q = (el: ParentNode, id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const src = (f: string) => readFileSync(join(process.cwd(), f), "utf8");

describe("#275 Personal Finance sub-nav labels", () => {
  it("PFNL-01: the sub-nav shows Report Builder, Yearly Ledger, Scenario Analysis in that order, same hrefs and test ids", async () => {
    container = dom.window.document.createElement("div");
    dom.window.document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root!.render(<PersonalFinancePage now={new Date("2026-10-16T16:00:00Z")} loadStore={loadLocalStore} />));
    const nav = q(container, "pf-subnav")!;
    assert.ok(nav, "sub-nav");
    const links = [...nav.querySelectorAll("a")];
    assert.deepEqual(
      links.map((a) => [a.getAttribute("data-testid"), a.getAttribute("href"), a.textContent]),
      [
        ["pf-charts-link", "/personal-finance/charts", "Report Builder"],
        ["pf-history-link", "/personal-finance/history", "Yearly Ledger"],
        ["pf-scenario-link", "/personal-finance/scenario", "Scenario Analysis"],
      ],
    );
    for (const old of ["Charts", "History", "Scenario"]) assert.ok(!links.some((a) => a.textContent === old), `old label ${old} is gone`);
    // PFNL-03: no per-link margin (the wrap is the container's column gap), so a wrapped row starts flush left.
    for (const a of links) assert.ok(!/\bml-\d/.test(a.className), a.className);
  });

  it("PFNL-02: titles and headings follow the labels", () => {
    assert.deepEqual(PF_NAV_LABELS, { charts: "Report Builder", history: "Yearly Ledger", scenario: "Scenario Analysis" });
    assert.deepEqual(PF_PAGE_TITLES, { charts: "Report Builder.", history: "Yearly Ledger.", scenario: "Scenario Analysis." });
    assert.equal(HISTORY_TITLE, "Yearly Ledger.");
    assert.equal(HISTORY_LINK, "Yearly Ledger");
    assert.equal(SCENARIO_TITLE, "Scenario Analysis.");
    assert.equal(pfDocTitle("charts"), "Report Builder · Personal Finance · Orpheus Wisdom");
    assert.equal(pfDocTitle("history"), "Yearly Ledger · Personal Finance · Orpheus Wisdom");
    assert.equal(pfDocTitle("scenario"), "Scenario Analysis · Personal Finance · Orpheus Wisdom");
    assert.equal(reportDocTitle("Report"), "Report · Report Builder · Orpheus Wisdom");
    assert.equal(reportDocTitle("New report"), "New report · Report Builder · Orpheus Wisdom");
    assert.equal(reportDocTitle("Edit report"), "Edit report · Report Builder · Orpheus Wisdom");
    // Each page and route uses them (no old literal left behind).
    assert.match(src("src/components/personal-finance/charts-page.tsx"), /<h1 className="pf-title mt-2">\{PF_PAGE_TITLES\.charts\}<\/h1>/);
    assert.match(src("src/components/personal-finance/history-page.tsx"), /<h1 className="pf-title mt-2">\{HISTORY_TITLE\}<\/h1>/);
    assert.match(src("src/components/personal-finance/expenses-page.tsx"), /\{scenario \? PF_PAGE_TITLES\.scenario : "Personal Finance\."\}/);
    assert.match(src("src/components/personal-finance/charts-builder.tsx"), /data-testid="pf-builder-back">\s*\{PF_NAV_LABELS\.charts\}\s*</);
    for (const [f, k] of [["charts", "charts"], ["history", "history"], ["scenario", "scenario"]])
      assert.match(src(`src/routes/personal-finance_.${f}.tsx`), new RegExp(`title: pfDocTitle\\("${k}"\\)`), f);
    for (const [f, w] of [["charts_.$id", "Report"], ["charts_.new", "New report"], ["charts_.$id_.edit", "Edit report"]])
      assert.match(src(`src/routes/personal-finance_.${f}.tsx`), new RegExp(`title: reportDocTitle\\("${w}"\\)`), f);
    for (const f of ["charts", "history", "scenario", "charts_.$id", "charts_.new", "charts_.$id_.edit"])
      assert.doesNotMatch(src(`src/routes/personal-finance_.${f}.tsx`), /"(Charts|History|Scenario) ·|· Charts ·/, f);
  });

  it("PFNL-04: routes and paths are unchanged", () => {
    assert.equal(CHARTS_PATH, "/personal-finance/charts");
    assert.equal(HISTORY_PATH, "/personal-finance/history");
    assert.equal(SCENARIO_PATH, "/personal-finance/scenario");
    for (const f of ["charts", "history", "scenario"])
      assert.match(src(`src/routes/personal-finance_.${f}.tsx`), new RegExp(`createFileRoute\\("/personal-finance_/${f}"\\)`), f);
  });

  it("PFNL-03: the sub-nav wraps whole links with the old 1.5rem spacing; links stay 44 px tall", () => {
    const css = src("src/styles.css");
    assert.match(css, /\.pf-subnav:not\(\[hidden\]\) \{ display: flex; flex-wrap: wrap; column-gap: 1\.5rem; \}/);
    assert.match(css, /\.pf-charts-back a \{ display: inline-flex; min-height: 2\.75rem;/);
    assert.doesNotMatch(css.slice(css.indexOf(".pf-subnav")), /^[^}]*tabular-nums|^[^}]*tnum/);
  });
});
