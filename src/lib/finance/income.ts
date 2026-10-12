/**
 * Personal Finance income (#85 v1.2; spec `attachments/personal-finance-spec.md` section 12, PF-11..16). Pure
 * helpers: people, net, which incomes count and each person's share, the income table and this browser's
 * `localStorage` (its own key; the expenses key is unchanged). Bonus rating = % of yearly wages (Q5); net = gross ×
 * (1 − average tax) (Q6); one share per person (Q7); biweekly = yearly ÷ 26 (Q8).
 */
import { type CurrencyCode, CURRENCIES, DEFAULT_HOUSEHOLD, isCurrency } from "./currency.ts";
import { amountOrZero, NAME_MAX, over, parseAmount, parseRate } from "./expenses.ts";

export const INCOME_KEY = "orpheus.finance.income.v1";
export const PEOPLE_MAX = 20;
export const PERCENT_ERROR = "Enter a percent from 0 to 100.";
export const PERIODS_BIWEEKLY = 26;
export const PERSON_COLUMNS = [
  "Name",
  "Wages (yearly)",
  "Bonus rating (%)",
  "Average tax (%)",
  "Net (yearly)",
  "Count wages",
  "Count bonus",
  "Share (%)",
  "Foreign", // #102
] as const;
export const FOREIGN_LABEL = "Foreign";
export const CONVERTED_LABEL = "Converted (yearly)";
/** `FX rate (BRL per 1 CAD)` (#102: foreign units per 1 household unit). */
export const rateLabel = (code: string, household: string): string =>
  `FX rate (${code} per 1 ${household})`;
export const TABLE_COLUMNS = ["Income", "Biweekly", "Monthly", "Yearly"] as const;
export const NET_INCOME = "Net income";

export type Person = {
  id: string;
  name: string;
  /** Gross yearly wages as typed. */
  wages: string;
  /** Bonus as a percent of yearly wages, as typed. */
  bonus: string;
  /** Average tax percent, as typed. */
  tax: string;
  /** Share percent of this person's counted lines, as typed. */
  share: string;
  countWages: boolean;
  countBonus: boolean;
  /** #102: the person's amounts are in `currency`, converted ÷ `rate` (foreign per 1 household unit). */
  foreign: boolean;
  /** One of the ten codes, or "" (the default foreign choice). */
  currency: string;
  /** As typed. */
  rate: string;
};

export type Income = { people: Person[] };
export const NO_INCOME: Income = { people: [] };

type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** A typed percent 0–100 (commas and spaces dropped; empty is 0), or null when it fails the field check. */
export function parsePercent(text: string): number | null {
  const value = parseAmount(text);
  return value === null || value > 100 ? null : value;
}

const percentOrZero = (text: string): number => parsePercent(text) ?? 0;

/** Gross yearly: wages + the bonus (wages × rating ÷ 100). */
export const grossWages = (p: Person): number => amountOrZero(p.wages);
export const grossBonus = (p: Person): number =>
  (amountOrZero(p.wages) * amountOrZero(p.bonus)) / 100;
const afterTax = (p: Person, gross: number): number => gross * (1 - percentOrZero(p.tax) / 100);

/** Net (yearly) per person, before any choice: (wages + bonus) × (1 − tax). */
export const personNet = (p: Person): number => afterTax(p, grossWages(p) + grossBonus(p));

export const personLabel = (p: Person, index: number): string =>
  p.name.trim() || `Person ${index + 1}`;

/** A foreign person's currency: as stored, else the first code that isn't the household's. */
export const personCurrency = (
  p: Person,
  household: CurrencyCode = DEFAULT_HOUSEHOLD,
): CurrencyCode =>
  isCurrency(p.currency) ? p.currency : (CURRENCIES.find((c) => c !== household) as CurrencyCode);

/** True when the person's amounts need converting (#102): Foreign ticked and a currency other than the household's. */
export const isForeignPerson = (p: Person, household: CurrencyCode = DEFAULT_HOUSEHOLD): boolean =>
  p.foreign && personCurrency(p, household) !== household;

/** What the person's amounts are divided by (#102): 1, their valid rate, or null (no valid rate). */
export const personDivisor = (
  p: Person,
  household: CurrencyCode = DEFAULT_HOUSEHOLD,
): number | null => (isForeignPerson(p, household) ? parseRate(p.rate) : 1);

/** `Converted (yearly)`: Net ÷ rate in the household currency, or null (`—`). */
export const personConverted = (
  p: Person,
  household: CurrencyCode = DEFAULT_HOUSEHOLD,
): number | null => {
  return over(personNet(p), personDivisor(p, household));
};

