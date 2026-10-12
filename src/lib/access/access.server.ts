/**
 * #90 access layer (server-only; attachments/roles-and-account-design.md sections 3–7). The single chokepoint
 * for every Personal Finance / Dashboard page gate and API: `accessOf` reads the owner, the person's grants and the
 * forced-password-change flag from the database on every request (never cached in the session cookie), so a grant
 * change applies on the next request (ROLE-16).
 *
 * Accounts the owner creates, password and email changes go through SQL plus Better Auth's own password hashing
 * (`better-auth/crypto`), so the public `/sign-up/email` path keeps its allow-list and nothing else creates users.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import type { Queryable } from "../dashboard/store.server.ts";
import {
  canRead,
  canWrite,
  type Grants,
  type Level,
  levelOf,
  NO_GRANTS,
  ownerEmailFromEnv,
  SURFACES,
  type Surface,
} from "./access.ts";

type Env = Record<string, string | undefined>;
export type Viewer = { id: string; email: string | null; sessionId?: string | null };

export type AccountAccess = {
  viewerId: string;
  /** The owner's user id, or null when ORPHEUS_OWNER_EMAIL is unset / names no account (then nobody has access). */
  ownerId: string | null;
  owner: boolean;
  /** Q-D5: a temporary password must be replaced before any Personal Finance / Dashboard content. */
  mustChange: boolean;
  grants: Grants;
};

export type SurfaceAccess = { read: boolean; write: boolean; owner: boolean; dataUserId: string | null };

export async function ownerIdOf(db: Queryable, env: Env): Promise<string | null> {
  const email = ownerEmailFromEnv(env);
  if (!email) return null;
  const rows = await db.query<{ id: string }>('SELECT id FROM "user" WHERE lower(email) = $1', [email]);
  return rows[0]?.id ?? null;
}

async function grantsOf(db: Queryable, userId: string): Promise<Grants> {
  const rows = await db.query<{ surface: Surface; can_read: boolean; can_write: boolean }>(
    "SELECT surface, can_read, can_write FROM access_grant WHERE user_id = $1",
    [userId],
  );
  const grants: Grants = { ...NO_GRANTS };
  for (const r of rows) if ((SURFACES as readonly string[]).includes(r.surface)) grants[r.surface] = levelOf(r);
  return grants;
}

export async function mustChangePassword(db: Queryable, userId: string): Promise<boolean> {
  const rows = await db.query<{ must_change_password: boolean }>(
    "SELECT must_change_password FROM account_state WHERE user_id = $1",
    [userId],
  );
  return Boolean(rows[0]?.must_change_password);
}

export async function accessOf(db: Queryable, viewer: Viewer, env: Env): Promise<AccountAccess> {
  const ownerId = await ownerIdOf(db, env);
  const owner = ownerId !== null && ownerId === viewer.id;
  const mustChange = await mustChangePassword(db, viewer.id);
  const grants: Grants = owner
    ? { personal_finance: "read_write", dashboard: "read_write" }
    : ownerId
      ? await grantsOf(db, viewer.id)
      : { ...NO_GRANTS };
  return { viewerId: viewer.id, ownerId, owner, mustChange, grants };
}

/** What a person may do on one surface; the data is always the owner's (Q-D1). */
export function surfaceAccess(acc: AccountAccess, surface: Surface): SurfaceAccess {
  const level: Level = acc.mustChange || !acc.ownerId ? "none" : acc.grants[surface];
  return { read: canRead(level), write: canWrite(level), owner: acc.owner, dataUserId: acc.ownerId };
}

// ---- People (owner's grant UI and "Who has access") ----

export type Person = { id: string; name: string; email: string; owner: boolean; grants: Grants };

/**
 * ROLE-19 / Q-D14. The owner sees every account (the owner first). Anyone else sees the owner and the people holding
 * a grant on a surface they hold themselves, with levels on those surfaces only. Current state only (no history: #91).
 */
