/**
 * #267 one-time seed: turns the CoS tracker's Daily Log (`cos-tracker.md`, section 4) into check-in bodies for
 * `POST /api/renaissance/checkin` (scripts/renaissance-seed.ts sends them; never a direct database write).
 * Reads: the Day 0 baseline lines, the Cap Log table, `YYYY-MM-DD PM result: HIT …; MISSED/unreported: …` lines and
 * `YYYY-MM-DD AM picks: …` lines. Anything else (session plans, notes) is ignored. Pure.
 */
import { PLAN, type Checkin, type CheckinEntry, type Pillar } from "./model.ts";

const KEYWORDS: { re: RegExp; item: string; pillar: Pillar }[] = [
  { re: /\bzyn\b/i, item: PLAN.zyn.item, pillar: "health" },
  { re: /\bcoffee/i, item: PLAN.coffee.item, pillar: "health" },
  { re: /\blift/i, item: PLAN.lift.item, pillar: "health" },
  { re: /\bsteps?\b/i, item: PLAN.steps.item, pillar: "health" },
  { re: /\bindustry\b|work block|servicenow/i, item: "industry", pillar: "industry" },
  { re: /\bspiritual\b|\bbible\b/i, item: "spiritual", pillar: "spiritual" },
];

/** Items a phrase names (a phrase like `Zyn ≤15 & coffee ≤6` names two). */
export function itemsIn(phrase: string): { item: string; pillar: Pillar }[] {
  return KEYWORDS.filter((k) => k.re.test(phrase)).map(({ item, pillar }) => ({ item, pillar }));
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number) => String(n).padStart(2, "0");

type Day = { picks: string[]; entries: Map<string, CheckinEntry> };

export function parseTracker(md: string, year = Number(PLAN.start.slice(0, 4))): Checkin[] {
  const days = new Map<string, Day>();
  const day = (d: string) => {
    let x = days.get(d);
    if (!x) days.set(d, (x = { picks: [], entries: new Map() }));
    return x;
  };
  const set = (d: string, e: CheckinEntry) => {
    const x = day(d);
    const prev = x.entries.get(e.item);
    x.entries.set(e.item, {
      ...e,
      target: e.target ?? prev?.target ?? null,
      actual: e.actual ?? prev?.actual ?? null,
      hit: e.hit ?? prev?.hit ?? null,
      note: e.note ?? prev?.note ?? null,
    });
  };
  const target = (item: string) => (item === PLAN.steps.item ? PLAN.steps.min : null);

  const lines = md.split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s+4\.\s*Daily Log/i.test(l));
  let current: string | null = null;
  for (const line of start >= 0 ? lines.slice(start) : lines) {
    const head = /^###\s+(\d{4}-\d{2}-\d{2})/.exec(line);
    if (head) current = head[1];
    if (current && /baseline/i.test(line)) {
      const z = /zyn baseline:\**\s*\**(\d+)/i.exec(line);
      if (z) set(current, { pillar: "health", item: PLAN.zyn.item, target: Number(z[1]), actual: Number(z[1]), hit: true, note: "Baseline" });
      const c = /coffee baseline:\**\s*\**(\d+)/i.exec(line);
      if (c) set(current, { pillar: "health", item: PLAN.coffee.item, target: Number(c[1]), actual: Number(c[1]), hit: true, note: "Baseline" });
    }
    const result = /(\d{4}-\d{2}-\d{2}) PM result:(.*)$/i.exec(line);
    if (result) {
      const [, d, rest] = result;
      const [hitPart, missPart = ""] = rest.split(/MISSED(?:\/unreported)?:/i);
      for (const phrase of hitPart.split(/;|\bHIT\b/i))
        for (const { item, pillar } of itemsIn(phrase)) set(d, { pillar, item, target: target(item), actual: null, hit: true, note: null });
      for (const phrase of missPart.split(/,|;/))
        for (const { item, pillar } of itemsIn(phrase)) set(d, { pillar, item, target: target(item), actual: null, hit: false, note: null });
    }
    const picks = /(\d{4}-\d{2}-\d{2}) AM picks:(.*)$/i.exec(line);
    if (picks) {
      const [, d, rest] = picks;
      const list = rest.split(";").map((p) => p.trim().replace(/\.$/, "")).filter(Boolean);
      day(d).picks = list.slice(0, 10).map((p) => p.slice(0, 200));
      for (const p of list) for (const { item, pillar } of itemsIn(p)) set(d, { pillar, item, target: target(item), actual: null, hit: null, note: null });
    }
    const cap = /^\|\s*([A-Z][a-z]{2})\s+(\d{1,2})\s*\|\s*(?:≤)?\s*(\d+)[^|]*\|\s*([^|]*)\|\s*(?:≤)?\s*(\d+)[^|]*\|\s*([^|]*)\|/.exec(line);
    if (cap) {
      const mi = MONTHS.indexOf(cap[1].toLowerCase());
      if (mi < 0) continue;
      const d = `${year}-${pad(mi + 1)}-${pad(Number(cap[2]))}`;
      const hitOf = (s: string) => (/^\s*(hit|yes|✓)/i.test(s) ? true : /miss/i.test(s) ? false : null);
      set(d, { pillar: "health", item: PLAN.zyn.item, target: Number(cap[3]), actual: null, hit: hitOf(cap[4]), note: null });
      set(d, { pillar: "health", item: PLAN.coffee.item, target: Number(cap[5]), actual: null, hit: hitOf(cap[6]), note: null });
    }
  }
  return [...days.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .filter(([, x]) => x.entries.size > 0)
    .map(([date, x]) => ({ date, picks: x.picks, entries: [...x.entries.values()] }));
}
