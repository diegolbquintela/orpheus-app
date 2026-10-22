import { Minus } from "lucide-react";
import { type ReactNode, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { fieldErrors, SAVE_BLOCKED } from "@/lib/finance/field-errors";
import { PF_DELETE_UI } from "@/lib/finance/flags";
import {
  ACCOUNT_MAX,
  ACCOUNTS_MAX,
  addAccount,
  addCategory,
  AMOUNT_ERROR,
  CATEGORIES_MAX,
  CATEGORY_MAX,
  accountTotals,
  categoryTotals,
  matchesFilters,
  NO_ACCOUNT,
  newFilteredLine,
  calculatedEquity,
  COLUMNS,
  type Expenses,
  fieldText,
  formatShare,
  grandTotals,
  type GroupKey,
  GROUPS,
  householdMonthlyOf,
  isForeign,
  type Line,
  LINES_MAX,
  NAME_MAX,
  NO_CATEGORY,
  NOT_COMPUTED,
  parseAmount,
  parseRate,
  readExpenses,
  renameCategory,
  deleteQuestion,
  deleteName,
  deleteNameQuestion,
  deletedLabel,
  DELETE_ACCOUNT,
  DELETE_CATEGORY,
  type NameKind,
  relinkName,
  UNNAMED_EXPENSE,
  type Totals,
  totalsOf,
  writeExpenses,
  migrateExpenses,
} from "@/lib/finance/expenses";
import { formatMoney } from "@/lib/finance/money";
import {
  type Income,
  monthly,
  netIncomeYearly,
  rateLabel,
  writeIncome,
} from "@/lib/finance/income";
import { type Rates, rateUsed, readRates, writeRates } from "@/lib/finance/equity";
import {
  CURRENCIES,
  type CurrencyCode,
  currencyChoices,
  FX_RATE_LABEL,
  FX_HISTORY_NOTE,
  type Household,
  HOUSEHOLD_LABEL,
  isCurrency,
  RATE_ERROR,
  readHousehold,
  writeHousehold,
} from "@/lib/finance/currency";
import { EquityRates } from "./equity-rates";
import { IncomeBlock } from "./income-block";
import { OverviewBlock } from "./overview-block";
import { PeriodChoice } from "./period-choice";
import { PeriodInput } from "./period-input";
import { Cell, Lock, SectionHead } from "./pf-cells";
import { ReadOnlyLine } from "@/components/access/denied";
import { basisNote as scenarioBasis, WHAT_IF_NOTE as SCENARIO_WHAT_IF } from "@/lib/finance/scenario";

import {
  type Figures,
  lastTwelve,
  type MonthKey,
  monthName,
  type Overview,
  readOverview,
  SAVE,
  UNSAVED,
  writeOverview,
  typedFigure,
} from "@/lib/finance/overview";
import {
  copiedNote,
  DISCARD_CONFIRM,
  typedOverCopy,
  lineFigures,
  liveLineFigures,
  deleteInMonths,
  type PendingDelete,
  withoutDeletedFor,
  migrateMonths,
  chosenMonth,
  COPY_FROM_CURRENT,
  copyOfCurrent,
  MONTH_CONTROL_LABEL,
  MONTH_OPTIONS,
  openMonth,
  hasLines,
  readMonths,
  renameInMonths,
  writeMonths,
  YEAR_CONTROL_LABEL,
  yearChoices,
} from "@/lib/finance/months";
import { loadAccountStore, type LoadStore, type StoreLike } from "@/lib/finance/account-client";
import {
  isOpen,
  readView,
  type SectionKey,
  toggleSection,
  type View,
  writeView,
} from "@/lib/finance/view";

const ADD_ACCOUNT = "__add-account__";
const ADD_CATEGORY = "__add-category__";
/** The filter's "every line" value (no category is named this: names are typed, this is not offered). */
const ALL = "";

let currentStore: StoreLike | null = null;
/** The loaded store (#102: the account's record; tests: localStorage). Null until loaded. */
function storage(): StoreLike | null {
  return currentStore;
}

/**
 * Personal Finance (#84 v1.1, #85 v1.2, #86 v1.3, #87 v1.4, #94; spec `attachments/personal-finance-spec.md`,
 * PF-01..32): the household currency, the income block, the equity-cover rates and Fixed and Variable expenses
 * (a line may be in a foreign currency with a typed FX rate), then (#94) `04` Overview and `05` Update. #102: the
 * five values live against the signed-in account (`loadStore`, default the account API); a failed save shows
 * `Not saved.` (absolutely placed under the title, so nothing moves). The server renders the title
 * and an empty area at least the viewport tall; the browser fills it once after reading storage, so nothing on
 * screen moves (strict CLS 0).
 */
/**
 * #221 (spec 57, PFPJ): the scenario screen renders this page in scenario mode: the same sections from Income through
 * Overview, prefilled from the saved record (the current month, or its unsaved copy of last month), with the
 * categories parts removed (the category filter and `By category`), no month control and no Save. The scenario's store
 * has no `save`, so no edit, toggle or migration is ever sent. `render` draws the projection below, from the live figures.
 */
export type ScenarioLive = {
  overview: Overview;
  now: Date;
  current: MonthKey;
  copiedFrom: MonthKey | null;
  lines: Record<MonthKey, Figures>;
  page: { expenses: number | null; income: number | null };
  rate: number | null;
  currency: string;
};
export type ScenarioMode = { render: (live: ScenarioLive) => ReactNode };

export function PersonalFinancePage({
  now: fixedNow,
  loadStore = loadAccountStore,
  readOnly = false,
  deleteUi = PF_DELETE_UI,
  scenario,
}: {
  now?: Date;
  loadStore?: LoadStore;
  readOnly?: boolean;
  /** #165: the Delete UI (default: the `PF_DELETE_UI` constant; tests pass both values). */
  deleteUi?: boolean;
  /** #221: scenario mode (what-ifs only, nothing sent). */
  scenario?: ScenarioMode;
} = {}) {
  const [saveFailed, setSaveFailed] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [expenses, setExpenses] = useState<Expenses | null>(null);
  const [income, setIncome] = useState<Income | null>(null);
  const [rates, setRates] = useState<Rates | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);
  /** `<line id>` while adding an account on that line, `cat:<line id>` while adding a category (#105). */
  const [adding, setAdding] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  /** #105 (PF-45): the category filter, this visit only; ALL shows every line. */
  const [filter, setFilter] = useState<string>(ALL);
  /** #119 (PF-71): the account filter, this visit only; ALL shows every line. */
  const [acctFilter, setAcctFilter] = useState<string>(ALL);
  /** #112: the month shown, the month its lines were copied from (unsaved), the saved state, a saved-count. */
  const [month, setMonth] = useState<MonthKey | null>(null);
  const [copiedFrom, setCopiedFrom] = useState<MonthKey | null>(null);
  const [baseline, setBaseline] = useState<string>("");
  const [saved, setSaved] = useState(0);
  const [saving, setSaving] = useState(false);
  /** #143 (Q-S1): Save was pressed while a field showed an error. */
  const [blocked, setBlocked] = useState(false);
  /** #113: category renames since the last save / month switch (applied to every stored month on Save). */
  const [renames, setRenames] = useState<[string, string][]>([]);
  /** #165: category / account deletes made on the shown month (applied to it and later months on Save). */
  const [deletes, setDeletes] = useState<PendingDelete[]>([]);

  useEffect(() => {
    let alive = true;
    loadStore({ onSaved: (ok) => alive && setSaveFailed(!ok) })
      .then((store) => {
        if (!alive) return;
        currentStore = store;
        migrateExpenses(store);
        const today = fixedNow ?? new Date();
        const current = lastTwelve(today)[11];
        // Decision 4: the record's lines become the current month's (stored for a writer; no change shown).
        if (migrateMonths(store, current) && !readOnly && !scenario) void store.save?.();
        setNow(today);
        setView(readView(store));
        open(current, current);
      })
      .catch(() => alive && setSaveFailed(true));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixedNow, loadStore]);

  /** #112: show a month from the saved record (its own lines, else a copy; decisions 3–5; Q-M1: read-only too). */
  function open(key: MonthKey, current: MonthKey) {
    const store = storage();
    const shared = readExpenses(store);
    const opened = openMonth(readMonths(store), key, current, true);
    // #165 Q-Z7: a copy never carries a name deleted on or before this month.
    const lines = opened.copiedFrom ? withoutDeletedFor(opened.lines, shared, key) : opened.lines;
    const e = { ...shared, fixed: lines.fixed, variable: lines.variable };
    const i = { people: lines.people };
    const r = readRates(store);
    const h = readHousehold(store);
    const o = readOverview(store);
    setExpenses(e);
    setIncome(i);
    setRates(r);
    setHousehold(h);
    setOverview(o);
    setMonth(key);
    setCopiedFrom(opened.copiedFrom);
    setRenames([]);
    setDeletes([]);
    setBlocked(false);
    setBaseline(canonical(e, i, r, h, o));
  }

  /**
   * #163 (PFM-15..PFM-19): `Copy from current month` puts the current month's saved lines into the shown empty past
   * month (unsaved: the note and Save show; nothing is stored until Save). Shown only to a writer, for a past month
   * with nothing on screen, when the current month has saved lines.
   */
  const current = now ? lastTwelve(now)[11] : null;
  const copySource = useMemo(
    () => (current ? copyOfCurrent(readMonths(storage()), current) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [saved, current, month],
  );
  const canCopyCurrent =
    !readOnly &&
    !!(month && current && month !== current && copySource && expenses && income) &&
    expenses!.fixed.length + expenses!.variable.length + income!.people.length === 0;
  function copyCurrent() {
    if (!canCopyCurrent || !copySource || !expenses || !current || !month) return;
    const lines = withoutDeletedFor(copySource, expenses, month);
    setExpenses({ ...expenses, fixed: lines.fixed, variable: lines.variable });
    setIncome({ people: lines.people });
    setCopiedFrom(current);
  }

  /** #163 Q-Y8: something typed or changed on the shown month (an untouched copy has nothing to lose). */
  const edited =
    !readOnly &&
    !!(expenses && income && rates && household && overview) &&
    canonical(expenses, income, rates, household, overview) !== baseline;
  // #221: the scenario screen never saves, so it never warns on leaving.
  const dirty = !readOnly && !scenario && (copiedFrom !== null || edited);

  // Decision 2: leaving with unsaved changes asks (the browser's own question).
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const hasErrors =
    !!(expenses && income && rates && household && overview) &&
    fieldErrors({ expenses, income, rates, overview, household: household.household }).length > 0;

  // #166 (CFO Q-AN1 / Q-AN3 / Q-AN6): an empty current month counts as its copy whichever month is shown (read-only too),
  // unless it has typed `05` Update totals, which win as before. The averages use complete months only, so they never
  // include it (Q-AN2 as changed by the CFO).
  // EL / CFO V2 order for the current month: stored lines > typed Update totals > unsaved copy > `—`, whichever month
  // is shown (so typed totals beat the copy even while October's copy is on screen).
  const typedNow = current ? overview?.months[current] : undefined;
  const hasTypedNow = !!(typedNow && (typedNow.expenses?.trim() || typedNow.income?.trim()));
  const copyMonth = current ?? undefined;
  const typedE = typedFigure(typedNow?.expenses);
  const typedI = typedFigure(typedNow?.income);
  // #144 (Q-V1, PF-159..PF-161): every figure is live: each month as Save would store it (read-only: the saved record).
  const figures = useMemo(
    () =>
      typedOverCopy(
        readOnly || !month || !expenses || !income || !rates || !household
          ? lineFigures(storage(), copyMonth)
          : liveLineFigures(
            storage(),
            {
              month,
              lines: { fixed: expenses.fixed, variable: expenses.variable, people: income.people },
              expenses,
              rates,
              household: household.household,
            },
            copyMonth,
          ),
        storage(),
        current,
        { expenses: typedE, income: typedI },
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [saved, month, readOnly, expenses, income, rates, household, copyMonth, typedE, typedI],
  );
  // #144: Save drops the shown month's old typed totals, so while something is unsaved the live Overview does too
  // (unedited, the page shows exactly the saved figures).
  const liveOverview = useMemo(() => {
    if (!dirty || !overview || !month || !(month in overview.months)) return overview;
    // #166 V2: the current month with typed totals and no stored lines keeps them (typed > unsaved copy).
    if (hasTypedNow && month === current && !hasLines(readMonths(storage())[month])) return overview;
    const months = { ...overview.months };
    delete months[month];
    return { ...overview, months };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview, month, dirty, hasTypedNow, current, saved]);

  function choose(key: MonthKey) {
    if (!now || key === month) return;
    if (edited && !window.confirm(DISCARD_CONFIRM)) return;
    open(key, lastTwelve(now)[11]);
  }

  /** Decision 2 / 7: store the shown month's lines and the shared values; stay on the month. */
  async function save() {
    const store = storage();
    if (!store || !month || !expenses || !income || !rates || !household || !overview) return;
    // #143 (PF-133, Q-S1): any field in error → nothing written, no PUT; the note and focus on the first such field.
    if (fieldErrors({ expenses, income, rates, overview, household: household.household }).length) {
      setBlocked(true);
      // #144 Q-V7 (PF-164): a blocked Save is a non-save too: `Not saved.` until a save succeeds.
      setSaveFailed(true);
      document.querySelector<HTMLElement>(".pf [aria-invalid=true]")?.focus();
      return;
    }
    setBlocked(false);
    // #113 (PF-65): renames reach every month (read against the old list, before it is replaced).
    // #165 (PFD-01..PFD-03): deletes reach the shown month and later months only; earlier months are left as stored.
    const months = deleteInMonths(renameInMonths(readMonths(store), renames), deletes);
    months[month] = { fixed: expenses.fixed, variable: expenses.variable, people: income.people };
    const legacy = { ...overview.months };
    delete legacy[month];
    const nextOverview = { ...overview, months: legacy };
    writeExpenses(store, expenses);
    writeIncome(store, income);
    writeRates(store, rates);
    writeHousehold(store, household);
    writeOverview(store, nextOverview);
    writeMonths(store, months);
    setSaving(true);
    const ok = store.save ? await store.save() : true;
    setSaving(false);
    setSaveFailed(!ok);
    if (!ok) return;
    setOverview(nextOverview);
    setCopiedFrom(null);
    setRenames([]);
    setDeletes([]);
    setBaseline(canonical(expenses, income, rates, household, nextOverview));
    setSaved((n) => n + 1);
  }

  function updateOverview(change: (current: Overview) => Overview) {
    setOverview((current) => (current ? change(current) : current));
  }

  function toggle(section: SectionKey) {
    // #143 PF-142 (Q-S6 condition): with a field in error on screen, the section still opens / closes and its view is
    // kept in the store (sent with the next successful Save), but no PUT is sent; `Not saved.` shows and stays until
    // a save succeeds; the edits stay on screen.
    const blockedNow = hasErrors && !readOnly;
    if (blockedNow) setSaveFailed(true);
    setView((current) => {
      if (!current) return current;
      const next = toggleSection(current, section);
      // Section toggles save at once (a view preference; #90 Q-D11).
      // #221: in scenario mode a toggle is for this visit only (nothing written or sent).
      if (scenario) return next;
      writeView(storage(), next);
      if (!blockedNow) void storage()?.save?.();
      return next;
    });
  }

  function updateIncome(change: (current: Income) => Income) {
    setIncome((current) => (current ? change(current) : current));
  }

  function updateRates(patch: Partial<Rates>) {
    setRates((current) => (current ? { ...current, ...patch } : current));
  }

  function updateHousehold(code: CurrencyCode) {
    setHousehold({ household: code });
  }

  function update(change: (current: Expenses) => Expenses) {
    setExpenses((current) => (current ? change(current) : current));
  }

  const updateLine = (group: GroupKey, id: string, patch: Partial<Line>) =>
    update((e) => ({ ...e, [group]: e[group].map((l) => (l.id === id ? { ...l, ...patch } : l)) }));

  return (
    <PeriodChoice.Provider value={!!scenario}>
    <div className="pf">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-14 px-5 pt-10 pb-20 sm:px-8 lg:gap-16 lg:pt-14 lg:pb-24">
        <header className="relative">
          <p className="pf-label">01</p>
          <h1 className="pf-title mt-2">{scenario ? "Scenario." : "Personal Finance."}</h1>
          {scenario ? (
            <>
              <p className="pf-charts-back mt-3">
                <a href="/personal-finance" data-testid="pf-scenario-back">
                  Personal Finance
                </a>
              </p>
              <p className="pf-history-note mt-3" data-testid="pf-scenario-whatif">
                {SCENARIO_WHAT_IF}
              </p>
              <p className="pf-history-note mt-1" data-testid="pf-scenario-basis">
                {current ? scenarioBasis(copiedFrom, current, hasLines(readMonths(storage())[current])) : ""}
              </p>
            </>
          ) : null}
          {/* #160 (spec 45, Q-AJ1): the Charts page, linked both ways. */}
          <p className="pf-charts-back mt-3" hidden={!!scenario}>
            <a href="/personal-finance/charts" data-testid="pf-charts-link">
              Charts
            </a>
            {/* #214 (spec 53, PFHT-01): the read-only History table. */}
            <a href="/personal-finance/history" className="ml-6" data-testid="pf-history-link">
              History
            </a>
            {/* #215 (spec 55, PFSC-01): the what-if scenario screen. */}
            <a href="/personal-finance/scenario" className="ml-6" data-testid="pf-scenario-link">
              Scenario
            </a>
          </p>
          {readOnly ? <ReadOnlyLine className="mt-3" /> : null}
          <p className="pf-save" role="status" data-testid="pf-save">
            {saveFailed ? "Not saved." : ""}
          </p>
          {scenario ? null : <MonthControl
            now={now}
            month={month}
            onChoose={choose}
            dirty={dirty}
            readOnly={readOnly}
            saving={saving}
            onSave={() => void save()}
            onCopy={canCopyCurrent ? copyCurrent : null}
            note={
              blocked && hasErrors
                ? SAVE_BLOCKED
                : copiedFrom
                  ? copiedNote(monthName(copiedFrom))
                  : ""
            }
          />}
        </header>

        <div
          className="pf-area flex flex-col gap-14 lg:gap-16"
          data-testid="pf-area"
          data-ready={
            expenses && income && rates && household && overview && now && view ? "true" : "false"
          }
        >
          {expenses && income && rates && household && overview && now && view ? (
            <>
              <Lock on={readOnly}>
                <HouseholdCurrency value={household.household} onChange={updateHousehold} />
              </Lock>
              <IncomeBlock
                income={income}
                update={updateIncome}
                household={household.household}
                open={isOpen(view, "income")}
                onToggle={() => toggle("income")}
                readOnly={readOnly}
              />
              <section
                className="flex flex-col gap-8"
                aria-labelledby="pf-expenses"
                data-testid="pf-expenses-block"
              >
                <SectionHead
                  numeral="03"
                  title="Expenses"
                  id="pf-expenses"
                  toggle={{
                    open: isOpen(view, "expenses"),
                    controls: "pf-expenses-body",
                    onToggle: () => toggle("expenses"),
                    testId: "pf-toggle-expenses",
                  }}
                />
                <div
                  id="pf-expenses-body"
                  className="pf-section-body flex flex-col gap-8"
                  data-testid="pf-body-expenses"
                >
                  {isOpen(view, "expenses") ? (
                    <>
                      <Lock on={readOnly}>
                        <EquityRates rates={rates} update={updateRates} />
                      </Lock>
                      {/* #119 S7 (amended, EL 07:51): filters are view-only, so read-only grantees can use them. */}
                      {/* #221: the scenario screen has no categories part (no filter). */}
                      {scenario ? null : <CategoryFilter
                        readOnly={readOnly}
                        categories={expenses.categories}
                        value={expenses.categories.includes(filter) ? filter : ALL}
                        onChange={setFilter}
                        accounts={expenses.accounts}
                        account={expenses.accounts.includes(acctFilter) ? acctFilter : ALL}
                        onAccount={setAcctFilter}
                        onRename={(from, typed) => {
                          const result = renameCategory(expenses, from, typed);
                          if ("error" in result) return result.error;
                          update(() => result.expenses);
                          if (result.name !== from) setRenames((r) => [...r, [from, result.name]]);
                          setFilter(result.name);
                          return null;
                        }}
                        onDelete={!deleteUi || readOnly ? null : (kind, name) => {
                          // #168 Q-AM3: hidden (not just disabled) for a Read grant; the server refuses the save anyway.
                          // #165 (PFD-01, Q-Z2): confirm, then the shown month loses it now; Save applies it onwards.
                          if (!month || !window.confirm(deleteNameQuestion(name))) return;
                          update((e) => deleteName(e, kind, name, month));
                          setDeletes((d) => [...d, { kind, name, from: month }]);
                          if (kind === "category") setFilter(ALL);
                          else setAcctFilter(ALL);
                        }}
                      />}
                      <Lock on={readOnly}>
                        <div className="flex flex-col gap-12">
                          <Groups
                            expenses={expenses}
                            rate={rateUsed(rates)}
                            household={household.household}
                            incomeMonthly={monthly(
                              netIncomeYearly(income.people, household.household),
                            )}
                            filter={expenses.categories.includes(filter) ? filter : ALL}
                            account={expenses.accounts.includes(acctFilter) ? acctFilter : ALL}
                            adding={adding}
                            setAdding={setAdding}
                            update={update}
                            updateLine={updateLine}
                          />
                        </div>
                      </Lock>
                    </>
                  ) : null}
                </div>
              </section>
              <ExpensesSummary
                expenses={expenses}
                rate={rateUsed(rates)}
                household={household.household}
                category={expenses.categories.includes(filter) ? filter : ALL}
                account={expenses.accounts.includes(acctFilter) ? acctFilter : ALL}
                open={isOpen(view, "summary")}
                onToggle={() => toggle("summary")}
                categories={!scenario}
              />
              <OverviewBlock
                overview={liveOverview ?? overview}
                update={updateOverview}
                now={now}
                lines={figures}
                open={isOpen(view, "overview")}
                onToggle={() => toggle("overview")}
                readOnly={readOnly}
                rate={rateUsed(rates)}
                currency={household.household}
                fieldsInError={readOnly ? null : hasErrors}
                page={{
                  expenses: grandTotals(expenses, rateUsed(rates), household.household).monthly,
                  income: monthly(netIncomeYearly(income.people, household.household)),
                }}
              />
              {scenario && current
                ? scenario.render({
                    overview: liveOverview ?? overview,
                    now,
                    current,
                    copiedFrom,
                    lines: figures,
                    page: {
                      expenses: grandTotals(expenses, rateUsed(rates), household.household).monthly,
                      income: monthly(netIncomeYearly(income.people, household.household)),
                    },
                    rate: rateUsed(rates),
                    currency: household.household,
                  })
                : null}
            </>
          ) : null}
        </div>
      </main>
    </div>
    </PeriodChoice.Provider>
  );
}

/** #112: the saved-state fingerprint of the shown month (Save shows when the page differs from it). */
const canonical = (e: Expenses, i: Income, r: Rates, h: Household, o: Overview): string =>
  JSON.stringify([e, i, r, h, { ...o, months: {} }]);

/**
 * #112 (PF-48, PF-49), #163 (spec section 34, PFM-01..PFM-12): `Month` (Jan..Dec) and `Year` (2020 to the current
 * year), each label above its select, under the title; `Save` beside them only while something is unsaved, and the
 * copy note under it. A choice opens its month at once; a future month can't be chosen (Q-Y1). The row and the note
 * line are reserved from the server render, so nothing moves (strict CLS 0).
 */
function MonthControl({
  now,
  month,
  onChoose,
  dirty,
  saving,
  onSave,
  onCopy,
  note,
  readOnly,
}: {
  onCopy: (() => void) | null;
  readOnly: boolean;
  now: Date | null;
  month: MonthKey | null;
  onChoose: (key: MonthKey) => void;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  note: string;
}) {
  const uid = useId();
  const current = now ? lastTwelve(now)[11] : null;
  const years = current ? yearChoices(current) : [];
  const [year, mm] = month ? month.split("-") : ["", ""];
  return (
    <div className="pf-month mt-6" data-testid="pf-month-control">
      <div className="pf-month-row">
        <span className="pf-month-field">
          <label htmlFor={`${uid}-month`} className="pf-label">
            {MONTH_CONTROL_LABEL}
          </label>
          <select
            id={`${uid}-month`}
            value={mm}
            disabled={!month}
            onChange={(event) => current && onChoose(chosenMonth(year, event.target.value, current))}
            className="pf-field pf-month-select"
            data-testid="pf-month"
          >
            {month ? null : <option value="" />}
            {MONTH_OPTIONS.map((name, i) => {
              const value = String(i + 1).padStart(2, "0");
              return (
                <option key={value} value={value} disabled={!!current && `${year}-${value}` > current}>
                  {name}
                </option>
              );
            })}
          </select>
        </span>
        <span className="pf-month-field">
          <label htmlFor={`${uid}-year`} className="pf-label">
            {YEAR_CONTROL_LABEL}
          </label>
          <select
            id={`${uid}-year`}
            value={year}
            disabled={!month}
            onChange={(event) => current && onChoose(chosenMonth(event.target.value, mm, current))}
            className="pf-field pf-year-select"
            data-testid="pf-month-year"
          >
            {month ? null : <option value="" />}
            {years.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
        </span>
        {/* #144 (PF-162, PF-171, PF-174): the Save slot (the button, or a Save-sized placeholder) stays beside the select
            from 400 px (spec 19.4); `Unsaved changes` is its own flex item right after it, always rendered (shown by
            visibility), so it takes the same place clean or unsaved: where it doesn't fit it wraps alone, in both
            states, and nothing ever moves. Read-only: no indicator. */}
        <span className="pf-month-save">
          {dirty ? (
            <button
              type="button"
              className="pf-button"
              onClick={onSave}
              disabled={saving}
              data-testid="pf-month-save"
            >
              {SAVE}
            </button>
          ) : (
            <span className="pf-save-slot" aria-hidden="true" />
          )}
        </span>
        {readOnly ? null : (
          <span className="pf-unsaved" role="status" data-testid="pf-unsaved" data-shown={dirty ? "true" : "false"}>
            {UNSAVED}
          </span>
        )}
      </div>
      {/* #163 PFM-11 (QA fix of e7a19fa): the copy line is always rendered and shown by visibility, so its space is
          reserved from the first render and nothing moves on a month change. Hidden, it is neither focusable nor in
          the accessibility tree (visibility: hidden), and it is disabled as well. */}
      <p className="pf-month-copy" data-testid="pf-month-copy-line" data-shown={onCopy ? "true" : "false"}>
        <button
          type="button"
          className="pf-button"
          onClick={onCopy ?? undefined}
          disabled={!onCopy}
          tabIndex={onCopy ? undefined : -1}
          data-testid="pf-month-copy"
        >
          {COPY_FROM_CURRENT}
        </button>
      </p>
      <p className="pf-month-note" data-testid="pf-month-note">
        {note}
      </p>
    </div>
  );
}

/** `Household currency` (#87, section 14): one select above `02` `Income`; the figures are in it. */
function HouseholdCurrency({
  value,
  onChange,
}: {
  value: CurrencyCode;
  onChange: (code: CurrencyCode) => void;
}) {
  const uid = useId();
  return (
    <div className="pf-cell pf-household" data-testid="pf-household-cell">
      <label htmlFor={`${uid}-household`} className="pf-label">
        {HOUSEHOLD_LABEL}
      </label>
      <select
        id={`${uid}-household`}
        value={value}
        onChange={(event) => {
          if (isCurrency(event.target.value)) onChange(event.target.value);
        }}
        className="pf-field"
        data-testid="pf-household"
      >
        {CURRENCIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </div>
  );
}

function Groups({
  expenses,
  rate,
  household,
  incomeMonthly,
  filter,
  account,
  adding,
  setAdding,
  update,
  updateLine,
}: {
  expenses: Expenses;
  /** #119 (PF-71): show only this account's lines (ALL: every line); combines with `filter`. */
  account: string;
  /** #105 (PF-45): show only this category's lines (ALL: every line); totals always use every line. */
  filter: string;
  /** The rate used (#86), a percent, or null: each line's calculated `Equity to cover` divides by it. */
  rate: number | null;
  /** The household currency (#87): every figure below is in it (a foreign line × its FX rate). */
  household: CurrencyCode;
  /** The counted net income a month (#85); `% of income` divides by it, `—` at 0. */
  incomeMonthly: number | null;
  adding: string | null;
  setAdding: (id: string | null) => void;
  update: (change: (current: Expenses) => Expenses) => void;
  updateLine: (group: GroupKey, id: string, patch: Partial<Line>) => void;
}) {
  const grand = grandTotals(expenses, rate, household);
  return (
    <>
      {GROUPS.map((group) => {
        const lines = expenses[group.key];
        return (
          <section
            key={group.key}
            className="flex flex-col gap-4"
            data-testid={`pf-group-${group.key}`}
          >
            <h3 className="pf-group">{group.title}</h3>
            <div className="pf-head" aria-hidden="true" data-testid="pf-head">
              {COLUMNS.map((c) => (
                <span key={c} className="pf-label">
                  {c}
                </span>
              ))}
            </div>
            {lines.map((line, index) =>
              !matchesFilters(line, filter, account) ? null : (
                <LineRow
                  key={line.id}
                  line={line}
                  index={index}
                  group={group.key}
                  accounts={expenses.accounts}
                  categories={expenses.categories}
                  household={household}
                  share={formatShare(householdMonthlyOf(line, household), grand.monthly)}
                  ofIncome={formatShare(householdMonthlyOf(line, household), incomeMonthly)}
                  calculated={calculatedEquity(line, rate, household)}
                  adding={adding === line.id}
                  addingCategory={adding === `cat:${line.id}`}
                  setAdding={setAdding}
                  onChange={(patch) => updateLine(group.key, line.id, patch)}
                  onRemove={() => {
                    // #113 (PF-61): confirm first.
                    if (!window.confirm(deleteQuestion(line.name.trim() || UNNAMED_EXPENSE)))
                      return;
                    if (adding === line.id) setAdding(null);
                    update((e) => ({
                      ...e,
                      [group.key]: e[group.key].filter((l) => l.id !== line.id),
                    }));
                  }}
                  onAddAccount={(typed) => {
                    const result = addAccount(expenses.accounts, typed);
                    if ("error" in result) return result.error;
                    // #165 Q-Z4: re-adding a deleted name re-links it (its earlier history shows it plain again).
                    update((e) => {
                      const { expenses: r, name } = relinkName({ ...e, accounts: result.accounts }, "account", result.name);
                      return {
                        ...r,
                        [group.key]: r[group.key].map((l) => (l.id === line.id && name ? { ...l, account: name } : l)),
                      };
                    });
                    setAdding(null);
                    return null;
                  }}
                  onAddCategory={(typed) => {
                    const result = addCategory(expenses.categories, typed);
                    if ("error" in result) return result.error;
                    update((e) => {
                      const { expenses: r, name } = relinkName({ ...e, categories: result.categories }, "category", result.name);
                      return {
                        ...r,
                        [group.key]: r[group.key].map((l) => (l.id === line.id && name ? { ...l, category: name } : l)),
                      };
                    });
                    setAdding(null);
                    return null;
                  }}
                />
              ),
            )}
            <button
              type="button"
              className="pf-add"
              disabled={lines.length >= LINES_MAX}
              onClick={() =>
                update((e) => ({
                  ...e,
                  [group.key]: [...e[group.key], newFilteredLine(filter, account)],
                }))
              }
              data-testid={`pf-add-${group.key}`}
            >
              ↳ Add expense
            </button>
            <TotalRow
              label={group.total}
              totals={totalsOf(lines, rate, household)}
              whole={grand.monthly}
              incomeMonthly={incomeMonthly}
              testId={group.key}
            />
          </section>
        );
      })}
      <TotalRow
        label="Total"
        totals={grand}
        whole={grand.monthly}
        incomeMonthly={incomeMonthly}
        testId="all"
      />
    </>
  );
}

/** #105 (PF-45): `Filter by category` (`All`, then the categories); shown once there is a category. */
function CategoryFilter({
  categories,
  value,
  onChange,
  onRename,
  onDelete,
  accounts,
  account,
  onAccount,
  readOnly = false,
}: {
  /** #165 (PFD-01): delete the chosen account / category (a write: disabled for read-only). */
  onDelete: ((kind: NameKind, name: string) => void) | null;
  /** #119 S7: read-only grantees filter, but `Rename` (a write) stays disabled. */
  readOnly?: boolean;
  categories: string[];
  value: string;
  onChange: (value: string) => void;
  /** #119 (PF-71): `Filter by account`, beside the category filter; shown once there is an account. */
  accounts: string[];
  account: string;
  onAccount: (value: string) => void;
  /** #113 (PF-63): rename the chosen category; a problem text, or null when done. */
  onRename: (from: string, typed: string) => string | null;
}) {
  const uid = useId();
  const [renaming, setRenaming] = useState(false);
  if (categories.length === 0 && accounts.length === 0) return null;
  return (
    <div className="flex flex-col gap-4">
      <div className="pf-filter-row">
        {accounts.length > 0 ? (
          <div className="pf-cell pf-filter" data-testid="pf-acct-filter-cell">
            <label htmlFor={`${uid}-acct-filter`} className="pf-label">
              Filter by account
            </label>
            <select
              id={`${uid}-acct-filter`}
              value={account}
              onChange={(event) => onAccount(event.target.value)}
              className="pf-field"
              data-testid="pf-acct-filter"
            >
              <option value={ALL}>All</option>
              {accounts.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {onDelete && accounts.length > 0 ? (
          <button
            type="button"
            className="pf-button pf-button-danger pf-delete"
            disabled={readOnly || account === ALL}
            onClick={() => onDelete("account", account)}
            data-testid="pf-delete-account"
          >
            {DELETE_ACCOUNT}
          </button>
        ) : null}
        {categories.length > 0 ? (
          <>
            <div className="pf-cell pf-filter" data-testid="pf-filter-cell">
              <label htmlFor={`${uid}-filter`} className="pf-label">
                Filter by category
              </label>
              <select
                id={`${uid}-filter`}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="pf-field"
                data-testid="pf-filter"
              >
                <option value={ALL}>All</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="pf-cancel pf-rename"
              disabled={readOnly || value === ALL || renaming}
              onClick={() => setRenaming(true)}
              data-testid="pf-rename-category"
            >
              Rename
            </button>
            {onDelete ? (
              <button
                type="button"
                className="pf-button pf-button-danger pf-delete"
                disabled={readOnly || value === ALL || renaming}
                onClick={() => onDelete("category", value)}
                data-testid="pf-delete-category"
              >
                {DELETE_CATEGORY}
              </button>
            ) : null}
          </>
        ) : null}
      </div>
      {renaming && !readOnly && value !== ALL ? (
        <NewName
          kind="rename"
          initial={value}
          onAdd={(typed) => {
            const problem = onRename(value, typed);
            if (!problem) setRenaming(false);
            return problem;
          }}
          onCancel={() => setRenaming(false)}
        />
      ) : null}
    </div>
  );
}

/**
 * #119 (PF-67..PF-72): `Expenses summary`, its own section after `03` Expenses (numeral `03`, Q-S1) with its own
 * toggle: `By account` then `By category` (moved from the Expenses body), each once used; household currency; the
 * chosen account / category row is marked (Q-S6), every row stays listed. Totals use every line of the month.
 */
function ExpensesSummary({
  expenses,
  rate,
  household,
  category,
  account,
  open,
  onToggle,
  categories = true,
}: {
  expenses: Expenses;
  rate: number | null;
  household: CurrencyCode;
  category: string;
  account: string;
  open: boolean;
  onToggle: () => void;
  /** #221: false on the scenario screen (no `By category`). */
  categories?: boolean;
}) {
  const whole = grandTotals(expenses, rate, household).monthly;
  return (
    <section
      className="flex flex-col gap-8"
      aria-labelledby="pf-summary"
      data-testid="pf-summary-block"
    >
      <SectionHead
        numeral="03"
        title="Expenses summary"
        id="pf-summary"
        toggle={{ open, controls: "pf-summary-body", onToggle, testId: "pf-toggle-summary" }}
      />
      <div
        id="pf-summary-body"
        className="pf-section-body flex flex-col gap-12"
        data-testid="pf-body-summary"
      >
        {open ? (
          <>
            <Subtotals
              kind="account"
              rows={accountTotals(expenses, rate, household)}
              whole={whole}
              selected={account}
              deleted={(expenses.deletedAccounts ?? []).map((d) => d.name)}
            />
            {categories ? (
              <Subtotals
                kind="category"
                rows={categoryTotals(expenses, rate, household)}
                whole={whole}
                selected={category}
                deleted={(expenses.deletedCategories ?? []).map((d) => d.name)}
              />
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}

/**
 * #105 (PF-46) `By category` / #119 (PF-69) `By account`: each used name, then `No category` / `No account`;
 * household currency; master totals unchanged.
 */
function Subtotals({
  kind,
  rows,
  whole,
  selected,
  deleted = [],
}: {
  /** #165 (PFD-04): deleted names on this month's lines, shown `<name> (deleted)`. */
  deleted?: string[];
  kind: "account" | "category";
  rows: { name: string; totals: Totals }[];
  whole: number | null;
  selected: string;
}) {
  if (rows.length === 0) return null;
  const k = kind === "account" ? "acct" : "cat";
  const title = kind === "account" ? "Account" : "Category";
  return (
    <section
      className="flex flex-col gap-4"
      data-testid={kind === "account" ? "pf-accounts" : "pf-categories"}
    >
      <h3 className="pf-group">{kind === "account" ? "By account" : "By category"}</h3>
      <div className="pf-head pf-cat-head" aria-hidden="true">
        {[title, "% of expenses", "Monthly", "Yearly"].map((c) => (
          <span key={c} className="pf-label">
            {c}
          </span>
        ))}
      </div>
      {rows.map((row) => {
        const on = selected !== ALL && row.name === selected;
        return (
          <div
            key={row.name || "-"}
            className={on ? "pf-cat-row pf-sum-selected" : "pf-cat-row"}
            data-testid={`pf-${k}-row`}
            {...{ [`data-${kind}`]: row.name }}
            data-selected={on ? "true" : undefined}
            aria-current={on ? "true" : undefined}
          >
            <div className="pf-cell pf-name">
              <span className="pf-row-label" data-testid={`pf-${k}-name`}>
                {row.name
                  ? deleted.includes(row.name)
                    ? deletedLabel(row.name)
                    : row.name
                  : kind === "account"
                    ? NO_ACCOUNT
                    : NO_CATEGORY}
              </span>
            </div>
            <Cell label="% of expenses" area="share">
              <span className="pf-value" data-testid={`pf-${k}-share`}>
                {formatShare(row.totals.monthly, whole)}
              </span>
            </Cell>
            <Cell label="Monthly" area="monthly">
              <span className="pf-value" data-testid={`pf-${k}-monthly`}>
                {orDash(row.totals.monthly)}
              </span>
            </Cell>
            <Cell label="Yearly" area="yearly">
              <span className="pf-value" data-testid={`pf-${k}-yearly`}>
                {orDash(row.totals.yearly)}
              </span>
            </Cell>
          </div>
        );
      })}
    </section>
  );
}

function LineRow({
  line,
  index,
  group,
  accounts,
  categories,
  household,
  share,
  ofIncome,
  calculated,
  adding,
  addingCategory,
  setAdding,
  onChange,
  onRemove,
  onAddAccount,
  onAddCategory,
}: {
  line: Line;
  index: number;
  group: GroupKey;
  accounts: string[];
  categories: string[];
  household: CurrencyCode;
  share: string;
  ofIncome: string;
  /** The calculated `Equity to cover` (#86), shown as the field's placeholder while no override is typed. */
  calculated: number | null;
  adding: boolean;
  addingCategory: boolean;
  setAdding: (id: string | null) => void;
  onChange: (patch: Partial<Line>) => void;
  onRemove: () => void;
  onAddAccount: (typed: string) => string | null;
  onAddCategory: (typed: string) => string | null;
}) {
  const uid = useId();
  const groupTitle = group === "fixed" ? "Fixed" : "Variable";
  const aria = (column: string) => `${column}, ${groupTitle} ${index + 1}`;
  const selectRef = useRef<HTMLSelectElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const amountBad = parseAmount(line.amount) === null;
  const scenarioScreen = useContext(PeriodChoice);
  const equityBad = parseAmount(line.equity) === null;
  const foreign = isForeign(line, household);
  const rateBad = foreign && parseRate(line.rate) === null;
  const check = (bad: boolean, field: string) =>
    bad ? { "aria-invalid": true as const, "aria-describedby": `${uid}-${field}` } : {};
  const error = (bad: boolean, field: string, text: string = AMOUNT_ERROR) =>
    bad ? (
      <span id={`${uid}-${field}`} className="pf-error" data-testid="pf-error" data-field={field}>
        {text}
      </span>
    ) : null;
  const amountField = (per: "month" | "year", column: string) => (
    <Cell label={column} area={per === "month" ? "monthly" : "yearly"} control>
      <PeriodInput
        value={fieldText(line, per)}
        onValue={(text) => onChange({ amount: text, per })}
        base={per}
        period={false}
        name={aria(column)}
        inputMode="decimal"
        autoComplete="off"
        aria-label={aria(column)}
        className="pf-field"
        testId={per === "month" ? "pf-monthly" : "pf-yearly"}
        {...check(amountBad && line.per === per, per)}
      />
      {error(amountBad && line.per === per, per)}
    </Cell>
  );

  return (
    <div className="pf-line" data-testid="pf-line">
      <Cell label="Name" area="name" control>
        <input
          value={line.name}
          maxLength={NAME_MAX}
          onChange={(event) => onChange({ name: event.target.value })}
          autoComplete="off"
          aria-label={aria("Name")}
          className="pf-field"
          data-testid="pf-name"
        />
      </Cell>
      <Cell label="% of income" area="income">
        <span className="pf-value" data-testid="pf-income">
          {ofIncome}
        </span>
      </Cell>
      <Cell label="% of expenses" area="share">
        <span className="pf-value" data-testid="pf-share">
          {share}
        </span>
      </Cell>
      {amountField("month", "Monthly")}
      {amountField("year", "Yearly")}
      <Cell label="Currency" area="currency" control>
        <select
          value={foreign ? line.currency : household}
          onChange={(event) =>
            onChange({ currency: event.target.value === household ? "" : event.target.value })
          }
          aria-label={aria("Currency")}
          className="pf-field"
          data-testid="pf-currency"
        >
          {currencyChoices(household).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Cell>
      {foreign ? (
        <Cell label={FX_RATE_LABEL} area="fx" control>
          <input
            value={line.rate}
            maxLength={40}
            onChange={(event) => onChange({ rate: event.target.value })}
            inputMode="decimal"
            autoComplete="off"
            aria-label={aria(rateLabel(line.currency, household))}
            className="pf-field"
            data-testid="pf-fx"
            {...check(rateBad, "rate")}
          />
          {error(rateBad, "rate", RATE_ERROR)}
          <span className="pf-fx-note" data-testid="pf-fx-note">
            {FX_HISTORY_NOTE}
          </span>
        </Cell>
      ) : (
        <Cell label={FX_RATE_LABEL} area="fx">
          <span className="pf-value" data-testid="pf-fx-none">
            {NOT_COMPUTED}
          </span>
        </Cell>
      )}
      <Cell label="Equity to cover" area="equity" control>
        <PeriodInput
          value={line.equity}
          placeholder={calculated === null ? NOT_COMPUTED : formatMoney(calculated)}
          onValue={(text) => onChange({ equity: text })}
          base="month"
          period={false}
          name={aria("Equity to cover")}
          inputMode="decimal"
          autoComplete="off"
          aria-label={aria("Equity to cover")}
          className="pf-field"
          testId="pf-equity"
          {...check(equityBad, "equity")}
        />
        {error(equityBad, "equity")}
      </Cell>
      {/* #221 AO1 (EL 2026-10-22): no Account or Category select on any expense line on the scenario screen. */}
      {scenarioScreen ? null : (
        <>
      <Cell label="Account" area="account" control>
        <select
          ref={selectRef}
          value={line.account}
          onChange={(event) => {
            if (event.target.value === ADD_ACCOUNT) setAdding(line.id);
            else onChange({ account: event.target.value });
          }}
          aria-label={aria("Account")}
          className="pf-field"
          data-testid="pf-account"
        >
          <option value="">{NOT_COMPUTED}</option>
          {/* #165 Q-Z3: a deleted account stays on its earlier line, labelled; it is never offered for another line. */}
          {line.account && !accounts.includes(line.account) ? (
            <option value={line.account}>{deletedLabel(line.account)}</option>
          ) : null}
          {accounts.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
          {accounts.length < ACCOUNTS_MAX ? (
            <option value={ADD_ACCOUNT}>Add account…</option>
          ) : null}
        </select>
      </Cell>
      <Cell label="Category" area="category" control>
        <select
          ref={categoryRef}
          value={line.category}
          onChange={(event) => {
            if (event.target.value === ADD_CATEGORY) setAdding(`cat:${line.id}`);
            else onChange({ category: event.target.value });
          }}
          aria-label={aria("Category")}
          className="pf-field"
          data-testid="pf-category"
        >
          <option value="">{NOT_COMPUTED}</option>
          {line.category && !categories.includes(line.category) ? (
            <option value={line.category}>{deletedLabel(line.category)}</option>
          ) : null}
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          {categories.length < CATEGORIES_MAX ? (
            <option value={ADD_CATEGORY}>Add category…</option>
          ) : null}
        </select>
      </Cell>
        </>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove expense"
        className="pf-remove"
        data-testid="pf-remove"
      >
        <Minus className="size-4" aria-hidden="true" />
      </button>
      {adding ? (
        <NewName
          kind="account"
          onAdd={(typed) => {
            const problem = onAddAccount(typed);
            if (!problem) queueMicrotask(() => selectRef.current?.focus());
            return problem;
          }}
          onCancel={() => {
            setAdding(null);
            queueMicrotask(() => selectRef.current?.focus());
          }}
        />
      ) : null}
      {addingCategory ? (
        <NewName
          kind="category"
          onAdd={(typed) => {
            const problem = onAddCategory(typed);
            if (!problem) queueMicrotask(() => categoryRef.current?.focus());
            return problem;
          }}
          onCancel={() => {
            setAdding(null);
            queueMicrotask(() => categoryRef.current?.focus());
          }}
        />
      ) : null}
    </div>
  );
}

/** The inline adder for an account (#84) or, #105, a category: same copy pattern, same checks. */
function NewName({
  kind,
  onAdd,
  onCancel,
  initial = "",
}: {
  kind: "account" | "category" | "rename";
  onAdd: (typed: string) => string | null;
  onCancel: () => void;
  /** #113: the rename field starts on the current name. */
  initial?: string;
}) {
  const uid = useId();
  const [typed, setTyped] = useState(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const submit = () => setProblem(onAdd(typed));
  return (
    <div className="pf-new" data-testid={`pf-new-${kind}`}>
      <label className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="pf-label">
          {kind === "account" ? "New account" : kind === "category" ? "New category" : "New name"}
        </span>
        <input
          autoFocus
          value={typed}
          maxLength={kind === "account" ? ACCOUNT_MAX : CATEGORY_MAX}
          onChange={(event) => {
            setTyped(event.target.value);
            setProblem(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            } else if (event.key === "Escape") {
              event.preventDefault();
              onCancel();
            }
          }}
          autoComplete="off"
          className="pf-field"
          data-testid={`pf-new-${kind}-input`}
          {...(problem
            ? { "aria-invalid": true as const, "aria-describedby": `${uid}-error` }
            : {})}
        />
        {problem ? (
          <span id={`${uid}-error`} className="pf-error" data-testid="pf-error" data-field={kind}>
            {problem}
          </span>
        ) : null}
      </label>
      <div className="flex gap-4">
        <button
          type="button"
          className="pf-button"
          onClick={submit}
          data-testid={`pf-new-${kind}-add`}
        >
          {kind === "rename" ? "Rename" : "Add"}
        </button>
        <button
          type="button"
          className="pf-cancel"
          onClick={onCancel}
          data-testid={`pf-new-${kind}-cancel`}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/** An amount, or `—` for null (Q10, Q14). */
const orDash = (value: number | null): string =>
  value === null ? NOT_COMPUTED : formatMoney(value);

function TotalRow({
  label,
  totals,
  whole,
  incomeMonthly,
  testId,
}: {
  label: string;
  totals: Totals;
  whole: number | null;
  incomeMonthly: number | null;
  testId: string;
}) {
  const value = (area: string, column: string, text: string, field: string) => (
    <Cell label={column} area={area}>
      <span className="pf-value" data-testid={`pf-total-${field}`}>
        {text}
      </span>
    </Cell>
  );
  return (
    <div
      className={`pf-line pf-total${testId === "all" ? " pf-total-all" : ""}`}
      data-testid={`pf-total-${testId}`}
    >
      <div className="pf-cell pf-name">
        <span className="pf-total-label">{label}</span>
      </div>
      {value("income", "% of income", formatShare(totals.monthly, incomeMonthly), "income")}
      {value("share", "% of expenses", formatShare(totals.monthly, whole), "share")}
      {value("monthly", "Monthly", orDash(totals.monthly), "monthly")}
      {value("yearly", "Yearly", orDash(totals.yearly), "yearly")}
      {value("equity", "Equity to cover", orDash(totals.equity), "equity")}
    </div>
  );
}
