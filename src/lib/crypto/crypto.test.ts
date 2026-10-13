// #93 encryption at rest (attachments/encryption-at-rest-design.md): ENC-01, ENC-02, ENC-03, ENC-04, ENC-05, ENC-06,
// ENC-07 offline, on PGLite with Better Auth and the real handlers. Test-only keys are generated per run.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pendingMigrations } from "../../../scripts/migration-plan.mjs";
import {
  DecryptError,
  keyringFromEnv,
  lookupCandidates,
  openValue,
  SEALED_COLUMNS,
  sealValue,
  type Keyring,
} from "../../../scripts/data-crypto.mjs";
import { encryptionStatus, migrateColumns } from "../../../scripts/data-migrate.mjs";
import { parseAllowList } from "../auth/config.ts";
import { createOrpheusAuth } from "../auth/instance.server.ts";
import { pgliteDialect } from "../auth/pglite-dialect.ts";
import type { DashboardApiDeps } from "../dashboard/session.server.ts";
import type { Queryable } from "../dashboard/store.server.ts";
import { handlePersonalFinanceRequest } from "../finance/account.server.ts";
import { STORAGE_KEY } from "../finance/expenses.ts";
import { handleAccountEncryptionRequest } from "../access/account-api.server.ts";
import { appKeyring, encryptionReadiness } from "./keys.server.ts";
import { sealedAuthDatabase } from "./kysely-plugin.ts";

const key = (kid: string) => `${kid}:${randomBytes(32).toString("base64")}`;
const K1 = key("k1");
const K2 = key("k2");
const ring = (env: Record<string, string>): Keyring => {
  const r = keyringFromEnv(env);
  if (!r.ok) throw new Error(r.reason);
  return r.keyring;
};

describe("envelope (ENC-01, ENC-02)", () => {
  const r1 = ring({ ORPHEUS_ENCRYPTION_KEY: K1 });
  it("round trip on every sealed column; deterministic vs randomized", () => {
    for (const [table, cols] of Object.entries(SEALED_COLUMNS))
      for (const [column, spec] of Object.entries(cols)) {
        const plain = "Value é ✓ 123";
        const a = sealValue(r1, table, column, plain) as string;
        const b = sealValue(r1, table, column, plain) as string;
        assert.match(a, /^enc:v1:k1:[A-Za-z0-9_-]+$/);
        assert.ok(!a.includes(plain));
        assert.equal(openValue(r1, table, column, a), spec.lower ? plain.toLowerCase() : plain);
        if (spec.det) assert.equal(a, b, `${table}.${column} deterministic`);
        else assert.notEqual(a, b, `${table}.${column} randomized`);
      }
    assert.equal(sealValue(r1, "user", "name", null), null);
    assert.equal(sealValue(r1, "user", "id", "abc"), "abc", "non-sensitive column untouched");
    assert.equal(openValue(r1, "user", "name", "legacy"), "legacy", "legacy plaintext reads as is");
  });
  it("another column, tampering or an unknown kid fail closed", () => {
    const v = sealValue(r1, "user", "name", "Diego") as string;
    assert.throws(() => openValue(r1, "user", "image", v), DecryptError);
    const t = v.slice(0, -2) + (v.endsWith("A") ? "B" : "A") + v.slice(-1);
    assert.throws(() => openValue(r1, "user", "name", t), DecryptError);
    const r2 = ring({ ORPHEUS_ENCRYPTION_KEY: K2 });
    assert.throws(() => openValue(r2, "user", "name", v), /key k1 not configured/);
    assert.throws(() => openValue(r1, "user", "name", "enc:v1:k1:AAAA"), DecryptError);
  });
  it("key formats: names only in reasons", () => {
    assert.deepEqual(keyringFromEnv({}), { ok: false, reason: "ORPHEUS_ENCRYPTION_KEY not set" });
    for (const bad of ["k1", "K1:" + K1.slice(3), "k1:" + randomBytes(16).toString("base64"), "toolongkid:" + K1.slice(3)])
      assert.deepEqual(keyringFromEnv({ ORPHEUS_ENCRYPTION_KEY: bad }), { ok: false, reason: "ORPHEUS_ENCRYPTION_KEY malformed" });
    const r = keyringFromEnv({ ORPHEUS_ENCRYPTION_KEY: K2, ORPHEUS_ENCRYPTION_KEYS_OLD: ` ${K1} ,` });
    assert.ok(r.ok && r.keyring.current.kid === "k2" && r.keyring.all.has("k1"));
    assert.equal(lookupCandidates(r.ok ? r.keyring : r1, "user", "email", "A@B.co").length, 4, "k2, k1, lower, as typed");
  });
});