export async function peopleFor(db: Queryable, acc: AccountAccess): Promise<Person[]> {
  if (!acc.ownerId) return [];
  const users = await db.query<{ id: string; name: string; email: string }>(
    'SELECT id, name, email FROM "user" ORDER BY "createdAt", email',
  );
  const grantRows = await db.query<{ user_id: string; surface: Surface; can_read: boolean; can_write: boolean }>(
    "SELECT user_id, surface, can_read, can_write FROM access_grant",
  );
  const grants = new Map<string, Grants>();
  for (const r of grantRows) {
    const g = grants.get(r.user_id) ?? { ...NO_GRANTS };
    g[r.surface] = levelOf(r);
    grants.set(r.user_id, g);
  }
  const all: Person[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    owner: u.id === acc.ownerId,
    grants: u.id === acc.ownerId ? { personal_finance: "read_write", dashboard: "read_write" } : grants.get(u.id) ?? { ...NO_GRANTS },
  }));
  const ownerFirst = [...all.filter((p) => p.owner), ...all.filter((p) => !p.owner)];
  if (acc.owner) return ownerFirst;
  const mine = SURFACES.filter((s) => acc.grants[s] !== "none");
  return ownerFirst
    .filter((p) => p.owner || mine.some((s) => p.grants[s] !== "none"))
    .map((p) => ({
      ...p,
      grants: Object.fromEntries(SURFACES.map((s) => [s, mine.includes(s) ? p.grants[s] : "none"])) as Grants,
    }));
}

export async function setGrants(db: Queryable, ownerId: string, userId: string, grants: Partial<Grants>) {
  for (const surface of SURFACES) {
    const level = grants[surface];
    if (level === undefined) continue;
    if (level === "none") {
      await db.query("DELETE FROM access_grant WHERE user_id = $1 AND surface = $2", [userId, surface]);
    } else {
      await db.query(
        `INSERT INTO access_grant (user_id, surface, can_read, can_write, granted_by)
         VALUES ($1, $2, true, $3, $4)
         ON CONFLICT (user_id, surface) DO UPDATE SET can_read = true, can_write = EXCLUDED.can_write,
           granted_by = EXCLUDED.granted_by, updated_at = now()`,
        [userId, surface, level === "read_write", ownerId],
      );
    }
  }
}

export async function userById(db: Queryable, id: string) {
  const rows = await db.query<{ id: string; name: string; email: string }>(
    'SELECT id, name, email FROM "user" WHERE id = $1',
    [id],
  );
  return rows[0] ?? null;
}

export async function userByEmail(db: Queryable, email: string) {
  const rows = await db.query<{ id: string; name: string; email: string }>(
    'SELECT id, name, email FROM "user" WHERE lower(email) = $1',
    [email.toLowerCase()],
  );
  return rows[0] ?? null;
}

/** Signs a person out everywhere (or everywhere but `keepSessionId`). */
export async function revokeSessions(db: Queryable, userId: string, keepSessionId?: string | null) {
  if (keepSessionId)
    await db.query('DELETE FROM "session" WHERE "userId" = $1 AND id <> $2', [userId, keepSessionId]);
  else await db.query('DELETE FROM "session" WHERE "userId" = $1', [userId]);
}

/** Q-D7: Remove = both grants cleared and every session revoked; the account stays. */
export async function removeAccess(db: Queryable, userId: string) {
  await db.query("DELETE FROM access_grant WHERE user_id = $1", [userId]);
  await revokeSessions(db, userId);
}

/** A temporary password: 18 characters from a CSPRNG, no look-alikes (Q-D4). Never logged or stored in plain text. */
export function temporaryPassword(length = 18): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(length * 2);
  let out = "";
  for (let i = 0; i < bytes.length && out.length < length; i++) {
    // Rejection sampling keeps every character equally likely.
    if (bytes[i] < 256 - (256 % alphabet.length)) out += alphabet[bytes[i] % alphabet.length];
  }
  return out.length === length ? out : temporaryPassword(length);
}

