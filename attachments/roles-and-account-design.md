# Roles and Account menu (#90): design pass

**Status: ACCEPTED, being built.** Written 2026-10-11 ≈ 22:45 ET against `main` `2cbe101` (design-only draft PR
#107). Diego accepted it via CoS ≈ 23:55 ET, with Q-D1..Q-D18 **decided exactly as recommended** (section 10). The
build ships it in one product PR (feat/roles-account) together with ROLE-01..22 in `qa/CANONICAL-AC-PACK.md`;
#107 is superseded by that PR. Same SDLC: harness → draft PR → QA on preview → merge → signed-out prod check.

Sources read, read only: issue #90; `AGENTS.md`; `attachments/personal-finance-spec.md` (§16.4 sign-in gate,
§16.5 the account record, Q30); `attachments/dashboard-spec.md` §3 (auth); `src/lib/auth/*` (Better Auth 1.6.33,
email/password, sign-up allow-list `DASHBOARD_SIGNUP_ALLOWLIST`, no email sender, `__Host-` cookies,
`safeNext`); `src/lib/dashboard/session.server.ts`; `src/lib/finance/account.server.ts`; `migrations/0001`,
`0010`; `src/components/site-menu.tsx`; `qa/CANONICAL-AC-PACK.md`.

## 1. Brief, and what changes

Diego grants access. **CFO** → Personal Finance. **Portfolio Manager** → Dashboard. Each grant is read, write or
both. Diego creates accounts and shares the logins. An account menu offers: change password, change email, see
who has access. Business owners stay as they are (CFO reviews PF, Portfolio Manager reviews Dashboard); this
ticket is only the access layer those roles need.

**Today (as built):** anyone whose email is on `DASHBOARD_SIGNUP_ALLOWLIST` can create an account. Every account
then sees and edits **its own** data: its own PF record (`personal_finance.user_id`) and its own holdings and
settings. There are no roles and no shared data. There is no sign-out on `/personal-finance` (Q30), and no way to
change a password or email.

**After #90 (proposed):**
- There is one **owner**: Diego.
- Personal Finance and the Dashboard show **Diego's data**.
- Other people see that data only through a grant Diego gives them.
- Everything else keeps the current shell and security: the `__Host-` cookies, the same-site check, `safeNext`,
  the flag `DASHBOARD_ENABLED`, and nothing on production until release.

## 2. Screens and flows

### 2.1 Sign-in (exists, small changes)
- `/dashboard/sign-in` stays the one sign-in page (dark shell, the lyre, footer `Orpheus Wisdom`, no gold).
- Proposed: `safeNext` gains exactly one more allowed value, `/account` (amends PF-34). The allowlist stays
  exact-match.
- The public `Create account` toggle: see Q-D6. The recommendation is to remove it, so that only Diego creates
  accounts. The env allow-list then only gates the owner's own first sign-up.
- First sign-in with a temporary password: the person is sent to `/account` with only `Change password`
  available. They cannot leave it until they set their own password (Q-D5).

