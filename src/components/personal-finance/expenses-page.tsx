import { Minus } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
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
  formatAmount,
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
  UNNAMED_EXPENSE,
  type Totals,
  totalsOf,
  writeExpenses,
  migrateExpenses,
} from "@/lib/finance/expenses";
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
import { Cell, Lock, SectionHead } from "./pf-cells";
import { ReadOnlyLine } from "@/components/access/denied";

import {
  lastTwelve,
  type MonthKey,
  monthName,
  type Overview,
  readOverview,
  SAVE,
  writeOverview,
} from "@/lib/finance/overview";
import {
  copiedNote,
  DISCARD_CONFIRM,
  lineFigures,
  migrateMonths,
  MONTH_CONTROL_LABEL,
  openMonth,
  readMonths,
  renameInMonths,
  writeMonths,
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
export function PersonalFinancePage({
  now: fixedNow,
  loadStore = loadAccountStore,
  readOnly = false,
}: { now?: Date; loadStore?: LoadStore; readOnly?: boolean } = {}) {
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
  /** #113: category renames since the last save / month switch (applied to every stored month on Save). */
  const [renames, setRenames] = useState<[string, string][]>([]);

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
        if (migrateMonths(store, current) && !readOnly) void store.save?.();
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
    const e = { ...shared, fixed: opened.lines.fixed, variable: opened.lines.variable };
    const i = { people: opened.lines.people };
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
    setBaseline(canonical(e, i, r, h, o));
  }

  const dirty =
    !readOnly &&
    !!(expenses && income && rates && household && overview) &&
    (copiedFrom !== null || canonical(expenses, income, rates, household, overview) !== baseline);

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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const figures = useMemo(() => lineFigures(storage()), [saved, month]);

  function choose(key: MonthKey) {
    if (!now || key === month) return;
    if (dirty && !window.confirm(DISCARD_CONFIRM)) return;
    open(key, lastTwelve(now)[11]);
  }

  /** Decision 2 / 7: store the shown month's lines and the shared values; stay on the month. */
  async function save() {
    const store = storage();
    if (!store || !month || !expenses || !income || !rates || !household || !overview) return;
    // #113 (PF-65): renames reach every month (read against the old list, before it is replaced).
    const months = renameInMonths(readMonths(store), renames);
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
    setBaseline(canonical(expenses, income, rates, household, nextOverview));
    setSaved((n) => n + 1);
  }

  function updateOverview(change: (current: Overview) => Overview) {
    setOverview((current) => (current ? change(current) : current));
  }

  function toggle(section: SectionKey) {
    setView((current) => {
      if (!current) return current;
      const next = toggleSection(current, section);
      // Section toggles save at once (a view preference; #90 Q-D11).
      writeView(storage(), next);
      void storage()?.save?.();
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
    <div className="pf">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-14 px-5 pt-10 pb-20 sm:px-8 lg:gap-16 lg:pt-14 lg:pb-24">
        <header className="relative">
          <p className="pf-label">01</p>
          <h1 className="pf-title mt-2">Personal Finance.</h1>
          {readOnly ? <ReadOnlyLine className="mt-3" /> : null}
          <p className="pf-save" role="status" data-testid="pf-save">
            {saveFailed ? "Not saved." : ""}
          </p>
          <MonthControl
            now={now}
            month={month}
            onChoose={choose}
            dirty={dirty}
            saving={saving}
            onSave={() => void save()}
            note={copiedFrom ? copiedNote(monthName(copiedFrom)) : ""}
          />
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
                      <CategoryFilter
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
                      />
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
              />
              <OverviewBlock
                overview={overview}
                update={updateOverview}
                now={now}
                lines={figures}
                open={isOpen(view, "overview")}
                onToggle={() => toggle("overview")}
                readOnly={readOnly}
                rate={rateUsed(rates)}
                currency={household.household}
                page={{
                  expenses: grandTotals(expenses, rateUsed(rates), household.household).monthly,
                  income: monthly(netIncomeYearly(income.people, household.household)),
                }}
              />
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}

/** #112: the saved-state fingerprint of the shown month (Save shows when the page differs from it). */
const canonical = (e: Expenses, i: Income, r: Rates, h: Household, o: Overview): string =>
  JSON.stringify([e, i, r, h, { ...o, months: {} }]);

/**
 * #112 (PF-48, PF-49): `Month` and a select of the last 12 months (newest first) under the title, `Save` beside it
 * only while something is unsaved, and the copy note under it. The row and the note line are reserved from the
 * server render, so nothing moves (strict CLS 0).
 */
function MonthControl({
  now,
  month,
  onChoose,
  dirty,
  saving,
  onSave,
  note,
}: {
  now: Date | null;
  month: MonthKey | null;
  onChoose: (key: MonthKey) => void;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  note: string;
}) {
  const uid = useId();
  const keys = now ? lastTwelve(now).slice().reverse() : [];
  return (
    <div className="pf-month mt-6" data-testid="pf-month-control">
      <div className="pf-month-row">
        <label htmlFor={`${uid}-month`} className="pf-label">
          {MONTH_CONTROL_LABEL}
        </label>
        <select
          id={`${uid}-month`}
          value={month ?? ""}
          disabled={!month}
          onChange={(event) => onChoose(event.target.value)}
          className="pf-field pf-month-select"
          data-testid="pf-month"
        >
          {month ? null : <option value="" />}
          {keys.map((k) => (
            <option key={k} value={k}>
              {monthName(k)}
            </option>
          ))}
        </select>
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
          ) : null}
        </span>
      </div>
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
                    update((e) => ({
                      ...e,
                      accounts: result.accounts,
                      [group.key]: e[group.key].map((l) =>
                        l.id === line.id && result.name ? { ...l, account: result.name } : l,
                      ),
                    }));
                    setAdding(null);
                    return null;
                  }}
                  onAddCategory={(typed) => {
                    const result = addCategory(expenses.categories, typed);
                    if ("error" in result) return result.error;
                    update((e) => ({
                      ...e,
                      categories: result.categories,
                      [group.key]: e[group.key].map((l) =>
                        l.id === line.id && result.name ? { ...l, category: result.name } : l,
                      ),
                    }));
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
  accounts,
  account,
  onAccount,
  readOnly = false,
}: {
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
}: {
  expenses: Expenses;
  rate: number | null;
  household: CurrencyCode;
  category: string;
  account: string;
  open: boolean;
  onToggle: () => void;
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
            />
            <Subtotals
              kind="category"
              rows={categoryTotals(expenses, rate, household)}
              whole={whole}
              selected={category}
            />
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
}: {
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
                {row.name || (kind === "account" ? NO_ACCOUNT : NO_CATEGORY)}
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
      <input
        value={fieldText(line, per)}
        onChange={(event) => onChange({ amount: event.target.value, per })}
        inputMode="decimal"
        autoComplete="off"
        aria-label={aria(column)}
        className="pf-field"
        data-testid={per === "month" ? "pf-monthly" : "pf-yearly"}
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
        </Cell>
      ) : (
        <Cell label={FX_RATE_LABEL} area="fx">
          <span className="pf-value" data-testid="pf-fx-none">
            {NOT_COMPUTED}
          </span>
        </Cell>
      )}
      <Cell label="Equity to cover" area="equity" control>
        <input
          value={line.equity}
          placeholder={calculated === null ? NOT_COMPUTED : formatAmount(calculated)}
          onChange={(event) => onChange({ equity: event.target.value })}
          inputMode="decimal"
          autoComplete="off"
          aria-label={aria("Equity to cover")}
          className="pf-field"
          data-testid="pf-equity"
          {...check(equityBad, "equity")}
        />
        {error(equityBad, "equity")}
      </Cell>
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
  value === null ? NOT_COMPUTED : formatAmount(value);

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
