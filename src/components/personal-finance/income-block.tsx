import { deleteQuestion } from "@/lib/finance/expenses";
import { Minus } from "lucide-react";
import { useId } from "react";
import { type CurrencyCode, CURRENCIES, RATE_ERROR } from "@/lib/finance/currency";
import {
  AMOUNT_ERROR,
  formatAmount,
  NAME_MAX,
  NOT_COMPUTED,
  parseAmount,
  parseRate,
} from "@/lib/finance/expenses";
import {
  biweekly,
  CONVERTED_LABEL,
  FOREIGN_LABEL,
  type Income,
  monthly,
  NET_INCOME,
  netIncomeYearly,
  newPerson,
  parsePercent,
  PEOPLE_MAX,
  PERCENT_ERROR,
  type Person,
  PERSON_COLUMNS,
  personConverted,
  personCurrency,
  personLabel,
  personNet,
  rateLabel,
  shownIncomeLines,
  TABLE_COLUMNS,
} from "@/lib/finance/income";
import { Cell, Lock, SectionHead } from "./pf-cells";

/**
 * The income block (#85 v1.2; spec `attachments/personal-finance-spec.md` section 12, PF-11..16): people with
 * wages, a bonus rating and an average tax, their net, which incomes count and each person's share, and the income
 * table (biweekly, monthly, yearly) whose `Net income` the expenses' `% of income` divides by. #102 (section 16): a
 * person can be `Foreign` (a currency and a rate, foreign units per 1 household unit); the table and `Net income`
 * are in the household currency (÷ rate; `—` without a valid rate).
 */
