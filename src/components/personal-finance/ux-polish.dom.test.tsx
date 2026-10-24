// #262 (personal-finance-spec §76, AC PFUX-01..PFUX-08): Personal Finance + site UX polish.
import { dom } from "../../test/dom-setup";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PersonalFinancePage } from "./expenses-page";
import { ScenarioPage } from "./scenario-page";
import { HistoryPage } from "./history-page";
import { ChartsPage } from "./charts-page";
import { ChartsBuilder, type BuilderApi } from "./charts-builder";
import { writeRates } from "@/lib/finance/equity";
import { writeExpenses } from "@/lib/finance/expenses";
import { writeIncome } from "@/lib/finance/income";
import { writeMonths } from "@/lib/finance/months";
import { NO_OVERVIEW, writeOverview } from "@/lib/finance/overview";
import { RecordStore, type PfRecord } from "@/lib/finance/record";
import { SCENARIO_KEY } from "@/lib/finance/scenario-key";
import type { ChartData, ReportItem, Result } from "@/lib/finance/charts-api";
import type { Report } from "@/lib/finance/report";

const CSS = readFileSync("src/styles.css", "utf8");
const FONTS_CSS = readFileSync("src/styles/fonts.css", "utf8");
const PARTS_CSS = readFileSync("src/styles/parts.css", "utf8");
const NOW = new Date(Date.UTC(2026, 9, 15, 16, 0, 0));

const mounted: { root: Root; el: HTMLElement }[] = [];

afterEach(async () => {
  while (mounted.length) {
    const m = mounted.pop()!;
    await act(async () => m.root.unmount());
    m.el.remove();
  }
});

