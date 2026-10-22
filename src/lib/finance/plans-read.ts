import { asLines, type MonthLines } from "./months.ts";
import type { MonthKey } from "./overview.ts";
import { PLANS_KEY } from "./plans-key.ts";
import { readExpenses } from "./expenses.ts";

/** #231 (spec 65): reading the plans value, its own file so field-errors.ts (the API check) and plans.ts share it. */
export type Plan = { lines: MonthLines; capturedAt: string };
export type Plans = Record<MonthKey, Plan>;

type StorageLike = Pick<Storage, "getItem" | "setItem">;
const isKey = (k: string): boolean => /^\d{4}-(0[1-9]|1[0-2])$/.test(k) && k >= "2020-01";

/** Raw plans as stored (server side; no shared-value checks): only `yyyy-mm` keys with an object value. */
export function rawPlans(text: string | undefined | null): Record<string, unknown> | null {
  if (typeof text !== "string") return null;
  try {
    const v = JSON.parse(text) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    const out: Record<string, unknown> = {};
    for (const [k, p] of Object.entries(v as Record<string, unknown>))
      if (isKey(k) && p && typeof p === "object" && !Array.isArray(p)) out[k] = p;
    return out;
  } catch {
    return null;
  }
}

/** The page's plans, each plan's lines read like a month's (against the shared accounts / categories). */
export function readPlans(storage: StorageLike | null): Plans {
  const raw = rawPlans(storage?.getItem(PLANS_KEY) ?? null) ?? {};
  const shared = readExpenses(storage);
  const out: Plans = {};
  for (const [k, p] of Object.entries(raw)) {
    const v = p as Record<string, unknown>;
    out[k] = { lines: asLines(v.lines, shared), capturedAt: typeof v.capturedAt === "string" ? v.capturedAt : "" };
  }
  return out;
}