export function IncomeBlock({
  income,
  update,
  household,
  open = true,
  onToggle,
  readOnly = false,
}: {
  income: Income;
  update: (change: (current: Income) => Income) => void;
  household: CurrencyCode;
  /** #105 (PF-40): the section is open (its body shows); `onToggle` makes the heading a toggle. */
  open?: boolean;
  onToggle?: () => void;
  /** #90 (ROLE-10): every field and button disabled. */
  readOnly?: boolean;
}) {
  const people = income.people;
  const updatePerson = (id: string, patch: Partial<Person>) =>
    update((i) => ({ people: i.people.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  const lines = shownIncomeLines(people, household);
  const net = netIncomeYearly(people, household);

  return (
    <section
      className="flex flex-col gap-8"
      aria-labelledby="pf-income-title"
      data-testid="pf-income-block"
    >
      <SectionHead
        numeral="02"
        title="Income"
        id="pf-income-title"
        toggle={
          onToggle
            ? { open, controls: "pf-income-body", onToggle, testId: "pf-toggle-income" }
            : undefined
        }
      />
      <div
        id="pf-income-body"
        className="pf-section-body flex flex-col gap-8"
        data-testid="pf-body-income"
      >
        {open ? (
          <Lock on={readOnly}>
            <div className="flex flex-col gap-4">
              <div
                className="pf-head pf-person-head"
                aria-hidden="true"
                data-testid="pf-person-head"
              >
                {PERSON_COLUMNS.map((c) => (
                  <span key={c} className="pf-label">
                    {c}
                  </span>
                ))}
              </div>
              {people.map((person, index) => (
                <PersonRow
                  key={person.id}
                  person={person}
                  label={personLabel(person, index)}
                  household={household}
                  onChange={(patch) => updatePerson(person.id, patch)}
                  onRemove={() => {
                    // #113 (PF-62): confirm first.
                    if (!window.confirm(deleteQuestion(personLabel(person, index)))) return;
                    update((i) => ({ people: i.people.filter((p) => p.id !== person.id) }));
                  }}
                />
              ))}
              <button
                type="button"
                className="pf-add"
                disabled={people.length >= PEOPLE_MAX}
                onClick={() => update((i) => ({ people: [...i.people, newPerson()] }))}
                data-testid="pf-add-person"
              >
                ↳ Add person
              </button>
            </div>

            <section className="flex flex-col gap-4" data-testid="pf-income-table">
              <h3 className="pf-group">Income table</h3>
              <div className="pf-head pf-table-head" aria-hidden="true" data-testid="pf-table-head">
                {TABLE_COLUMNS.map((c) => (
                  <span key={c} className="pf-label">
                    {c}
                  </span>
                ))}
              </div>
              {lines.map((line) => (
                <TableRow
                  key={line.id}
                  label={line.label}
                  yearly={line.yearly}
                  testId="pf-income-line"
                />
              ))}
              <TableRow label={NET_INCOME} yearly={net} testId="pf-net-income" total />
            </section>
          </Lock>
        ) : null}
      </div>
    </section>
  );
}

function TableRow({
  label,
  yearly,
  testId,
  total = false,
}: {
  label: string;
  yearly: number | null;
  testId: string;
  total?: boolean;
}) {
  return (
    <div className={`pf-table-row${total ? " pf-total pf-table-total" : ""}`} data-testid={testId}>
      <div className="pf-cell pf-name">
        <span className={total ? "pf-total-label" : "pf-row-label"} data-testid="pf-income-label">
          {label}
        </span>
      </div>
      {(
        [
          ["biweekly", "Biweekly", biweekly(yearly)],
          ["monthly", "Monthly", monthly(yearly)],
          ["yearly", "Yearly", yearly],
        ] as const
      ).map(([area, column, value]) => (
        <Cell key={area} label={column} area={area}>
          <span className="pf-value" data-testid={`pf-income-${area}`}>
            {value === null ? NOT_COMPUTED : formatAmount(value)}
          </span>
        </Cell>
      ))}
    </div>
  );
}

function PersonRow({
  person,
  label,
  household,
  onChange,
  onRemove,
}: {
  person: Person;
  label: string;
  household: CurrencyCode;
  onChange: (patch: Partial<Person>) => void;
  onRemove: () => void;
}) {
  const uid = useId();
  const aria = (column: string) => `${column}, ${label}`;
  const bad = {
    wages: parseAmount(person.wages) === null,
    bonus: parseAmount(person.bonus) === null,
    tax: parsePercent(person.tax) === null,
    share: parsePercent(person.share) === null,
  };
  const field = (key: "wages" | "bonus" | "tax" | "share", column: string, area: string) => (
    <Cell label={column} area={area} control>
      <input
        value={person[key]}
        maxLength={40}
        onChange={(event) => onChange({ [key]: event.target.value })}
        inputMode="decimal"
        autoComplete="off"
        aria-label={aria(column)}
        className="pf-field"
        data-testid={`pf-person-${key}`}
        {...(bad[key]
          ? { "aria-invalid": true as const, "aria-describedby": `${uid}-${key}` }
          : {})}
      />
      {bad[key] ? (
        <span id={`${uid}-${key}`} className="pf-error" data-testid="pf-error" data-field={key}>
          {key === "tax" || key === "share" ? PERCENT_ERROR : AMOUNT_ERROR}
        </span>
      ) : null}
    </Cell>
  );
  const box = (key: "countWages" | "countBonus", column: string, area: string) => (
    <Cell label={column} area={area} control>
      <label className="pf-check">
        <input
          type="checkbox"
          checked={person[key]}
          onChange={(event) => onChange({ [key]: event.target.checked })}
          aria-label={aria(column)}
          data-testid={`pf-person-${key === "countWages" ? "count-wages" : "count-bonus"}`}
        />
      </label>
    </Cell>
  );

  const code = personCurrency(person, household);
  const foreignHere = person.foreign && code !== household;
  const rateBad = foreignHere && parseRate(person.rate) === null;
  const converted = personConverted(person, household);
  const rateName = rateLabel(code, household);
  return (
    <div
      className="pf-person"
      data-testid="pf-person"
      data-foreign={person.foreign ? "true" : "false"}
    >
      <Cell label="Name" area="name" control>
        <input
          value={person.name}
          maxLength={NAME_MAX}
          onChange={(event) => onChange({ name: event.target.value })}
          autoComplete="off"
          aria-label={aria("Name")}
          className="pf-field"
          data-testid="pf-person-name"
        />
      </Cell>
      {field("wages", "Wages (yearly)", "wages")}
      {field("bonus", "Bonus rating (%)", "bonus")}
      {field("tax", "Average tax (%)", "tax")}
      <Cell label="Net (yearly)" area="net">
        <span className="pf-value" data-testid="pf-person-net">
          {formatAmount(personNet(person))}
        </span>
      </Cell>
      {box("countWages", "Count wages", "cw")}
      {box("countBonus", "Count bonus", "cb")}
      {field("share", "Share (%)", "pct")}
      <Cell label={FOREIGN_LABEL} area="fb" control>
        <label className="pf-check">
          <input
            type="checkbox"
            checked={person.foreign}
            onChange={(event) => onChange({ foreign: event.target.checked })}
            aria-label={aria(FOREIGN_LABEL)}
            data-testid="pf-person-foreign"
          />
        </label>
      </Cell>
      {person.foreign ? (
        <div className="pf-foreign" data-testid="pf-foreign">
          <div className="pf-cell pf-foreign-cell">
            <label htmlFor={`${uid}-currency`} className="pf-label">
              Currency
            </label>
            <select
              id={`${uid}-currency`}
              value={code}
              onChange={(event) => onChange({ currency: event.target.value })}
              className="pf-field"
              data-testid="pf-person-currency"
            >
              {CURRENCIES.filter((c) => c !== household || c === code).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="pf-cell pf-foreign-cell">
            <label htmlFor={`${uid}-rate`} className="pf-label">
              {rateName}
            </label>
            {foreignHere ? (
              <input
                id={`${uid}-rate`}
                value={person.rate}
                maxLength={40}
                onChange={(event) => onChange({ rate: event.target.value })}
                inputMode="decimal"
                autoComplete="off"
                className="pf-field"
                data-testid="pf-person-rate"
                {...(rateBad
                  ? { "aria-invalid": true as const, "aria-describedby": `${uid}-rate-error` }
                  : {})}
              />
            ) : (
              <span className="pf-value" id={`${uid}-rate`} data-testid="pf-person-rate-none">
                {NOT_COMPUTED}
              </span>
            )}
            {rateBad ? (
              <span
                id={`${uid}-rate-error`}
                className="pf-error"
                data-testid="pf-error"
                data-field="person-rate"
              >
                {RATE_ERROR}
              </span>
            ) : null}
          </div>
          <div className="pf-cell pf-foreign-cell">
            <span className="pf-label">{CONVERTED_LABEL}</span>
            <span className="pf-value" data-testid="pf-person-converted">
              {converted === null ? NOT_COMPUTED : formatAmount(converted)}
            </span>
          </div>
        </div>
      ) : null}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove person"
        className="pf-remove"
        data-testid="pf-remove-person"
      >
        <Minus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
