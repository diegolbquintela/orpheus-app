/**
 * #221 (spec 57.15, AC PFPJ-71..76; QA AO3 / AO4, EL 2026-10-22): the scenario screen's own amount check. The main
 * page's `parseAmount` is unchanged (it drops every comma, so `10,5` reads as 105 and `1.234,56` as 1.23456 there).
 * Here a comma is only a thousands separator: `12,345.67` and `1,000` pass; `10,5` and `1.234,56` are refused.
 */
import { parseAmount } from "./expenses.ts";

export const DECIMAL_COMMA_ERROR = "Use a dot for decimals and commas only for thousands, for example 1,234.56.";

/** True when the text has a comma that is not a thousands separator (`10,5`, `1.234,56`, `1,00`). */
export function badComma(text: string): boolean {
  const t = text.replace(/\s/g, "").replace(/^[+\-\u2212]/, "").replace(/^\$/, "");
  if (!t.includes(",")) return false;
  return !/^\d{1,3}(,\d{3})+(\.\d*)?$/.test(t);
}

/**
 * A scenario amount: blank → 0; an optional sign (`+`, `-`, U+2212) only when `signed`; then the main `parseAmount`,
 * after the comma check. Null when refused.
 */
export function parseScenarioAmount(text: string, signed = false): number | null {
  const t = text.trim();
  if (!t) return 0;
  if (badComma(t)) return null;
  const m = /^([+\-\u2212]?)\s*(.*)$/.exec(t)!;
  if (m[1] && !signed && m[1] !== "+") return null;
  if (m[1] && m[2].trim() === "") return null;
  const v = parseAmount(m[2]);
  if (v === null) return null;
  return m[1] === "-" || m[1] === "\u2212" ? -v : v;
}
