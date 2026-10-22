import { type CurrencyCode, readHousehold } from "./currency.ts";
import { parseRoic, parseWithdrawal, type Rates, readRates } from "./equity.ts";
import { type Expenses, isForeign, type Line, parseAmount, parseRate, readExpenses } from "./expenses.ts";
import { type Income, parsePercent, type Person, personCurrency, readIncome } from "./income.ts";
import { type MonthLines, readMonths } from "./months.ts";
import { householdMonth, type Overview, readOverview } from "./overview.ts";
import { PLANS_KEY } from "./plans-key.ts";
import { readPlans } from "./plans-read.ts";
import { RecordStore, type PfRecord } from "./record.ts";
import { scenarioValueOk } from "./scenario-key.ts";
import { RANGE_AFTER_CURRENT, RANGE_BEFORE_FIRST, rangeError } from "./report.ts";

/**
 * #143 (spec section 28, PF-133..PF-140): the one field check behind the page's Save and the API's PUT. Every field that
 * shows an error (Q-S2): a line's amount / `Equity to cover` / foreign FX rate; a person's wages, bonus %, tax %,
 * share %, foreign FX rate; the two rates; `Starting net assets` and growth. Never clamps: an invalid value is an error.
 */
export const SAVE_BLOCKED = "Fix the fields marked in red before saving.";
export const INVALID_VALUE = "Invalid value.";

export type FieldState = {
  expenses: Pick<Expenses, "fixed" | "variable">;
  income: Income;
  rates: Rates;
  overview: Pick<Overview, "start" | "growth" | "asOf">;
  household: CurrencyCode;
};

/** `blankRateIsError`: the page shows a blank FX rate on a foreign line as an error (Q-S2); the API accepts it (Q-S4). */
type Options = { blankRateIsError: boolean };

const rateBad = (text: string, o: Options): boolean =>
  text.trim() === "" ? o.blankRateIsError : parseRate(text) === null;

export function lineErrors(group: string, lines: Line[], household: CurrencyCode, o: Options): string[] {
  const out: string[] = [];
  lines.forEach((l, i) => {
    if (parseAmount(l.amount) === null) out.push(`${group}.${i}.amount`);
    if (parseAmount(l.equity) === null) out.push(`${group}.${i}.equity`);
    if (isForeign(l, household) && rateBad(l.rate, o)) out.push(`${group}.${i}.rate`);
  });
  return out;
}

export function peopleErrors(people: Person[], household: CurrencyCode, o: Options): string[] {
  const out: string[] = [];
  people.forEach((p, i) => {
    if (parseAmount(p.wages) === null) out.push(`people.${i}.wages`);
    if (parseAmount(p.bonus) === null) out.push(`people.${i}.bonus`);
    if (parsePercent(p.tax) === null) out.push(`people.${i}.tax`);
    if (parsePercent(p.share) === null) out.push(`people.${i}.share`);
    if (p.foreign && personCurrency(p, household) !== household && rateBad(p.rate, o)) out.push(`people.${i}.rate`);
  });
  return out;
}

/**
 * #171 (spec 42, Q-AG9): an as-of month is bad unless empty / absent or a real month from 2020-01 to the current
 * household month: the #179 shared range validator in save mode, as a one-month range. `current` omitted (old callers)
 * = the validator's own household month of now.
 */
export const asOfBad = (asOf: string | undefined, current?: string): boolean => asOfError(asOf, current) !== null;

/** #171 Q-AG9 (CFO, 2026-10-17): the record API's as-of bound messages (400, field `overview.asOf`). */
export const MONTH_BEFORE_FIRST = "Month can't be before 2020-01.";
export const MONTH_AFTER_CURRENT = "Month can't be after the current month.";
/**
 * The record API's message for a bad as-of month, or null. The #179 validator's two bound refusals map to the month
 * texts; everything else it refuses (malformed, before 2000 / after 2100) stays `Invalid value.`.
 */
export function asOfError(asOf: string | undefined, current?: string): string | null {
  if (!asOf) return null;
  const e = rangeError({ from: asOf, to: asOf }, "save", current);
  if (!e) return null;
  return e.error === RANGE_BEFORE_FIRST ? MONTH_BEFORE_FIRST : e.error === RANGE_AFTER_CURRENT ? MONTH_AFTER_CURRENT : INVALID_VALUE;
}

