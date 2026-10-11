/**
 * Personal finance income (#85 v1.2; spec `attachments/personal-finance-spec.md` section 12, PF-11..16). Pure
 * helpers: people, net, which incomes count and each person's share, the income table and this browser's
 * `localStorage` (its own key; the expenses key is unchanged). Bonus rating = % of yearly wages (Q5); net = gross ×
 * (1 − average tax) (Q6); one share per person (Q7); biweekly = yearly ÷ 26 (Q8).
 */
import { amountOrZero, NAME_MAX, parseAmount } from "./expenses.ts";

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
] as const;
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

export type IncomeLine = { id: string; label: string; yearly: number; counted: boolean };

/** The income table: Wages then Bonus per person, each line's counted net (× share, 0 when not ticked). */
export function incomeLines(people: readonly Person[]): IncomeLine[] {
  return people.flatMap((p, i) => {
    const share = percentOrZero(p.share) / 100;
    const label = personLabel(p, i);
    return [
      {
        id: `${p.id}-wages`,
        label: `${label} · Wages`,
        counted: p.countWages,
        yearly: p.countWages ? afterTax(p, grossWages(p)) * share : 0,
      },
      {
        id: `${p.id}-bonus`,
        label: `${label} · Bonus`,
        counted: p.countBonus,
        yearly: p.countBonus ? afterTax(p, grossBonus(p)) * share : 0,
      },
    ];
  });
}

/** The counted net income, yearly (what `% of income` divides by, monthly). */
export const netIncomeYearly = (people: readonly Person[]): number =>
  incomeLines(people).reduce((sum, l) => sum + l.yearly, 0);

export const biweekly = (yearly: number): number => yearly / PERIODS_BIWEEKLY;
export const monthly = (yearly: number): number => yearly / 12;

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