export type IncomeLine = { id: string; label: string; yearly: number | null; counted: boolean };

/**
 * The income table: Wages then Bonus per person, each line's counted net (× share, 0 when not ticked), in the
 * household currency (#102: a foreign person's lines ÷ rate; null (`—`) without a valid rate).
 */
export function incomeLines(
  people: readonly Person[],
  household: CurrencyCode = DEFAULT_HOUSEHOLD,
): IncomeLine[] {
  return people.flatMap((p, i) => {
    const d = personDivisor(p, household);
    const conv = (v: number): number | null => over(v, d);
    const share = percentOrZero(p.share) / 100;
    const label = personLabel(p, i);
    return [
      {
        id: `${p.id}-wages`,
        label: `${label} · Wages`,
        counted: p.countWages,
        yearly: p.countWages ? conv(afterTax(p, grossWages(p)) * share) : 0,
      },
      {
        id: `${p.id}-bonus`,
        label: `${label} · Bonus`,
        counted: p.countBonus,
        yearly: p.countBonus ? conv(afterTax(p, grossBonus(p)) * share) : 0,
      },
    ];
  });
}

/**
 * #105 (PF-42): the lines the income table shows: counted and not 0 (a counted foreign line without a valid rate is
 * `—`, so it stays). `Net income` still sums every line (the hidden ones are 0).
 */
export const shownIncomeLines = (
  people: readonly Person[],
  household: CurrencyCode = DEFAULT_HOUSEHOLD,
): IncomeLine[] => incomeLines(people, household).filter((l) => l.counted && l.yearly !== 0);

/** The counted net income, yearly, household currency (what `% of income` divides by, monthly); null (`—`) when a line is. */
export const netIncomeYearly = (
  people: readonly Person[],
  household: CurrencyCode = DEFAULT_HOUSEHOLD,
): number | null =>
  incomeLines(people, household).reduce<number | null>(
    (sum, l) => (sum === null || l.yearly === null ? null : sum + l.yearly),
    0,
  );

export function biweekly(yearly: number): number;
export function biweekly(yearly: number | null): number | null;
export function biweekly(yearly: number | null): number | null {
  return yearly === null ? null : yearly / PERIODS_BIWEEKLY;
}
export function monthly(yearly: number): number;
export function monthly(yearly: number | null): number | null;
export function monthly(yearly: number | null): number | null {
  return yearly === null ? null : yearly / 12;
}

let counter = 0;
export function newPerson(): Person {
  counter += 1;
  return {
    id: `p${Date.now().toString(36)}${counter.toString(36)}`,
    name: "",
    wages: "",
    bonus: "",
    tax: "",
    share: "100",
    countWages: true,
    countBonus: true,
    foreign: false,
    currency: "",
    rate: "",
  };
}

const isText = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;

function asPerson(value: unknown): Person | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (!isText(v.id, 40) || !v.id || !isText(v.name, NAME_MAX)) return null;
  if (![v.wages, v.bonus, v.tax, v.share].every((x) => isText(x, 40))) return null;
  if (typeof v.countWages !== "boolean" || typeof v.countBonus !== "boolean") return null;
  return {
    id: v.id,
    name: v.name,
    wages: v.wages as string,
    bonus: v.bonus as string,
    tax: v.tax as string,
    share: v.share as string,
    countWages: v.countWages,
    countBonus: v.countBonus,
    // #102: people stored before it read as not foreign.
    foreign: v.foreign === true,
    currency: isCurrency(v.currency) ? v.currency : "",
    rate: isText(v.rate, 40) ? v.rate : "",
  };
}

/** A stored value back into the income block, or no people when it isn't one (never throws). */
export function asIncome(value: unknown): Income {
  if (!value || typeof value !== "object") return NO_INCOME;
  const list = (value as Record<string, unknown>).people;
  if (!Array.isArray(list)) return NO_INCOME;
  const seen = new Set<string>();
  const people: Person[] = [];
  for (const item of list.slice(0, PEOPLE_MAX)) {
    const p = asPerson(item);
    if (p && !seen.has(p.id)) {
      seen.add(p.id);
      people.push(p);
    }
  }
  return { people };
}

export function readIncome(storage: StorageLike | null): Income {
  try {
    const text = storage?.getItem(INCOME_KEY);
    return text ? asIncome(JSON.parse(text)) : NO_INCOME;
  } catch {
    return NO_INCOME;
  }
}

export function writeIncome(storage: StorageLike | null, income: Income): void {
  try {
    storage?.setItem(INCOME_KEY, JSON.stringify(income));
  } catch {
    // Storage full or blocked: the page keeps working for this visit.
  }
}
