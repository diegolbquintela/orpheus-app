// Types for the pf-helpers.mjs exports imported by src/lib/finance/fx-history.server.test.ts (#170).
type FxReply = { fx_basis?: unknown; fx_fallback_months?: unknown };
export const EXPORT_FX_LINE: string;
export const EXPORT_FX_LINE_HISTORICAL: string;
export const FX_BASIS_CURRENT: string;
export const FX_BASIS_HISTORICAL: string;
export const FX_BASIS_MIXED: string;
export const FX_HISTORY_NOTE: string;
export function exportFxMixedLine(months: string[]): string;
export function expectedFxLine(j: FxReply): string;
export function fxBasisOk(j: FxReply): boolean;