const sharedErrors = (rates: Rates, overview: Pick<Overview, "start" | "growth" | "asOf">, current?: string): string[] => [
  ...(parseWithdrawal(rates.withdrawal) === null ? ["rates.withdrawal"] : []),
  ...(parseRoic(rates.roic) === null ? ["rates.roic"] : []),
  ...(parseAmount(overview.start) === null ? ["overview.start"] : []),
  ...(asOfBad(overview.asOf, current) ? ["overview.asOf"] : []),
  ...(parseAmount(overview.growth) === null ? ["overview.growth"] : []),
];

/** The page (Q-S1): every field in error on the shown month and the shared values; empty → Save may save. */
export function fieldErrors(s: FieldState, o: Options = { blankRateIsError: true }, current?: string): string[] {
  return [
    ...lineErrors("fixed", s.expenses.fixed, s.household, o),
    ...lineErrors("variable", s.expenses.variable, s.household, o),
    ...peopleErrors(s.income.people, s.household, o),
    ...sharedErrors(s.rates, s.overview, current),
  ];
}

/**
 * #231 PV1 (spec 65.7, PFPV-27..30): a month's (or plan's) lines checked like the page's Save (a blank FX rate on a
 * foreign line is an error by default); empty = valid.
 */
export function monthErrors(m: MonthLines, household: CurrencyCode, o: Options = { blankRateIsError: true }): string[] {
  return [
    ...lineErrors("fixed", m.fixed, household, o),
    ...lineErrors("variable", m.variable, household, o),
    ...peopleErrors(m.people, household, o),
  ];
}

/**
 * The API (Q-S4): the first invalid value in a record (read with the page's own readers), or null. Checks the shared
 * values and every stored month's lines; a blank FX rate is accepted (Q14).
 */
/** #171 Q-AG9: the record API's refusal, `{ field, error }`: the as-of month's own message, else `Invalid value.`. */
export function recordRefusal(record: PfRecord, current?: string, storedPlans?: string): { field: string; error: string } | null {
  const field = recordFieldError(record, current, storedPlans);
  if (!field) return null;
  const asOf = field === "overview.asOf" ? asOfError(readOverview(new RecordStore(record)).asOf, current) : null;
  return { field, error: asOf ?? INVALID_VALUE };
}

/**
 * #231 PV1 (spec 65.7): `storedPlans` = the plans text already stored for the user. Only incoming plans the save would
 * WRITE are checked: a month after `current` whose plan differs from the stored one. Current / past plans (ignored by the
 * merge) and unchanged stored plans (legacy) never block a save.
 */
export function recordFieldError(record: PfRecord, current?: string, storedPlans?: string): string | null {
  const store = new RecordStore(record);
  const o: Options = { blankRateIsError: false };
  const household = readHousehold(store).household;
  const shared = readExpenses(store);
  const errors = [
    ...lineErrors("expenses.fixed", shared.fixed, household, o),
    ...lineErrors("expenses.variable", shared.variable, household, o),
    ...peopleErrors(readIncome(store).people, household, o).map((p) => `income.${p}`),
    ...sharedErrors(readRates(store), readOverview(store), current),
  ];
  for (const [key, m] of Object.entries(readMonths(store))) {
    errors.push(
      ...lineErrors(`months.${key}.fixed`, m.fixed, household, o),
      ...lineErrors(`months.${key}.variable`, m.variable, household, o),
      ...peopleErrors(m.people, household, o).map((p) => `months.${key}.${p}`),
    );
  }
  if (record[PLANS_KEY] !== undefined) {
    const now = current ?? householdMonth(new Date());
    const before = readPlans(new RecordStore({ ...record, [PLANS_KEY]: storedPlans ?? "{}" }));
    for (const [key, p] of Object.entries(readPlans(store))) {
      if (key <= now || (before[key] && JSON.stringify(before[key]) === JSON.stringify(p))) continue;
      errors.push(...monthErrors(p.lines, household).map((e) => `plans.${key}.${e}`));
    }
  }
  // #215 (spec 55, PFSC): a saved scenario must be a readable set of levers in bounds; refused, never clamped.
  if (!scenarioValueOk(record)) errors.push("scenario");
  return errors[0] ?? null;
}
