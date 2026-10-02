/**
 * Calendar-date validation for dashboard inputs (`?date=` on `/api/dashboard/fx`, provider rows).
 * A date is accepted only if it is strict `YYYY-MM-DD`, the year is 1 or later, and it round-trips
 * through a UTC `Date` unchanged, so impossible dates (2026-02-31, 2026-02-29 in a non-leap year,
 * 04-31, 0000-01-01) are rejected before they reach Postgres (which would throw, i.e. a 500).
 */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1 || mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  // setUTCFullYear, not Date.UTC: Date.UTC maps years 0..99 to 1900..1999.
  const t = new Date(0);
  t.setUTCFullYear(y, mo - 1, d);
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}
