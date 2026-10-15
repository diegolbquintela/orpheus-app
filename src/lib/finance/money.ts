/**
 * #142 (spec section 32, PF-175..PF-182): the one Personal Finance money format.
 * Exactly two decimals, comma thousands separators, no currency symbol (Q-W1, Q-W2): `4,296.30`, `1,200.00`, `0.00`.
 * Negatives `-1,234.50`; a value that rounds to zero is `0.00`, never `-0.00` (Q-W3).
 * Display-only rounding, half away from zero to the cent (Intl default; Q-W4).
 */
const MONEY = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatMoney(value: number): string {
  const text = MONEY.format(value);
  return text === "-0.00" ? "0.00" : text;
}
