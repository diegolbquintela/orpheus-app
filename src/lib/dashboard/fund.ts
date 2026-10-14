/**
 * #124: pure fund / ETF classification of an OpenFIGI mapping answer (attachments/etf-detection-design.md, Q-F3).
 * Shared by the server job and the company view.
 */
export type InstrumentKind = "fund" | "company" | "unknown";

export type FigiRecord = { figi?: string; securityType?: string | null; securityType2?: string | null; [k: string]: unknown };
export type FigiResult = { data?: FigiRecord[] } | { warning?: string } | { error?: string };

/** Q-F3: `securityType` values that make a listing a fund. */
export const FUND_SECURITY_TYPES = new Set(["ETP", "ETF", "Open-End Fund", "Closed-End Fund", "Mutual Fund", "Fund of Funds", "Unit Trust"]);

export const FUND_LINE = "Fund: company figures do not apply";
export const SOURCE_LINE_FUND = "Daily closes and dividends as stored by the Dashboard · fund type from OpenFIGI";

/** Fund only if the first hit is a fund; no hit = unknown. */
export function classifyFigi(result: FigiResult | undefined): InstrumentKind {
  const first = result && "data" in result ? result.data?.[0] : undefined;
  if (!first) return "unknown";
  if ((first.securityType && FUND_SECURITY_TYPES.has(first.securityType)) || first.securityType2 === "Mutual Fund") return "fund";
  return "company";
}