const ORIGIN = "http://localhost:3000";
const SECRET = "test-only-secret-0123456789abcdef0123456789";
const OWNER = "owner@example.com";
const PW = "owner-test-pass-1";
let pg: PGlite;
let db: Queryable;
let env: Record<string, string | undefined> = {};
let lastViewer: { id: string; email: string; sessionId: string } | null = null;
/** The app reads keys from process.env (src/lib/crypto/sealed.server.ts); handlers get the same values. */
function setEnv(next: Record<string, string>) {
  env = next;
  for (const k of ["ORPHEUS_ENCRYPTION_KEY", "ORPHEUS_ENCRYPTION_KEYS_OLD", "VERCEL"]) {
    if (next[k] === undefined) delete process.env[k];
    else process.env[k] = next[k];
  }
}
const auth = () =>
  createOrpheusAuth({
    database: sealedAuthDatabase(pgliteDialect(() => pg), () => appKeyring(env)),
    secret: SECRET,
    baseURL: ORIGIN,
    trustedOrigins: [ORIGIN],
    allowList: parseAllowList(OWNER),
  });
const post = (a: ReturnType<typeof auth>, path: string, body: unknown) =>
  a.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify(body),
    }),
  );
const cookieOf = (r: Response) =>
  r.headers.getSetCookie().map((c) => c.split(";")[0]).filter((c) => !c.endsWith("=")).join("; ");
