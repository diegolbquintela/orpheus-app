import { Minus } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  ACCOUNT_MAX,
  ACCOUNTS_MAX,
  addAccount,
  AMOUNT_ERROR,
  COLUMNS,
  type Expenses,
  fieldText,
  formatAmount,
  formatShare,
  grandTotals,
  type GroupKey,
  GROUPS,
  type Line,
  LINES_MAX,
  monthlyOf,
  NAME_MAX,
  newLine,
  NOT_COMPUTED,
  parseAmount,
  readExpenses,
  type Totals,
  totalsOf,
  writeExpenses,
} from "@/lib/finance/expenses";

const ADD_ACCOUNT = "__add-account__";

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Personal finance (#84 v1.1; spec `attachments/personal-finance-spec.md`, PF-01..10): Fixed and Variable expenses
 * in this browser's localStorage only. The server renders the title and an empty expenses area at least the
 * viewport tall; the browser fills it once after reading storage, so nothing on screen moves (strict CLS 0).
 */
export function PersonalFinancePage() {
  const [expenses, setExpenses] = useState<Expenses | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    setExpenses(readExpenses(storage()));
  }, []);

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

        <section className="flex flex-col gap-8" aria-labelledby="pf-expenses">
          <div>
            <p className="pf-label">02</p>
            <h2
              id="pf-expenses"
              className="mt-2 text-2xl leading-none font-normal tracking-tight text-chalk"
            >
              Expenses
            </h2>
          </div>
          <div
            className="pf-area flex flex-col gap-12"
            data-testid="pf-area"
            data-ready={expenses ? "true" : "false"}
          >
            {expenses ? (
              <Groups
                expenses={expenses}
                adding={adding}
                setAdding={setAdding}
                update={update}
                updateLine={updateLine}
              />
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}

function Groups({
  expenses,
  adding,
  setAdding,
  update,
  updateLine,
}: {
  expenses: Expenses;
  adding: string | null;
  setAdding: (id: string | null) => void;
  update: (change: (current: Expenses) => Expenses) => void;
  updateLine: (group: GroupKey, id: string, patch: Partial<Line>) => void;
}) {
  const grand = grandTotals(expenses);
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
                share={formatShare(monthlyOf(line), grand.monthly)}
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
              totals={totalsOf(lines)}
              whole={grand.monthly}
              testId={group.key}
            />
          </section>
        );
      })}
      <TotalRow label="Total" totals={grand} whole={grand.monthly} testId="all" />
    </>
  );
}

/**
 * One labelled cell. The label shows above the value on a phone and is visually hidden from 1024 px (the group's
 * column-label row stands in). A control carries its own aria-label, so its visible label is hidden from
 * assistive tech; a computed value keeps its label as its name.
 */
function Cell({
  label,
  area,
  control = false,
  children,
}: {
  label: string;
  area: string;
  control?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`pf-cell pf-${area}`}>
      <span className="pf-label pf-cell-label" {...(control ? { "aria-hidden": true } : {})}>
        {label}
      </span>
      {children}
    </div>
  );
}

function LineRow({
  line,
  index,
  group,
  accounts,
  share,
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
  share: string;
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
  const check = (bad: boolean, field: string) =>
    bad ? { "aria-invalid": true as const, "aria-describedby": `${uid}-${field}` } : {};
  const error = (bad: boolean, field: string) =>
    bad ? (
      <span id={`${uid}-${field}`} className="pf-error" data-testid="pf-error" data-field={field}>
        {AMOUNT_ERROR}
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
          {NOT_COMPUTED}
        </span>
      </Cell>
      <Cell label="% of expenses" area="share">
        <span className="pf-value" data-testid="pf-share">
          {share}
        </span>
      </Cell>
      {amountField("month", "Monthly")}
      {amountField("year", "Yearly")}
      <Cell label="Equity to cover" area="equity" control>
        <input
          value={line.equity}
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

function TotalRow({
  label,
  totals,
  whole,
  testId,
}: {
  label: string;
  totals: Totals;
  whole: number;
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
      {value("income", "% of income", NOT_COMPUTED, "income")}
      {value("share", "% of expenses", formatShare(totals.monthly, whole), "share")}
      {value("monthly", "Monthly", formatAmount(totals.monthly), "monthly")}
      {value("yearly", "Yearly", formatAmount(totals.yearly), "yearly")}
      {value("equity", "Equity to cover", formatAmount(totals.equity), "equity")}
    </div>
  );
}
