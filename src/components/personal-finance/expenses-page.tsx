import { Minus } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
  ACCOUNT_MAX,
  ACCOUNTS_MAX,
  addAccount,
  AMOUNT_ERROR,
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
  newLine,
  NOT_COMPUTED,
  parseAmount,
  parseRate,
  readExpenses,
  type Totals,
  totalsOf,
  writeExpenses,
} from "@/lib/finance/expenses";
import {
  type Income,
  monthly,
  netIncomeYearly,
  readIncome,
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
import { Cell, SectionHead } from "./pf-cells";

const ADD_ACCOUNT = "__add-account__";

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Personal finance (#84 v1.1, #85 v1.2, #86 v1.3, #87 v1.4; spec `attachments/personal-finance-spec.md`,
 * PF-01..25): the household currency, the income block, the equity-cover rates and Fixed and Variable expenses
 * (a line may be in a foreign currency with a typed FX rate), in this browser's localStorage only (four keys). The server renders the title
 * and an empty area at least the viewport tall; the browser fills it once after reading storage, so nothing on
 * screen moves (strict CLS 0).
 */
export function PersonalFinancePage() {
  const [expenses, setExpenses] = useState<Expenses | null>(null);
  const [income, setIncome] = useState<Income | null>(null);
  const [rates, setRates] = useState<Rates | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    setIncome(readIncome(storage()));
    setRates(readRates(storage()));
    setHousehold(readHousehold(storage()));
    setExpenses(readExpenses(storage()));
  }, []);

  function updateIncome(change: (current: Income) => Income) {
    setIncome((current) => {
      if (!current) return current;
      const next = change(current);
      writeIncome(storage(), next);
      return next;
    });
  }

  function updateRates(patch: Partial<Rates>) {
    setRates((current) => {
      if (!current) return current;
      const next = { ...current, ...patch };
      writeRates(storage(), next);
      return next;
    });
  }

  function updateHousehold(code: CurrencyCode) {
    const next = { household: code };
    writeHousehold(storage(), next);
    setHousehold(next);
  }

  function update(change: (current: Expenses) => Expenses) {
    setExpenses((current) => {
      if (!current) return current;
      const next = change(current);
      writeExpenses(storage(), next);
      return next;
    });
  }

  const updateLine = (group: GroupKey, id: string, patch: Partial<Line>) =>
    update((e) => ({ ...e, [group]: e[group].map((l) => (l.id === id ? { ...l, ...patch } : l)) }));

  return (
    <div className="pf">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-14 px-5 pt-10 pb-20 sm:px-8 lg:gap-16 lg:pt-14 lg:pb-24">
        <header>
          <p className="pf-label">01</p>
          <h1 className="pf-title mt-2">Personal finance.</h1>
        </header>

        <div
          className="pf-area flex flex-col gap-14 lg:gap-16"
          data-testid="pf-area"
          data-ready={expenses && income && rates && household ? "true" : "false"}
        >
          {expenses && income && rates && household ? (
            <>
              <HouseholdCurrency value={household.household} onChange={updateHousehold} />
              <IncomeBlock income={income} update={updateIncome} />
              <section className="flex flex-col gap-8" aria-labelledby="pf-expenses">
                <SectionHead numeral="03" title="Expenses" id="pf-expenses" />
                <EquityRates rates={rates} update={updateRates} />
                <div className="flex flex-col gap-12">
                  <Groups
                    expenses={expenses}
                    rate={rateUsed(rates)}
                    household={household.household}
                    incomeMonthly={monthly(netIncomeYearly(income.people))}
                    adding={adding}
                    setAdding={setAdding}
                    update={update}
                    updateLine={updateLine}
                  />
                </div>
              </section>
            </>
          ) : null}
        </div>
      </main>
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
  adding,
  setAdding,
  update,
  updateLine,
}: {
  expenses: Expenses;
  /** The rate used (#86), a percent, or null: each line's calculated `Equity to cover` divides by it. */
  rate: number | null;
  /** The household currency (#87): every figure below is in it (a foreign line × its FX rate). */
  household: CurrencyCode;
  /** The counted net income a month (#85); `% of income` divides by it, `—` at 0. */
  incomeMonthly: number;
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
            {lines.map((line, index) => (
              <LineRow
                key={line.id}
                line={line}
                index={index}
                group={group.key}
                accounts={expenses.accounts}
                household={household}
                share={formatShare(householdMonthlyOf(line, household), grand.monthly)}
                ofIncome={formatShare(householdMonthlyOf(line, household), incomeMonthly)}
                calculated={calculatedEquity(line, rate, household)}
                adding={adding === line.id}
                setAdding={setAdding}
                onChange={(patch) => updateLine(group.key, line.id, patch)}
                onRemove={() => {
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
              />
            ))}
            <button
              type="button"
              className="pf-add"
              disabled={lines.length >= LINES_MAX}
              onClick={() => update((e) => ({ ...e, [group.key]: [...e[group.key], newLine()] }))}
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

function LineRow({
  line,
  index,
  group,
  accounts,
  household,
  share,
  ofIncome,
  calculated,
  adding,
  setAdding,
  onChange,
  onRemove,
  onAddAccount,
}: {
  line: Line;
  index: number;
  group: GroupKey;
  accounts: string[];
  household: CurrencyCode;
  share: string;
  ofIncome: string;
  /** The calculated `Equity to cover` (#86), shown as the field's placeholder while no override is typed. */
  calculated: number | null;
  adding: boolean;
  setAdding: (id: string | null) => void;
  onChange: (patch: Partial<Line>) => void;
  onRemove: () => void;
  onAddAccount: (typed: string) => string | null;
}) {
  const uid = useId();
  const groupTitle = group === "fixed" ? "Fixed" : "Variable";
  const aria = (column: string) => `${column}, ${groupTitle} ${index + 1}`;
  const selectRef = useRef<HTMLSelectElement>(null);
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
            aria-label={aria(FX_RATE_LABEL)}
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
        <NewAccount
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
    </div>
  );
}

function NewAccount({
  onAdd,
  onCancel,
}: {
  onAdd: (typed: string) => string | null;
  onCancel: () => void;
}) {
  const uid = useId();
  const [typed, setTyped] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const submit = () => setProblem(onAdd(typed));
  return (
    <div className="pf-new" data-testid="pf-new-account">
      <label className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="pf-label">New account</span>
        <input
          autoFocus
          value={typed}
          maxLength={ACCOUNT_MAX}
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
          data-testid="pf-new-account-input"
          {...(problem
            ? { "aria-invalid": true as const, "aria-describedby": `${uid}-error` }
            : {})}
        />
        {problem ? (
          <span
            id={`${uid}-error`}
            className="pf-error"
            data-testid="pf-error"
            data-field="account"
          >
            {problem}
          </span>
        ) : null}
      </label>
      <div className="flex gap-4">
        <button
          type="button"
          className="pf-button"
          onClick={submit}
          data-testid="pf-new-account-add"
        >
          Add
        </button>
        <button
          type="button"
          className="pf-cancel"
          onClick={onCancel}
          data-testid="pf-new-account-cancel"
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
  incomeMonthly: number;
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
