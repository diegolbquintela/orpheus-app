/**
 * #267 Renaissance Man dashboard (attachments/renaissance-spec.md): the shared shapes, the tracked plan and the
 * check-in body validation. Pure (no React, no server imports) so the API, the page and the tests share it.
 */

export const PILLARS = ["health", "industry", "spiritual"] as const;
export type Pillar = (typeof PILLARS)[number];

export const PILLAR_LABEL: Record<Pillar, string> = {
  health: "Health",
  industry: "Industry",
  spiritual: "Classical Knowledge & Spiritual Life",
};

/** The Wave 1 plan (cos-tracker.md, Oct 28 2026). Day 0 is the baseline day. */
export const PLAN = {
  start: "2026-10-28",
  timeZone: "America/Toronto",
  zyn: { item: "zyn", baseline: 16, floor: 3 },
  coffee: { item: "coffee", baseline: 7, floor: 3 },
  /** hit = no coffee after 12:00 noon; actual = cups after noon. */
  coffeeNoon: { item: "coffee_noon" },
  steps: { item: "steps", min: 8000, goal: 10000 },
  lift: { item: "lift", perWeek: 3 },
} as const;

export type CapSpec = { item: string; baseline: number; floor: number };

/** One stored row (rm_entries). `hit` null = not reported / pending. */
export type Entry = {
  date: string;
  pillar: Pillar;
  item: string;
  target: number | null;
  actual: number | null;
  hit: boolean | null;
  note: string | null;
  picks: string[];
};

export type CheckinEntry = Omit<Entry, "date" | "picks">;
export type Checkin = { date: string; picks: string[]; entries: CheckinEntry[] };

export const LIMITS = { entries: 40, picks: 10, pick: 200, note: 500, value: 1_000_000 } as const;
const ITEM = /^[a-z][a-z0-9_]{0,39}$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar date `yyyy-mm-dd` (2000–2099). */
export function isIsoDate(s: unknown): s is string {
  if (typeof s !== "string") return false;
  const m = DATE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 2000 || y > 2099) return false;
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

type Result = { ok: true; value: Checkin } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });

function num(v: unknown, field: string): number | null | string {
  if (v === undefined || v === null) return null;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > LIMITS.value)
    return `${field} must be a number from 0 to ${LIMITS.value}, or null.`;
  return v;
}

/** Validates `{ date, picks, entries: [{ pillar, item, target, actual, hit, note }] }`; unknown keys are ignored. */
export function parseCheckin(raw: unknown): Result {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail("Body must be a JSON object.");
  const b = raw as Record<string, unknown>;
  if (!isIsoDate(b.date)) return fail("date must be a real yyyy-mm-dd date.");
  const picksRaw = b.picks ?? [];
  if (!Array.isArray(picksRaw) || picksRaw.length > LIMITS.picks) return fail(`picks must be a list of at most ${LIMITS.picks} strings.`);
  const picks: string[] = [];
  for (const p of picksRaw) {
    if (typeof p !== "string" || !p.trim() || p.length > LIMITS.pick) return fail(`Each pick must be 1 to ${LIMITS.pick} characters.`);
    picks.push(p.trim());
  }
  if (!Array.isArray(b.entries) || b.entries.length < 1 || b.entries.length > LIMITS.entries)
    return fail(`entries must be a list of 1 to ${LIMITS.entries} entries.`);
  const seen = new Set<string>();
  const entries: CheckinEntry[] = [];
  for (const [i, e] of b.entries.entries()) {
    const at = `entries[${i}]`;
    if (!e || typeof e !== "object" || Array.isArray(e)) return fail(`${at} must be an object.`);
    const r = e as Record<string, unknown>;
    if (!(PILLARS as readonly unknown[]).includes(r.pillar)) return fail(`${at}.pillar must be health, industry or spiritual.`);
    if (typeof r.item !== "string" || !ITEM.test(r.item)) return fail(`${at}.item must be a lowercase slug (a-z, 0-9, _), up to 40 characters.`);
    if (seen.has(r.item)) return fail(`${at}.item repeats ${r.item}.`);
    seen.add(r.item);
    const target = num(r.target, `${at}.target`);
    if (typeof target === "string") return fail(target);
    const actual = num(r.actual, `${at}.actual`);
    if (typeof actual === "string") return fail(actual);
    if (r.hit !== undefined && r.hit !== null && typeof r.hit !== "boolean") return fail(`${at}.hit must be true, false or null.`);
    if (r.note !== undefined && r.note !== null && (typeof r.note !== "string" || r.note.length > LIMITS.note))
      return fail(`${at}.note must be text up to ${LIMITS.note} characters, or null.`);
    entries.push({
      pillar: r.pillar as Pillar,
      item: r.item,
      target,
      actual,
      hit: typeof r.hit === "boolean" ? r.hit : null,
      note: typeof r.note === "string" && r.note.trim() ? r.note.trim() : null,
    });
  }
  return { ok: true, value: { date: b.date, picks, entries } };
}