const deps = (a: ReturnType<typeof auth>): DashboardApiDeps => ({
  env: { DASHBOARD_ENABLED: "true", ORPHEUS_OWNER_EMAIL: OWNER, ...env },
  getUser: async (headers) => {
    // Without a key Better Auth cannot read the session table; the gate is then checked with the last viewer.
    if (!env.ORPHEUS_ENCRYPTION_KEY) return lastViewer;
    const s = await a.api.getSession({ headers, query: { disableCookieCache: true } });
    if (s?.user) lastViewer = { id: s.user.id, email: s.user.email, sessionId: s.session.id };
    return s?.user ? { id: s.user.id, email: s.user.email, sessionId: s.session.id } : null;
  },
  getDb: async () => db,
});
const call = (h: typeof handlePersonalFinanceRequest, a: ReturnType<typeof auth>, path: string, cookie: string, method = "GET", body?: unknown) =>
  h(
    new Request(`${ORIGIN}${path}`, {
      method,
      headers: { cookie, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }),
    deps(a),
  );

/** Every stored value of the sealed columns, as text. */
async function dump(): Promise<string> {
  const rows = [
    ...(await pg.query('SELECT * FROM "user"')).rows,
    ...(await pg.query('SELECT * FROM "session"')).rows,
    ...(await pg.query('SELECT * FROM "account"')).rows,
    ...(await pg.query("SELECT data FROM personal_finance")).rows,
  ];
  return JSON.stringify(rows);
}

describe("in the app (ENC-03..ENC-07)", () => {
  const RECORD = { [STORAGE_KEY]: '{"fixed":[],"variable":[],"accounts":[]}' };
  let cookie = "";
  before(async () => {
    pg = new PGlite({ parsers: { 20: Number, 1082: (v: string) => v } });
    await pg.waitReady;
    for (const { name } of pendingMigrations(readdirSync("migrations"), [])) await pg.exec(readFileSync(`migrations/${name}`, "utf8"));
    db = { query: async (text, params) => (await pg.query(text, params)).rows as never[] };
    setEnv({ ORPHEUS_ENCRYPTION_KEY: K1 });
  });
  after(async () => {
    setEnv({});
    await pg.close();
  });

  it("ENC-03: sign-up / sign-in / session through Better Auth; rows hold ciphertext only", async () => {
    const a = auth();
    const up = await post(a, "/sign-up/email", { email: "Owner@Example.com", password: PW, name: "Diego Owner" });
    assert.equal(up.status, 200);
    const r = await post(a, "/sign-in/email", { email: OWNER, password: PW });
    assert.equal(r.status, 200);
    cookie = cookieOf(r);
    const s = await a.api.getSession({ headers: new Headers({ cookie }), query: { disableCookieCache: true } });
    assert.equal(s?.user.email, OWNER);
    assert.equal(s?.user.name, "Diego Owner");
    const text = await dump();
    assert.doesNotMatch(text, /example\.com|Diego|scrypt|\$/i);
    const token = decodeURIComponent(cookie.split("session_token=")[1] ?? "").split(".")[0];
    assert.ok(token.length > 10 && !text.includes(token), "the session token is not stored in clear");
    const sess = (await pg.query<{ token: string }>('SELECT token FROM "session" LIMIT 1')).rows[0];
    assert.match(sess.token, /^enc:v1:k1:/);
  });

  it("ENC-04: the Personal Finance record is sealed in personal_finance.data and reads back identical", async () => {
    const a = auth();
    const put = await call(handlePersonalFinanceRequest, a, "/api/personal-finance", cookie, "PUT", { data: RECORD });
    assert.equal(put.status, 200);
    const raw = (await pg.query<{ t: string }>("SELECT data #>> '{}' AS t FROM personal_finance")).rows[0].t;
    assert.match(raw, /^enc:v1:k1:/);
    assert.doesNotMatch(raw, /fixed|variable|accounts/);
    const got = (await (await call(handlePersonalFinanceRequest, a, "/api/personal-finance", cookie)).json()) as { data: unknown };
    assert.deepEqual(got.data, RECORD);
  });

  it("ENC-05: no key (or a bad one) where a database is set: readiness off, APIs 503, nothing written", async () => {
    assert.deepEqual(encryptionReadiness({ VERCEL: "1" }), { ready: false, reason: "ORPHEUS_ENCRYPTION_KEY not set" });
    assert.deepEqual(encryptionReadiness({ DATABASE_URL: "postgres://x" }), { ready: false, reason: "ORPHEUS_ENCRYPTION_KEY not set" });
    assert.deepEqual(encryptionReadiness({ VERCEL: "1", ORPHEUS_ENCRYPTION_KEY: "k1:nope" }), {
      ready: false,
      reason: "ORPHEUS_ENCRYPTION_KEY malformed",
    });
    assert.equal(encryptionReadiness({}).ready, true, "local in-memory runs use a random key");
    const a = auth();
    const before = await dump();
    setEnv({ VERCEL: "1" });
    const pf = await call(handlePersonalFinanceRequest, a, "/api/personal-finance", cookie, "PUT", { data: { x: "plain" } });
    assert.equal(pf.status, 503);
    assert.deepEqual(await pf.json(), { error: "encryption_unavailable" });
    const enc = await call(handleAccountEncryptionRequest, a, "/api/account/encryption", cookie);
    assert.equal(enc.status, 503);
    const signIn = await post(a, "/sign-in/email", { email: OWNER, password: PW });
    assert.notEqual(signIn.status, 200, "Better Auth cannot read or write sealed columns without a key");
    setEnv({ ORPHEUS_ENCRYPTION_KEY: K1 });
    assert.equal(await dump(), before, "nothing changed, nothing in plaintext");
  });

  it("ENC-07: migration: encrypt legacy plaintext, idempotent, decrypt restores exactly", async () => {
    const r1 = ring({ ORPHEUS_ENCRYPTION_KEY: K1 });
    await pg.query(`INSERT INTO "user" (id, name, email, "emailVerified", "updatedAt") VALUES ('legacy', 'Legacy Name', 'legacy@example.org', false, now())`);
    await pg.query(`INSERT INTO "session" (id, "expiresAt", token, "updatedAt", "userId", "userAgent") VALUES ('ls', now() + interval '1 day', 'legacytoken123', now(), 'legacy', 'UA/1')`);
    await pg.query(`INSERT INTO personal_finance (user_id, data) VALUES ('legacy', '{"a":"Legacy 42"}'::jsonb)`);
    const s0 = await encryptionStatus(db, r1);
    assert.equal(s0.plaintext, 5, "name, email, token, userAgent, data");
    const plainBefore = JSON.stringify(
      (await pg.query<Record<string, unknown>>(`SELECT id, name, email FROM "user" ORDER BY id`)).rows.map((u) => ({
        ...u,
        name: openValue(r1, "user", "name", u.name),
        email: openValue(r1, "user", "email", u.email),
      })),
    );
    const dry = await migrateColumns(db, r1, "encrypt", { dryRun: true });
    assert.equal(dry.changed, 5);
    assert.equal((await encryptionStatus(db, r1)).plaintext, 5, "dry run writes nothing");
    const run = await migrateColumns(db, r1, "encrypt");
    assert.equal(run.changed, 5);
    assert.equal((await encryptionStatus(db, r1)).plaintext, 0);
    assert.equal((await migrateColumns(db, r1, "encrypt")).changed, 0, "idempotent");
    assert.doesNotMatch(await dump(), /Legacy|legacy@|legacytoken|UA\/1/);
    const after = JSON.stringify(
      (await pg.query<Record<string, unknown>>(`SELECT id, name, email FROM "user" ORDER BY id`)).rows.map((u) => ({
        ...u,
        name: openValue(r1, "user", "name", u.name),
        email: openValue(r1, "user", "email", u.email),
      })),
    );
    assert.equal(after, plainBefore, "no data loss");
    // Decrypt back: the reversible path.
    const dec = await migrateColumns(db, r1, "decrypt");
    assert.ok(dec.changed >= 5);
    const back = (await pg.query<{ name: string; email: string }>(`SELECT name, email FROM "user" WHERE id = 'legacy'`)).rows[0];
    assert.deepEqual(back, { name: "Legacy Name", email: "legacy@example.org" });
    assert.deepEqual((await pg.query<{ data: unknown }>(`SELECT data FROM personal_finance WHERE user_id = 'legacy'`)).rows[0].data, { a: "Legacy 42" });
    assert.equal((await pg.query<{ token: string }>(`SELECT token FROM "session" WHERE id = 'ls'`)).rows[0].token, "legacytoken123");
    await migrateColumns(db, r1, "encrypt");
    assert.equal((await encryptionStatus(db, r1)).plaintext, 0);
  });

  it("ENC-06: rotation k1 → k2: k1 rows still work, reencrypt moves all, k1 removed still works", async () => {
    setEnv({ ORPHEUS_ENCRYPTION_KEY: K2, ORPHEUS_ENCRYPTION_KEYS_OLD: K1 });
    let a = auth();
    const r = await post(a, "/sign-in/email", { email: OWNER, password: PW });
    assert.equal(r.status, 200, "k1 email + password hash still sign in");
    cookie = cookieOf(r);
    const got = (await (await call(handlePersonalFinanceRequest, a, "/api/personal-finance", cookie)).json()) as { data: unknown };
    assert.deepEqual(got.data, RECORD, "k1 record still reads");
    const st = await call(handleAccountEncryptionRequest, a, "/api/account/encryption", cookie);
    assert.equal(st.status, 200);
    const status = (await st.json()) as { kid: string; oldKids: string[]; columns: { old: number }[] };
    assert.equal(status.kid, "k2");
    assert.deepEqual(status.oldKids, ["k1"]);
    assert.ok(status.columns.some((c) => c.old > 0));
    const re = await call(handleAccountEncryptionRequest, a, "/api/account/encryption", cookie, "POST", { action: "reencrypt" });
    assert.equal(re.status, 200);
    const after = (await re.json()) as { status: { columns: { old: number; plaintext: number }[] } };
    assert.ok(after.status.columns.every((c) => c.old === 0 && c.plaintext === 0));
    assert.doesNotMatch(await dump(), /enc:v1:k1:/);
    setEnv({ ORPHEUS_ENCRYPTION_KEY: K2 });
    a = auth();
    const r2 = await post(a, "/sign-in/email", { email: OWNER, password: PW });
    assert.equal(r2.status, 200, "k1 retired: still signs in");
    const got2 = (await (await call(handlePersonalFinanceRequest, a, "/api/personal-finance", cookieOf(r2))).json()) as { data: unknown };
    assert.deepEqual(got2.data, RECORD);
  });
});