### 2.2 Account menu in the dark shell
- **Bar item.** The bar keeps its one thin charcoal row (#46 / #68): the lyre and `Orpheus` on the left, then
  `Calculator`, `Dashboard` and `Personal finance`. The design adds one right-most item, `Account`.
- **Always shown.** Like `Dashboard` and `Personal finance`, it is a plain link and is always rendered, so
  there's no hydration shift and strict CLS stays 0.
- **Signed out**, it goes to `/dashboard/sign-in?next=/account`.
- **Styling.** It uses the same 44 px hit area, dim/chalk current mark (`aria-current="page"` on `/account*`),
  chalk focus ring and no hover rule.
- **No dropdown (Q-D9 decided).** The bar has a standing "no dropdowns" rule (#46), so the "account menu" is the
  page `/account`, not a popover.
- **Phone width (Q-D8 decided).** Below 640 px the item is a 44 × 44 chalk-outline person glyph (inline SVG like
  the lyre, decorative, the link's accessible name `Account`); from 640 px it is the text `Account`.
- **`/account` page.** It is a page in the shell (dark, mono numerals `01`, `02`… like PF sections, no helper
  paragraphs, noindex, title `Account · Orpheus Wisdom`). Its sections:
  - `01 You`: name, email, role labels (e.g. `CFO · Personal finance · Read and write`), `Sign out`.
  - `02 Password`: `Current password`, `New password`, `Confirm new password`, `Save`.
  - `03 Email`: `New email`, `Current password`, `Save`.
  - `04 Who has access` (see 2.3).
  - Owner only, `05 Grant access` (see 2.3).
- Fixes the gap noted in PF Q30: sign-out becomes reachable from every page via `Account`.

### 2.3 Grant UI (Diego, owner only)
On `/account`, section `05 Grant access`.
- **Table:** one row per person (not Diego). Columns:
  - `Name`
  - `Email`
  - `Personal finance` (select `No access` / `Read` / `Read and write`; Q-D2 decided)
  - `Dashboard` (same select)
  - `Role` (derived and read-only: `CFO` when PF ≠ none, `Portfolio Manager` when Dashboard ≠ none, both if both)
  - Actions: `Reset password`, `Remove`
- **Saving.** A change saves on `Save` per row, not per keystroke (consistent with Q39). A grant change takes
  effect on the person's next request (grants are read per request, never cached in the session cookie).
- **`Add person`:** `Name`, `Email`, `Personal finance` level and `Dashboard` level, then `Create account`.
  - The server creates the account with a **temporary password, generated server-side** (Q-D4).
  - It is shown once to Diego with a `Copy` button. The page also shows the sign-in URL (`/dashboard/sign-in`)
    and the email, as one copyable block, so Diego can share the login himself (there is no email sender).
  - The temporary password is never stored in plain text, logged, emailed, or shown again. `Reset password`
    makes a new one-time temporary password the same way and signs that person out everywhere.
  - If an account with that email already exists, `Add person` just sets the grants (no new password).
- **`Remove`** clears both grants and revokes that person's sessions. Whether it also deletes the account is
  Q-D7; the default keeps the account with no access.
- **Diego's own row** is not editable: the owner always has read and write on both and cannot be removed or
  demoted.

### 2.4 What CFO / PM see when denied
- **Signed out:** unchanged. `/personal-finance` and `/dashboard` → 307 to sign-in (`next` allowlist).
- **Signed in, no read grant** on the page they asked for:
  - The page answers **403** in the dark shell, noindex, with no data, no figures and no copy from that surface.
  - Content: an `h1` naming the page and one line: `You don't have access to Personal finance.` (or
    `… to the Dashboard.`).
  - Links: `Account` and home. No "request access" button (no messaging in v1).
  - The bar is unchanged (items stay; Q-D10 if Diego wants them hidden).
- **Read only:**
  - The page renders with every input `readOnly` / disabled and no `Add`, `Remove`, `Save`, `Update month` or
    `Add account…` controls.
  - The PF autosave never fires.
  - Section toggles (`orpheus.finance.view.v1`) are a view preference. Proposed: they stay per person and are
    not written into the owner's record (Q-D11).
  - On the Dashboard: no add/edit/delete holding, no column/currency change, no preview refresh.
  - One quiet status line under the page title, `Read only`, mono, dim chalk.
- **No write without read** (Q-D2 decided): the levels are `No access` / `Read` / `Read and write`.

## 3. Data model

New migration `0011_access.sql` (idempotent, previews share one database). snake_case, `user_id TEXT`.

```sql
-- One row per (person, surface). Absent row = no access. Owner is never stored here.
CREATE TABLE IF NOT EXISTS access_grant (
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  surface     TEXT NOT NULL CHECK (surface IN ('personal_finance','dashboard')),
  can_read    BOOLEAN NOT NULL,
  can_write   BOOLEAN NOT NULL,
  granted_by  TEXT NOT NULL REFERENCES "user"(id),
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, surface),
  CHECK (can_read OR can_write)
);
-- Account flags kept outside Better Auth's generated tables (0001 is never edited).
CREATE TABLE IF NOT EXISTS account_state (
  user_id               TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  must_change_password  BOOLEAN NOT NULL DEFAULT false,
  created_by            TEXT REFERENCES "user"(id)
);
```

- **Roles** are labels derived in code, not stored: `personal_finance` → `CFO`, `dashboard` →
  `Portfolio Manager`. One person may hold both (Q-D3). Storing surfaces keeps the brief's "CFO → PF,
  PM → Dashboard" in one constant (`SURFACE_ROLE`) rather than a free-form role table.
- **Owner.** There is exactly one, never a row in `access_grant`. Proposed: a server-only env var
  `ORPHEUS_OWNER_EMAIL`. Diego or EL set it per environment; bots never set env. It is resolved to a user id per
  request and compared case-insensitively. Changing the owner is out of scope without Diego via CoS. Owner email
  change: Q-D12.
- **Accounts** are Better Auth's `user` / `account` / `session`, unchanged. Accounts are created through Better
  Auth's server API, so password hashing stays Better Auth's. Recommendation: the `admin` plugin's `createUser` /
  `setUserPassword` are used **server-side only**, with no admin endpoints exposed to the client. Otherwise, the
  internal adapter does the same job.
- **Allow-list.** Today the `user.create.before` hook refuses any email not on `DASHBOARD_SIGNUP_ALLOWLIST`.
  Proposed: an account may also be created when the request is the owner's `Add person` call (server-side flag
  on that call only). The public `/sign-up/email` path keeps the env allow-list (or is closed, Q-D6). Nobody
  edits `DASHBOARD_SIGNUP_ALLOWLIST`.
- **Whose data.** PF reads and writes `personal_finance` where `user_id = owner id`. The Dashboard reads and
  writes holdings, settings, columns and chips for the owner id. Grantees never get their own PF record or
  portfolio. Existing non-owner rows (e.g. QA accounts) are left in place and are no longer shown (Q-D1).

## 4. Authorization

One server-only function, the single chokepoint for every page gate and API below:
`resolveAccess(sessionUser, surface) → { read, write, dataUserId } | null`.
- Owner → read and write, `dataUserId` = owner.
- Grantee → the row's flags, `dataUserId` = owner.
- Otherwise → no access.
- The user comes only from the Better Auth session. Grants are read from the database on every request.

**Pages**
| Route | Signed out | Signed in, no read | Read | Read + write |
|---|---|---|---|---|
| `/personal-finance` | 307 sign-in `next=/personal-finance` (PF-33, unchanged) | 403 shell page | read-only render | as today |
| `/dashboard` | 307 sign-in (unchanged) | 403 shell page | read-only render | as today |
| `/account` | 307 sign-in `next=/account` | n/a (every signed-in person) | — | — |
| `/account` §05 | — | hidden and 403 on its API for non-owners | — | owner only |

**APIs.** Existing order kept, with one step inserted: 404 flag off → 405 method → 401 no session → **403 no grant
for this method** → 403 `userId` naming anyone → 400/413 body → 503 no DB.
- Read methods (`GET`/`HEAD`) need `read`. `PUT`/`POST`/`DELETE` need `write`.
- `/api/personal-finance`: GET read; PUT/DELETE write. `DELETE` (wipe the record) is proposed as **owner only**
  (Q-D13).
- `/api/dashboard/holdings` (GET read, POST write), `/holdings/:id` (GET read, PUT/DELETE write), `/settings`,
  `/columns` (GET read, PUT write), `/fx`, `/me`, `/status` (read), `/refresh` (preview only; write).
- `/api/dashboard/me` adds `{ role labels, access: { personal_finance, dashboard } }`, and never other people's
  data.
- `/api/auth/*`: Better Auth, unchanged; plus `change-password` and `change-email` (section 6).
- `/api/cron/*` (cron secret) and `/api/chart` (public): unchanged.
- **New `/api/account/access`** (owner only):
  - GET lists people and grants.
  - PUT `{ userId, personal_finance, dashboard }` sets grants.
  - POST `{ name, email, … }` creates a person and returns the temporary password once, with `Cache-Control:
    no-store`.
  - POST `…/reset-password` resets a password.
  - DELETE `…/:userId` removes access.
  - Every write passes the existing same-site check (`assertSameSiteRequest`) and Better Auth `trustedOrigins`.
- **New `/api/account/who`** (any signed-in person): the "who has access" list, scoped per Q-D14.

## 5. Create-account and share-login rules
1. Only the owner creates accounts. On the build branch, `Create account` is removed from the public sign-in page
   (Q-D6). Nobody, bots included, edits `DASHBOARD_SIGNUP_ALLOWLIST`.
2. One person = one account = one email. "Share logins" means Diego hands each person **their own** email and
   temporary password. Several people sharing one login is not supported (Q-D15 confirms).
3. Temporary password:
   - generated server-side, ≥ 16 characters from a CSPRNG;
   - shown once to the owner over `no-store`;
   - never logged, never in git, PR, screenshot names or analytics;
   - `must_change_password = true`;
   - the person must set their own (≥ 8, per the current `minPasswordLength`) before seeing PF or the Dashboard.
4. Email is trimmed and lower-cased and must be unique. An existing account → grants only.
5. New accounts have no data of their own; they see the owner's data per grant.
6. No email is ever sent (no sender configured; `requireEmailVerification: false` stays). Forgot password =
   Diego uses `Reset password`.

## 6. Password and email change
- **Change password** (`/account` §02): Better Auth core `changePassword` with `currentPassword`, `newPassword`
  and `revokeOtherSessions: true`.
  - Field checks: `Enter your current password.`; `Use 8 or more characters.`; `Passwords don't match.`
  - A wrong current password → `That password is not right.` (no detail).
  - Success: `Saved.`; other devices are signed out; `must_change_password` is cleared.
  - Rate-limited by Better Auth's limiter.
- **Change email** (`/account` §03): Better Auth `changeEmail` with `user.changeEmail.enabled: true`.
  - With no sender and `emailVerified=false` it updates immediately. Because Better Auth's call takes no
    password, the server re-checks `Current password` first.
  - New email: trimmed, lower-cased, unique. `That email is already in use.` vs a generic failure is Q-D16
    (enumeration).
  - Success signs out other sessions.
  - The owner's email change is blocked in-app while ownership is keyed on `ORPHEUS_OWNER_EMAIL` (Q-D12).
- Both forms: 44 px controls, AA, the chalk focus ring, `autocomplete` (`current-password`, `new-password`,
  `email`), no CLS.

## 7. "Who has access" (not an audit log)
- It shows the **current state only**: each person's name, email, role label(s) and level per surface, with the
  owner marked `Owner`. No history, no timestamps of actions, no "who changed what". That is #91, out of scope.
- **Owner:** sees everyone (§05 is the editable form of the same list).
- **Grantee:** proposed default, a read-only list of the people with access to the surface(s) the grantee holds,
  plus the owner (Q-D14: or only "you and Diego").

## 8. Proposed AC IDs (not implemented)
These are for a new pack section, "Roles and account (#90)", in `qa/CANONICAL-AC-PACK.md`. It would get a new
ticket-table row 16: `#90 Roles and account`, rows ROLE-01..22, no-regression pass on PF-01..47, PFE-01..13,
ST1 (bar), ST5b (sign-in), `$313,000`, signed-out 307 + `safeNext`. The tool would be a new
`qa/tools/roles.mjs`, preview only. It needs four EL-provisioned preview accounts (owner, CFO-read, PM-write,
no-grant) with passwords in env only, plus `ORPHEUS_OWNER_EMAIL` set on Preview by EL/Diego (Q-D17).

| AC | Pass when |
|----|-----------|
| ROLE-01 | Bar: `Account` is the right-most item on every page (signed in and out), 44 px, `aria-current` on `/account*`, the four existing items unchanged, one line at 360 / 400 / 1024 / 1440, no sideways scroll, strict CLS 0, no gold (amends ST1-01). |
| ROLE-02 | Signed out `/account` → 307 to `/dashboard/sign-in?next=/account`; after sign-in, returns there; `safeNext` allows exactly `/personal-finance` and `/account` (amends PF-34). |
| ROLE-03 | `/account` renders in the dark shell (lyre, footer `Orpheus Wisdom`, noindex, title `Account · Orpheus Wisdom`) with `01 You`, `02 Password`, `03 Email`, `04 Who has access`; `05 Grant access` only for the owner. |
| ROLE-04 | `Sign out` on `/account` ends the session; `/personal-finance` then 307s. |
| ROLE-05 | Change password: the field checks; a wrong current password is refused; success signs out a second context; the new password signs in, the old one doesn't. |
| ROLE-06 | Change email: needs the current password; a duplicate is refused; success signs in with the new email only; the owner's form is blocked (per Q-D12). |
| ROLE-07 | Owner `Add person`: the account is created, the temporary password is shown once (`no-store`, absent after reload, absent from logs and analytics); an existing email gets grants only. |
| ROLE-08 | First sign-in with a temporary password lands on `/account` with only `Change password`; PF and Dashboard 307 to `/account` until it's changed. |
| ROLE-09 | Public sign-up is closed (or still env allow-list only, per Q-D6); no non-owner path creates an account. |
| ROLE-10 | PF grant `Read`: `/personal-finance` shows the owner's figures read-only (no inputs editable, no Add / Remove / Save / Update month / Add account…, `Read only` line); `PUT` / `DELETE /api/personal-finance` → 403; GET → owner's record. |
| ROLE-11 | PF grant `Read and write`: edits save to the owner's record; the owner sees them after reload; `DELETE` is 403 unless owner (Q-D13). |
| ROLE-12 | Dashboard grant `Read`: the owner's holdings read-only; POST/PUT/DELETE on holdings, settings, columns, refresh → 403. |
| ROLE-13 | Dashboard grant `Read and write`: edits land on the owner's portfolio. |
| ROLE-14 | No grant: `/personal-finance` or `/dashboard` → 403 shell page with one line, no data; every API → 403 (after 401 for signed out, 404 flag off, 405 method). |
| ROLE-15 | A PF-only person gets 403 on the Dashboard and the reverse; a person with both sees both. |
| ROLE-16 | Grant changes apply on the next request (no re-sign-in); `Remove` signs the person out everywhere. |
| ROLE-17 | `/api/account/access` (every method) → 403 for non-owners; `?userId` / body `userId` cannot widen access; the owner's own grants can't be edited. |
| ROLE-18 | `Reset password`: new one-time temporary password, old password refused, sessions revoked, `must_change_password` set. |
| ROLE-19 | Who has access: the owner sees everyone; a grantee sees the list per Q-D14; no history or audit data (#91). |
| ROLE-20 | Cross-site scripted POSTs to every new endpoint → 403 (`assertSameSiteRequest`); `__Host-` cookies unchanged. |
| ROLE-21 | Layout: `/account` and the 403 page at 360 / 400 / 1024 / 1440, 44 px controls, AA, axe clean, chalk focus ring, strict CLS 0, no gold. |
| ROLE-22 | Regression: PF-01..47, PFE-01..13 (now as the owner), ST shipped pages, `$313,000`, signed-out 307 on production; nothing visible on production before release. |

## 9. Out of scope
- **#91** audit log product. The "who has access" view is current state only.
- **#92** shared page parts. **#93** encryption at rest.
- **#50 / #51 / #95**: untouched.
- Changing which business owner reviews which surface (CFO on PF, Portfolio Manager on Dashboard) without Diego
  via CoS. Changing the app owner.
- PF calculations, currency and FX, and PF Overview/Update design.
- Dashboard content restyle (**#71**, on hold).
- Email sending, verification and self-service "forgot password"; OAuth / SSO; 2FA.
- Org / multi-tenant workspaces; more surfaces than PF and Dashboard.
- Vercel env or secret changes by bots (`ORPHEUS_OWNER_EMAIL` and the QA accounts are set up by EL/Diego).

## 10. Decisions (Diego via CoS ≈ 23:55 ET; every one exactly as recommended)

Originally the open questions only Diego could flip; each line is kept as asked, with the decision first.
- **Q-D1 — Decided: Diego's data only: one shared owner workspace; non-owner accounts' own rows hidden.** Asked: **Whose data.** Grantees see and edit **Diego's** PF record and portfolio (one shared owner workspace),
  and non-owner accounts' own existing rows are hidden? Or does every person keep their own data, with grants
  adding read/write to Diego's on top? *Recommended: Diego's only.*
- **Q-D2 — Decided: `No access` / `Read` / `Read and write`; no write-without-read.** Asked: **"Read, write, or both".** Is there a real write-without-read level? *Recommended: no; three values
  `No access` / `Read` / `Read and write`.*
- **Q-D3 — Decided: yes, one person may hold both CFO and Portfolio Manager.** Asked: **Both roles.** May one person be both CFO (PF) and Portfolio Manager (Dashboard)? *Recommended: yes.*
- **Q-D4 — Decided: server-generated temporary password, shown once to Diego.** Asked: **Who sets the first password.** A server-generated temporary password shown once to Diego, or Diego types
  it? *Recommended: generated.*
- **Q-D5 — Decided: yes, forced password change before seeing anything.** Asked: **Forced change.** Must a new person change the temporary password before seeing anything?
  *Recommended: yes.*
- **Q-D6 — Decided: public `Create account` removed from sign-in; the env allow-list is for Diego's own account only.** Asked: **Public sign-up.** Remove `Create account` from the sign-in page so only Diego creates accounts?
  *Recommended: remove (the env allow-list stays for Diego's own account only).*
- **Q-D7 — Decided: revoke access only (keep the account); no delete-account in #90.** Asked: **`Remove`.** Revoke access only (keep the account), or delete the account? *Recommended: revoke only.*
- **Q-D8 — Decided: (a), a person glyph below 640 px.** Asked: **Phone bar.** If a fifth item doesn't fit at 360 px:
  - (a) a person glyph below 640 px (recommended);
  - (b) drop the word `Orpheus` on phones (reverses Q21);
  - (c) shorten `Personal finance` to `Finance` on phones.
- **Q-D9 — Decided: the `/account` page, not a dropdown.** Asked: **Menu form.** `/account` page (keeps the no-dropdown rule, recommended) or a dropdown under `Account`?
- **Q-D10 — Decided: keep `Dashboard` / `Personal finance` visible; denied → 403 shell page, or read-only + API 403; nothing hidden (no CLS).** Asked: **Bar for no-access people.** Keep `Dashboard` / `Personal finance` visible and answer 403 (recommended,
  no CLS, matches the "items always show" rule), or hide items a person can't open?
- **Q-D11 — Decided: view toggles per person for read-only people.** Asked: **View toggles for read-only people.** Per person (recommended) or shared with Diego's record?
- **Q-D12 — Decided: owner = `ORPHEUS_OWNER_EMAIL` (server-only, set by Diego/EL); Diego's in-app email change is blocked.** Asked: **Owner identity.** Owner = server env `ORPHEUS_OWNER_EMAIL` set by Diego/EL, with Diego's in-app email
  change blocked? Or another mechanism?
- **Q-D13 — Decided: yes, `DELETE` of the whole PF record is owner-only, even for `Read and write`.** Asked: **Wipe.** Is `DELETE` of the whole PF record owner-only even for `Read and write`? *Recommended: yes.*
- **Q-D14 — Decided: grantees see the people on their surfaces (plus the owner).** Asked: **Who has access, for grantees.** Can a CFO see who else has access (names, emails, levels) to the
  surfaces they hold, or only "you and Diego"? *Recommended: the people on their surfaces.*
- **Q-D15 — Decided: each person has their own login; no shared account.** Asked: **Shared logins.** Confirm "share logins" means each person gets their own login (no shared account).
- **Q-D16 — Decided: the plain `That email is already in use.`; only signed-in people reach it.** Asked: **Email-in-use message.** Say `That email is already in use.` (friendlier, reveals existence to a
  signed-in grantee) or a generic failure? *Recommended: the plain message; only signed-in people reach it.*
- **Q-D17 — Decided: EL sets `ORPHEUS_OWNER_EMAIL` on Preview and creates the four QA accounts; passwords in env only.** Asked: **Preview QA setup.** Who sets `ORPHEUS_OWNER_EMAIL` on Preview and creates the four QA accounts
  (owner / CFO-read / PM-write / no-grant)? *Recommended: EL, passwords in env only.*
- **Q-D18 — Decided: at release Diego's existing production account becomes the owner; every other existing production account starts with no access until Diego grants.** Asked: **Production rollout.** Diego's existing production account becomes the owner at release; any other
  existing production accounts start with **no access** until Diego grants. OK?
