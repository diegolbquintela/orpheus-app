import { type CurrencyCode, readHousehold } from "./currency.ts";
import { parseRoic, parseWithdrawal, type Rates, readRates } from "./equity.ts";
import { type Expenses, isForeign, type Line, parseAmount, parseRate, readExpenses } from "./expenses.ts";
import { type Income, parsePercent, type Person, personCurrency, readIncome } from "./income.ts";
import { readMonths } from "./months.ts";
import { type Overview, readOverview } from "./overview.ts";
import { RecordStore, type PfRecord } from "./record.ts";

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
  overview: Pick<Overview, "start" | "growth">;
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

const sharedErrors = (rates: Rates, overview: Pick<Overview, "start" | "growth">): string[] => [
  ...(parseWithdrawal(rates.withdrawal) === null ? ["rates.withdrawal"] : []),
  ...(parseRoic(rates.roic) === null ? ["rates.roic"] : []),
  ...(parseAmount(overview.start) === null ? ["overview.start"] : []),
  ...(parseAmount(overview.growth) === null ? ["overview.growth"] : []),
];

/** The page (Q-S1): every field in error on the shown month and the shared values; empty → Save may save. */
export function fieldErrors(s: FieldState, o: Options = { blankRateIsError: true }): string[] {
  return [
    ...lineErrors("fixed", s.expenses.fixed, s.household, o),
    ...lineErrors("variable", s.expenses.variable, s.household, o),
    ...peopleErrors(s.income.people, s.household, o),
    ...sharedErrors(s.rates, s.overview),
  ];
}

/**
 * The API (Q-S4): the first invalid value in a record (read with the page's own readers), or null. Checks the shared
 * values and every stored month's lines; a blank FX rate is accepted (Q14).
 */
export function recordFieldError(record: PfRecord): string | null {
  const store = new RecordStore(record);
  const o: Options = { blankRateIsError: false };
  const household = readHousehold(store).household;
  const shared = readExpenses(store);
  const errors = [
    ...lineErrors("expenses.fixed", shared.fixed, household, o),
    ...lineErrors("expenses.variable", shared.variable, household, o),
    ...peopleErrors(readIncome(store).people, household, o).map((p) => `income.${p}`),
    ...sharedErrors(readRates(store), readOverview(store)),
  ];
  for (const [key, m] of Object.entries(readMonths(store))) {
    errors.push(
      ...lineErrors(`months.${key}.fixed`, m.fixed, household, o),
      ...lineErrors(`months.${key}.variable`, m.variable, household, o),
      ...peopleErrors(m.people, household, o).map((p) => `months.${key}.${p}`),
    );
  }
  return errors[0] ?? null;
}
