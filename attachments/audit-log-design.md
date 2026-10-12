# Audit log of actions (#91)

Status: BUILT as the thinnest reading of the brief (EL kickoff 2026-10-12 ≈ 09:59 ET, Diego via CoS). Open
questions are in section 8; none blocks the build.

Brief (#91): "Audit log of actions, **not** personal data. Amounts and names masked. For operations and debug.
Prefer append-only, minimal fields. Masking is required, not optional." Out of scope: full personal finance figures,
account numbers, real names; Roles / Account (#90), shared page parts (#92), encryption at rest (#93).

## 1. What it is

A server-side, append-only list of **who did what, when** on the signed-in parts of the app (sign-in, `/account`,
Personal Finance, Dashboard). Written by the API handlers after the action; read by the owner only, as section
`06 Activity` on `/account` (the dark shell: bar, lyre, footer `Orpheus Wisdom`; no gold).

## 2. Storage

Table `audit_event` (migration `0012_audit.sql`):

| column | type | content |
|--------|------|---------|
| `id` | bigserial | order |
| `at` | timestamptz | server time of the action |
| `actor` | text | masked: `owner`, `p-xxxxxxxx` (a person) or `anonymous` (a failed sign-in) |
| `role` | text | `owner`, `cfo`, `pm`, `cfo+pm`, `person` (no grant) or `anonymous` |
| `action` | text | one of the codes in section 3 |
| `target` | text, null | masked: `p-xxxxxxxx` for a person, `h-xxxxxxxx` for a holding, else null |
| `outcome` | text | `ok`, `denied` (403) or `failed` (sign-in refused) |
| `detail` | text, null | a short code from a fixed list only (grant levels such as `pf:read dash:none`, the surface of a denial and the method); never free text |

Append-only: a trigger refuses `UPDATE` and `DELETE` on the table. No foreign keys (removing a person never removes
their history). No IP address, user agent, email, name, amount, ticker, currency or record content is stored.

## 3. Actions recorded

| code | when |
|------|------|
| `auth.sign_in` | `POST /api/auth/sign-in/email`: `ok` (actor the person) or `failed` (actor `anonymous`; the email typed is not stored) |
| `auth.sign_out` | `POST /api/auth/sign-out` with a session |
| `account.password` | own password changed |
| `account.email` | own email changed |
| `access.add` | the owner adds a person (or grants an existing account); detail the levels |
| `access.grants` | the owner changes a person's grants; detail the levels |
| `access.remove` | the owner removes a person's access |
| `access.reset` | the owner resets a person's password |
| `pf.save` / `pf.delete` / `pf.view` | Personal Finance record saved / wiped / section toggles saved |
| `dash.holding_add` / `dash.holding_edit` / `dash.holding_delete` | Dashboard holdings |
| `dash.settings` | Dashboard settings saved |
| `access.denied` | a signed-in person refused (403) by the Personal Finance / Dashboard grant check; detail `<surface> <METHOD>` |

Reads (GET) are not recorded, except a denial.

## 4. Masking (required)

- A person: `p-` + the first 8 hex digits of SHA-256 of `orpheus-audit-v1:` + their account id. Stable (the same
  person always shows the same code), not reversible from the log, no email or name. The owner shows as `owner`.
- A holding: `h-` + the same hash of its id. Never the ticker, shares or cost.
- Amounts: none are written. Personal Finance writes record only `pf.save`; Dashboard writes only the action.
- The owner's page shows the masked codes; it does not decode them (the "Who has access" list in section `04` stays
  the place for names).

## 5. Reading

- `GET /api/account/audit?before=<id>&limit=<1..100>` (default 50): owner only (else 403; signed out 401; flag off
  404; `no-store`), newest first, `{ events: [{ id, at, actor, role, action, target, outcome, detail }], more }`.
- `/account` section `06 Activity` (owner only, not with a temporary password): a table `When` (ET, `yyyy-mm-dd
  hh:mm`), `Who`, `Role`, `Action`, `Target`, `Result`; `Show older` loads the next 50. Empty: `No activity yet.`

## 6. Failure

Writing the log is best effort: a failed insert is reported in the server log (the action code only) and never
changes the action's own answer.

## 7. Decision log

| When | Decision |
|------|----------|
| 2026-10-12 ≈ 09:59 ET | **#91 kickoff (EL; Diego via CoS):** low priority; ops / debug; masked amounts and names; dark style, lyre, footer, no gold; harness first; the thinnest reading if the issue is thin; list open questions in the PR. |
| 2026-10-12 | **Reading chosen (this document):** server-side append-only table, masked actor / target codes, a fixed action list, owner-only section on `/account` + API. No new route, no new env var. |

## 8. Open questions (built as recommended; EL / Diego may change)

- **Q-A1 Retention.** Built: kept forever (tiny rows). Alternative: prune older than N days by the cron.
- **Q-A2 Who reads it.** Built: the owner only. Alternative: also a Dashboard `Read and write` grantee.
- **Q-A3 Failed sign-ins.** Built: recorded as `anonymous` without the typed email. Alternative: also a masked code of the typed email (would let the owner spot repeated guesses for one account).
- **Q-A4 Denials.** Built: only the Personal Finance / Dashboard grant 403s. Alternative: also the owner-only `/api/account/*` 403s.
