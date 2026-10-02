export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function yearsBetween(origin: string, day: string): number {
  const a = Date.parse(`${origin}T00:00:00Z`);
  const b = Date.parse(`${day}T00:00:00Z`);
  return (b - a) / (365.25 * 86400000);
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Same day-of-month, or the last day when the next month is shorter. */
export function addMonths(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const day = Math.min(d, last);
  return new Date(Date.UTC(y, m, day)).toISOString().slice(0, 10);
}

export function contributionDates(start: string, end: string, frequency: "weekly" | "monthly"): string[] {
  const dates: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    dates.push(cursor);
    const next = frequency === "weekly" ? addDays(cursor, 7) : addMonths(cursor);
    if (next <= cursor) break;
    cursor = next;
  }
  return dates;
}
