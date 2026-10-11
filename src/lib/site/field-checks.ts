/**
 * Calculator field checks (#78, spec §4 / §7 / ST4-17; EL decisions A, 1, 4). Pure: the form calls `checkFields`
 * before any price request and `checkListings` after the prices are read, and shows each message under its field
 * without clearing anything. The engine (src/lib/dca/simulate.ts) is unchanged and refuses amounts that are not
 * above zero, so the amounts must be numbers above 0 here too (decision A).
 *
 * Field keys: `ticker-<n>` / `weight-<n>` (n = the basket row's index, 0-based), `start`, `end`, `capital`,
 * `contribution`, `frequency`.
 */

export type FieldErrors = Record<string, string>;

export const FIELD_COPY = {
  tickerBlank: "Add a ticker.",
  weight: "Enter a weight above 0.",
  duplicate: (ticker: string) => `${ticker} is already in the basket.`,
  startBlank: "Add a start date.",
  endBlank: "Add an end date.",
  order: "End must be after the start.",
  amount: "Enter a number above 0.",
  frequency: "Choose weekly or monthly.",
  currency: (ticker: string, currency: string, basket: string) =>
    `${ticker} trades in ${currency}; this basket is in ${basket}. One currency per basket.`,
} as const;

export const tickerField = (index: number) => `ticker-${index}`;
export const weightField = (index: number) => `weight-${index}`;

/** A number typed in a field ("1,000" allowed); null for text or a blank. */
export function parseAmount(value: string): number | null {
  const text = value.replace(/,/g, "").trim();
  if (!text) return null;
  const amount = Number(text);
  return Number.isFinite(amount) ? amount : null;
}

const aboveZero = (value: string) => {
  const amount = parseAmount(value);
  return amount != null && amount > 0 ? amount : null;
};

export type FieldInput = {
  rows: { ticker: string; weight: string }[];
  start: string;
  end: string;
  capital: string;
  contribution: string;
  frequency: string;
};

export type Basket = { index: number; ticker: string; weight: number }[];

export type FieldResult =
  | {
      ok: true;
      basket: Basket;
      capital: number;
      contribution: number;
      frequency: "weekly" | "monthly";
    }
  | { ok: false; errors: FieldErrors };

/** Every bad field at once, before any price request (tickers blank / duplicate, weights, dates, amounts, frequency). */
export function checkFields(input: FieldInput): FieldResult {
  const errors: FieldErrors = {};
  const basket: Basket = [];
  const seen = new Set<string>();
  let anyRow = false;
  input.rows.forEach((row, index) => {
    const ticker = row.ticker.trim().toUpperCase();
    const weightText = row.weight.trim();
    if (!ticker && !weightText) return; // an empty extra row is ignored
    anyRow = true;
    if (!ticker) errors[tickerField(index)] = FIELD_COPY.tickerBlank;
    else if (seen.has(ticker)) errors[tickerField(index)] = FIELD_COPY.duplicate(ticker);
    else seen.add(ticker);
    const weight = aboveZero(weightText);
    if (weight == null) errors[weightField(index)] = FIELD_COPY.weight;
    if (ticker && weight != null) basket.push({ index, ticker, weight });
  });
  if (!anyRow) errors[tickerField(0)] = FIELD_COPY.tickerBlank;

  if (!input.start) errors.start = FIELD_COPY.startBlank;
  if (!input.end) errors.end = FIELD_COPY.endBlank;
  else if (input.start && input.end <= input.start) errors.end = FIELD_COPY.order;

  const capital = aboveZero(input.capital);
  const contribution = aboveZero(input.contribution);
  if (capital == null) errors.capital = FIELD_COPY.amount;
  if (contribution == null) errors.contribution = FIELD_COPY.amount;

  const frequency =
    input.frequency === "weekly" || input.frequency === "monthly" ? input.frequency : null;
  if (!frequency) errors.frequency = FIELD_COPY.frequency;

  if (Object.keys(errors).length || capital == null || contribution == null || !frequency)
    return { ok: false, errors };
  return { ok: true, basket, capital, contribution, frequency };
}

export type Listing =
  | { index: number; ticker: string; ok: true; currency: string }
  | { index: number; ticker: string; ok: false; message: string };

/**
 * After the prices are read (EL decision 1): the price feed's refusal (venue outside US / EU / CA, unknown ticker)
 * under that ticker, naming it; then one currency per basket, the first ticker's currency being the basket's.
 */
export function checkListings(listings: Listing[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const listing of listings) {
    if (listing.ok) continue;
    const named = listing.message.toUpperCase().includes(listing.ticker.toUpperCase());
    errors[tickerField(listing.index)] = named
      ? listing.message
      : `${listing.ticker}: ${listing.message}`;
  }
  const priced = listings.filter(
    (listing): listing is Extract<Listing, { ok: true }> => listing.ok,
  );
  const basket = priced[0]?.currency;
  if (basket) {
    for (const listing of priced.slice(1)) {
      if (listing.currency !== basket) {
        errors[tickerField(listing.index)] = FIELD_COPY.currency(
          listing.ticker,
          listing.currency,
          basket,
        );
      }
    }
  }
  return errors;
}
