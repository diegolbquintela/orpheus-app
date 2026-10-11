/**
 * Personal finance household currency (#87 v1.4; spec `attachments/personal-finance-spec.md` section 14, PF-21..25).
 * One household-level code from a fixed list (default `USD`, Q13): income, every total, both percentages and
 * `Equity to cover` are in it. Each expense line may be in another code with a typed `FX rate` (household units per
 * 1 unit of the line's currency, Q12; the conversion lives in `expenses.ts`). Stored in this browser's
 * `localStorage`, its own key; the other three keys are unchanged.
 */

export const CURRENCY_KEY = "orpheus.finance.currency.v1";
export const HOUSEHOLD_LABEL = "Household currency";
export const CURRENCY_LABEL = "Currency";
export const FX_RATE_LABEL = "FX rate";
export const RATE_ERROR = "Enter a number above 0.";

export const CURRENCIES = [
  "USD",
  "CAD",
  "EUR",
  "GBP",
  "BRL",
  "MXN",
  "CHF",
  "JPY",
  "AUD",
  "CNY",
] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];
export const DEFAULT_HOUSEHOLD: CurrencyCode = "USD";

export const isCurrency = (value: unknown): value is CurrencyCode =>
  typeof value === "string" && (CURRENCIES as readonly string[]).includes(value);

export type Household = { household: CurrencyCode };
export const DEFAULT_CURRENCY: Household = { household: DEFAULT_HOUSEHOLD };

type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** A stored value back into the page: an unknown, missing or malformed value reads as `USD` (never throws). */
export function asHousehold(value: unknown): Household {
  if (!value || typeof value !== "object") return DEFAULT_CURRENCY;
  const v = value as Record<string, unknown>;
  return isCurrency(v.household) ? { household: v.household } : DEFAULT_CURRENCY;
}

export function readHousehold(storage: StorageLike | null): Household {
  try {
    const text = storage?.getItem(CURRENCY_KEY);
    return text && text.length <= 200 ? asHousehold(JSON.parse(text)) : DEFAULT_CURRENCY;
  } catch {
    return DEFAULT_CURRENCY;
  }
}

export function writeHousehold(storage: StorageLike | null, value: Household): void {
  try {
    storage?.setItem(CURRENCY_KEY, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the page keeps working for this visit.
  }
}

/** The line's `Currency` choices: the household code first, then the other nine in list order. */
export const currencyChoices = (household: CurrencyCode): CurrencyCode[] => [
  household,
  ...CURRENCIES.filter((c) => c !== household),
];
