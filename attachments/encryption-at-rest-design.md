# Sign-in and call data encrypted at rest (#93)

Status: DESIGN + BUILD (EL kickoff 2026-10-12 21:59 ET). Brief (#93, Diego via CoS 2026-10-11): "Sign-in and calls
encrypted at rest. A later security pass." Design the threat model and what is encrypted before code; secrets stay
out of git and out of client storage. Out of scope: Roles / Account (#90), the audit log (#91), shared page parts
(#92), Personal Finance Overview / Update (#95), new auth providers. Open questions with recommendations: section 10.

## 1. Threat model

| Threat | Covered? | How |
|--------|----------|-----|
| A copy of the database leaks (Neon backup, branch, dump, a read-only SQL credential, a log of rows) | **Yes** | Sensitive columns hold AES-256-GCM ciphertext; the key is never in the database. |
| Someone reads a stolen session token from the `session` table and replays it | **Yes** | `session.token` is ciphertext; the cookie value cannot be read back without the key. |
| A leaked dump shows who the users are (emails, names, IPs, user agents) or the Personal Finance record | **Yes** | All encrypted (section 3). |
| The app server itself is compromised (it holds the key) | No | Out of scope: whoever runs the code can decrypt. |
| The key leaks with the dump | No | Keys live only in Vercel env (section 4), never next to the data. |
| Equality of two encrypted emails / tokens is visible (deterministic columns, section 2) | Accepted | Needed for lookups; the values stay unreadable (Q-E2). |

Not changed: transport (HTTPS), cookies (`__Host-`, Secure, signed), Better Auth's password hashing (scrypt), the
audit log (already masked, #91).

## 2. Envelope

`enc:v1:<kid>:<base64url(iv ‖ ciphertext ‖ tag)>`, AES-256-GCM, 12-byte IV, 16-byte tag. The additional data
(AAD) is the column's context `table.column`, so a value moved to another column does not decrypt.

- **Randomized** (default): a fresh random IV per write.
- **Deterministic** (only where the app looks a value up by equality): IV = first 12 bytes of
  HMAC-SHA256(macKey, context ‖ 0x00 ‖ plaintext). Same plaintext + same key + same column → same ciphertext, so
  `WHERE email = $1` and the UNIQUE constraints keep working without a schema change. This is the "blind index"
  done in place: no extra column, no edit to the generated `0001_auth.sql`.
- Keys: from the 32-byte master key, HKDF-SHA256 derives `encKey` (info `orpheus-enc-v1`) and `macKey`
  (info `orpheus-siv-v1`).
- A value without the `enc:v1:` prefix is legacy plaintext (written before the migration, section 6): it is read as
  is and counted by the status check; every **write** is encrypted (no plaintext writes, ever).

## 3. What is encrypted

| Table.column | Mode | Why / lookup |
|--------------|------|--------------|
| `user.email` | deterministic (lower-cased first) | Better Auth finds users by email (`= lower(email)`); UNIQUE kept |
| `user.name` | randomized | personal data, never looked up |
| `user.image` | randomized | personal data (unused today) |
| `session.token` | deterministic | Better Auth finds the session by token (`=`, `in`); UNIQUE kept |
| `session.ipAddress` | randomized | personal data |
| `session.userAgent` | randomized | personal data |
| `account.password` | randomized | the scrypt hash, wrapped once more (a dump gives nothing to crack) |
| `account.accessToken`, `account.refreshToken`, `account.idToken` | randomized | provider tokens (none today; covered for later) |
| `verification.identifier` | deterministic | Better Auth looks it up by equality |
| `verification.value` | randomized | one-time secrets |
| `personal_finance.data` | randomized | **the call data**: the Personal Finance record each `/api/personal-finance` call saves (amounts, names, months). Stored as a JSON string scalar `"enc:v1:…"` in the same JSONB column (no schema change). |

Left in clear (ids, flags, times, foreign keys): every `id` / `userId` / `user_id`, `account.accountId` and
`providerId`, `emailVerified`, `expiresAt`, `createdAt`, `updatedAt`, `scope`, `access_grant`, `account_state`
(flags and the person's section toggles), `audit_event` (already masked), market data. Holdings (Dashboard) are
Q-E3.

Better Auth needs equality lookups only on `email`, `token` and `identifier`; they are deterministic. It never
filters or sorts on a randomized column; a query that tries is refused with an error (fail closed), not run.
`ORDER BY email` in the owner's people list moves to the server after decryption.

## 4. Key source (env only)

| Variable | Format | Use |
|----------|--------|-----|
| `ORPHEUS_ENCRYPTION_KEY` | `<kid>:<base64 of 32 random bytes>`; kid = 1–8 of `[a-z0-9]`, e.g. `k1:…` (44 base64 chars) | The current key: encrypts every write; decrypts its own values. |
| `ORPHEUS_ENCRYPTION_KEYS_OLD` | optional, comma-separated `<kid>:<base64>` | Decrypt and look up only (rotation, section 5). Never encrypts. |

Generate: `node -e "console.log('k1:'+require('crypto').randomBytes(32).toString('base64'))"`. Set by EL in Vercel
(Preview; Production only on a separate go). Never in git, PR, logs, reports or client code (server-only module;
the status check names variables and key ids, never values).

Local runs with **no database URL** (embedded PGLite, in-memory) use a random per-process key, like
`BETTER_AUTH_SECRET`; anything with a database URL needs the variable.

## 5. Rotation

1. Generate `k2`. Set `ORPHEUS_ENCRYPTION_KEY=k2:…` and `ORPHEUS_ENCRYPTION_KEYS_OLD=k1:…`; redeploy. New writes
   use k2; k1 values still read; lookups try k2, every old key and the legacy plaintext (`= ANY(candidates)`).
2. Re-encrypt: owner `POST /api/account/encryption {"action":"reencrypt"}` or
   `node scripts/data-encryption.mjs reencrypt`. Rewrites every value not under the current kid.
3. Status shows 0 values on k1 → remove `ORPHEUS_ENCRYPTION_KEYS_OLD`; redeploy. k1 is retired.

A value whose kid is not configured fails to decrypt with a clear error (fail closed).

## 6. Migration of existing rows

One code path, two entry points: `scripts/data-encryption.mjs <status|encrypt|reencrypt|decrypt> [--dry-run]`
(needs a database URL and the key in env) and the owner-only `/api/account/encryption` (GET status, POST
`encrypt` / `reencrypt`; no decrypt over the web).

- **Safe / no data loss:** per row, the new value is decrypted again and compared with the original before it is
  written; the UPDATE is conditional (`WHERE id = $1 AND col IS NOT DISTINCT FROM $old`), so a row changed meanwhile
  is skipped and picked up by the next run. One transaction per table.
- **Idempotent:** values already under the current kid are skipped; a second run changes 0 rows.
- **Reversible:** `decrypt` (CLI only, needs `--confirm-plaintext`) writes plaintext back with the same checks;
  the app reads plaintext as legacy, so rolling the code back after `decrypt` is clean.
- **Order:** deploy the code with the key → run `status` → `encrypt` → `status` (0 plaintext) on the Preview
  database first (Q-E4), then Production on a separate go.
- No schema migration: the columns stay `text` / `jsonb`.

## 7. Fail closed

- `ORPHEUS_ENCRYPTION_KEY` missing or malformed where a database URL is set (and always on Vercel): sign-in is off
  (`/api/auth/*` answers 503 JSON, reason `ORPHEUS_ENCRYPTION_KEY not set` / `… malformed`, names only), and
  `/api/personal-finance` and the encryption endpoint answer 503 `{"error":"encryption_unavailable"}`. Nothing is
  written in plaintext; there is no fallback.
- A value that does not decrypt (wrong key, tampered, unknown kid) throws; the request fails (500/503), it is never
  shown as ciphertext or treated as empty.
- The key and plaintext are never logged; errors carry the context (`user.email`) and kid only.

## 8. Code

- `scripts/data-crypto.mjs`: keys from env, envelope, deterministic / randomized, lookup candidates (shared by the
  app and the CLI).
- `src/lib/crypto/columns.ts`: the column table of section 3.
- `src/lib/crypto/kysely-plugin.ts`: a Kysely plugin on Better Auth's database: encrypts INSERT / UPDATE values,
  turns `=` / `in` on deterministic columns into `in (candidates)`, refuses filters on randomized columns, decrypts
  result rows.
- `src/lib/access/access.server.ts`, `src/lib/finance/account.server.ts`: the raw SQL on those columns goes through
  the same helpers.
- `src/lib/crypto/migrate.ts` + `scripts/data-encryption.mjs`; `src/lib/crypto/encryption-api.server.ts`.
- QA: `qa/tools/encryption.mjs` (ENC-08..ENC-10 on the preview; ENC-11/ENC-12 in-process on PGLite).

## 9. Decision log

| # | Decision | Why |
|---|----------|-----|
| D1 | App-level AES-256-GCM, not database or disk encryption alone | Neon already encrypts disks; the brief is about a leaked copy of the data. |
| D2 | Deterministic encryption in place for lookup columns, not a separate HMAC column | Keeps Better Auth's generated schema and UNIQUE constraints; no `0001` edit. |
| D3 | Envelope carries the key id; old keys decrypt only | Rotation without downtime; re-encrypt job. |
| D4 | Context (`table.column`) as AAD | A ciphertext copied to another column does not decrypt. |
| D5 | Legacy plaintext read as is; writes always encrypted | Lets the migration run on a live database; status shows what is left. |
| D6 | Missing key = sign-in and Personal Finance off (503), no plaintext fallback | Fail closed (EL). |
| D7 | Migration in code (CLI + owner endpoint), not in `npm run build` | A build must not rewrite data; Production needs its own go. |

## 10. Open questions (recommendation built until EL answers)

- **Q-E1** What is "calls"? → The data each signed-in API call stores: the Personal Finance record
  (`personal_finance.data`), plus everything sign-in stores (sessions, accounts, users, verification).
- **Q-E2** Deterministic encryption for `email` / `token` / `identifier` leaks equality (two rows with the same value
  look the same). → Accept: they are UNIQUE anyway; it keeps lookups and constraints.
- **Q-E3** Encrypt Dashboard holdings (symbols, quantities, average cost)? → Not in #93: the Dashboard sums and
  sorts them in SQL and is on hold (#71); a later ticket.
- **Q-E4** The Preview database is shared by every preview. Once this preview encrypts rows, older previews (built
  from main) cannot read them. → EL points this preview at a Neon branch (Preview-scoped `DATABASE_URL`) before
  running `encrypt`; otherwise run `encrypt` only right before merge, and `decrypt` restores the old state.
- **Q-E5** Keep reading legacy plaintext after the migration? → Yes until Production's `status` shows 0 plaintext;
  a follow-up can refuse plaintext reads.
- **Q-E6** Wrap the password hash too? → Yes (cheap; a dump gives nothing to crack offline).
