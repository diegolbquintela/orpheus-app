/**
 * #267 Renaissance Man API (server-only; attachments/renaissance-spec.md sections 3–4).
 *
 * `POST /api/renaissance/checkin`, in this order:
 * - 404 JSON while `DASHBOARD_ENABLED` is off (like every dashboard / PF API);
 * - 405 JSON (`Allow: POST`) for any other method;
 * - auth: an `Authorization: Bearer …` header is checked against `RENAISSANCE_INGEST_TOKEN` (constant time, length
 *   guarded; unset / empty = the bearer path is refused) and never falls back to the session; without that header,
 *   the session must be the owner (`ORPHEUS_OWNER_EMAIL`). 401 signed out or a wrong / refused token, 403 a signed-in
 *   non-owner; 503 without a database;
 * - 400 JSON for a body that isn't a valid check-in (model.ts `parseCheckin`); nothing is written;
 * - 200 `{ ok, date, upserted }`: each entry upserted on (date, item), so the same post twice changes nothing.
 * The token and the header are never logged. The page reads through `loadRenaissance` (owner only), not an API.
 */
import { timingSafeEqual } from "node:crypto";
import { ownerIdOf } from "../access/access.server.ts";
import { dashboardMethodNotAllowedResponse, guardDashboardApi } from "../dashboard/flag.server.ts";
import {
  badRequest,
  dashboardJson,
  defaultGetDb,
  forbiddenResponse,
  sessionFromRequestHeaders,
  storageUnavailable,
  unauthorizedResponse,
  type SessionLookup,
} from "../dashboard/session.server.ts";
import type { Queryable } from "../dashboard/store.server.ts";
import { parseCheckin, type Checkin, type Entry, type Pillar } from "./model.ts";

type Env = Record<string, string | undefined>;

export const INGEST_TOKEN_ENV = "RENAISSANCE_INGEST_TOKEN";
export const CHECKIN_ALLOW = ["POST"] as const;

export type RenaissanceDeps = { env?: Env; getUser?: SessionLookup; getDb?: (env: Env) => Promise<Queryable | null> };

/** True only for `Bearer <token>` with a non-empty token; constant time once the lengths match. */
export function ingestAuthorized(header: string | null, token: string | undefined): boolean {
  if (!token || !header) return false;
  const got = Buffer.from(header, "utf8");
  const want = Buffer.from(`Bearer ${token}`, "utf8");
  if (got.length !== want.length) return false;
  return timingSafeEqual(got, want);
}

export async function upsertCheckin(db: Queryable, c: Checkin): Promise<number> {
  const picks = JSON.stringify(c.picks);
  for (const e of c.entries) {
    await db.query(
      `INSERT INTO rm_entries (entry_date, item, pillar, target, actual, hit, note, picks)
       VALUES ($1::date, $2, $3, $4, $5, $6, $7, $8::jsonb)
       ON CONFLICT (entry_date, item) DO UPDATE SET pillar = EXCLUDED.pillar, target = EXCLUDED.target,
         actual = EXCLUDED.actual, hit = EXCLUDED.hit, note = EXCLUDED.note, picks = EXCLUDED.picks, updated_at = now()`,
      [c.date, e.item, e.pillar, e.target, e.actual, e.hit, e.note, picks],
    );
  }
  // The day's picks live on every row of that day; keep the day's other items in step.
  await db.query("UPDATE rm_entries SET picks = $2::jsonb WHERE entry_date = $1::date AND picks <> $2::jsonb", [c.date, picks]);
  return c.entries.length;
}

type Row = { date: string; pillar: Pillar; item: string; target: number | null; actual: number | null; hit: boolean | null; note: string | null; picks: unknown };

export async function readEntries(db: Queryable): Promise<Entry[]> {
  const rows = await db.query<Row>(
    `SELECT to_char(entry_date, 'YYYY-MM-DD') AS date, pillar, item, target, actual, hit, note, picks
     FROM rm_entries ORDER BY entry_date, item`,
  );
  return rows.map((r) => ({
    date: r.date,
    pillar: r.pillar,
    item: r.item,
    target: r.target === null ? null : Number(r.target),
    actual: r.actual === null ? null : Number(r.actual),
    hit: r.hit,
    note: r.note,
    picks: Array.isArray(r.picks) ? r.picks.filter((p): p is string => typeof p === "string") : typeof r.picks === "string" ? (JSON.parse(r.picks) as string[]) : [],
  }));
}

export async function handleCheckinRequest(request: Request, deps: RenaissanceDeps = {}): Promise<Response> {
  const env = deps.env ?? process.env;
  const blocked = guardDashboardApi(env);
  if (blocked) return blocked;
  if (request.method.toUpperCase() !== "POST") return dashboardMethodNotAllowedResponse(CHECKIN_ALLOW);
  const header = request.headers.get("authorization");
  const bearer = header !== null && /^bearer\s/i.test(header);
  let db: Queryable | null = null;
  if (bearer) {
    if (!ingestAuthorized(header, env[INGEST_TOKEN_ENV])) return unauthorizedResponse();
  } else {
    const viewer = await (deps.getUser ?? sessionFromRequestHeaders)(request.headers);
    if (!viewer) return unauthorizedResponse();
    db = await (deps.getDb ?? defaultGetDb)(env);
    if (!db) return storageUnavailable();
    const ownerId = await ownerIdOf(db, env);
    if (!ownerId || ownerId !== viewer.id) return forbiddenResponse();
  }
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return badRequest("Body must be JSON.");
  }
  const parsed = parseCheckin(raw);
  if (!parsed.ok) return badRequest(parsed.error);
  db ??= await (deps.getDb ?? defaultGetDb)(env);
  if (!db) return storageUnavailable();
  const upserted = await upsertCheckin(db, parsed.value);
  return dashboardJson({ ok: true, date: parsed.value.date, upserted });
}

export type RenaissanceLoad =
  | { status: "not_found" }
  | { status: "not_configured" }
  | { status: "ok"; entries: Entry[] };

/** The page's read: the owner only (anyone else, or no owner, is `not_found` → a 404 page). */
export async function loadRenaissance(headers: Headers, deps: RenaissanceDeps = {}): Promise<RenaissanceLoad> {
  const env = deps.env ?? process.env;
  if (guardDashboardApi(env)) return { status: "not_found" };
  const viewer = await (deps.getUser ?? sessionFromRequestHeaders)(headers);
  if (!viewer) return { status: "not_found" };
  const db = await (deps.getDb ?? defaultGetDb)(env);
  if (!db) return { status: "not_found" };
  const ownerId = await ownerIdOf(db, env);
  if (!ownerId || ownerId !== viewer.id) return { status: "not_found" };
  try {
    return { status: "ok", entries: await readEntries(db) };
  } catch {
    // The table isn't there yet (migration not applied): say so, never a 500.
    return { status: "not_configured" };
  }
}

