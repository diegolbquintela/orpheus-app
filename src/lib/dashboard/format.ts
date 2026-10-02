/** "10.500000" -> "10.5", "3.000000" -> "3". NUMERIC comes back as an exact string. */
export function trimDecimal(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}
