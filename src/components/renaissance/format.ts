// #267 display strings and number formatting for the Renaissance page (kept apart so fast refresh works).
export const NOT_CONFIGURED = "Check-ins aren't set up here yet.";
export const LEVEL_TEXT = { all: "all targets hit", partial: "some targets hit", none: "no targets hit", unreported: "no report" } as const;

export const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v)}%`);
/** Rounded half away from zero, so −12.5 reads −13 like +12.5 reads +13. */
const round = (v: number) => Math.sign(v) * Math.round(Math.abs(v));
/** `+5`, `−3` (a real minus), `±0`, then the unit. */
export const signed = (v: number | null, unit: string) => {
  if (v === null) return "—";
  const r = round(v);
  return `${r === 0 ? "±" : r > 0 ? "+" : "−"}${Math.abs(r)}${unit}`;
};
export const pts = (v: number | null) => signed(v, " pts");
