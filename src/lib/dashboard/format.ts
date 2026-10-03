/** "10.500000" -> "10.5", "3.000000" -> "3". NUMERIC comes back as an exact string. */
export function trimDecimal(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

/** EPS as reported (at least 2 decimals, never rounded away: 0.105 stays 0.105) + currency code (T11). */
export function formatEps(v: number, currency: string | null | undefined): string {
  const [int, dec = ""] = String(v).split(".");
  const shown = String(v).includes("e") ? v.toFixed(2) : `${int}.${dec.padEnd(2, "0")}`;
  return currency ? `${shown} ${currency}` : shown;
}