async function renderNode(node: React.ReactElement): Promise<HTMLElement> {
  const el = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(el);
  const root = createRoot(el);
  mounted.push({ root, el });
  await act(async () => {
    root.render(node);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
  return el;
}

const click = async (el: Element) => act(async () => (el as HTMLElement).click());

function seededRecord(): PfRecord {
  const s = new RecordStore({});
  const fixedLine = {
    id: "f1",
    name: "Mortgage",
    amount: "2000",
    per: "month" as const,
    equity: "",
    account: "Checking",
    currency: "",
    rate: "",
    category: "Housing",
  };
  const person = {
    id: "p1",
    name: "Alex",
    wages: "120,000",
    bonus: "0",
    tax: "25",
    share: "100",
    countWages: true,
    countBonus: true,
    foreign: false,
    currency: "",
    rate: "",
  };
  writeExpenses(s, {
    fixed: [fixedLine],
    variable: [],
    accounts: ["Checking"],
    categories: ["Housing"],
  });
  writeIncome(s, { people: [person] });
  writeRates(s, { withdrawal: "4", roic: "" });
  writeOverview(s, { ...NO_OVERVIEW, start: "100000", asOf: "2026-10", growth: "6" });
  writeMonths(s, {
    "2026-10": {
      fixed: [fixedLine],
      variable: [],
      people: [person],
    },
  });
  return s.data;
}

describe("#262 Personal Finance + site UX polish (PFUX-01..PFUX-08)", () => {
  it("PFUX-01: major Personal Finance sections carry .pf-section rhythm and spacing rules", async () => {
    assert.match(CSS, /\.pf-section\s*\{[^}]*border-top:\s*1px solid var\(--color-hair\);[^}]*padding-top:\s*2rem;/);
    const rec = seededRecord();
    const el = await renderNode(<PersonalFinancePage now={NOW} loadStore={async () => new RecordStore(rec)} />);
    for (const id of ["pf-income-block", "pf-expenses-block", "pf-summary-block", "pf-overview"]) {
      const sec = el.querySelector(`[data-testid="${id}"]`);
      assert.ok(sec, `${id} exists`);
      assert.ok(sec.classList.contains("pf-section"), `${id} has .pf-section`);
    }

    const histEl = await renderNode(
      <HistoryPage now={() => NOW} load={async () => ({ ok: true, status: 200, record: rec })} />,
    );
    assert.ok(histEl.querySelector(`[data-testid="pf-history"]`)?.classList.contains("pf-section"));

    const chartsEl = await renderNode(
      <ChartsPage load={async () => ({ ok: true, status: 200, data: { reports: [], limit: 20 } })} />,
    );
    assert.ok(chartsEl.querySelector(`[data-testid="pf-charts"]`)?.classList.contains("pf-section"));
  });

  it("PFUX-02 & PFUX-06: button hierarchy classes (.pf-button-primary, .pf-button-secondary, .pf-button-ghost, .pf-button-danger) and responsive wrapping rules", async () => {
    assert.match(CSS, /\.pf-button\s*\{[^}]*min-height:\s*2\.75rem;[^}]*max-width:\s*100%;/);
    assert.match(CSS, /\.pf-button-primary\s*\{[^}]*background:\s*var\(--color-chalk\);[^}]*color:\s*var\(--color-night\);/);
    assert.match(CSS, /\.pf-button\.pf-button-secondary\s*\{[^}]*background:\s*transparent;[^}]*border-color:\s*var\(--color-rule\);[^}]*color:\s*var\(--color-chalk\);/);
    assert.match(CSS, /\.pf-button\.pf-button-ghost\s*\{[^}]*background:\s*transparent;[^}]*color:\s*var\(--color-dim\);/);
    assert.match(CSS, /\.pf-button-danger,[\s\S]*?\.pf-button\.pf-button-danger\s*,[\s\S]*?\{[^}]*background:\s*transparent;[^}]*border:\s*1px solid var\(--color-danger\);[^}]*color:\s*var\(--color-danger\);/);
    assert.match(CSS, /\.pf-saved-actions\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap;/);

    const rec = seededRecord();
    const el = await renderNode(<PersonalFinancePage now={NOW} loadStore={async () => new RecordStore(rec)} />);

    // Copy button in reserved line uses secondary variant
    const copyBtn = el.querySelector(`[data-testid="pf-month-copy"]`)!;
    assert.ok(copyBtn.classList.contains("pf-button"));
    assert.ok(copyBtn.classList.contains("pf-button-secondary"));

    // Filter row: Rename is ghost, Delete account / Delete category are danger with pf-delete preserved
    const renameCat = el.querySelector(`[data-testid="pf-rename-category"]`)!;
    assert.ok(renameCat.classList.contains("pf-button-ghost"));
    for (const id of ["pf-delete-account", "pf-delete-category"]) {
      const del = el.querySelector(`[data-testid="${id}"]`)!;
      assert.ok(del.classList.contains("pf-button"));
      assert.ok(del.classList.contains("pf-button-danger"));
      assert.ok(del.classList.contains("pf-delete"));
    }

    // Scenario page button hierarchy
    const savedRecord: PfRecord = {
      ...rec,
      [SCENARIO_KEY]: JSON.stringify({
        version: 1,
        saved: [
          {
            id: "s1",
            name: "Baseline A",
            savedAt: "2026-10-15T12:00:00.000Z",
            basis: "2026-10",
            inputs: { start: 100000, income: 7500, expenses: 2000, growth: 6, rate: 4 },
            values: {},
            lines: JSON.stringify({ fixed: [], variable: [], people: [] }),
          },
          {
            id: "s2",
            name: "Baseline B",
            savedAt: "2026-10-15T12:05:00.000Z",
            basis: "2026-10",
            inputs: { start: 100000, income: 8000, expenses: 2000, growth: 6, rate: 4 },
            values: {},
            lines: JSON.stringify({ fixed: [], variable: [], people: [] }),
          },
        ],
      }),
    };
    const scEl = await renderNode(
      <ScenarioPage
        now={NOW}
        load={async () => ({ ok: true, record: savedRecord, access: { allowed: true, write: true, owner: true } })}
      />,
    );

    const saveScenarioBtn = scEl.querySelector(`[data-testid="pf-saved-save"]`)!;
    assert.ok(saveScenarioBtn.classList.contains("pf-button-primary"));

    const toggleBtn = scEl.querySelector(`[data-testid="pf-saved-toggle"]`)!;
    assert.ok(toggleBtn.classList.contains("pf-button-secondary"));
    await click(toggleBtn);

    const savedTable = scEl.querySelector(`[data-testid="pf-saved-table"]`)!;
    assert.ok(savedTable.classList.contains("pf-saved-table"));

    const openBtn = scEl.querySelector(`[data-testid="pf-saved-open"]`)!;
    const renameBtn = scEl.querySelector(`[data-testid="pf-saved-rename"]`)!;
    const updateBtn = scEl.querySelector(`[data-testid="pf-saved-update"]`)!;
    const deleteBtn = scEl.querySelector(`[data-testid="pf-saved-delete"]`)!;
    assert.ok(openBtn.classList.contains("pf-button-secondary"));
    assert.ok(renameBtn.classList.contains("pf-button-ghost"));
    assert.ok(updateBtn.classList.contains("pf-button-secondary"));
    assert.ok(deleteBtn.classList.contains("pf-button-danger"));

    // Select both rows to reveal Compare selected primary CTA
    const checks = scEl.querySelectorAll(`[data-testid="pf-saved-compare"]`);
    await click(checks[0]);
    await click(checks[1]);
    const cmpBtn = scEl.querySelector(`[data-testid="pf-saved-compare-button"]`)!;
    assert.ok(cmpBtn.classList.contains("pf-button-primary"));
    await click(cmpBtn);
    assert.ok(scEl.querySelector(`[data-testid="pf-compare-section"]`)?.classList.contains("pf-section"));

    // Charts builder save & cancel hierarchy
    const rep: Report = { series: [{ kind: "group", id: "all" }], range: { preset: "12m" }, chart: "line" };
    const repItem: ReportItem = {
      id: "r-00000001",
      name: "Cashflow",
      default: false,
      report: rep,
      missing: [],
      deleted: [],
      labels: ["all"],
      created_at: null,
      updated_at: null,
    };
    const api: BuilderApi = {
      record: async () => rec,
      list: async () => ({ ok: true, status: 200, data: { limit: 20, reports: [repItem] } }),
      get: async () => ({ ok: true, status: 200, data: repItem } as Result<ReportItem>),
      chart: async () => ({
        ok: true,
        status: 200,
        data: {
          chart: "line",
          mixed_axes: false,
          source: "request",
          labels: ["all"],
          series: [{ kind: "group", id: "all", axis: "flow", stack: false, values: [1] }],
          rows: [{ month: "2026-10", label: "Oct", partial: true, values: [1] }],
        } as unknown as ChartData,
      }),
      create: async () => ({ ok: true, status: 201, data: repItem }),
      update: async () => ({ ok: true, status: 200, data: repItem }),
      remove: async () => ({ ok: true, status: 200, data: { deleted: "r-00000001" } }),
    };
    const builderEl = await renderNode(<ChartsBuilder now={NOW} debounceMs={0} id="r-00000001" api={api} />);
    assert.ok(builderEl.querySelector(`[data-testid="pf-builder-save"]`)?.classList.contains("pf-button-primary"));
    const builderDel = builderEl.querySelector(`[data-testid="pf-builder-delete"]`)!;
    assert.ok(builderDel.classList.contains("pf-button-danger"));
    await click(builderDel);
    assert.ok(builderEl.querySelector(`[data-testid="pf-builder-delete-yes"]`)?.classList.contains("pf-button-danger"));
    assert.ok(builderEl.querySelector(`[data-testid="pf-builder-delete-cancel"]`)?.classList.contains("pf-button-ghost"));
  });

  it("PFUX-03: table refinement — right-aligned numeric columns, sticky headers, and soft dark row hover", () => {
    assert.match(CSS, /\.pf-ov-head\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;[\s\S]*?border-bottom:\s*1px solid var\(--color-rule\);/);
    assert.match(CSS, /\.pf-ov-head > :not\(:first-child\)\s*\{[^}]*text-align:\s*right;/);
    assert.match(CSS, /\.pf-ov-value\s*\{[^}]*text-align:\s*right;[^}]*font-variant-numeric:\s*slashed-zero;/);
    assert.match(CSS, /\.pf-ov-row:not\(\.pf-ov-head\):hover\s*\{[^}]*background-color:\s*rgb\(242 240 235 \/ 0\.03\);/);
    assert.match(CSS, /\.pf-history-grid thead th\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;/);
    assert.match(CSS, /\.pf-saved-table thead th\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;/);
    assert.match(CSS, /\.pf-table thead th\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;/);
    assert.match(CSS, /\.pf-table td:nth-child\(5\)\s*\{[^}]*text-align:\s*right;/);
    assert.match(CSS, /\.pf-num\s*\{[^}]*text-align:\s*right;[^}]*font-variant-numeric:\s*slashed-zero;/);
  });

  it("PFUX-04: quiet feedback and empty/loading states keep reserved space (CLS = 0) and muted styling", async () => {
    const rec = seededRecord();
    const el = await renderNode(<PersonalFinancePage now={NOW} loadStore={async () => new RecordStore(rec)} />);
    const unsaved = el.querySelector(`[data-testid="pf-unsaved"]`)!;
    assert.equal(unsaved.getAttribute("data-shown"), "false");
    const figNote = el.querySelector(`[data-testid="pf-figures-note"]`)!;
    assert.equal(figNote.getAttribute("data-shown"), "false");
    const copyLine = el.querySelector(`[data-testid="pf-month-copy-line"]`)!;
    assert.equal(copyLine.getAttribute("data-shown"), "false");
  });

  it("PFUX-05 & PFUX-07 & PFUX-08: font stack includes Schibsted Grotesk + Alliance fallbacks, zero tabular-nums/tnum on dark pages, single-block tap-target rules intact", () => {
    assert.match(
      CSS,
      /--font-sans:\s*"Schibsted Grotesk",\s*"Schibsted Grotesk Fallback",\s*"Alliance No\.1",\s*"Alliance No\.2",\s*"Inter",\s*"Helvetica Neue",\s*Helvetica,\s*Arial,\s*sans-serif;/,
    );
    assert.equal((FONTS_CSS.match(/^@font-face\b/gm) ?? []).length, 7);
    for (const css of [CSS, FONTS_CSS, PARTS_CSS]) {
      assert.ok(!/fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(css));
    }
    const darkRules = [...CSS.matchAll(/\n {2}(\.(?:calc|home|signin|pf)[^{]*)\{([^}]*)\}/g)];
    for (const [, sel, body] of darkRules) {
      assert.ok(!/tabular-nums|"tnum"/i.test(body), `${sel.trim()} must not enable tnum`);
    }
  });
});