async function setMustChange(db: Queryable, userId: string, value: boolean, createdBy?: string) {
  await db.query(
    `INSERT INTO account_state (user_id, must_change_password, created_by) VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET must_change_password = EXCLUDED.must_change_password, updated_at = now()`,
    [userId, value, createdBy ?? null],
  );
}

/**
 * ROLE-07: the owner creates an account with a temporary password (shown once; the caller returns it with
 * `no-store` and never logs it), or, for an email that already has an account, sets grants only.
 */
export async function createPerson(
  db: Queryable,
  ownerId: string,
  input: { name: string; email: string; grants: Grants },
): Promise<{ userId: string; created: boolean; temporaryPassword: string | null }> {
  const existing = await userByEmail(db, input.email);
  if (existing) {
    if (existing.id !== ownerId) await setGrants(db, ownerId, existing.id, input.grants);
    return { userId: existing.id, created: false, temporaryPassword: null };
  }
  const id = randomUUID().replace(/-/g, "");
  const password = temporaryPassword();
  const hash = await hashPassword(password);
  await db.query(
    `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, false, now(), now())`,
    [id, input.name, input.email],
  );
  await db.query(
    `INSERT INTO "account" (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
     VALUES ($1, $2, 'credential', $2, $3, now(), now())`,
    [randomUUID().replace(/-/g, ""), id, hash],
  );
  await setMustChange(db, id, true, ownerId);
  await setGrants(db, ownerId, id, input.grants);
  return { userId: id, created: true, temporaryPassword: password };
}

/** ROLE-18: a new temporary password, every session revoked, the forced change set. */
export async function resetPassword(db: Queryable, ownerId: string, userId: string): Promise<string> {
  const password = temporaryPassword();
  await db.query(
    `UPDATE "account" SET password = $1, "updatedAt" = now() WHERE "userId" = $2 AND "providerId" = 'credential'`,
    [await hashPassword(password), userId],
  );
  await setMustChange(db, userId, true, ownerId);
  await revokeSessions(db, userId);
  return password;
}

export async function checkPassword(db: Queryable, userId: string, password: string): Promise<boolean> {
  const rows = await db.query<{ password: string | null }>(
    `SELECT password FROM "account" WHERE "userId" = $1 AND "providerId" = 'credential'`,
    [userId],
  );
  const hash = rows[0]?.password;
  if (!hash || !password) return false;
  try {
    return await verifyPassword({ hash, password });
  } catch {
    return false;
  }
}

/** ROLE-05: the person's own new password; other sessions signed out; the forced change cleared. */
export async function changePassword(db: Queryable, viewer: Viewer, newPassword: string) {
  await db.query(
    `UPDATE "account" SET password = $1, "updatedAt" = now() WHERE "userId" = $2 AND "providerId" = 'credential'`,
    [await hashPassword(newPassword), viewer.id],
  );
  await db.query(
    "UPDATE account_state SET must_change_password = false, updated_at = now() WHERE user_id = $1",
    [viewer.id],
  );
  await revokeSessions(db, viewer.id, viewer.sessionId);
}

/** ROLE-06: the person's own new email; other sessions signed out. */
export async function changeEmail(db: Queryable, viewer: Viewer, newEmail: string) {
  await db.query('UPDATE "user" SET email = $1, "updatedAt" = now() WHERE id = $2', [newEmail, viewer.id]);
  await revokeSessions(db, viewer.id, viewer.sessionId);
}

// ---- Q-D11: a non-owner's own Personal Finance section toggles ----

export async function readOwnView(db: Queryable, userId: string): Promise<string | null> {
  const rows = await db.query<{ pf_view: string | null }>("SELECT pf_view FROM account_state WHERE user_id = $1", [
    userId,
  ]);
  return rows[0]?.pf_view ?? null;
}

export async function writeOwnView(db: Queryable, userId: string, view: string | null) {
  await db.query(
    `INSERT INTO account_state (user_id, pf_view) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET pf_view = EXCLUDED.pf_view, updated_at = now()`,
    [userId, view],
  );
}
