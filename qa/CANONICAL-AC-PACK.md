<!-- Canonical copy. Seeded 2026-10-02 from QA's box (/workspace/orpheus-app/qa/CANONICAL-AC-PACK.md);
     from now on edit this repo file, not the box copy. Only change since seeding: the "Fixtures:" line
     now points at the repo's qa/fixtures.json. 2026-10-04 (#54): added the "Dashboard: mobile-first redesign"
     section from epic #53; the DCA rows are unchanged. -->
# Canonical AC pack: orpheus-app DCA calculator and dashboard

Source: Chief of Staff relay, 2026-10-02 (Diego-approved direction). Six rules only; no invented ACs.
Report to: Engineering Lead. Live URL: https://orpheus-app-beta.vercel.app. Fixtures: [`qa/fixtures.json`](fixtures.json) in this repo (an empty array counts as a pack defect).

Specs behind each section: the DCA rows, [`attachments/dca-app-spec.md`](../attachments/dca-app-spec.md); site style
(ST rows, epic #66), [`attachments/site-style-spec.md`](../attachments/site-style-spec.md); dashboard (DR rows,
epic #53), [`attachments/dashboard-spec.md`](../attachments/dashboard-spec.md).

| AC | Tier | Rule | Pass when (on the live page) |
|----|------|------|------------------------------|
| DCA-01 | BLOCK | Dividends reinvested | The result reflects reinvested dividends (stated, or visible in the output) |
| DCA-02 | BLOCK | DCA = extra cash on each date | Each scheduled date adds the contribution on top of prior holdings |
| DCA-03 | BLOCK | Lump sum on day one | Starting capital is fully deployed on the start date |
| DCA-04 | BLOCK | Multi-ticker weighted basket | The basket accepts several tickers with weights and applies those weights |
| DCA-05 | BLOCK | US/EU/CA listings only | Tickers outside US/EU/CA are refused or not offered |
| DCA-06 | BLOCK | No buy/sell advice | The page outputs no buy, sell, hold, or recommendation, however it's worded. A missing 'Not a recommendation' disclaimer is intended and is not a fail (Diego rule change via Engineering Lead, 2026-10-02). |

Exact expected numbers need fixtures (tickers, dates, amounts) from the owner. Until those exist, numeric checks are BLOCKED rather than guessed.

## Site style: dark, mobile first (epic #66)

Source of truth: [`attachments/site-style-spec.md`](../attachments/site-style-spec.md) (dark brief, re-scoped by
Diego via CoS and EL, 2026-10-05 21:26 ET; the row text below is copied from its section 11). **A white style was
proposed on 2026-10-05 and dropped at 21:26 ET; dark wins and nothing white gets merged.** The #53 dark style
stands and is extended. Widths: phone 400 × 860, 1024 × 800, 1440 × 900, plus 360 × 780 for the calculator's
phone rows (ST4-08..12, ST4-17, ST4-19..24) and ST4-14 / -15, and home's ST3-01, -02, -05, -06 (#69); phone rules below 1024 px, the wide layout from 1024 px. ST2 (hover) is retired; ST5a (dashboard content) is deferred while #71 is on hold.

**Per-ticket QA:** each ticket's own rows plus a no-regression pass on everything else (the dashboard content
always: ST0-05).

| # | Ticket | Rows | No-regression pass on |
|---|---|---|---|
| 1 | #67 (docs) | ST0-04 | n/a |
| 2 | #68 dark shell | ST1 on every page; ST0-05 | page content everywhere unchanged (calculator, home, sign-in, dashboard) and still AA-readable |
| 3 | #70 calculator | ST0-01..03, ST4 on `/calculator`; ST0-05 | `/`, `/dashboard/sign-in`, `/dashboard` |
| 4 | #69 home | ST0-01..03, ST3 on `/`; ST0-05 | `/calculator` (ST4), sign-in, `/dashboard` |
| 3a | #78 calculator polish | ST0-01..03, ST4 on `/calculator` (ST4-06, -10, -12, -13 amended; ST4-17 field checks, ST4-18 wide layout new); ST0-05 | `/` (ST3), sign-in, `/dashboard` |
| 3b | #80 saved searches | ST0-01..03, ST4 on `/calculator` (ST4-19..24 new: button always visible and closed by default, list of 5 + Load, auto-save, refresh restore (multi-name restore page CLS < 0.1, EL Q18), no auth / `localStorage` only, isolation + clear-site-data) ; ST0-05 | `/` (ST3), sign-in, `/dashboard` |
| 5 | #73 sign-in | ST0-01..03, ST5b-01..05 on `/dashboard/sign-in` (ST5b-04 AA / color-scheme / autofill and ST5b-05 layout / noindex new; `qa/tools/signin-page.mjs`); ST0-05 | `/`, `/calculator`, `/dashboard` |
| 6 | #72 leave-outs + regression | ST6-01..09 (ST6-06 font / strict CLS, -07 punctuation, -08 bar tap targets, -09 dark 404 new; ST3-01 / ST4-01 CLS now strict 0) and every row above except ST5a, shipped pages; `qa/tools/site-style-regression.mjs` | `/dashboard` (ST0-05) |
| 7 | #84 Personal Finance v1.1 + lyre | PF-01..10 on `/personal-finance` (`qa/tools/personal-finance.mjs`); ST1-05 the lyre on every page; EL (≈ 12:05 ET): URL only (Q1 (d): ST1-01 three items, ST3-03 two home lines unchanged), unitless amounts until #87 (Q2), a typed `Equity to cover` overrides #86's calculated amount (Q3, for #86), `__grok/icon-180.png` out of scope (Q4); ST0-05 | every shipped page (`qa/tools/site-style-regression.mjs`: `/`, `/calculator`, sign-in, the 404; `$313,000`) |
| 8 | #85 Personal Finance v1.2 income | PF-11..16 new (people, net, counted + share, income table, `% of income` wired); PF-02, -04, -07, -09, -10 amended (`02` Income / `03` Expenses, `% of income` computed, the income key, CLS with people restored); `qa/tools/personal-finance.mjs`; ST0-05 | every shipped page (`qa/tools/site-style-regression.mjs`; `$313,000`); #86 / #87 not started. EL (≈ 13:11 ET): Q5–Q8 accepted as built (bonus rating = % of yearly wages; one average tax % per person; one Share (%) per person on each counted line; biweekly = yearly ÷ 26) |
| 9 | #86 Personal Finance v1.3 equity cover | PF-17..20 new (the two household rates and `Rate used`, formula A, the override, the equity key); PF-02, -05, -07, -09 amended (the rate cells' copy, totals = override or calculated, the third key, CLS with rates restored); `qa/tools/personal-finance.mjs`; ST0-05 | every shipped page (`qa/tools/site-style-regression.mjs`; `$313,000`); #87 / #94 / #90 / #71 not started; no currency symbol (Q2). EL (≈ 14:12 ET): Q9 bad override → calculated; Q10 no rate → `—` in line and totals; Q11 ROIC no upper cap |
| 10 | #97 home + bar for Personal Finance | ST1-01 (four bar items; 12 px text / 8 px gaps below 640 px, 14 px / 24 px from 640, word `Orpheus` kept, no sideways scroll: Q21 decided by EL 15:42 ET), ST1-02 (`Personal finance` current on `/personal-finance`), ST3-03 (three Platforms lines, the approved copy; Q22 decided: Dashboard line `The portfolio as a business.`), ST3-06 (four items on one line on a phone); PF-01 / PF-10 amended (Q1 (d) superseded: nav first-class, URL still works); `qa/tools/site-shell.mjs`, `home-page.mjs`, `personal-finance.mjs`; ST0-05 | every shipped page (`qa/tools/site-style-regression.mjs`; `$313,000`); `/personal-finance` content untouched; #87 / #94 / #98 / #71 not started |
| 11 | #87 Personal Finance v1.4 foreign-currency line | PF-21..25 new (`Household currency`, line `Currency` / `FX rate`, conversion into the household currency for totals / `% of expenses` / `% of income` / `Equity to cover`, no valid rate → check + `—`, the currency key); PF-02, -07 amended (copy, keys); Q12–Q16 decided by EL ≈ 16:26 ET (Q12 multiply, Q13 default `CAD`, Q14 no valid rate → `—` in every household figure / total containing it, Q15 no symbol / no converted column, Q16 one rate per line) | every shipped page (`qa/tools/site-style-regression.mjs`; `$313,000`); home / bar / dashboard untouched; #94 / #98 / #90 / #71 not started |
| 12 | #94 Personal Finance Overview and Update | PF-26..32 new (`04` Overview: this month against the 12-month average, the three-line chart, `Starting net assets`, `Growth rate (%)`, `Future` 1 / 5 / 10 / 15 years; `05` Update: the last-12-months `Month` dropdown, typed past months update the average; the overview key); PF-02, -07 amended (the two sections' copy, the fifth key); Q17–Q23 decided by EL ≈ 17:14 ET as built (Q19 option A ≈ 17:16 ET: net assets may go negative over time when expenses exceed income; the start field stays ≥ 0); `qa/tools/personal-finance.mjs`; ST0-05 | every other route; `/dashboard` untouched (#71 on hold) |
| 13 | #102 Personal Finance foreign income + sign-in + account | PF-33..39 new (signed-out 307 to sign-in with `next`, the API's 401/403/404/405; return after sign-in; rate direction foreign-per-1-household ÷ (Q12 superseded); account persistence incl. a second signed-in context = another device; the person `Foreign` box with `Currency` / `FX rate (BRL per 1 CAD)` / `Converted (yearly)`; v1 → v2 migration + one-time import; layout); PF-01 / PF-07 amended (signed in; the account); Q24–Q31 open; `qa/tools/personal-finance.mjs` (signed in needs QA_EMAIL / QA_PASSWORD on a preview), signed-out rows in release-smoke / site-shell / site-style-regression; ST0-05 | every other route; `/dashboard` product untouched (#71 on hold); #90 untouched |
| 14 | #98 Personal Finance end-to-end | PFE-01..13 new (entry points signed out / in, the `next` allowlist and the API gate, one CFO journey: income incl. Brazilian Dividends 37,000 BRL at 3.70 → 10,000, expenses incl. Condo BRL at 5, equity cover, Overview / Update, Future; save / reload / second device / `?userId` 403 / `Not saved.`; style + CLS 0; hygiene); `qa/tools/personal-finance-e2e.mjs` (signed in with `QA_EMAIL` / `QA_PASSWORD`: `qa-pf@orpheus.test` on the preview); Q32–Q34 decided (EL ≈ 20:02 ET: Q33 enough as built, `?userId` 403 + second device on the preview, two-account isolation local `--with-database`; Q34 previews only, never production) | PFE-12: the whole shipped-page suite (`site-style-regression.mjs`, $313,000, release-smoke) |
| 15 | #105 Personal Finance usability | PF-40..47 new (section toggles on Income / Expenses / Overview stored against the account `orpheus.finance.view.v1`; hide uncounted / zero income lines; `Update month` panel with Save / Cancel; expense categories, filter, `By category` subtotals, master totals unchanged; layout + CLS 0); PF-15 amended by PF-42, PF-27 / PF-31 by PF-43; `qa/tools/personal-finance.mjs` + `personal-finance-e2e.mjs` updated; Q35–Q39 decided by EL ≈ 21:43 ET, all as built (Q35 helper sentence omitted; Q36 Charts = whole Overview; Q37 account; Q38 filter not persisted, `No category` subtotal; Q39 save on Save, opens on the current month) | signed-out 307 + `safeNext`, `$313,000`, shell / home, CLS 0, noindex (`site-style-regression.mjs`) |
| 16 | #90 Roles and account | ROLE-01..22 new (the `Account` bar item (person glyph below 640 px) and `/account` in the dark shell; password / email change; Diego-only grant UI with a temporary password shown once; forced password change; public `Create account` removed; one owner (`ORPHEUS_OWNER_EMAIL`), grantees see the owner's data: CFO → Personal Finance, Portfolio Manager → Dashboard, `Read` or `Read and write`; the 403 shell page, read-only pages and API 403s; PF `DELETE` owner-only); ST1-01 (five items), ST5b-02 (no `Create an account` link) and PF-34 (`next` also allows `/account`) amended; Q-D1..Q-D18 decided by Diego via CoS ≈ 23:55 ET exactly as recommended; `qa/tools/roles.mjs` (locally on a throwaway database: owner / CFO-read / PM-write / no-grant; on a preview only once EL sets `ORPHEUS_OWNER_EMAIL` and the four QA accounts, passwords in env only) | PF-01..47 and PFE-01..13 as the owner, every shipped page (`site-style-regression.mjs`, `$313,000`), the signed-out 307s, `safeNext`; #91 / #92 / #93 / #71 untouched |
| 17 | #50 Remove Grok template leftovers | NG-01..09 new (no grok.com request / script, no `.grok.com` cookie, the static Orpheus `/manifest.webmanifest` with 180 / 512 icons, `apple-touch-icon` retargeted, `/__grok/*` gone, `/?install=1` is just the old-link redirect to the calculator, noindex / X-Robots-Tag / favicon / theme-color / apple meta kept, no preview bridge); decided by EL ≈ 07:50 ET (option A + cut the preview bridge); `qa/tools/no-grok.mjs` | every shipped page (`site-style-regression.mjs`, `$313,000`, CLS 0), release-smoke, the signed-out 307s; #51 / #71 / #91–#95 untouched |
| 18 | #51 Remove remaining Grok tooling | TL-01..06 new (`.grok/`, `startup.sh`, the preview / app-env / auth-invariant / write-atomic / browser-smoke scripts and `screenshots/app-builder-*` gone; `dev` / `build` / `preview` run Vite directly; no app-env Vite plugin; the deployed auth flag unchanged because Vercel sets `VITE_AUTH_ENABLED` itself (EL ≈ 08:48 ET); kept: `migrations/*0001_auth.sql`, `qa/runs/**`, the frozen-copy compare default); `scripts/no-grok-tooling.test.mjs` | every shipped page (`site-style-regression.mjs`, `$313,000`, CLS 0), `qa/tools/no-grok.mjs`, release-smoke, signed-out 307s; #71 / #91–#95 untouched |
| 19 | #91 Audit log of actions | AUDIT-01..12 new (append-only `audit_event`, the fixed action list, masked actor / target codes, no amounts / names / emails / tickers, owner-only `GET /api/account/audit` and `/account` `06 Activity`, best-effort writes, dark shell); design `attachments/audit-log-design.md`; Q-A1..Q-A4 open, built as recommended; `qa/tools/audit.mjs` | ROLE-01..22 (`roles.mjs`), every shipped page (`site-style-regression.mjs`, `$313,000`, CLS 0), signed-out 307s; #92 / #93 / #95 / #71 untouched |
| 20 | #112 Personal Finance month control | PF-48..PF-58 new (the month control at the top, last 12 months, per-month lines, explicit Save shown only when unsaved, empty past month copies the current saved lines with the note, rollover copy, old totals-only months, averages / Overview after Save, the control stays on the saved month, `05 Update` gone, discard / leave confirms); PF-28 and PF-43 retired; PF-27, PF-31, PF-36, PF-41 amended; design `attachments/pf-month-control-design.md` (EL option A, decisions 1–7); `qa/tools/pf-months.mjs`, `personal-finance.mjs` / `personal-finance-e2e.mjs` updated | signed-out 307, `safeNext`, roles (`roles.mjs`), audit (`audit.mjs`), every shipped page (`site-style-regression.mjs`, `$313,000`, CLS 0), no-grok; #92 / #93 / #95 / #113 untouched |
| 21 | #113 Personal Finance: capital F, delete confirmations, rename categories | PF-59..PF-66 new; ST1-01 / ROLE-01 / home Platforms / PFE-03 / ROLE-04 / ROLE-14 copy amended to "Personal Finance"; spec section 20 (Q-F1..Q-F8) | the bar on one line at 360 / 399 / 400, signed-out 307, roles, audit, no-grok, `$313,000`, CLS 0, PF-01..58 |
| 22 | #92 Shared page parts (refactor) | SP-01..SP-07 new; site-style-spec section 16 (Q-S1..Q-S4) | no visible change: site-style-regression (`$313,000`, CLS 0, noindex, PF 307), site-shell, home-page, no-grok, personal-finance, pf-months, e2e, roles, audit |
| — | #71 dashboard (on hold) | ST5a deferred | n/a |

### ST0: tokens and the decision

| AC | Tier | Pass when (on the preview / live page) |
|----|------|------------------------------|
| ST0-01 | BLOCK | On every shipped page the page, bar and footer backgrounds compute to `#1e2124` and body text to `#f2f0eb`; no white surface remains on a shipped page (only the hero image itself is light). |
| ST0-02 | BLOCK | Shipped pages use only the section 5 tokens; the green `#5cc08a` appears only on the chart line, the chart fill and the last-value pill; the font is Schibsted Grotesk. |
| ST0-03 | BLOCK | Every text / token pair on a shipped page meets AA on dark (section 5 table: text ≥ 4.5:1, large text and non-text UI such as underlines, focus ring, chart line and pill ≥ 3:1); an axe-core run reports no `color-contrast` violation. |
| ST0-04 | BLOCK | Docs: the decision log records that white was proposed on 2026-10-05 and dropped at 21:26 ET, and that the #53 dark style stands and is extended; no doc says white supersedes dark. (#67) |
| ST0-05 | BLOCK | `/dashboard` content is untouched: only the bar and footer differ from `main`; holdings, chips, book, their styles and data render as before; released and visible; signed-out `/dashboard` still 307s to sign-in; no diff in `src/routes/dashboard.tsx`, `src/components/dashboard/*`, existing token values or `.field` / `.kicker` / `.section`; `qa/tools/dashboard-redesign.mjs --read-only` still passes. "Only the bar and footer differ" is checked by a screenshot compare of the main content (the dashboard's `bg-paper` wrapper, bar and footer hidden) **signed in** against the **base PR's preview** (the PR this one is stacked on; `main`'s preview for a PR on `main`) with the same QA account (`QA_EMAIL` / `QA_PASSWORD`): `qa/tools/site-shell.mjs --base-url <this preview> --compare-url <base PR preview>`, pixel-identical. Never against production: production has no sign-in for QA (EL N7, QA round 1 on #70). |

### ST1: bar and footer on every page (#68)

| AC | Tier | Pass when (on the preview / live page) |
|----|------|------------------------------|
| ST1-01 | BLOCK | On every page (`/`, `/calculator`, `/dashboard`, `/dashboard/sign-in`, a 404) one thin charcoal bar (height ≤ 48 px), sticky on scroll: `Orpheus` (with the lyre) left (→ `/`), `Calculator`, `Dashboard` and `Personal finance` right (→ `/calculator`, `/dashboard`, `/personal-finance`), in that order, text only (no icons), no other items, no dropdowns; at 360 and 400 px all four fit on one line with no horizontal page scroll (#97; Q21 decided: below 640 px 12 px text, right links 8 px apart; from 640 px 14 px, 24 px apart; the word `Orpheus` kept, no sideways scroll). On `/personal-finance` too. **#90: amended by ROLE-01 (a fifth item `Account`, the person glyph below 640 px; the one icon on the right; bar text 11 px through 399 px so all five fit on one line at 360, EL).** |
| ST1-02 | BLOCK | The current page's item has `aria-current="page"` and a visible mark (chalk and underline; the others dim): exactly one item on `/` (Orpheus), `/calculator`, `/dashboard` and `/dashboard/sign-in` (Dashboard), `/personal-finance` (Personal finance, #97); none on a 404. |
| ST1-03 | BLOCK | On every page the footer is charcoal and its only text is exactly `Orpheus Wisdom`. |
| ST1-04 | BLOCK | One bar component and one footer component serve every page (same markup on `/dashboard` as elsewhere); plain links, so every page reaches every other in one click and `/dashboard` stays server-gated. |
| ST1-05 | BLOCK | (#84) The lyre mark: on every page the bar's `Orpheus` link starts with the inline lyre SVG (20 × 20 px, chalk via `currentColor`, `aria-hidden`), the link text stays exactly `Orpheus`, the bar stays 45 px and the link ≥ 44 px tall; `/favicon.svg` is the lyre (no two-bar geometric mark left); the footer stays exactly `Orpheus Wisdom`. |

### ST3: home `/` (#69)

| AC | Tier | Pass when (on the preview / live page) |
|----|------|------------------------------|
| ST3-01 | BLOCK | Charcoal page in the dark shell; under the bar the Jordaens band (*Triumph of Frederick Henry, Prince of Orange*, 1652), `alt` naming it, no visible credit (Q5); source and licence recorded in the repo (`public/hero/home-SOURCE.md`); optimised (`srcset`, AVIF or WebP + JPEG; every file ≤ 300 KB and the largest file served at 1440 px on a 2x screen ≤ 300 KB), served from the app, explicit `width` and `height`. Layout shift measured as ST4-01 (`PerformanceObserver`, every entry counted, cold cache-disabled loads, several runs per width at 360, 400, 1024 and 1440): CLS from the hero = 0 and the page total = 0 (strict, since #72's self-hosted font) on every run. |
| ST3-02 | BLOCK | `01` (small) and the `h1` `Investment driven by research.` sit lower left on the soft wash in plain type (site font, normal weight, no all caps or effects, ≤ 48 px at 1440 and ≤ 32 px on a phone; sizes in section 8); chalk on the wash ≥ 4.5:1 at the worst pixel. At 360, 400, 1024 and 1440 the prince and the horses are not covered by the text or the wash (with its soft edge). Protected: the prince and the four white chariot horses (with the dark head behind the leftmost); the brown horse on the far right is outside the box and may be partly cropped on phones (EL, 2026-10-10): their region is the figure box per crop in `src/lib/site/home-hero.ts` through the crop and `object-position`, checked by geometry and by a screenshot with both boxes outlined. |
| ST3-03 | BLOCK | `02` `Platforms` follows with exactly the three lines of section 4 (#97; `Calculator` · `Dollar-cost average calculator.` · `Open` → `/calculator`; `Dashboard` · `The portfolio as a business.` (Q22 decided: the issue's wording, not the longer live sentence) · `Open` → `/dashboard`; `Personal finance` · `Income, expenses, and the cover.` · `Open` → `/personal-finance`): full-width rows, a thin rule above each, no boxes (no border box, background or shadow), the same pattern for all three; nothing else between the bar and the footer (no #46 line, no cards). |
| ST3-04 | BLOCK | Home does no calculating (no price requests, no calculator code) and `/?query` still redirects to `/calculator?query`; `noindex` meta and `X-Robots-Tag: noindex, nofollow` unchanged. |
| ST3-05 | BLOCK | The wash box fully contains the bounding boxes of `01` and the title (element and text-line rects) at 360, 400, 1024 and 1440; it hugs the text, anchored lower left (≤ 12 px of padding a side on a phone, ≤ 24 px wide), and takes at most 50% of the band's height at 360 and 400 (as ST4-15). |
| ST3-06 | BLOCK | Phone (360 and 400; phone rules below 1024 px): the phone crop in its band, `min(66.667vw, 480px)`: 240 px at 360, 267 px at 400 (Q17; the ≤ 200 px cap is calculator-only), the title three lines, the Platforms lines one column (name and `Open` on a row, the description under them), every text whole, no horizontal page scroll; the bar's four items on one line (ST1-01). Wide (1024, 1440): the wide crop, each Platforms line one row. |
| ST3-07 | BLOCK | AA on dark for every text on `/` (`01`, title, `02`, `Platforms`, names, descriptions, `Open`; the focus ring ≥ 3:1); an axe-core run reports no `color-contrast` violation; `color-scheme: dark` on `<html>` and `<body>`. |

### ST4: calculator `/calculator` (#70)

| AC | Tier | Pass when (on the preview / live page) |
|----|------|------------------------------|
| ST4-01 | BLOCK | Charcoal page in the dark shell; under the bar the Botticelli band (*The Birth of Venus*), `alt` naming it; source and licence recorded in the repo; optimised (`srcset`, AVIF or WebP + JPEG; the largest file served at 1440 px on a 2x screen ≤ 300 KB), served from the app, explicit `width` and `height`. Layout shift (EL, QA round 1 on #70): measured with a `PerformanceObserver` (`layout-shift`, buffered) on load, **every entry counted** (no `hadRecentInput` exclusion), on cold loads with the cache disabled, several runs per width at 360, 400, 1024 and 1440: CLS from the hero (entries with a source inside the band) = 0, and the page total = 0 (strict) on every run (#72: self-hosted font, Q16). |
| ST4-02 | BLOCK | `01` (small) and the `h1` `Dollar-cost average calculator.` sit lower left on the soft wash, in plain type (site font, normal weight, no all caps or effects, ≤ 48 px at 1440 and ≤ 32 px on a phone; `01` 12 px; sizes in section 7); chalk on the wash ≥ 4.5:1 at the worst pixel. |
| ST4-03 | BLOCK | The fields (tickers with weights, start, end, starting capital, contribution, weekly or monthly) are borderless with a thin underline only (no box border, fill or radius; a 1 px rule `#8b9298` underline, 5.1:1), with visible labels and a visible focus ring (2 px solid chalk, offset 2 px). The select and its `<option>`s carry charcoal `#1e2124` with chalk text (≥ 4.5:1; the page's own colour, so still no visible fill), so the list Chrome opens is dark and readable; `color-scheme: dark` on `<html>` (and `<body>`), so date pickers are dark too (QA round 1, D2). |
| ST4-04 | BLOCK | `US, EU and CA listings, one currency per basket.` (wording unchanged) is one line at 13 px in dim (no wrap at 360 or 400 px, nothing clipped) directly under the form; no other note there (Q2, A11). |
| ST4-05 | BLOCK | One chart with one series (the DCA portfolio value): a green line (2 px), a soft green fill (green at 16%) and the last value in a small green pill (22 px tall, night text on green, same money format as the results); no second chart and no chart note. |
| ST4-06 | BLOCK | (#78) Results are two plan columns, `Lump sum` and `DCA`, each with **exactly four lines** in this order, labels word for word: `Final value` (end value), `Total invested`, `Return (%)` (total return), `CAGR (%)` (the existing CAGR); no money-weighted return, max drop, value at the drop or return to the drop shown; no boxes, no borders around them, no `<table>` (Q12); the regression case shows DCA `Total invested` `$313,000` and each value equals the engine's figure in the results' money / percent format (display only). |
| ST4-07 | BLOCK | No instruction text: the intro paragraph, the swipe hint and the chart scale note are gone (Q2, Q12). |
| ST4-08 | BLOCK | Phone (360 and 400; phone rules below 1024 px): the fields stack, one under another (wide: ST4-18); the field rows span the full width, a basket row's ticker above its weight with the remove control beside the ticker (Q15, A2); the listings note is still one line under the form. |
| ST4-09 | BLOCK | Phone (360 and 400): the chart is full width (the content column's full width, same edges as the fields), with the green line, the soft fill and the pill unclipped. |
| ST4-10 | BLOCK | Results columns (EL A1 / A9; #78): `Lump sum` and `DCA` side by side while each column is ≥ 150 px wide, stacked (Lump sum above DCA) otherwise; expected and checked: two columns at 360 and 400 (and wide). In each column the four lines in order; on a phone each label above its value, from 1024 px label and value on one row; every value whole on one line (`nowrap`), inside its column, nothing clipped, no horizontal scroll. |
| ST4-11 | BLOCK | Phone (360 and 400): the painting is a short band (≤ 200 px tall), with `01` and the title lower left on the wash and Venus visible. |
| ST4-12 | BLOCK | Phone otherwise the same as wide: dark page, Botticelli hero, borderless underlines, green line, fill and pill, label-value results (ST4-01..07 hold at 360 and 400); the wide page (1024, 1440) as ST4-18; no horizontal page scroll at 360, 400, 1024 or 1440. |
| ST4-13 | BLOCK | Logic untouched: `qa/tools/site.mjs` passes (`$313,000`; VOD.L 400 with the exact message, read from under the VOD.L ticker field since #78; it may only change how it finds the value); DCA-01..06 pass; no diff in `src/lib/dca/*` or `src/routes/api/chart.ts`. |
| ST4-14 | BLOCK | (EL A3) At 360, 400, 1024 and 1440 the `01` / title block and its wash (with its soft edge) don't overlap Venus; her region is defined by the crop and `object-position` (the figure box per crop in `src/lib/site/hero.ts`); checked by geometry and by a screenshot with both boxes outlined. |
| ST4-15 | BLOCK | (EL A4) The wash box fully contains the bounding boxes of `01` and the title (element and text-line rects), checked by bounding rect plus screenshot, at 360, 400, 1024 and 1440. (EL N4, QA round 1) The wash hugs the text, anchored lower left (≤ 12 px of padding a side on a phone, ≤ 24 px wide), and takes at most 50% of the band's height at 360 and 400. |
| ST4-16 | BLOCK | (Q6) The primary button `Compare plans` is a chalk fill with night text (14.2:1), radius 0, the section 7 size, a chalk focus ring; while reading prices a dim fill with night text (7.2:1); not green. |
| ST4-17 | BLOCK | (#78) Field checks before the calculation, at 360 and 1440: each case's message (section 4 copy, word for word) sits directly under its field in `#ff8f87` 13 px, the field `aria-invalid` and described by it; every bad field marked at once; no field cleared (each keeps what was typed). Cases: empty basket → `Add a ticker.`; a ticker without a weight → `Enter a weight above 0.`; the same ticker twice → `<T> is already in the basket.` under the second; start or end blank → `Add a start date.` / `Add an end date.`; end on or before start → `End must be after the start.`; starting capital or contribution as text, negative, 0 or blank → `Enter a number above 0.` (decision A: above zero, the engine refuses 0); frequency blank → `Choose weekly or monthly.`; none of these sends a price request. After the prices: VOD.L → `VOD.L lists on LSE. US, EU, and CA listings only.` under VOD.L (HTTP 400); a basket mixing currencies → `<T> trades in <CUR>; this basket is in <CUR>. One currency per basket.` under the other ticker; no result shown. A valid run afterwards shows no field message. |
| ST4-18 | BLOCK | (#78) Wide (1024 and 1440): one column; the basket's ticker / weight / remove rows stacked (≤ 26rem wide); Start, End, Starting capital, Contribution and Frequency in **one row** (same top, left to right), `Compare plans` under them; the listings note one line under the form; the result (chart, then the two plan columns) below the form at full width (same left and right edges as the window row). |
| ST4-19 | BLOCK | (#80) `Saved searches` is a button (`aria-expanded`, `aria-controls`), the form's first control, above `02` Basket and the first Ticker, in the site font with the chalk focus ring; **always visible**, even with nothing saved (EL, Q20); **closed by default** on every load (the panel not rendered or hidden); it opens and closes the panel; at 360, 400, 1024 and 1440. |
| ST4-20 | BLOCK | (#80) Open: newest first, at most 5 lines, each exactly `<TICKERS> · <start> – <end> · DCA <amount>` (section 4) with the search's own contribution (EL, Q19; no `weekly` / `monthly` on the line), then `Load`; each line underlined by a 1 px `#8b9298` rule across the form's full width; empty: `No saved searches yet.` `Load` fills every field (basket rows, tickers, weights, start, end, starting capital, contribution, frequency) word for word as typed for that search (`1,000` stays `1,000`; EL, D1 follow-up), clears field marks and any result, closes the panel, sends no request. No other save control anywhere on the page. |
| ST4-21 | BLOCK | (#80) Saved automatically by a successful calculation only (a field-check or listing refusal saves nothing); the same search again moves to the top (no duplicate line; QA D1 on #81: repeats match on the standard form, tickers trimmed and upper-cased, weights and amounts with commas dropped and read as numbers, so `1,000` and `1000`, `ko` and `KO` are the same search; the list keeps one line, the newest as typed); six different searches leave the newest 5 (the oldest dropped); the `$313,000` regression case still reads `$313,000` and is saved like any search. |
| ST4-22 | BLOCK | (#80) Refresh on the same browser: the fields hold the last search, the list (closed) holds the same ≤ 5 lines; no result until `Compare plans`; calculating keeps the search in the fields. The restore moves nothing in the hero (hero CLS 0); the page shift from extra basket rows is measured and reported and stays under 0.1 (EL, Q18: accepted; the form is not hidden until the restore, the restore is not tap-only). |
| ST4-23 | BLOCK | (#80) No auth, this browser only: signed out with no account, no request to `/api/auth/*` or `/api/dashboard/*` while saving, loading or restoring (only `GET /api/chart` on a calculation); exactly two `localStorage` keys, `orpheus.calculator.last.v1` and `orpheus.calculator.saved.v1`; no cookie set, nothing in `sessionStorage` or IndexedDB from the calculator; the analytics rules unchanged. |
| ST4-24 | BLOCK | (#80) Isolation and clearing: a second browser context (another device) on the same preview sees no list and blank fields; clearing the site's data (`localStorage` cleared, e.g. DevTools "Clear site data" / `Storage.clearDataForOrigin`) and reloading shows `No saved searches yet.` and blank fields. |

### ST5a: dashboard content (#71): ON HOLD, deferred

| AC | Tier | Pass when (on the preview / live page) |
|----|------|------------------------------|
| ST5a-01 | DEFERRED | *(deferred)* Rewritten from the dashboard's new brief when it lands (via CoS). Not checked in this epic; until then ST0-05 applies. |

### ST5b: sign-in `/dashboard/sign-in` (#73)

| AC | Tier | Pass when (on the preview / live page) |
|----|------|------------------------------|
| ST5b-01 | BLOCK | Dark: charcoal page, chalk type, underline fields (as ST4-03) using sign-in-only classes; `.field` and `.kicker` unchanged. |
| ST5b-02 | BLOCK | The page shows exactly `Email`, `Password`, the submit button and the `Create an account` link, plus the heading (Q4) and an error line only after a failed attempt; the invite-only note is gone. Create-account mode mirrors it with a `Sign in` link. **#90: amended by ROLE-09 (no `Create an account` link and no create-account mode).** |
| ST5b-03 | BLOCK | The auth logic is unchanged: sign-in, sign-up (allow-list), the redirect to `/dashboard`, the signed-out matrix in `scripts/release-smoke.mjs`. |
| ST5b-04 | BLOCK | AA on dark at 360, 400, 1024 and 1440: every visible text ≥ 4.5:1 (labels `dim` 7.2:1, submit night on chalk 14.2:1, the error `#ff8f87` 7.3:1); the field underline (`rule`, 5.1:1) and the chalk focus ring ≥ 3:1; `color-scheme: dark` on `<html>` and `<body>`; an autofilled field stays charcoal with chalk text. |
| ST5b-05 | BLOCK | Layout and page rules at 360, 400, 1024 and 1440: no horizontal scroll; fields, submit and link ≥ 44 px tall, the fields the column's full width; title `Sign in · Orpheus Wisdom`, noindex meta and `X-Robots-Tag` unchanged; the shell holds (ST1); no painting or CSS background image. |

### ST6: leave-outs, contrast and regression (#72, shipped pages)

| AC | Tier | Pass when (on the preview / live page) |
|----|------|------------------------------|
| ST6-01 | BLOCK | No painting except the Jordaens on home and the Botticelli on the calculator (no artwork `img`, `picture` or CSS `background-image` on sign-in or elsewhere). |
| ST6-02 | BLOCK | No instruction text on the shipped pages: home only hero and Platforms; the calculator only hero, form, note, chart and results (Q2, Q12); sign-in only ST5b-02; the 404 only `Page not found.` |
| ST6-03 | BLOCK | AA on dark on every shipped page (and the 404) at every width, including focus, error and disabled-but-readable states (ST0-03). |
| ST6-04 | BLOCK | The shell holds everywhere: ST1 passes on `/`, `/calculator`, `/dashboard`, `/dashboard/sign-in` and a 404; ST0-05 passes. |
| ST6-05 | BLOCK | Regression on the preview, then production, at 400 / 1024 / 1440: every ST row except ST5a, DCA-01..06 (`$313,000`), noindex meta + `X-Robots-Tag` on every page, the analytics rules, `release-smoke.mjs`; `README.md`, `AGENTS.md`, this spec and the QA pack match the shipped site. Runner: `qa/tools/site-style-regression.mjs` (runs every shipped-page tool and the ST6 checks; `--compare-url` for ST0-05 signed in). The dashboard's full regression waits for its new brief. |
| ST6-06 | BLOCK | Self-hosted font (Q16): no request to `fonts.googleapis.com` / `fonts.gstatic.com` on any page; Schibsted Grotesk served from the app (`/fonts/schibsted-grotesk/`, licence and source in the repo), the upright latin file preloaded, `font-display: optional`; the page CLS is a strict 0 on `/`, `/calculator`, `/dashboard/sign-in` and a 404 at 360, 400, 1024 and 1440 on cold loads, every shift counted (EL: a slow first visit may keep the fallback for that view; never a swap that adds CLS). |
| ST6-07 | BLOCK | Punctuation: on the dark pages no text runs with `tnum` (the body sets `zero` only; no `tabular-nums` in the dark pages' classes), so `.` `,` `:` `;` take their normal widths (`research.`, `business:` with no gap); figures stay proportional, result values included (EL: no `tabular-nums` back on); `/dashboard` keeps `main`'s setting. |
| ST6-08 | BLOCK | Bar tap targets (QA N1 on #73): `Orpheus`, `Calculator` and `Dashboard` each ≥ 44 px tall (and ≥ 44 px wide) on every page at 360, 400, 1024 and 1440, the bar still ≤ 48 px (45 px), the text, underline and current mark where they were. |
| ST6-09 | BLOCK | The 404 is dark (charcoal, chalk, the shell's bar with no current item and footer), status 404, and shows only the `h1` `Page not found.` in the content column; the dashboard-off paths serve the same page. |

## Dashboard: mobile-first redesign (epic #53)

Source: epic #53 (architect's brief and acceptance, approved by Diego via Chief of Staff, 2026-10-04), written out
in [`attachments/dashboard-spec.md`](../attachments/dashboard-spec.md) section 0. That section is the source of
truth for tickets 2–6; these IDs are copied from its 0.7 and, if the two ever differ, the spec wins. Run every
row on the PR preview, then on production after the merge, at **phone 400 × 860** and **desktop 1440 × 900**.
Each ticket's PR runs DR0 plus its own block. Old DASH-00..26: kept or superseded per spec 0.8.

Unchanged from this pack: DCA-01..06 above (DCA-06 included: a missing 'Not a recommendation' disclaimer is
intended and is not a fail, on the dashboard too). Brief items in one line each: holdings list is the page
(name, shares, value in base currency, share of the book; tap for the rest; no helper paragraphs; empty state
`Add a holding`); add = ticker + shares, cost optional, blank cost saves, cost and return blank until a cost,
listing check US/EU/CA; metrics = second sheet on phone, right side on wide screens, search adds a chip, chips
remove themselves, rows show kept chips only, defaults Revenue growth 1y / ROIC (1y) / Share of the book,
missing figure `—`; book = one total under the list, donut of the same weights (largest first, Other past ten),
weighted figures for kept chips, dashes left out; leave out Connect broker, K/M/B, ownership toggle, download,
instructions under the table.

### DR0: Every ticket 2–6, both widths

| AC | Tier | Pass when (on the preview / live page) |
|----|------|------------------------------|
| DR0-01 | BLOCK | (From #68, epic #66: the menu and footer follow ST1 below; the dashboard content part of this row still holds.) Dark style unchanged: page, menu, footer and controls use the same colours and fonts as production before the ticket (computed background / text colours match; no light theme, no new accent colour). |
| DR0-02 | BLOCK | Dashboard released: production `/dashboard` signed out → 307 to `/dashboard/sign-in`; `/api/dashboard/status` → 200 `{"dashboard":"enabled"}`. The PR diff touches no env var, `DASHBOARD_ENABLED`, `flag.server.ts` or `vercel.json` env. |
| DR0-03 | BLOCK | Signed-out matrix unchanged: `node scripts/release-smoke.mjs <preview> preview` and `<production> on` pass every check. |
| DR0-04 | BLOCK | Calculator unchanged: `qa/tools/site.mjs` passes ($313,000 for PLTR 50 / TQQQ 50, 2020-10-02..2026-10-01, 1,000 + 1,000 weekly; VOD.L 400 with the exact message); DCA-01..06 pass. |
| DR0-05 | BLOCK | noindex: `robots` meta `noindex, nofollow` and `X-Robots-Tag: noindex, nofollow` on `/dashboard` and `/dashboard/sign-in`. |
| DR0-06 | BLOCK | Referrer and analytics as on `main`: one Analytics mount, page-view URLs without query or hash, no custom events, no other tracker requests; the `Referrer-Policy` header / meta equal `main`'s. |
| DR0-07 | BLOCK | No buy, sell, hold, rating, target, "undervalued" / "overvalued" or recommendation wording on `/dashboard` (signed in, both widths, with and without holdings); no "Not a recommendation" disclaimer (absence is intended, not a fail). |

### DR2: Ticket 2 (#55): holdings list

| AC | Tier | Pass when (on the preview / live page) |
|----|------|------------------------------|
| DR2-01 | BLOCK | At 400 px the holdings list is the page: after the heading and the add form come the list rows; no metrics table beside or inside the list; no horizontal page scroll (`document.documentElement.scrollWidth` ≤ 400). |
| DR2-02 | BLOCK | Each row shows exactly name, shares, value in base currency (full digits, two decimals, code) and share of the book (one decimal %); seed account: weights 24.1 / 54.2 / 21.7 and values match DASH-13. A price-pending row shows `—` for value and share. |
| DR2-03 | BLOCK | Tapping a row opens its detail with ticker, name, shares, average cost, last close + session date, value, cost, return (amount and %), share of the book and the FX line; closing returns to the list. Edit and Delete work from the detail (DASH-07 rules; one DELETE per click). |
| DR2-04 | BLOCK | No helper paragraphs: the "US, EU and CA listings only. Average cost is per share…" paragraph is gone and no other explanatory paragraph is on the page; the as-of line, the out-of-date note and errors are single lines. |
| DR2-05 | BLOCK | Empty state: an account with no holdings shows exactly one line, `Add a holding`, in the list area, and no headers, total or chart. |
| DR2-06 | BLOCK | Base currency select still re-expresses every value and the total (DASH-12) and the setting persists; the as-of line and out-of-date note behave as DASH-25. |
| DR2-07 | BLOCK | At 1440 px the same rows and detail work; the nine-column T07 table is gone. |

### DR3: Ticket 3 (#56): add holding

| AC | Tier | Pass when (on the preview / live page) |
|----|------|------------------------------|
| DR3-01 | BLOCK | The add form has exactly Ticker, Shares, Average cost marked optional, and Add; no help text or placeholder sentences. |
| DR3-02 | BLOCK | Ticker + shares with cost blank saves (API `POST` without `avgCost`, or with `null` / `""`, → 201 with no cost); the row appears and survives a reload. |
| DR3-03 | BLOCK | With no cost, the detail's cost and return are blank (not `0`, `n/m` or `—`); value and share of the book still show and the holding counts in the total and the donut. |
| DR3-04 | BLOCK | Entering a cost via Edit fills cost and return (values as DASH-13 / D8); clearing it blanks them again; cost 0 is accepted (return % `n/m`). |
| DR3-05 | BLOCK | Listing check unchanged: `VOD.L` → "VOD.L lists on LSE. US, EU, and CA listings only."; `TCS.BO` → the BSE message; KO, RY.TO, ASML.AS accepted; a second KO → 409. |
| DR3-06 | BLOCK | Validation: shares ≤ 0 or more than 6 decimals refused; a given cost < 0 or more than 6 decimals refused; other users' holdings unreachable (DASH-06). |

### DR4: Ticket 4 (#57): metrics sheet and chips

| AC | Tier | Pass when (on the preview / live page) |
|----|------|------------------------------|
| DR4-01 | BLOCK | At 400 px the metrics are a second sheet behind the `Holdings` / `Metrics` switch, never beside the list; switching back shows the list unchanged; no horizontal page scroll. |
| DR4-02 | BLOCK | At 1440 px the metrics sheet sits to the right of the list, both visible without switching. |
| DR4-03 | BLOCK | A user with no saved chips sees exactly `Revenue growth 1y`, `ROIC (1y)`, `Share of the book`, in that order. |
| DR4-04 | BLOCK | The search field: typing "gross" offers Gross margin (1y) (and no chip already kept); choosing it adds the chip at the end; it survives a reload. |
| DR4-05 | BLOCK | Each chip's own `×` removes it and its figures from every row (and the book once ticket 5 lands); the change survives a reload, including removing every chip. |
| DR4-06 | BLOCK | Each metrics row shows the holding's name and figures for the kept chips only, in chip order; values equal DASH-16..20 (e.g. KO revenue growth 1y 1.9%, ROIC 17.4%, EPS 3.04 USD, EBIT margin 28.7%, gross margin 61.6%). |
| DR4-07 | BLOCK | A missing figure (RY ROIC, a not-covered name such as MC.PA, a pending check) shows exactly `—`, with no visible reason text next to it. |

### DR5: Ticket 5 (#58): book

| AC | Tier | Pass when (on the preview / live page) |
|----|------|------------------------------|
| DR5-01 | BLOCK | Exactly one total under the list: the total value in base currency (seed account 4,141.21 CAD); no total cost or total return row; the excluded line shows only when a holding has no price or FX rate. |
| DR5-02 | BLOCK | A donut (ring with a hole) of the rows' share of the book: same labels as the rows, largest first, ties by ticker; with 11+ valued holdings the 10 largest plus `Other`; neutral greys; the ticker + % list is present as text. |
| DR5-03 | BLOCK | The metrics sheet's `Book` row shows, for each kept chip, the weighted figure from section 9: DASH-22 set EBIT margin `27.6% · 71% covered`; the EPS chip shows `26.5%` labelled `EPS growth 1y (weighted)`; adding or removing a chip adds or removes its book figure. |
| DR5-04 | BLOCK | Dashes are left out: a holding with `—` for a chip is excluded from that chip's figure (not counted as 0) and counts against coverage; a chip nobody has a figure for shows `—`. |
| DR5-05 | BLOCK | The `Share of the book` chip's book figure is the sum of the valued weights (100.0% ± rounding). |

### DR6: Ticket 6 (#59): leave-outs and regression

| AC | Tier | Pass when (on the preview / live page) |
|----|------|------------------------------|
| DR6-01 | BLOCK | No "Connect broker" and no broker link or button anywhere on `/dashboard`, both widths. |
| DR6-02 | BLOCK | No K/M/B: every amount on `/dashboard` shows full digits with thousands separators (no `K`, `M` or `B` suffix on any amount). |
| DR6-03 | BLOCK | No ownership toggle (no switch or toggle about ownership or % owned). |
| DR6-04 | BLOCK | No download: no download / export / CSV button or link. |
| DR6-05 | BLOCK | No instructions under (or above) the list; DR2-04 still holds. Tests in `npm test` keep DR6-01..05 true. |
| DR6-06 | BLOCK | Regression: DR0, DR2..DR5 and every kept DASH ID pass in one run on the preview at both widths, then on production after the merge; `README.md`, `AGENTS.md` and this spec match the shipped page. |

How to run DR6 (#59): `QA_EMAIL=… QA_PASSWORD=… node qa/tools/dashboard-redesign.mjs --base-url <preview> --out <dir> --smoke preview`
(add `--empty` with `QA_EMPTY_EMAIL` / `QA_EMPTY_PASSWORD` for an account with no holdings; `--read-only` on
production skips the add / chip-save tools). It runs at 400, 1024 and 1440 px; DR6-02 also covers shares,
average cost and last close (spec 0.5 item 20).

## Personal Finance (#84 v1.1, #85 v1.2 income, #86 v1.3 equity cover; spec `attachments/personal-finance-spec.md`)

EL decisions (2026-10-11, ≈ 12:05 ET): reached by URL only (no bar item, no home line), amounts unitless until #87,
a typed `Equity to cover` overrides #86's calculated amount, Grok builder assets (`__grok/icon-180.png`) out of scope.
Business user: the CFO. QA at 360 × 780, 400 × 860, 1024 × 800, 1440 × 900 on `/personal-finance` with
`qa/tools/personal-finance.mjs`; the no-regression pass on the shipped pages with `qa/tools/site-style-regression.mjs`
(ST1-05 lyre on every page included). #85 income, #86 equity cover and #87 foreign currency add their rows here.
#86 (EL option A, ≈ 13:57 ET): rate used = the typed withdrawal rate, else portfolio ROIC ÷ 2 (a typed rate never
halved); calculated Equity to cover = yearly expense ÷ (rate ÷ 100); a typed Equity to cover overrides (Q3
implemented); key `orpheus.finance.equity.v1`. EL (≈ 14:12 ET): Q9 a bad override falls back to the
calculated amount; Q10 no usable rate → `—` for a line without a valid override and for any total containing it; Q11
ROIC may exceed 100 (withdrawal rate 0–100).

| AC | Tier | Pass when (on the preview / live page) |
|----|------|------------------------------|
| PF-01 | BLOCK | (#102: signed in; signed out → PF-33) `/personal-finance` renders in the shared dark shell: charcoal page, chalk type, `color-scheme: dark`, the bar (#97: four items, `Personal finance` current; ST1-01 / ST1-02) and footer `Orpheus Wisdom`; title `Personal finance · Orpheus Wisdom`; noindex meta + `X-Robots-Tag`; one Analytics script; no painting; status 200; signed out, no flag. |
| PF-02 | BLOCK | Exact copy (sections 4 and 12): `01`, `Personal finance.`, `02`, `Income` with its copy (section 12), `03`, `Expenses`, (#94) `04` `Overview` and `05` `Update` with their copy (section 15), (v1.3) `Withdrawal rate (%)`, `Portfolio ROIC (%)`, `Rate used` `—` (section 13), (v1.4) `Household currency` `CAD` (Q13), `Fixed`, `Variable`, the nine column labels in order (v1.4: `Currency`, `FX rate` after `Yearly`), `↳ Add expense` per group, the totals rows; no other text (no instruction text). |
| PF-03 | BLOCK | Lines: add and remove lines in each group; Name, Monthly, Yearly and Equity to cover are inputs with visible labels; typing Monthly fills Yearly × 12 and typing Yearly fills Monthly ÷ 12; the typed value stays as typed; a bad amount shows `Enter a number, 0 or more.` under its field and counts as 0. |
| PF-04 | BLOCK | Percentages: `% of expenses` per line and per group = monthly ÷ the monthly total of both groups (one decimal, `—` at 0), `Total` `100.0%`; `% of income` per line, group and `Total` = monthly ÷ the monthly counted net income (section 12; one decimal), `—` while that income is 0 (v1.2: e.g. the section 12 example's 11,200 a month: Fixed 1,000 → `8.9%`, 250 → `2.2%`, Fixed total `11.2%`, Variable 100 → `0.9%`, Total `12.1%`). |
| PF-05 | BLOCK | Totals: `Fixed total`, `Variable total` and `Total` sum Monthly, Yearly and Equity to cover exactly (e.g. Fixed 1,000 + 250 monthly and Variable 1,200 yearly → Fixed 1,250 / 15,000, Variable 100 / 1,200, Total 1,350 / 16,200); v1.3: Equity to cover sums each line's valid override or calculated amount, `—` when any line contributes `—` (PF-19). |
| PF-06 | BLOCK | Account: a dropdown per line with `—`, the accounts and `Add account…`; adding one (inline `New account`, `Add`) selects it on that line and offers it on every line in both groups; an empty name shows `Name the account.`; a repeat name (any case) reuses the existing account. |
| PF-07 | BLOCK | (#102: from the account, PF-36) Storage: everything typed survives a reload (lines, typed amounts as typed, accounts, selections) from `localStorage` keys `orpheus.finance.expenses.v1`, (v1.2) `orpheus.finance.income.v1` and (v1.3) `orpheus.finance.equity.v1`, (v1.4) `orpheus.finance.currency.v1` and (#94) `orpheus.finance.overview.v1` only; no `/api/*` request, no cookie, no `sessionStorage` / IndexedDB write; a new browser context starts empty; a malformed stored value shows an empty page without an error. |
| PF-08 | BLOCK | Layout: phone (360, 400) lines stacked with labels, no horizontal page scroll; wide (1024, 1440) one row per line in column order with the column labels; every control ≥ 44 px tall; AA for every visible text (axe-core too), a ≥ 3:1 focus mark on every Tab stop; proportional figures (no `tnum`). |
| PF-09 | BLOCK | Strict page CLS 0 on cold loads at every width, every shift counted, both empty and with stored lines (v1.2: and people; v1.3: and rates) restored. |
| PF-10 | BLOCK | Logic and shell untouched elsewhere: the calculator `$313,000`, the dashboard content (ST0-05; no diff under `src/components/dashboard/*`, `src/routes/dashboard.tsx`), sign-in, home (hero + three lines since #97, ST3-03), the bar's four items since #97 (ST1-01), the lyre (ST1-05) and the site-style regression (`qa/tools/site-style-regression.mjs`) pass. |
| PF-11 | BLOCK | (#85) Income copy (section 12.1): `02` `Income`, the person column labels in order, `↳ Add person`, `Remove person`, `Income table` with `Income`, `Biweekly`, `Monthly`, `Yearly`, the line labels `<name> · Wages` / `<name> · Bonus` (`Person <n>` while unnamed) and `Net income`; nothing else. A new page: no people, the table only its `Net income` row at `0`. |
| PF-12 | BLOCK | (#85) People: add and remove; Name, Wages (yearly), Bonus rating (%), Average tax (%) and Share (%) are inputs with accessible labels, Count wages / Count bonus checkboxes (on by default; Share `100` by default); typed values stay as typed; a bad Wages or Bonus rating shows `Enter a number, 0 or more.`, a bad Average tax or Share `Enter a percent from 0 to 100.`, and counts as 0. |
| PF-13 | BLOCK | (#85) Net: each person's `Net (yearly)` = (wages + wages × bonus rating) × (1 − average tax) (e.g. 120,000, 10%, 30% → `92,400`; 80,000, 5%, 25% → `63,000`), shown whatever is counted. |
| PF-14 | BLOCK | (#85) Counted and share: each income line counts its net × the person's share when its box is ticked, 0 when not; the section 12 example (own bonus excluded, spouse at 80%) gives the table `84,000` / `0` / `48,000` / `2,400` yearly and `Net income` `134,400` yearly, `11,200` monthly, `5,169.23` biweekly. |
| PF-15 | BLOCK | (#85; #105 PF-42: only counted, non-zero lines) Income table: one row per person per line (Wages, then Bonus) in people order, Biweekly = yearly ÷ 26, Monthly = yearly ÷ 12, Yearly; `Net income` sums them; up to two decimals, no currency symbol (Q2). |
| PF-16 | BLOCK | (#85) `% of income` wired: changing a share, a box, a tax or wages updates every expense line's and total's `% of income` at once (PF-04); with no counted income they show `—`; income survives a reload from `orpheus.finance.income.v1` (malformed → no people, no error); layout, AA, 44 px controls (checkbox rows included) and CLS as PF-08 / PF-09. |
| PF-17 | BLOCK | (#86) Equity cover copy and inputs (section 13): under `03` `Expenses`, before `Fixed`: `Withdrawal rate (%)` and `Portfolio ROIC (%)` (inputs, visible labels, empty on a new page) and `Rate used` (computed: `—` on a new page); typed values stay as typed; a bad or out-of-range withdrawal rate shows `Enter a percent from 0 to 100.`, a bad or negative ROIC `Enter a number, 0 or more.` (alert, `aria-invalid`; Q11: ROIC above 100 is valid, e.g. `150` → `Rate used` `75%`); an invalid rate is no rate (`—`). |
| PF-18 | BLOCK | (#86) Formula A: rate used = the typed withdrawal rate, else ROIC ÷ 2; a typed withdrawal rate is used as typed (never halved) and wins when both are typed; calculated `Equity to cover` = the line's yearly amount ÷ (rate ÷ 100); e.g. ROIC `8` → `Rate used` `4%`, Rent 1,000 a month → `300,000`, Phone 250 a month → `75,000`, Gifts 1,200 a year → `30,000`; then withdrawal rate `5` → `5%`, `240,000` / `60,000` / `24,000`; neither typed, or a rate of 0 → `—`. |
| PF-19 | BLOCK | (#86, Q3 implemented) Override: an empty `Equity to cover` shows the calculated amount as the field's placeholder (dim, AA) and uses it; a valid typed value replaces it on that line only (stored as typed); a bad one shows `Enter a number, 0 or more.` and the line falls back to the calculated amount (Q9; e.g. ROIC 8, Rent `abc` → Fixed `375,000`); clearing it brings the calculated amount back; totals sum each line's valid override or calculated amount (e.g. ROIC 8, Rent override `250,000`: Fixed `325,000`, Variable `30,000`, Total `355,000`); with no usable rate a line without a valid override contributes `—` and so does its total and `Total` (Q10; e.g. no rate, Rent `250,000`, Phone and Gifts empty → `—` / `—` / `—`; every line overridden → the sum); a v1.1 / v1.2 stored line with a typed amount restores as an override. |
| PF-20 | BLOCK | (#86) The rates survive a reload from `orpheus.finance.equity.v1` (malformed → both empty, no error); changing either rate updates every line's placeholder and every total at once; layout (phone: the two fields stacked full width, then `Rate used`; wide: one row of three), 44 px controls, AA, focus ring and CLS as PF-08 / PF-09. |
| PF-21 | BLOCK | (#87) Currency copy and inputs (section 14.1): `Household currency` (a select, visible label, `CAD` on a new page (Q13), the ten codes in order) above `02` `Income`; each line's `Currency` (the household code first, then the other nine) and `FX rate`: `—` on a household line, an input with its visible label on a foreign line; column labels `Currency`, `FX rate` after `Yearly` (wide); no other text. |
| PF-22 | BLOCK | (#87) Conversion (Q12): a foreign line's household amount = its amount × `FX rate`; household `CAD`, Rent 1,000 / Phone 250 a month and `Condo` 2,000 a month in `BRL` at `0.2` (Fixed), Gifts 1,200 a year (Variable): the Condo fields stay `2,000` / `24,000` (its own currency) while Fixed total `1,650` / `19,800`, Variable `100` / `1,200`, Total `1,750` / `21,000`; Condo `% of expenses` `22.9%`; with the section 12 example's income (11,200 a month) Condo `% of income` `3.6%`, Fixed total `14.7%`, Total `15.6%`. |
| PF-23 | BLOCK | (#87) Equity cover on a foreign line uses the household yearly amount: ROIC `8` (rate 4%) → Condo placeholder `120,000` (4,800 ÷ 0.04), Fixed total `495,000`, Variable `30,000`, Total `525,000`; a typed override is in the household currency as typed (Condo `100,000` → Fixed `475,000`); the formulas of sections 12 and 13 are unchanged. |
| PF-24 | BLOCK | (#87, Q14 decided) A foreign line with an empty, bad (`abc`, `-1`) or `0` rate shows `Enter a number above 0.` under `FX rate` (alert, `aria-invalid`) and contributes `—` (not 0) until fixed: its `% of expenses`, `% of income` and calculated `Equity to cover` (placeholder) show `—`, and so do its group's and `Total`'s Monthly, Yearly, `% of income` and Equity to cover, and every `% of expenses` (the whole is `—`); its own `Monthly` / `Yearly` still show the typed amount (e.g. Condo 2,000 BRL, no rate, ROIC 8: Fixed and Total all `—`, Variable `100` / `1,200` / `30,000`, Rent `% of income` `8.9%`); a valid override on it still counts; switching the line back to the household currency (or making the household currency the line's) drops the rate from the sums (× 1) and keeps it stored. |
| PF-25 | BLOCK | (#87) Storage: the household currency survives a reload from `orpheus.finance.currency.v1` (malformed or unknown code → `CAD`, Q13; no error); each line's `currency` / `rate` from `orpheus.finance.expenses.v1`; a v1.1–v1.3 stored line (no `currency` / `rate`) restores as a household line with its figures unchanged; layout (phone: `Currency` \| `FX rate` under `Monthly` \| `Yearly`; wide: one row, nine columns + remove, no horizontal scroll at 1024), 44 px controls, AA, focus ring and CLS as PF-08 / PF-09 (with a stored foreign line and household currency restored). |
| PF-26 | BLOCK | (#94) Overview / Update copy (section 15.1): `04` `Overview` with the table (`This month`, `12-month average`; `Expenses`, `Income`, `Surplus`; `—` on a new page), `Starting net assets`, `Growth rate (%)`, the `Future` toggle (off; `1 year`, `5 years`, `10 years`, `15 years` only while on), the chart's legend `Expenses`, `Income`, `Net assets`; `05` `Update` with `Month` (12 choices, the current month first, e.g. `October 2026` … `November 2025`), `Expenses`, `Income`; nothing else visible. |
| PF-27 | BLOCK | (#94, Q17 / Q18) This month and the average: with nothing typed and an empty page every figure is `—`; the current month takes the page's `Total` Monthly and `Net income` Monthly when above 0; typing a past month (`June 2026`: Expenses `4,000`, Income `9,000`) updates the 12-month average at once (the mean of the months with a figure: e.g. page 1,750 / 11,200 this month + June → average `2,875` / `10,100`, surplus `9,450` this month, `7,225` average); a typed current month replaces the page figure; clearing a month's fields empties it. |
| PF-28 | BLOCK | (#94) Update: `Month` lists exactly the last 12 months, newest first, current included; choosing a month shows its typed values (empty fields: placeholder = the page figure for the current month, the average for a past one; dim, AA); a bad value shows `Enter a number, 0 or more.` and is not used. |
| PF-29 | BLOCK | (#94) Chart: three lines (Expenses, Income, Net assets) over the 12 months (oldest → current); an empty month plots the average; net assets start at `Starting net assets` and add each month's surplus (Q19; the 15.2 example: start `10,000` → **96,700** at the current month); the plot `aria-hidden`, the legend visible; the figure carries `data-months` (points plotted) and `data-net-last` (the last net assets, 2 decimals) for QA. |
| PF-30 | BLOCK | (#94, Q20 / Q21) Future: the toggle (`aria-pressed`) shows `1 year` … `15 years` (default `1 year`); on, the chart runs 12 × years months past the current one with Expenses and Income flat at the 12-month average and net assets compounding monthly at (1 + `Growth rate (%)` ÷ 100)^(1/12) plus the average surplus (the 15.2 example: growth `5`: 1 year → 24 points, net assets **190,204.37**; 5 years → 72 points, **613,370.68**); off, the chart ends at the current month. A bad growth rate shows `Enter a number, 0 or more.` and counts as 0. |
| PF-31 | BLOCK | (#94) Storage: everything typed in `04` / `05` (starting net assets, growth, Future on / years, each month's expenses / income as typed) survives a reload from `orpheus.finance.overview.v1` only (malformed → all empty, Future off, no error; months outside the last 12 are kept but unused); the other four keys unchanged. |
| PF-32 | BLOCK | (#94) Layout and the shell: phone (360, 400): the table three columns, the fields and the Update fields stacked full width, the year choices wrap, the chart full width (240 px tall); from 640 px the fields in one row (≤ 16rem each); from 1024 px the chart 320 px tall; every control ≥ 44 px, chalk focus ring, AA (axe), no horizontal scroll, strict CLS 0 (empty and restored with months typed and Future on); no gold. |
| PF-33 | BLOCK | (#102) Signed out: `GET /personal-finance` → **307** to `/dashboard/sign-in?next=/personal-finance` (noindex), no Personal Finance data or copy in the response; the browser lands on the sign-in page (dark shell; the bar marks `Dashboard` current, as on every sign-in page); `GET` / `PUT` / `DELETE /api/personal-finance` → **401** JSON; a bad method → 405 JSON; with `DASHBOARD_ENABLED` off → 404 JSON (like `/api/auth/*`). |
| PF-34 | BLOCK | (#102; QA D1) Signing in from `?next=/personal-finance` returns to `/personal-finance`. `next` is an allowlist of exactly one value, the relative same-origin path `/personal-finance` (exact: no query, fragment, trailing slash or case change); every other value (an external URL such as `https://evil.example`, protocol-relative `//evil.example`, any other path such as `/calculator`, empty or missing) is dropped on load (it never appears in the URL, the page or a redirect) and the visitor goes to `/dashboard`, both on load and after sign-in / sign-up; signed in, `/dashboard/sign-in?next=/personal-finance` redirects straight there; the page renders as PF-01..32 with the bar's `Personal finance` current. **#90: amended by ROLE-02 (`next` allows exactly `/personal-finance` and `/account`).** |
| PF-35 | BLOCK | (#102) Rate direction: every FX rate = foreign units per 1 household unit; household amount = amount ÷ rate. #87 example with rate `5` (5 BRL per 1 CAD): Condo 2,000 BRL → 400 (Fixed 1,650 / 19,800, Total 1,750 / 21,000); the expense FX field's accessible name `FX rate (BRL per 1 CAD)`; no valid rate → `Enter a number above 0.` and `—` (Q14 unchanged). |
| PF-36 | BLOCK | (#102) Account persistence: every change (lines, people, rates, months, Foreign boxes, household currency) is saved to `/api/personal-finance` (`PUT`, the whole record) and a reload restores it from the account; nothing PF stays in `localStorage`; a **second browser context signed in to the same account** (another device) loads the same figures; another account sees its own (empty) record; `?userId=` naming anyone else → 403. A failed save shows `Not saved.` **#90: another account with no grant gets 403 (ROLE-12), not its own record; grantees see the owner's record.** |
| PF-37 | BLOCK | (#102) Foreign income: a person's `Foreign` box (off by default); ticked: `Currency` (nine codes, not the household's), `FX rate (BRL per 1 CAD)`, `Converted (yearly)`. Example: `Brazilian Dividends`, Wages 37,000, tax 0, `Foreign` BRL `3.70` → Net 37,000, Converted **10,000**; with the section 12 people the table's lines and `Net income` use 10,000 for it; % of income and the Overview's income follow; no valid rate → the check, Converted `—`, `Net income` `—`, `% of income` `—`. Unticking keeps the typed currency and rate stored. |
| PF-38 | BLOCK | (#102) Migration: an old browser record (localStorage v1 keys; Condo BRL at the old `0.2`) is imported into an empty account on the first signed-in visit with the rate inverted to `5` (Condo still 400), saved as `orpheus.finance.expenses.v2`, and the old keys are removed from the browser; an account that already has a record ignores the browser's values. |
| PF-39 | BLOCK | (#102) Layout and the shell with a foreign person: phone the `Foreign` box on its own row under `Count wages` | `Count bonus`, the three foreign cells stacked under it (one row from 640 px), `Net (yearly)` last; wide the box as the last person column and the three cells in a row under the person; 44 px controls, chalk focus ring, AA, axe, no horizontal scroll, strict CLS 0 signed in (empty and restored from the account), no gold. |
| PF-40 | BLOCK | (#105) Section toggles: the `02` `Income`, `03` `Expenses` and `04` `Overview` (the brief's "Charts": the table, `Starting net assets` / `Growth rate (%)`, `Future` and the chart) headings are each a button (`aria-expanded`, `aria-controls`, the heading text unchanged, a chevron `aria-hidden`); a click / Enter / Space collapses the section's body (only the numeral and heading stay) and expands it again; open by default; the household currency, `01` and `05` `Update` are not collapsible; 44 px tap target, chalk focus ring. |
| PF-41 | BLOCK | (#105) Toggle state survives a refresh: stored against the **account** in `orpheus.finance.view.v1` (`{"closed":["income"|"expenses"|"overview"]}`; malformed → all open); a reload and a second signed-in device show the same sections closed; nothing PF in `localStorage`; strict CLS 0 on a cold load with a section restored closed; closing a section changes no figure. |
| PF-42 | BLOCK | (#105) Hide empty income lines: the income table lists a person's `Wages` / `Bonus` line only when it is counted (`Count wages` / `Count bonus` ticked) **and** its yearly amount is not 0; no row reads 0 (a counted foreign line without a valid rate still shows `—`); `Net income` always shows and is unchanged. Amends PF-15. |
| PF-43 | BLOCK | (#105) Clearer Update: `05` `Update` shows one button `Update month` (`aria-expanded`); it opens a panel with `Month` (the last 12 months, newest first, default this month), `Expenses`, `Income` (the stored figures for that month; placeholders as #94), `Save` and `Cancel`. Nothing is stored or recomputed until `Save`; `Save` stores both fields for that month, closes the panel, returns focus to `Update month`, and the `04` averages and chart refresh; `Cancel` / Escape closes without a change; a bad amount shows the field check and `Save` stores nothing. No helper text (Q35 decided: omitted). Amends PF-27 / PF-31 (the figures are stored on `Save`). |
| PF-44 | BLOCK | (#105) Expense categories: a `Category` column after `Account` on every expense line (choices `—`, the user's categories in the order added, `Add category…`); adding: label `New category`, `Add` / `Cancel`, check `Name the category.`, ≤ 40 characters, ≤ 50 categories, an existing name reused in any case; stored in `orpheus.finance.expenses.v2` (`categories` + each line's `category`; older values read as no category). |
| PF-45 | BLOCK | (#105) Filter: `Filter by category` (`All` then the categories) above the groups shows only the lines in that category in both groups; `Fixed total`, `Variable total`, `Total`, every `% of expenses` / `% of income` and `Equity to cover` stay the whole page's; a line added while filtered takes the filter's category; the filter is not stored (a reload shows `All`). |
| PF-46 | BLOCK | (#105) Subtotals: when any line has a category, `By category` (`h3`) after `Total` lists each used category (in the order added), then `No category` for the rest, with `% of expenses`, `Monthly`, `Yearly` in the household currency (`—` as Q14); the rows sum to `Total`; categories and the filter never change the master totals. |
| PF-47 | BLOCK | (#105) Layout and regression at 360 / 400 / 1024 / 1440: `Category` under `Account` on a phone, the last column before remove from 1024 px; the subtotal rows and the Update panel stack on a phone; 44 px controls, AA, axe, no horizontal scroll, strict CLS 0 (empty, restored, restored with a section closed); PF-01..39 and PFE-01..13 hold as amended; the signed-out 307 gate and `safeNext` unchanged. |
| PFE-01 | BLOCK | Entry points, signed out: the bar's `Personal finance` item, the home `02` Platforms `Personal finance` line's `Open` and the URL `/personal-finance` each end on the sign-in form at `/dashboard/sign-in?next=/personal-finance` (server: **307** to `/dashboard/sign-in?next=%2Fpersonal-finance`, `X-Robots-Tag` noindex); no Personal Finance copy shown. |
| PFE-02 | BLOCK | Gate, signed out: `next` allowlist (`safeNext`): `?next=https://evil.example`, `//evil.example` and `/calculator` are dropped on load (not in the URL or the page) and a faked successful sign-in (the auth POST answered in the browser, no account) goes to `/dashboard`; `?next=/personal-finance` is kept and goes there. `/api/personal-finance` `GET` / `PUT` / `DELETE` → 401 JSON, `POST` → 405 JSON. |
| PFE-03 | BLOCK | Entry points, signed in (the QA account): the bar item and the home `Open` both open `/personal-finance` (200, `Personal finance` current, title `Personal finance · Orpheus Wisdom`); `/dashboard/sign-in?next=/personal-finance` goes straight to the page; an empty account shows the empty page (PF-02 copy). |
| PFE-04 | BLOCK | Income, typed through the UI (household `CAD`): `Me` 120,000 / bonus 10 / tax 30, bonus not counted → Net 92,400; `Spouse` 80,000 / 5 / 25, share 80 → Net 63,000; the table Me · Wages 84,000, Spouse · Wages 48,000, Spouse · Bonus 2,400. |
| PFE-05 | BLOCK | Foreign income: `Brazilian Dividends` 37,000, `Foreign` ticked, `BRL`, `FX rate (BRL per 1 CAD)` `3.70` → Net 37,000, `Converted (yearly)` **10,000**; table line 384.62 / 833.33 / 10,000; `Net income` **5,553.85 / 12,033.33 / 144,400**. |
| PFE-06 | BLOCK | Expenses with a foreign line: Fixed `Rent` 1,000 a month (account `Chequing`, added inline), `Condo` 2,000 a month `BRL` at `5` (BRL per 1 CAD) → 400; Variable `Gifts` 1,200 a year (account `Visa`). Totals Fixed 1,400 / 16,800, Variable 100 / 1,200, Total 1,500 / 18,000; % of expenses 66.7% / 26.7% / 6.7% (Fixed 93.3%, Variable 6.7%, Total 100.0%); % of income 8.3% / 3.3% / 0.8% (Fixed 11.6%, Variable 0.8%, Total 12.5%). |
| PFE-07 | BLOCK | Equity cover: `Portfolio ROIC (%)` 8 → `Rate used` 4% → Rent 300,000, Condo 120,000 (household amount), Gifts 30,000; totals 420,000 / 30,000 / 450,000. A typed Rent override 250,000 → Fixed 370,000, Total 400,000. |
| PFE-08 | BLOCK | Overview / Update (today fixed at 11 October 2026): this month = the page (Expenses 1,500, Income 12,033.33, Surplus 10,533.33; the average the same); `Update` June 2026 typed 4,000 / 9,000 → 12-month average 2,750 / 10,516.67 / 7,766.67; `Starting net assets` 10,000 → the chart: 12 months, three lines (Expenses, Income, Net assets), net assets at the last month 103,200.00. |
| PFE-09 | BLOCK | Future with a typed growth rate: `Growth rate (%)` 5, `Future` on → 1 year (24 points) 203,677.02; 5 years (72 points) 658,398.96 (± 0.01: x ← x × 1.05^(1/12) + 7,766.67 a month). |
| PFE-10 | BLOCK | Persistence and isolation: after the debounced save a reload shows every figure above unchanged (PFE-04..09); a **second signed-in browser context** on the same account (another device) shows the same figures; `GET /api/personal-finance?userId=<anyone else>` → 403; an aborted save shows `Not saved.` and the next saved change clears it. (Isolation between two real accounts: `npm run check:dashboard-built -- --with-database`, locally; Q33 decided: enough.) |
| PFE-11 | BLOCK | Style on the full page at 360 / 400 / 1024 / 1440: charcoal + chalk, `color-scheme: dark`, the lyre first in the bar, footer exactly `Orpheus Wisdom`, no gold, noindex meta + `X-Robots-Tag`, one Analytics script, no horizontal scroll, AA for every text, and page CLS exactly 0 on a cold load of the full budget. |
| PFE-12 | BLOCK | Regression on the same preview: `qa/tools/site-style-regression.mjs` (every shipped-page tool: site-shell, home, calculator incl. **$313,000** via site.mjs, saved searches, sign-in, personal-finance, release-smoke preview, CLS 0, noindex) passes. |
| PFE-13 | BLOCK | Hygiene: credentials only from env (`QA_EMAIL` / `QA_PASSWORD`; never logged, never created); every signed-in context signs out (session.mjs); the QA account's Personal Finance record is reset (`DELETE /api/personal-finance`) before each viewport and left empty at the end; preview only (it writes to the account). |

## Roles and account (#90; design `attachments/roles-and-account-design.md`)

Diego via CoS ≈ 23:55 ET accepted the design with Q-D1..Q-D18 decided exactly as recommended (design section 10).
One **owner** (the account whose email equals the server-only `ORPHEUS_OWNER_EMAIL`, set by Diego / EL, never a
bot). Personal Finance and the Dashboard show the owner's data; anyone else sees it only through a grant:
**CFO** → Personal Finance, **Portfolio Manager** → Dashboard, each `Read` or `Read and write`. "Who has access" is
current state only (the audit log is #91, out of scope). Widths 360 × 780, 400 × 860, 1024 × 800, 1440 × 900. Tool:
`qa/tools/roles.mjs` (four accounts: owner, CFO with `Read`, Portfolio Manager with `Read and write`, no grant;
credentials only from env or generated in memory on a throwaway database; never logged).

| AC | Tier | Pass when |
|----|------|-----------|
| ROLE-01 | BLOCK | Bar (amends ST1-01): a fifth, right-most item `Account` (plain link to `/account`) on every page, signed in or out; bar text 11 px through 399 px (EL; 12 px to 639, 14 px from 640; `Personal finance` never wraps); below 640 px a 44 × 44 chalk-outline person glyph whose link's accessible name is `Account`, from 640 px the text `Account`; `aria-current="page"` on `/account`; the four other items unchanged; one line, no horizontal scroll at 360 / 400 / 1024 / 1440; strict CLS 0; no gold. |
| ROLE-02 | BLOCK | Signed out, `GET /account` → **307** to `/dashboard/sign-in?next=/account` (noindex); signing in returns to `/account`; `safeNext` allows exactly `/personal-finance` and `/account` (amends PF-34), anything else → `/dashboard`. |
| ROLE-03 | BLOCK | `/account` in the dark shell (the lyre, footer `Orpheus Wisdom`, `color-scheme: dark`), title `Account · Orpheus Wisdom`, noindex meta + `X-Robots-Tag`; sections `01` `You`, `02` `Password`, `03` `Email`, `04` `Who has access`; `05` `Grant access` only for the owner (absent from the HTML for anyone else). |
| ROLE-04 | BLOCK | `You` shows the name, the email and one line per role (`Owner`, or `CFO · Personal finance · Read` / `Read and write`, `Portfolio Manager · Dashboard · …`, or `No access`); `Sign out` ends the session (→ `/dashboard/sign-in`) and `/personal-finance` then 307s. |
| ROLE-05 | BLOCK | Change password (`Current password`, `New password`, `Confirm new password`, `Save`): `Enter your current password.`, `Use 8 or more characters.`, `Passwords don't match.`; a wrong current password → `That password is not right.`; success `Saved.`; a second signed-in context is signed out; the new password signs in and the old one doesn't. |
| ROLE-06 | BLOCK | Change email (`New email`, `Current password`, `Save`): needs the right current password; an email in use → `That email is already in use.`; success signs in with the new email only and signs out other contexts; for the owner the form is replaced by `Owner email can't be changed here.` and `POST /api/account/email` → 403. |
| ROLE-07 | BLOCK | Owner `Add person` (`Name`, `Email`, `Personal finance` and `Dashboard` levels, `Create account`): the account is created (outside `DASHBOARD_SIGNUP_ALLOWLIST`), a temporary password (≥ 16 characters) is shown **once** with the email and the sign-in URL and a `Copy` button, the reply is `Cache-Control: no-store`, nothing of it after a reload or in any log; an existing email gets grants only (no new password). |
| ROLE-08 | BLOCK | A person with a temporary password: `/personal-finance` and `/dashboard` → **307** to `/account`, every Personal Finance / Dashboard API → 403; `/account` shows only `You` and `Password` with `Set a new password to continue.`; after `Save` everything their grants allow opens. |
| ROLE-09 | BLOCK | `/dashboard/sign-in` has no `Create an account` link or create-account mode (amends ST5b-02 / ST5b-03); `POST /api/auth/sign-up/email` still refuses every email outside `DASHBOARD_SIGNUP_ALLOWLIST` (the owner's own bootstrap only); no other path creates an account except the owner's `Add person`. |
| ROLE-10 | BLOCK | CFO `Read`: `/personal-finance` shows the **owner's** figures with every field, select and action (`Add`, `Remove`, `Update month`, `Save`, `Add account…`, categories) disabled and the line `Read only`; the section toggles still work and are stored for that person (Q-D11), never in the owner's record; `GET /api/personal-finance` → the owner's record; `PUT` / `DELETE` → 403. |
| ROLE-11 | BLOCK | CFO `Read and write`: edits save to the owner's record (the owner sees them after a reload); their section toggles stay theirs; `DELETE /api/personal-finance` → 403 for everyone but the owner (Q-D13). |
| ROLE-12 | BLOCK | Portfolio Manager `Read`: `/dashboard` shows the owner's holdings with `Read only` and no add / edit / delete / columns / currency / refresh control enabled; `POST` / `PUT` / `DELETE` on holdings, settings, columns and refresh → 403; reads → the owner's data. |
| ROLE-13 | BLOCK | Portfolio Manager `Read and write`: holdings, settings and columns changes land on the owner's portfolio (the owner sees them). |
| ROLE-14 | BLOCK | No grant (or `ORPHEUS_OWNER_EMAIL` unset, for everyone): `/personal-finance` and `/dashboard` answer **403** in the shell (h1 the page name, one line `You don't have access to Personal finance.` / `You don't have access to the Dashboard.`, links `Account` and `Home`), noindex, no figures, no data; every API → 403 (still 404 flag off, 405 method, 401 signed out first). |
| ROLE-15 | BLOCK | A Personal-Finance-only person gets 403 on the Dashboard and the reverse; one person with both grants (Q-D3) opens both. |
| ROLE-16 | BLOCK | A grant change applies on the person's next request without signing in again; `Remove` clears both grants and signs the person out everywhere; the account stays (Q-D7). |
| ROLE-17 | BLOCK | `/api/account/access` (every method) → 403 for anyone but the owner; `?userId` / a body `userId` can't widen anyone's access; the owner's own access can't be edited or removed. |
| ROLE-18 | BLOCK | `Reset password`: a new one-time temporary password shown once, the old password refused, the person's sessions revoked, the forced change (ROLE-08) on next sign-in. |
| ROLE-19 | BLOCK | `Who has access`: the owner sees every person (name, email, roles and levels) and `Owner` on their own row; a grantee sees the owner and the people holding a grant on a surface they hold (Q-D14); no history, no timestamps of actions (#91). |
| ROLE-20 | BLOCK | Scripted cross-site / same-site `POST` / `PUT` / `DELETE` to every `/api/account/*` endpoint → 403; the `__Host-` cookies and `trustedOrigins` unchanged; no password or temporary password in a URL, log or analytics event. |
| ROLE-21 | BLOCK | Layout: `/account`, the forced-change view and the 403 page at 360 / 400 / 1024 / 1440: 44 px controls, AA, axe clean, chalk focus ring, no horizontal scroll, strict CLS 0, no gold, no painting. |
| ROLE-22 | BLOCK | Regression: PF-01..47 and PFE-01..13 hold for the owner; every shipped page (`site-style-regression.mjs`, `$313,000`, release-smoke's signed-out matrix); nothing visible on production before release (Q-D18: at release Diego's existing account is the owner and every other existing account starts with no access). |

## Template leftovers removed (#50; decision log `attachments/site-style-spec.md` § "Template leftovers removed (#50)")

EL ≈ 07:50 ET picked option A: remove every Grok app-builder leftover (the `grok.com/grok-app-builder/extensions.js`
script and its `.grok.com` cookies, the PWA middleware and Vite plugin, the `/__grok/*` manifest / install page /
icon, the OG head injection, the preview postMessage bridge) and replace the manifest with a static Orpheus one.
`.grok/` (agent skills / docs, not shipped) stays. Tool: `qa/tools/no-grok.mjs` (360 × 780 and 1440 × 900).

| AC | Tier | Pass when |
|----|------|-----------|
| NG-01 | BLOCK | No request to `grok.com` / `*.grok.com` / `grok-sandbox.com` while loading `/`, `/calculator`, `/dashboard/sign-in`, `/dashboard`, `/personal-finance` (the signed-out 307 is fine) and a 404; no `<script>` pointing at grok in the HTML. |
| NG-02 | BLOCK | No cookie on a `.grok.com` domain (`grok_device_id`, `__cf_bm` or any other) in the browser after those pages; no such `Set-Cookie`. |
| NG-03 | BLOCK | `GET /manifest.webmanifest` → 200, a static file: `name` and `short_name` `Orpheus Wisdom`, `background_color` / `theme_color` `#1e2124`, `display` `standalone`, `start_url` `/`; icons `/icons/icon-180.png` (180 × 180) and `/icons/icon-512.png` (512 × 512), PNG, made from `favicon.svg` (the off-white lyre on charcoal). |
| NG-04 | BLOCK | Every page links `rel=manifest` → `/manifest.webmanifest` and `rel=apple-touch-icon` → `/icons/apple-touch-icon.png` (180 × 180), nothing under `/__grok`. |
| NG-05 | BLOCK | `/__grok/manifest.webmanifest`, `/__grok/manifest.json`, `/__grok/icon-180.png`, `/__grok/install/styles.css` → 404; nothing links `/__grok` or `grok.com`. |
| NG-06 | MUST | `/?install=1` is no longer special: like any `/?query` it redirects to `/calculator?install=1` (the #46 old-link rule) and the calculator renders (200, no "Add to Home Screen" tutorial). Installing is the browser's own (Share → Add to Home Screen / Install app), using NG-03. |
| NG-07 | BLOCK | Unchanged: `robots` meta and `X-Robots-Tag` `noindex, nofollow`, `favicon.svg`, `theme-color` `#1e2124`, `apple-mobile-web-app-title` `Orpheus Wisdom`, `apple-mobile-web-app-status-bar-style` `black`. |
| NG-08 | MUST | No preview postMessage bridge in the app (`grok-preview-bridge` absent from the HTML and the source). |
| NG-09 | BLOCK | Nothing else moves: shell, home, lyre, footer, `$313,000`, CLS 0 (`site-style-regression.mjs`), release-smoke, signed-out 307 on `/personal-finance`, `/dashboard`, `/account`. |

## Remaining Grok tooling removed (#51; decision log `attachments/site-style-spec.md` § 15)

Follow-up to #50. Removes the Grok App Builder workspace tooling (none of it touches grok.com). Gate (EL ≈ 08:48 ET):
Vercel sets `VITE_AUTH_ENABLED` itself (Preview `true`, Production its own encrypted value), so dropping
`.grok/app-env.json` and `scripts/with-app-env.mjs` does not change a deployed build. Test: `scripts/no-grok-tooling.test.mjs`
(in `npm test`).

| AC | Tier | Pass when |
|----|------|-----------|
| TL-01 | BLOCK | Gone: `.grok/` (app-env.json, skills, references, logs, status, project_memory), `startup.sh`, `scripts/preview.mjs` (+ test), `scripts/preview-thumbnail.mjs`, `scripts/with-app-env.mjs` (+ test), `scripts/app-env-plugin.mjs`, `scripts/check-auth-invariant.mjs` (+ test), `scripts/write-atomic.mjs` (+ test), `scripts/browser-smoke*.mjs`, `scripts/browser-guard.mjs`, `screenshots/app-builder-*`. |
| TL-02 | BLOCK | `package.json`: `dev`, `build`, `build:dev`, `preview` run `vite` directly; `preview:restart`, `preview:stop` and `check:auth` gone. |
| TL-03 | BLOCK | `vite.config.ts` loads no app-env plugin (no `/__app-env`). |
| TL-04 | BLOCK | Deployed behaviour unchanged: the client bundle does not depend on `VITE_AUTH_ENABLED` from a file (an identical build with the file `"false"`, with env `true` and without the file); Preview sign-in still works; signed-out 307s on `/personal-finance`, `/dashboard`, `/account`. |
| TL-05 | BLOCK | Kept: `migrations/0001_auth.sql`, `migrations/auth/0001_auth.sql`, `qa/runs/**`, the frozen-copy compare default in `qa/tools/config.mjs`. |
| TL-06 | BLOCK | Nothing else moves: `qa/tools/no-grok.mjs` (no grok.com request / cookie), `site-style-regression.mjs` (`$313,000`, CLS 0, noindex, shell / home), release-smoke, CI green. |

## Audit log of actions (#91; design `attachments/audit-log-design.md`)

Ops / debug log, not personal data. Tool: `qa/tools/audit.mjs` (a preview with the #90 QA accounts: `QA_OWNER_*`,
`QA_CFO_*`, `QA_PM_*`, `QA_NONE_*`; passwords in env only, never logged). Widths 360 × 780
and 1440 × 900.

| AC | Tier | Pass when |
|----|------|-----------|
| AUDIT-01 | BLOCK | Migration `0012_audit.sql` creates `audit_event` (id, at, actor, role, action, target, outcome, detail); `UPDATE` and `DELETE` on it fail (append-only). |
| AUDIT-02 | BLOCK | Each action in design section 3 writes one row with the right `action`, `outcome`, `role`; reads write nothing (except a denial). |
| AUDIT-03 | BLOCK | Masking: `actor` / `target` are only `owner`, `anonymous`, `p-` + 8 hex or `h-` + 8 hex; the same person always has the same code; no row (any column) contains an email, a person's name, a ticker, a currency code or a digit run that is an amount from the request. |
| AUDIT-04 | BLOCK | `detail` is null or from the fixed list (grant levels `pf:<lvl> dash:<lvl>`, `<surface> <METHOD>`); never free text from a request. |
| AUDIT-05 | BLOCK | A failed sign-in writes `auth.sign_in` / `failed` / `anonymous` without the typed email; a good one writes `ok` with the person's code. |
| AUDIT-06 | BLOCK | A CFO with `Read` writing Personal Finance (403) and a no-grant person opening the Dashboard API (403) write `access.denied` with detail `personal_finance PUT` / `dashboard GET`. |
| AUDIT-07 | BLOCK | `GET /api/account/audit`: owner 200 newest first, `limit` 1..100 (default 50), `before` pages, `more` flag, `Cache-Control: no-store`; a grantee or no-grant person 403; signed out 401; flag off 404; non-GET 405. |
| AUDIT-08 | BLOCK | `/account` for the owner shows `06` `Activity`: columns `When`, `Who`, `Role`, `Action`, `Target`, `Result`, newest first, times in ET; `Show older` appends the next page; empty: `No activity yet.` Grantees and a temporary-password session do not see the section. |
| AUDIT-09 | BLOCK | Style: the dark shell (bar, lyre, footer `Orpheus Wisdom`, `color-scheme: dark`), no gold, AA contrast, no horizontal page scroll at 360 (the table scrolls inside its own box), strict CLS 0, noindex. |
| AUDIT-10 | MUST | A failing audit insert never changes the action's own answer (unit test); the server log gets the action code only. |
| AUDIT-11 | BLOCK | No new env var, no allow-list change; the signed-out 307s (`/personal-finance`, `/dashboard`, `/account`) and the `$313,000` calculator unchanged. |
| AUDIT-12 | MUST | Removing a person keeps their rows (no foreign key). |

Amended by #91: **ROLE-03** (the owner's `/account` also has `06` `Activity`, AUDIT-08) and **ROLE-19** ("Who has
access" stays current state with no history; the history is only in the owner's `06 Activity`). `qa/tools/roles.mjs`
checks both as amended.

## Personal Finance month control (#112; design `attachments/pf-month-control-design.md`, spec section 19)

EL option A (≈ 11:23 ET). Retires PF-28 and PF-43 (the Update section). Amends PF-27 (a month's figure, below),
PF-31 / PF-36 (stored on Save, not on every change), PF-41 (section toggles still save at once). Tool:
`qa/tools/pf-months.mjs` (the QA owner account `QA_EMAIL` / `QA_PASSWORD` on a preview; restores the record at the
end) with a fixed browser clock; 400 × 860 and 1440 × 900.

| AC | Tier | Pass when |
|----|------|-----------|
| PF-48 | BLOCK | Under the title: `Month` and a select showing the current month (`October 2026` on 2026-10-11), options exactly the last 12 months newest first; `05` `Update` (and `Update month`, its panel) gone; `04` `Overview` the last section. |
| PF-49 | BLOCK | `Save` is hidden on load and after Save; it shows as soon as anything on the shown month or a shared value changes (a line, a person, the household currency, the equity rates, a category / account, Starting net assets, Growth, Future), and hides again if the change is undone. Section toggles never show it. |
| PF-50 | BLOCK | No autosave: editing and reloading without Save keeps the stored record unchanged (no PUT); Save PUTs once and a reload shows the change. |
| PF-51 | BLOCK | Switching to an empty past month shows the current month's saved lines (expenses and people, with their currency, FX rate, equity to cover, account, category) and `Copied from <current month> — edit and save.`; nothing is stored; `Save` is shown; editing changes only this month. |
| PF-52 | BLOCK | Save on a past month stores that month's lines in `orpheus.finance.months.v1`; the control stays on that month; the note goes; the current month's lines are unchanged; `04` (This month, 12-month average, net assets, chart) updates at once. |
| PF-53 | BLOCK | A month figure = that month's saved `Total` Monthly and `Net income` Monthly (above 0); example: current 1,750 / 11,200 and June 2026 saved with lines totalling 4,000 / 9,000 → averages **2,875** / **10,100**, surplus **7,225** (the section 15.2 example, now from lines). |
| PF-54 | BLOCK | Switching month with unsaved changes asks `Discard unsaved changes?`; Cancel keeps the month and the edits, OK switches and drops them; leaving the page with unsaved changes asks the browser's leave-page question; nothing asked when nothing is unsaved. |
| PF-55 | BLOCK | Existing data: a record without `months.v1` opens with its lines as the current month (no change shown, `Save` hidden); an old totals-only month keeps its two totals in the averages until saved; opened, it shows the copied current lines and the note; saving it drops its old totals. |
| PF-56 | BLOCK | Rollover: with the clock on a new month whose month has no lines, the page shows a copy of the most recent month with lines and `Copied from <that month> — edit and save.`; `Save` shown; nothing stored until Save. |
| PF-57 | BLOCK | Roles: a Read-only CFO can switch months (each saved month shows; Q-M1 (EL): an empty one shows the copy preview with its note), never sees `Save`, and the record is never written; section toggles still save to the person's own view. |
| PF-58 | BLOCK | Layout and regression at 360 / 400 / 1024 / 1440: the control row under the title, select and `Save` ≥ 44 px, no gold, AA, no horizontal scroll, strict CLS 0 (empty, restored, `Save` appearing); PF-01..47 (as amended) and PFE-01..13 hold; signed-out 307 and `safeNext` unchanged; `$313,000`. |

## Personal Finance: capital F, delete confirmations, rename categories (#113; spec section 20)

Amends the copy of ST1-01, ROLE-01, the home Platforms line (HP), PFE-03, ROLE-04 and ROLE-14 / -15 to
"Personal Finance". Tools: `site-shell.mjs`, `home-page.mjs`, `site.mjs`, `roles.mjs`, `personal-finance.mjs`,
`personal-finance-e2e.mjs`.

| AC | Tier | Pass when |
|----|------|-----------|
| PF-59 | BLOCK | The bar item, the home Platforms line, the h1 `Personal Finance.` and the document title `Personal Finance · Orpheus Wisdom` use a capital F; no visible "Personal finance" anywhere. |
| PF-60 | BLOCK | The bar stays on one line, full words, at 360 / 399 (11 px) and 400 / 1024 / 1440 (12 px / desktop), no overlap (ROLE-01). |
| PF-61 | BLOCK | Remove expense asks `Delete Rent? This cannot be undone.` (unnamed: `Delete this expense? …`); Cancel keeps the line, OK removes it. |
| PF-62 | BLOCK | Remove person asks `Delete Me? This cannot be undone.` (unnamed: `Delete Person 2? …`); Cancel keeps, OK removes. |
| PF-63 | BLOCK | With a category chosen, `Rename` opens `New name`; renaming `Home` to `House` updates the list, every line using it, the filter (still on it) and `By category`; master totals unchanged; `Save` shows. |
| PF-64 | BLOCK | Empty → `Name the category.`; another category's name (any case) → `That category exists.`; nothing changes; Cancel / Escape leave it as it was; a case-only change is accepted. |
| PF-65 | BLOCK | After Save, every stored month's lines carry the new name (a month saved before shows it when opened). |
| PF-66 | BLOCK | Read-only: remove buttons and `Rename` disabled, no confirm; the controls ≥ 44 px, no gold, AA, strict CLS 0. |


## Personal Finance: Expenses summary, account filter, totals by account (#119; spec section 21)

Unit / DOM tests cover PF-67..PF-75; `qa/tools/personal-finance-e2e.mjs` covers PF-76..PF-78 on the preview.

| AC | Tier | Pass when |
|----|------|-----------|
| PF-67 | BLOCK | `Expenses summary` (numeral `03`) is its own section after `03` Expenses with a toggle (`aria-expanded`); 04–06 keep their numerals. |
| PF-68 | BLOCK | Closing `Expenses` leaves the Summary open and visible; closing the Summary leaves `Expenses` open; both remembered after reload. |
| PF-69 | BLOCK | `By account` lists each used account then `No account`: `% of expenses`, `Monthly`, `Yearly`, full digits; the rows sum to `Total`. |
| PF-70 | BLOCK | `By category` is in the Summary (not the Expenses body), same values as before. |
| PF-71 | BLOCK | `Filter by account` (`All` + accounts) shows only that account's lines; with a category chosen too, only lines matching both. |
| PF-72 | BLOCK | With an account chosen, its Summary row is marked (`aria-current`) and every other account's total is still listed; same for a chosen category. |
| PF-73 | BLOCK | Filters change no total: group totals, `Total`, `% of income`, `% of expenses`, `Equity to cover` equal the unfiltered values. |
| PF-74 | BLOCK | `↳ Add expense` with an account chosen starts the line on that account; `Save` (#112) appears, nothing saved before it. |
| PF-75 | BLOCK | A foreign line without a valid rate makes its account's figures `—`; master totals behave as before (Q14). |
| PF-76 | BLOCK | Preview: account filter, totals by account and the Summary staying visible with `Expenses` collapsed, phone 400 and desktop 1440. |
| PF-77 | BLOCK | Preview: Read-only CFO can toggle and filter; inputs locked; no `Save`. |
| PF-78 | BLOCK | Preview: dark style, lyre, footer `Orpheus Wisdom`, no gold, controls ≥ 44 px, strict CLS 0; the other PF suites, roles, audit PASS. |

PF-77 as built (design section 7): read-only toggles the Summary; both filters stay locked (ROLE-10 unchanged).

Amendment rows (EL 07:51 ET, Diego approved; supersede PF-77 and the note above, and amend ROLE-10):

| AC | Tier | Pass when |
|----|------|-----------|
| PF-77a | BLOCK | Read-only: both filters enabled and work (Amex → its lines, marked; combined with a category); totals unchanged; nothing saved. |
| PF-77b | BLOCK | Read-only: every write stays locked: `↳ Add expense` (incl. a new line taking the filtered account), `Save`, `Rename`, remove, fields, rates, household currency. |
| ROLE-10a | BLOCK | Amends ROLE-10: a read-only grantee's enabled controls are the section toggles, the month select and the two expense filters; every other control disabled (roles.mjs). |

## Shared page parts (#92; site-style-spec section 16)

Refactor: no visible change. Test `scripts/shared-parts.test.mjs` (SP-01..SP-05); preview regression (SP-06, SP-07).

| AC | Tier | Pass when |
|----|------|-----------|
| SP-01 | BLOCK | Every `@font-face` is in `src/styles/fonts.css` and nowhere else; `src/styles.css` imports it once. |
| SP-02 | BLOCK | `FONT_PRELOAD` (src/lib/site/fonts.ts) is the root head's preload href, a `src:` of a face in `fonts.css`, and a file under `public/fonts/`. |
| SP-03 | BLOCK | The label typography (0.75rem, 1.2, 0.14em, uppercase, dim) is declared once (`src/styles/parts.css`, `.ow-label` with `.calc-label`, `.signin-label`, `.pf-label`); no page rule redeclares it. |
| SP-04 | BLOCK | The chalk button (`.ow-button` with `.calc-button`, `.signin-button`, and `:disabled`) is declared once in `parts.css`. |
| SP-05 | BLOCK | The bar and footer are rendered only by `src/routes/__root.tsx` (no page imports `SiteMenu` / `SiteFooter`). |
| SP-06 | BLOCK | Preview: site-style-regression, site-shell, home-page, no-grok all PASS (`$313,000`, strict CLS 0, noindex, signed-out PF 307, Schibsted Grotesk on every page). |
| SP-07 | BLOCK | Preview: personal-finance, pf-months, personal-finance-e2e, roles, audit PASS (no change in any page's text, size or layout). |


## Dashboard: company view (#95; attachments/dashboard-company-view-design.md)

Unit / DOM tests cover CV-01..CV-07; `qa/tools/dashboard-company.mjs` covers CV-08..CV-14 on the preview; the existing
suites cover CV-15.

| AC | Tier | Pass when |
|----|------|-----------|
| CV-01 | BLOCK | Profile: market cap = last close × diluted shares; EV = market cap + debt − cash; revenue; employees `Not reported`. |
| CV-02 | BLOCK | Margins: gross, operating, net, FCF = ÷ revenue, one decimal %; zero / negative revenue → `n/m`. |
| CV-03 | BLOCK | Returns: ROA, ROE, ROCE on averages of the two latest year ends (one year alone when only one), ROIC the stored value. |
| CV-04 | BLOCK | Valuation: P/E, EV/EBIT, P/FCF as `12.3×`; a negative or zero denominator → `n/m`. |
| CV-05 | BLOCK | Growth: revenue 1y / CAGR 3y / 5y / 10y from the stored metrics, EPS 1y; dividends TTM per share, yield, last ex-date, or `No dividends`. |
| CV-06 | BLOCK | No SEC coverage → `Not covered` on fundamentals rows, price / chart / dividends still shown; nothing fetched (database only). |
| CV-07 | BLOCK | The expanded holding row links `Open company view` to `/dashboard/company/<SYMBOL>`; the collapsed row is unchanged. |
| CV-08 | BLOCK | Preview: the page for a held symbol (PLTR when held) shows the header, chart, Profile, Margins, Returns, Valuation, Growth, Dividends in that order. |
| CV-09 | BLOCK | Preview: 1Y / 5Y / Max switch the chart (1Y default, `aria-pressed`), the change line follows. |
| CV-10 | BLOCK | Preview: gate: signed out → `/dashboard/sign-in`; no grant → 403 page; a symbol not held → `Not in your holdings.`; API 401 / 403 / 404 / 405 as designed. |
| CV-11 | BLOCK | Preview: the API values equal the page's (same rows, same text). |
| CV-12 | BLOCK | Preview: dark shell, lyre, footer `Orpheus Wisdom`, no gold, section labels `.ow-label`, noindex. |
| CV-13 | BLOCK | Preview: phone 400 × 860 one column, desktop 1440 × 900 two columns, no horizontal scroll, strict CLS 0. |
| CV-14 | BLOCK | Preview: a Read-only Portfolio Manager sees the same page. |
| CV-15 | BLOCK | Preview: site-style-regression ($313,000, strict CLS 0), site-shell, home-page, no-grok, roles, audit, personal-finance, pf-months, personal-finance-e2e all PASS. |

## Dashboard: company view without SEC filings (#121; dashboard-spec section 16)

Unit / DOM tests cover NC-01..NC-04; `qa/tools/dashboard-company.mjs --seed` covers NC-05..NC-07 on the preview.

| AC | Tier | Pass when |
|----|------|-----------|
| NC-01 | BLOCK | An uncovered, checked listing: `coverage` = `Not covered: no SEC filings`; covered or pending: `null`. |
| NC-02 | BLOCK | Uncovered: every Profile / Margins / Returns / Valuation / Growth row `Not covered`; Dividends and the last close from stored data. |
| NC-03 | BLOCK | Uncovered source line `Daily closes and dividends as stored by the Dashboard · no SEC filings for this listing`; covered keeps the #95 line. |
| NC-04 | BLOCK | The page shows `company-coverage` under the header (dim, no instruction text) and the chart when there are ≥ 2 closes. |
| NC-05 | BLOCK | Preview: RMS.PA held (seeded) → API 200 with NC-01..NC-03; the page 200, no error, the line and the chart shown. |
| NC-06 | BLOCK | Preview: dark shell, `.ow-label`, no gold, no K / M / B, phone 400 and desktop 1440, no horizontal scroll. |
| NC-07 | BLOCK | Preview: the seeded RMS.PA holding is deleted again; CV-08..CV-14 still PASS for PLTR. |
| NC-08 | BLOCK | Preview: site-style-regression ($313,000, strict CLS 0), site-shell, home-page, no-grok, roles, audit, PF suites PASS. |

## Dashboard: EU fundamentals from ESEF (#123; dashboard-spec section 17)

Unit tests (recorded fixture, no live call) cover ES-01..ES-08; `qa/tools/dashboard-company.mjs --seed` covers
ES-09..ES-11 on the preview.

| AC | Tier | Pass when |
|----|------|-----------|
| ES-01 | BLOCK | Fixture: Hermès FY2024 revenue 15,170,000,000 EUR, gross profit 10,660,000,000, EBIT 6,150,000,000, net income 4,603,000,000, diluted EPS 43.87. |
| ES-02 | BLOCK | N6: fiscal year from the figures (the FY2025 filing indexed `2026-12-31` gives FY end 2025-12-31); newest filing per fiscal year; restated comparatives from the newer filing. |
| ES-03 | BLOCK | Dimensional facts ignored; durations outside 335–395 days ignored; instants only on a fiscal year end. |
| ES-04 | BLOCK | Diluted shares = net income ÷ diluted EPS when no share tag (Q-E1); capex from the broad IFRS purchase tag (Q-E5). |
| ES-05 | BLOCK | Ticker → LEI: pinned RMS.PA; GLEIF accepted only on same company + venue country; otherwise not covered. |
| ES-06 | BLOCK | The job stores `fundamentals_source = 'esef'`, `lei`, facts and metrics; US symbols still go to SEC; no ESEF call for non-EU. |
| ES-07 | BLOCK | Parser version 4: a covered symbol (SEC or ESEF) stored by version 3 is refetched once. |
| ES-08 | BLOCK | Company view for an ESEF listing: figures in EUR, source line `ESEF annual reports via filings.xbrl.org · daily closes as stored by the Dashboard`, no coverage line; valuation shown when price currency = reporting currency, else `— (currency mismatch)`. |
| ES-09 | BLOCK | Preview: RMS.PA (seeded) API and page show Revenue €15,170,000,000-era figures for the latest FY (non-`Not covered`), margins in %, the ESEF source line. |
| ES-10 | BLOCK | Preview: dark shell, `.ow-label`, no gold, no K / M / B, phone 400 and desktop 1440. |
| ES-11 | BLOCK | Preview: the seeded holdings are deleted again; PLTR (SEC) still passes CV-08..CV-14. |
| ES-12 | BLOCK | Preview: site-style-regression ($313,000, strict CLS 0), site-shell, home-page, no-grok, roles, audit, PF suites PASS. |
| ES-13 | BLOCK | Unit (`esef.test.ts`): Hermès FY2024 diluted shares are derived (`source_tag` `derived:net_income/eps_diluted`) and capex comes from the broad IFRS tag; `derivedMethod()` returns `shares_from_eps` / `capex_broad_ifrs` for them and null for reported tags; the API rows flag `shares` and `fcf_margin`, only derivable rows are flagged, all flagged rows are `ok`, `revenue` is not flagged. |
| ES-14 | BLOCK | Unit (DOM): a derived row shows `derived` in a `.ow-label` span next to the label (`company-derived-<key>`), `title` and `aria-label` explain the method; the value text is unchanged; Revenue / P/E / margins without a derived input and every SEC (reported) view show no marker. |
| ES-15 | BLOCK | Preview (`dashboard-company --seed`): RMS.PA API rows `shares` (net income ÷ diluted EPS) and `fcf_margin` (broad IFRS line) carry `derived`, only rows from {shares, market_cap, ev, ev_ebit, fcf_margin, p_fcf}; page phone 400 and desktop 1440 shows the marker dim, small, `.ow-label`, with title and aria-label; none on Revenue. |
| ES-16 | BLOCK | Preview: ES-09..ES-12 still PASS with the marker (the seeded holdings are deleted, PLTR shows no marker). |

## Personal Finance: Overview equity coverage and 3-month average (#126; spec section 22)

Unit / DOM tests cover PF-79..PF-88; `qa/tools/personal-finance-e2e.mjs` covers PF-89; the preview suites cover PF-90.

| AC | Tier | Pass when |
|----|------|-----------|
| PF-79 | BLOCK | `pf-coverage` sits directly after the comparison table (`pf-ov-table`) and before the fields, `Future` and the chart. |
| PF-80 | BLOCK | Math: start 13,125, rate used 4, this month's expenses 8,254.72 → `Equity coverage: 43.75 CAD/mo · 0.53% of expenses` and `525 CAD/yr` (annual = start × rate ÷ 100; monthly ÷ 12; % of this month's expenses). |
| PF-81 | BLOCK | Rate from ROIC ÷ 2 (withdrawal empty) is used; a typed withdrawal rate wins (the #86 rule); household currency code shown (USD household → `USD`). |
| PF-82 | BLOCK | No rate: `Equity coverage: —` and `Set rate under Expenses`; rate set but start empty / 0 / invalid: `—` and `Set starting net assets`; expenses missing or 0: the % is `—`. |
| PF-83 | BLOCK | This month without a figure: the % uses the 12-month average expenses. |
| PF-84 | BLOCK | `Future` on: coverage uses the projected net assets at the horizon end and the average expenses; label `Equity coverage in N years:`; toggling off restores the current figures. |
| PF-85 | BLOCK | The table columns are `This month`, `3-month average`, `12-month average` (`pf-ov-now`, `pf-ov-avg3`, `pf-ov-avg`) for Expenses, Income and Surplus. |
| PF-86 | BLOCK | 3-month average = mean over the current and 2 previous months, each month's figure else the 12-month average; no figure in 12 months → `—`. |
| PF-87 | BLOCK | The chart is unchanged (12 points, + Future months); #112 per-month lines feed both averages and coverage. |
| PF-88 | BLOCK | Read-only: coverage and both averages visible; no new control; ROLE-10a unchanged; nothing is saved by viewing (explicit `Save` unchanged). |
| PF-89 | BLOCK | Preview (`personal-finance-e2e`): seeded rate, start and months show the expected coverage line, yearly line and 3-month average; phone 400 and desktop 1440, no horizontal scroll. |
| PF-90 | BLOCK | Preview: dark style, lyre, footer `Orpheus Wisdom`, no gold, full digits, strict CLS 0; personal-finance, pf-months, site-style regression ($313,000), site-shell, home, roles, audit, no-grok, dashboard-company PASS. |
| PF-91 | BLOCK | Change (C7/C2, approved 2026-10-13; supersedes the PF-86 window and the PF-85 column label): the 3-month average (`pf-ov-avg3`) is the mean of the last 3 COMPLETE months, excluding the current partial month; on 2026-10-13 that is Jul, Aug, Sep. The column header reads `3-month average (Jul–Sep)`. Unit + DOM. |
| PF-92 | BLOCK | Change (C7, approved 2026-10-13): year boundary: any day in January → Oct, Nov, Dec of the previous year, label `3-month average (Oct–Dec)`. Unit. |
| PF-93 | BLOCK | Change (C7/C8, approved 2026-10-13): the C8 rule applies to complete months: an empty complete month takes the 12-month average; no figure in 12 months → `—`; the current month's figure never enters the 3-month average. Unit. |
| PF-94 | BLOCK | Change (C2, approved 2026-10-13; supersedes the "this month's expenses" basis of PF-80 / PF-83): the equity coverage % (`pf-coverage`, Future off) is monthly coverage ÷ the 3-month average of complete months, and the line names it: `… · 20.00% of 3-month average (Jul–Sep) expenses`. Future on keeps PF-84. Unit + DOM. |
| PF-95 | BLOCK | Change (C7, approved 2026-10-13): the window is computed at render time from the current date in the household timezone (America/Toronto), never hardcoded: Oct 31 → Jul–Sep, Nov 1 → Aug–Oct; the UTC instant 2026-11-01T03:30Z (still Oct 31 in Toronto) → Jul–Sep, 2026-11-01T04:30Z → Aug–Oct. Unit + DOM. |
| PF-96 | BLOCK | Change (N1, 2026-10-13): `This month` and the 12 months (`lastTwelve`) use the household month (`householdMonth()`, America/Toronto), the same as the 3-month window; a UTC server or a browser west of Toronto never shows next month early or counts a month twice. 2026-10-31T20:00 / 20:30 / 23:59 ET (already Nov 1 in UTC) → This month = Oct, window Jul–Sep; 2026-11-01T00:00 ET → Nov, Aug–Oct. Unit (TZ=UTC and America/Los_Angeles) + DOM. |
| PF-97 | BLOCK | Change (PF-84 confirmed by the CFO, 2026-10-13): beside the coverage % a dim basis label (`pf-coverage-basis`): `basis: 3-mo avg (Jul–Sep)` with Future off (window computed from the date), `basis: projection` with Future on. Unit + DOM. |

## Dashboard: funds / ETFs on the company view (#124; dashboard-spec section 18)

Unit tests (`src/lib/dashboard/openfigi.test.ts`, recorded fixture `test-fixtures/openfigi/mapping-2026-10-14.json`, no
live call) cover FD-01..FD-08; the DOM test (`company-view.dom.test.tsx`) covers FD-09..FD-10;
`qa/tools/dashboard-company.mjs --seed` covers FD-11..FD-14 on the preview.

| AC | Tier | Pass when |
|----|------|-----------|
| FD-01 | BLOCK | `figiJob`: `VDY.TO` → TICKER `VDY` / `CN`; `RMS.PA` → `RMS` / `FP`; `PLTR` → `PLTR` / `US`; `BRK-B` → `BRK/B` / `US`; an unmapped suffix (e.g. `X.ZZ`) → null (no request). |
| FD-02 | BLOCK | `classifyFigi` on the recorded answers: VDY, XEQT, SPY (ETP), PDI (Closed-End Fund), VFIAX (Open-End Fund) → `fund`; RMS, PLTR, RY, BRK/B (Common Stock), O (REIT) → `company`; `No identifier found.` → `unknown`. |
| FD-03 | BLOCK | The job stores `provider_ids.openfigi` `{kind, securityType, securityType2, figi, checkedAt}` for held symbols and keeps the other provider ids. |
| FD-04 | BLOCK | Refresh: a stored fund / company result is not asked again before 30 days, an unknown one before 7 days; older ones are asked again. |
| FD-05 | BLOCK | Limits: ≤ 10 jobs a request, ≥ 2,500 ms between requests, ≤ 3 requests a run; no API key header is sent. |
| FD-06 | BLOCK | Failure (HTTP 429 / 500, thrown error, bad JSON): nothing stored, the run stops asking, the error is in the summary; the next run asks again. |
| FD-07 | BLOCK | `companyView` for a fund: `kind` `fund`, `fund` = `Fund: company figures do not apply`, sections = Dividends only, `coverage` null, source `Daily closes and dividends as stored by the Dashboard · fund type from OpenFIGI`; last close, chart and dividend rows as for a company. |
| FD-08 | BLOCK | `companyView` for a company / unknown / unclassified listing is unchanged (six sections; #121 / #123 coverage and source lines as before); `loadCompany` reads the stored kind. |
| FD-09 | BLOCK | DOM: a fund shows `company-fund` with the line in place of the five company sections (none of `company-section-profile/margins/returns/valuation/growth`), `company-section-dividends`, the chart and range buttons, and no `company-coverage`. |
| FD-10 | BLOCK | DOM: a company view renders exactly as before (six sections, no `company-fund`). |
| FD-11 | BLOCK | Preview (`dashboard-company --seed`): VDY.TO (seeded) API 200 with `kind` `fund`, `securityType` `ETP`, the fund line, Dividends only; page 200 shows `company-fund`, the chart, Dividends, no company sections, no coverage line. |
| FD-12 | BLOCK | Preview: the fund page is dark shell, `.ow-label`, no gold, phone 400 and desktop 1440, no horizontal scroll. |
| FD-13 | BLOCK | Preview: PLTR (SEC) and RMS.PA (ESEF) are not funds (`kind` `company`), CV-08..CV-14 and ES-09..ES-11 still PASS; the seeded holdings are deleted again. |
| FD-14 | BLOCK | Preview: site-style-regression ($313,000, strict CLS 0), site-shell, home-page, no-grok PASS. |

## Personal Finance: Overview equity coverage layout, multi-line with notes (#129; spec section 23)

Unit / DOM tests cover PF-98..PF-103; `qa/tools/personal-finance-e2e.mjs` covers PF-104 on preview. Supersedes the one-line display of PF-80 / PF-94 / PF-97 (math unchanged).

| AC | Tier | Pass when |
|----|------|-----------|
| PF-98 | BLOCK | `pf-coverage` has three lines in order: amounts (`pf-coverage-amounts`), rate note (`pf-coverage-rate-note`), source note (`pf-coverage-source`); still directly after `pf-ov-table` and before `Starting net assets`. |
| PF-99 | BLOCK | Line 1: start 4,000, Rate used 12.5 → `Equity coverage: 41.67 CAD/mo (500 CAD/yr)`; household currency code; full digits. |
| PF-100 | BLOCK | Line 2, Future off: `* 12.5% yearly, or 0.50% monthly on 3-month average (Jul–Sep) expenses.` (3-month average of complete months 8,333.33; window from the date); expenses missing / 0 → `* 12.5% yearly, or — monthly on 3-month average (Jul–Sep) expenses.` |
| PF-101 | BLOCK | Line 3 is exactly `** Coverage rate is derived from Rate Used under Expenses section.`, in every state. |
| PF-102 | BLOCK | Lines 2 and 3 use `.pf-coverage-sub` (smaller font, 0.875rem, dim) and line 1 does not; no `pf-coverage-basis` element. |
| PF-103 | BLOCK | Future on: line 1 `Equity coverage in N years: …`, line 2 `… monthly on 12-month average expenses (projection).`, numbers as PF-84; no rate → `Equity coverage: —` / `Set rate under Expenses` / line 3; no start → `—` / `Set starting net assets` / line 3. |
| PF-104 | BLOCK | Preview (`personal-finance-e2e`, phone 400 and desktop 1440): the three lines with the seeded figures, line 2–3 font smaller than line 1, no horizontal scroll; dark style, lyre, footer `Orpheus Wisdom`, no gold. |
| PF-105 | BLOCK | Change (Q-L1 CFO-confirmed, 2026-10-14; supersedes the PF-100 line-2 wording): Future off line 2 reads `* 12.5% yearly, covers 0.50% of monthly expenses (3-month average, Jul–Sep).` (window from the date); expenses missing / 0 → `covers — of …`. Unit + DOM. |
| PF-106 | BLOCK | Change (Q-L4 CFO-confirmed as option b, 2026-10-14; supersedes the PF-103 line-2 wording and the PF-84 expenses term): Future on, the share divides by the horizon-end point's expenses (`summary.points.at(-1).expenses`); no point → `none` as before; line 2 reads `* 12.5% yearly, covers X% of projected monthly expenses at horizon end (held at 12-month average).` Unit + DOM. |
| PF-107 | BLOCK | The projection holds expenses flat: the horizon-end point's expenses equal the 12-month average today, so the PF-106 figure equals the earlier one; growing expenses are out of scope. Unit. |

## Personal Finance: Expenses Withdrawal rate description (#131; spec section 24)

Unit / DOM tests cover PF-108..PF-112; `qa/tools/personal-finance.mjs` (signed in, QA credentials) covers PF-113 on the
preview; PF-114 is the regression set. Copy and style only: PF-18 (Rate used) is unchanged.

| AC | Tier | Pass when |
|----|------|-----------|
| PF-108 | BLOCK | `pf-withdrawal-desc` has exactly two `<p>` lines: `Withdrawal rate used to calculate how much equity can cover expenses.` and `Rate Used is your Withdrawal Rate, or half of Portfolio ROIC when no Withdrawal Rate is set.` (Q-W1). |
| PF-109 | BLOCK | Placement: under `03` `Expenses`, the description is the element immediately before `pf-rates` (nothing between), so it precedes the `Withdrawal rate (%)` label; the rates row itself is unchanged (PF-17 labels and order). |
| PF-110 | BLOCK | Description style: no `h1`–`h6`, no `role="heading"`, not `.pf-label` / `.ow-label`; class `pf-desc` (0.875rem, dim, no uppercase). |
| PF-111 | BLOCK | The withdrawal input's `aria-describedby` includes the description's id; with a bad rate it also includes the error id. |
| PF-112 | BLOCK | Read-only: the description shows inside the locked block; Rate used unchanged (withdrawal 5 + ROIC 8 → `5%`; ROIC 8 alone → `4%`). |
| PF-113 | BLOCK | Preview (`personal-finance`, signed in, 360 / 400 / 1024 / 1440): both lines visible, bottom of the block above the top of the `Withdrawal rate (%)` label, font size smaller than the body text and not uppercase, dim colour, no horizontal scroll; dark style, lyre, footer `Orpheus Wisdom`, no gold. |
| PF-114 | BLOCK | Preview: site-style-regression (258 with axe), home-page (154 with axe), site-shell, no-grok, personal-finance, pf-months, personal-finance-e2e PASS (font-load flakes noted as intermittent). |


## Personal Finance: month range under the 12-month average (#132; spec section 25)

Unit / DOM tests cover PF-115..PF-119; the preview suites cover PF-120.

| AC | Tier | Pass when |
|----|------|-----------|
| PF-115 | BLOCK | The `04` Overview table header reads `This month`, `3-month average (Jul–Sep)`, `12-month average (Nov–Oct)` on 2026-10-14 (`pf-ov-avg-head`): short months, en dash, no years, the 3-month label style. |
| PF-116 | BLOCK | The 12-month range is the months the 12-month average is computed over: the current household month (America/Toronto) and the 11 before it; the 12-month figures are unchanged. |
| PF-117 | BLOCK | Rollover in the household timezone, never hardcoded: 2026-10-31T23:59-04:00 → `Nov–Oct`; 2026-11-01T00:00-04:00 → `Dec–Nov`; 2026-11-01T03:30Z (still Oct 31 in Toronto) → `Nov–Oct`; January 2027 → `Feb–Jan`. Unit under TZ=UTC and America/Los_Angeles. |
| PF-118 | BLOCK | The 3-month average, its label and window (PF-91..PF-95) are unchanged. |
| PF-119 | BLOCK | Equity coverage text (#129, PF-98..PF-107) and the Withdrawal rate description (#131) are unchanged; read-only sees the same header. |
| PF-120 | BLOCK | Preview: personal-finance (empty page), site-style-regression (PF copy list) and personal-finance-e2e show the dated header; dark style, lyre, footer `Orpheus Wisdom`, no gold; no horizontal scroll at 400 px. |

## Personal Finance: 12-month average over 12 complete months (#140; spec section 26)

Unit / DOM tests cover PF-121..PF-127; the preview suites cover PF-128. Supersedes the 12-month window of PF-26..31 / Q18 and PF-116, and the `Nov–Oct` header of PF-115 (rows stay as the record).

| AC | Tier | Pass when |
|----|------|-----------|
| PF-121 | BLOCK | The 12-month average is the mean over the last 12 COMPLETE household months (America/Toronto), the current partial month excluded; on 2026-10-14: Oct 2025..Sep 2026; header `12-month average (Oct–Sep)` (`pf-ov-avg-head`). Supersedes PF-116 and the PF-115 example. |
| PF-122 | BLOCK | Rollover / timezone: 2026-10-31T23:59-04:00 → `Oct–Sep`; 2026-11-01T00:00-04:00 → `Nov–Oct`; 2026-11-01T03:30Z → `Oct–Sep`; January 2027 → `Jan–Dec`. Unit under TZ=UTC and America/Los_Angeles. |
| PF-123 | BLOCK | Q-T1 / Q-T2: fewer than 12 complete months with a figure → the mean of those; empty months left out; the label still names the full window. |
| PF-124 | BLOCK | Q-T3 / Q-T5: no complete month with a figure → 12-month average `—`; the 3-month average is the mean of its months with a figure else `—`; Future and Future-on coverage not computed; the current month's figure never enters the 12-month average. |
| PF-125 | BLOCK | C8 fill and Future use the new average: an empty 3-month / chart month takes it; future points' expenses = it (supersedes the PF-107 value), so Future-on coverage (PF-106) divides by it. |
| PF-126 | BLOCK | Unchanged: `This month`, the chart's 12 months (current + 11 before), the 3-month window / label, Future-off coverage (÷ 3-month average), coverage layout (#129), Withdrawal rate (#131). |
| PF-127 | BLOCK | DOM: the header, the 12-month and 3-month figures and Future-on coverage follow the new window on 2026-10-14, and roll over at Nov 1 00:30 ET. |
| PF-128 | BLOCK | Preview: personal-finance (empty page `emptyTexts`), site-style-regression PF copy list and personal-finance-e2e (12-month = June only 4,000 / 9,000 / 5,000; net assets 75,533.33) show the new header and figures; dark style, lyre, footer `Orpheus Wisdom`, no gold. |

### #141 Q-T1 (CFO-changed): 12-month label count (spec section 27)
| ID | Acceptance criterion |
|---|---|
| PF-129 | All 12 complete months have data (expenses or income): the 12-month header is dated, `12-month average (Oct–Sep)` on Oct 14, 2026, and rolls over at 00:00 on the 1st in Toronto (`Nov–Oct`). |
| PF-130 | Fewer than 12 have data: the header reads `12-month average (N of 12 months)`, e.g. `(8 of 12 months)` (the CFO's example), with no range. An income-only month counts. The figures are unchanged. The e2e (June alone) reads `(1 of 12 months)`. |
| PF-131 | None has data: `12-month average (0 of 12 months)` and the figures are `—` (Q-T3). The empty-page QA copy lists read `(0 of 12 months)`. |

PF-129..PF-131 supersede the PF-115/PF-121 header example and PF-123's "full-window label" when fewer than 12 months have data. The Future-on coverage note names no range and is unchanged.

| ID | Acceptance criterion (#141 addendum, CFO via EL) |
|---|---|
| PF-132 | For the 12-month expense average and the N-of-12 count, a month has data only if it has expense entries. An income-only month is neither counted nor averaged as $0: 8 expense months + 1 income-only month give `12-month average (8 of 12 months)` and an expense average over 8. The fill, Future and coverage use that average. The income average keeps its own months. This supersedes PF-130's "an income-only month counts". |

PF-132 also supersedes PF-129's `(expenses or income)`: for the 12 of 12 dated label too, a month has data only if it has expense entries.

### #143 Save blocked while a field has an error; API refuses invalid values (spec section 28)
| ID | Acceptance criterion |
|---|---|
| PF-133 | With October saved (This month 2,950), typing `-5` in Rent shows `Enter a number, 0 or more.`. Pressing Save sends no PUT and shows `Fix the fields marked in red before saving.`; focus moves to Rent. After a reload, This month is still 2,950. |
| PF-134 | The same for a bad tax (`-1` or `101`: `Enter a percent from 0 to 100.`), wages, bonus, share, `Equity to cover`, `Withdrawal rate (%)`, `Portfolio ROIC (%)`, `Starting net assets`, growth, and a foreign line's FX rate. |
| PF-135 | 0 and blank are valid: `0` in Rent saves (one PUT), and This month counts it as 0. |
| PF-136 | Fixing the field clears the note, and Save then saves (one PUT). |
| PF-137 | API: a PUT whose record holds a negative amount, a non-number, a percent above 100, or an FX rate of 0 or less (in any month's lines or the shared values) gets 400 `{ "error": "Invalid value.", "field": "<path>" }`. Nothing is stored and nothing is clamped to 0. A valid record still saves. A blank FX rate is accepted by the API. |
| PF-138 | A refused PUT shows `Not saved.`, and the edits stay unsaved (Save shown). |
| PF-139 | A record already holding `-5` opens with the error shown on that field, and Save is blocked until it's fixed. |
| PF-140 | Read-only is unchanged: no Save and no PUT. |

| ID | Acceptance criterion (#143 addendum: the CFO's condition on Q-S6, via EL) |
|---|---|
| PF-141 | When an automatic save on section open/close is refused (e.g. a record already holding a bad value), `Not saved.` shows and **stays** visible: it doesn't flash away; it clears only on a later successful save. The user's unsaved edits stay on screen, not reverted (field errors still shown, Save still shown). Already true at 8ecd2fc; pinned by a DOM test. |

| ID | Acceptance criterion (#143 addendum after QA's fail at f307e46) |
|---|---|
| PF-142 | Correction to PF-141's "Already true at 8ecd2fc": that claim was wrong. At 8ecd2fc / f307e46 a section toggle sent its PUT (the stored record plus the view) with no field check, so it returned 200 and `Not saved.` never showed. Now, with a field in error on screen (e.g. `-5` in Rent, `520,000` in Starting net assets), closing or reopening a section still toggles it on screen, and the view is kept and sent with the next successful Save. **No PUT is sent.** `Not saved.` shows and stays until a save succeeds. The edits stay on screen. PF-141 still covers a server refusal of a valid on-screen state. |
| PF-133 note | The signed-in e2e check uses its own fixture, whose October This month is **1,500** (PFE-08). PF-133's 2,950 is the issue's repro. Both mean the same thing: This month is unchanged after the blocked Save. |

### #146 12-month income and expense averages over the same months (spec section 29)
| ID | Acceptance criterion |
|---|---|
| PF-143 | Both 12-month averages use the complete months with expense entries. An income-only month counts toward neither: 8 expense months plus 1 income-only month → income and expenses both average over 8, label `12-month average (8 of 12 months)`. |
| PF-144 | Surplus = the income average minus the expense average, on those same months. |
| PF-145 | The month-count label matches the months used (12 of 12 dated; otherwise `(N of 12 months)`). |
| PF-146 | No expense month in the window (income-only months only): the 12-month expenses, income and surplus are `—`, label `(0 of 12 months)`. |
| PF-147 | Future on: future months use the same-months income and expense averages, so net assets grow by that surplus each month. |
| PF-148 | An expense month with no income figure counts as 0 income in the average (Q-U1). The C8 fill (a chart month or 3-month window month with no income figure) uses the new income average. A month's own income stays its own. |
| PF-149 | This month, the 3-month window (C7) and Future-off coverage are unchanged. |
| PF-148 addendum | If none of the expense months has an income figure, the 12-month income and surplus show `—`, not 0. |

### #138 Rate used = the lower of the Withdrawal Rate and half of Portfolio ROIC (spec section 30; supersedes PF-18's rule and PF-108's line 2, by addition)
| ID | Acceptance criterion |
|---|---|
| PF-150 | Both set: Rate used = min(withdrawal, ROIC ÷ 2). Withdrawal 5 and ROIC 8 → `4%` (was 5%), source `from half of Portfolio ROIC`. Withdrawal 3 and ROIC 8 → `3%`, `from Withdrawal Rate`. Withdrawal 4 and ROIC 8 → `4%`, `Withdrawal Rate and half of Portfolio ROIC are equal`. |
| PF-151 | Only one set: withdrawal 5 alone → `5%` (`from Withdrawal Rate`); ROIC 8 alone → `4%` (`from half of Portfolio ROIC`). Neither → `—`, no source line. |
| PF-152 | A typed 0 counts as not set: withdrawal 0 and ROIC 8 → `4%`; ROIC 0 and withdrawal 5 → `5%`; both 0 → `—`. |
| PF-153 | Any rate field in error (ROIC `-8`, withdrawal `101`, `abc`) → Rate used `—`, no source line, even if the other is valid. |
| PF-154 | The source line `pf-rate-source` sits under the value and passes AA contrast. |
| PF-155 | `pf-withdrawal-desc` line 2 reads `Rate Used is the lower of your Withdrawal Rate or half of Portfolio ROIC.` (line 1 unchanged). |
| PF-156 | Equity to cover, its totals, the saved months' figures and the Overview coverage use the new rate: withdrawal 5 and ROIC 8 → Rent 1,000 a month → `300,000` (was 240,000). |
| PF-157 | Read-only shows the same value and source line, with no new control. |

| ID | Acceptance criterion (#138 addendum: the CFO accepted Q-R1..Q-R5 via EL, with a condition on Q-R3) |
|---|---|
| PF-158 | When Rate used is `—` because a rate field is invalid, that field's own error says what to fix. Portfolio ROIC `-8` or `abc` → `Enter a number, 0 or more.` Withdrawal rate `-1`, `101` or `abc` → `Enter a percent from 0 to 100.` The field has `aria-invalid="true"`, Rate used is `—`, and there's no source line. These messages already existed before #138 (4e3a7f1 renders them); they're pinned by a DOM test. |

### #144 Every figure updates live; an unsaved-changes indicator (spec section 31)
| ID | Acceptance criterion |
|---|---|
| PF-159 | Editing an expense or income line on the shown month changes This month (expenses, income, surplus) and the chart's point for that month while typing, before Save. On a past month inside the windows, the 3-month and 12-month averages, surpluses and the `N of 12` label change too. |
| PF-160 | Changing a rate or the household currency changes, while typing, Rate used, Equity to cover, the Expenses totals, every month's figures (so the averages too) and the coverage. |
| PF-161 | Starting net assets, growth, Future and years change the chart, projection and coverage while typing (as before), and the coverage uses the live expense averages. |
| PF-162 | The first edit shows `Unsaved changes` (`pf-unsaved`) beside Save. It's dim and passes AA contrast. |
| PF-163 | A successful Save (2xx) clears `Unsaved changes` and `Not saved.`. A reload shows the saved values and the same figures. |
| PF-164 | Save pressed with a field in error: no PUT, `Fix the fields marked in red before saving.`, `Not saved.`, and `Unsaved changes` stays. |
| PF-165 | A section toggle with a field in error: no PUT, `Not saved.`, and `Unsaved changes` stays. |
| PF-166 | A save the server refuses (tested through the real account client and the real `/api/personal-finance` handler): `Not saved.`, `Unsaved changes` stays, and the edits and live figures stay. |
| PF-167 | Typing back to the saved values hides `Unsaved changes` and Save. Discarding on a month switch (after the confirm) also hides them. |
| PF-168 | The browser's leave-page prompt stays registered while unsaved, including after a blocked or refused save, and goes after a successful save. |
| PF-169 | Read-only: no `Unsaved changes`, no Save, and the figures equal the saved record's. |
| PF-170 | Live figures with a field in error: Rent `-5` counts 0 in This month and the Expenses totals while its error shows. ROIC `-8` makes Rate used and Equity to cover `—`. |

| ID | Acceptance criterion (#144 addendum: QA layout fix at 400 px; the CFO accepted Q-V1, Q-V2 and Q-V4..Q-V7 and chose option (c) on Q-V3) |
|---|---|
| PF-171 | Save and `Unsaved changes` sit in one non-wrapping group. The indicator's space is always reserved (`visibility: hidden` while nothing is unsaved, never `display: none`), and a Save-sized slot holds the button's place. Typing at 320, 360, 400, 1024 and 1440 px moves nothing (pf-months PF-58 layout shift 0) and nothing overflows. Read-only has no indicator element. |
| PF-172 | While any field shows an error, `Figures leave out fields marked in red.` (`pf-figures-note`, dim) shows above the Overview table, and the live numbers stay. Fixing the last error hides it. Its line is always reserved (`visibility`), so nothing moves. |
| PF-173 | Read-only shows no `pf-figures-note`, even when the record holds a bad value. |
| PF-170 addendum | Q-V3 is now option (c): PF-170's live figures stand, together with PF-172's note. |
| PF-174 | (QA, 8dc0b5d at 400 px) From 400 px, Save is on the month select's row (vertical centres within 2 px, Save to the right), clean and unsaved, as PF-32 and PF-58 measure it. Below 400 px Save wraps under the select. The reserved `Unsaved changes` may wrap alone onto the next line, and does so in both states. No layout shift and no horizontal scroll at 320, 360, 399, 400, 1024 and 1440, with or without the red-fields note. Supersedes PF-171's "one non-wrapping group", by addition. |

## Dashboard: company view, ROIC method tooltip (#130; attachments/roic-tooltip-design.md; dashboard-spec §19)

Unit and DOM tests cover CV-16..CV-20. The layout (CV-21) is checked in headless Chromium with the deployed CSS (the page needs sign-in) and by QA signed in.

| AC | Tier | Pass when |
|----|------|-----------|
| CV-16 | BLOCK | The Returns `ROIC` label has a button `company-roic-info` (accessible name `How ROIC is calculated`), and only that row does. Its tooltip `company-roic-tip` (`role="tooltip"`) reads exactly `ROIC = operating income × (1 − tax rate) ÷ average invested capital (equity + debt − cash) over the last two year-ends. Cash is excluded, which raises ROIC for net-cash companies.` |
| CV-17 | BLOCK | The tooltip opens on mouse hover (button or tooltip) and on keyboard focus. It closes on mouse leave and on blur. |
| CV-18 | BLOCK | A tap (click) toggles it. A second tap or a tap elsewhere closes it. Escape closes it from any of these states. |
| CV-19 | BLOCK | The button has `aria-describedby` pointing to the tooltip's id, and `aria-expanded` follows the open state. The tooltip is always in the DOM, hidden with `visibility` while closed. |
| CV-20 | BLOCK | It shows whatever ROIC's status (ok, `n/m`, insufficient history). A fund (no Returns section) has none. The ROIC formula and value are unchanged. |
| CV-21 | BLOCK | No layout shift on open or close, and no horizontal overflow at 320, 360, 400, 1024 and 1440 px. The tooltip text is chalk on night (AA), the button is ≥ 44 px with the 2 px chalk focus ring, and there's no gold. |

**Addendum (#130, Q-T1 short wording, dashboard-spec §19.1).** CV-22 supersedes CV-16's quoted text only; the rest of CV-16 still applies.

| AC | Tier | Pass when |
|----|------|-----------|
| CV-22 | BLOCK | The tooltip `company-roic-tip` reads exactly `Operating income after tax ÷ average (equity + debt − cash). Cash excluded.` (PM's Q-T1 short wording, which supersedes CV-16's long text). Nothing else changes: CV-17..CV-21 still apply. |

## QA tools: font wait (#135; site-style-spec §17)

Tools only. These checks cover the harness itself, not the site.

| AC | Tier | Pass when |
|----|------|-----------|
| FW-01 | BLOCK | `site-shell.mjs` waits with `fontsSettled` (qa/tools/fonts.mjs) before each font-dependent measurement: signed-out pages on both hosts, ROLE-01 399 / 400, signed-in `/dashboard` (both ST0-05 shots) and `/personal-finance`. After a reload, the HTTP checks read the reload's response. |
| FW-02 | BLOCK | `site-style-regression.mjs` waits after the ST6-06 request / preload checks and before the h1 font, ST6-07 and the other measurements. The cold-load CLS check stays cold. |
| FW-03 | BLOCK | No assertion is loosened: only waits are added (diff review). |
| FW-04 | BLOCK | 5+ signed-out runs per side on a preview: 0 font FAILs (ST1-01 phone360, ST6-06 h1, ST6-07, ST6-05) with the wait, against the baseline count. |
| FW-05 | BLOCK | QA, signed in with `--compare-url`: ST0-05 `/dashboard` pixel diff passes at all 4 widths. |

## Personal Finance: one money format (#142; personal-finance-spec section 32; attachments/pf-money-format-design.md)

| AC | Tier | Pass when |
|----|------|-----------|
| PF-175 | BLOCK | Every computed PF money figure shows exactly two decimals with comma thousands separators (`4,296.30`, `1,200.00`, `83.33`, `0.00`). |
| PF-176 | BLOCK | No currency symbol on amounts. The coverage line reads `<m> <code>/mo (<y> <code>/yr)`, with both figures in two decimals. |
| PF-177 | BLOCK | Negatives show `-1,234.50`. Nothing shows `-0.00`. |
| PF-178 | BLOCK | Rounding is display only: half away from zero to the cent. Totals are summed from unrounded values (unchanged). |
| PF-179 | BLOCK | Scope:<br>• Overview: This month, 3-month and 12-month figures, Future figures, chart tooltip<br>• Coverage<br>• Income: table, Net, Converted<br>• Expenses: totals, the Equity to cover placeholder, the converted Monthly / Yearly field<br>All use `formatMoney`. |
| PF-180 | BLOCK | Unchanged: typed input text, percentages (one decimal), Rate used (`12.5%`), FX rates, compact chart ticks. |
| PF-181 | BLOCK | `—` for a figure that isn't computed, unchanged. |
| PF-182 | BLOCK | QA #133 fixture (8 expenses, 1 income-only person), signed in: the Overview 3-month Income reads `4,296.30`. |

> **Clarification (2026-10-15, PF-182):** the "QA #133 fixture" in PF-182 means test data shaped like the #133 set: 8 expense months, income 4,000 with Aug 4,388.9 and Sep 4,500, plus an income-only January. On that data the 3-month Income reads `4,296.30`. The real #133 set reads `4,266.67` because of #148. Both must show two decimals.

## Personal Finance: saved chart report, data model (#153; personal-finance-spec section 33; attachments/pf-chart-report-design.md)

Backend only. Signed-in checks: `qa/tools/pf-report-api.mjs` (needs `QA_EMAIL` / `QA_PASSWORD`). Signed out, it checks PFR-01 only.

| AC | Tier | Pass when |
|----|------|-----------|
| PFR-01 | BLOCK | `/api/personal-finance/report` signed out: 401 JSON for GET / PUT / DELETE. Another method: 405. |
| PFR-02 | BLOCK | Signed in with nothing saved: `GET` → `{ "report": null, "missing": [] }`. |
| PFR-03 | BLOCK | `PUT` a valid report → 200 with the report; `GET` returns the same (survives reload / another device). |
| PFR-04 | BLOCK | `PUT` replaces the whole report (one report per person). |
| PFR-05 | BLOCK | Series kinds: `line`, `account`, `category`, `group` (`fixed` / `variable` / `all`), `metric` (`income` / `expenses` / `surplus` / `net-assets`). Anything else → 400 `{ "error": "Invalid value.", "field": "series.<i>.kind" }` (or `.id`). |
| PFR-06 | BLOCK | 0 or more than 12 series, or a duplicate kind + id → 400 with `field` `series`. |
| PFR-07 | BLOCK | Range presets `3m` / `6m` / `12m` / `24m` / `ytd` are accepted; any other preset → 400 `range.preset`. |
| PFR-08 | BLOCK | A custom range `{ from, to }` in `YYYY-MM` is accepted. `from` after `to`, more than 24 months, a bad month, or a year outside 2000–2100 → 400 `range`. |
| PFR-09 | BLOCK | Chart `line` / `bar` / `stacked-bar` is accepted; anything else → 400 `chart`. |
| PFR-10 | BLOCK | An unknown key (top level, in a series or in the range) → 400. A body that isn't JSON → 400. More than 4 KB → 413. Nothing is stored on any refusal. |
| PFR-11 | BLOCK | A line / account / category series that is not in the record is kept as saved and listed by index in `missing`. Group and metric series are never missing. |
| PFR-12 | BLOCK | `DELETE` → `{ "report": null, "missing": [] }`; a later `GET` → null. |
| PFR-13 | BLOCK | The record API never shows the report (`GET /api/personal-finance` has no `orpheus.finance.report.v1`), and a record `PUT` keeps the saved report. A record `PUT` naming it → 400 `Unknown name`. |
| PFR-14 | BLOCK | Per person: a CFO (Read only is enough) saves their own report. The owner and the CFO each see only their own. `missing` is checked against the owner's record. No grant → 403. |
| PFR-15 | BLOCK | The client and the API use one validator (`reportError` in `src/lib/finance/report.ts`). |
| PFR-16 | BLOCK | No migration file is added. No UI, navigation or style change. |

## Personal Finance: month control allows any past month (#163; personal-finance-spec section 34; attachments/pf-any-month-design.md)

Signed in (`qa/tools/pf-months.mjs`, `qa/tools/personal-finance.mjs`, `qa/tools/personal-finance-e2e.mjs`). Supersedes PF-48's "12 choices".

| AC | Tier | Pass when |
|----|------|-----------|
| PFM-01 | BLOCK | Under the title: label `Month` above a select with `Jan`..`Dec`, and label `Year` above a select with the current year down to `2020`. Then the Save slot. |
| PFM-02 | BLOCK | Default: the current household month (for example October / 2026). |
| PFM-03 | BLOCK | In the current year, the months after the current month are disabled. Choosing the current year while a later month is chosen opens the current month. No future month can be opened. |
| PFM-04 | BLOCK | Any past month from January 2020 opens (for example March 2021): its own saved lines if it has them. |
| PFM-05 | BLOCK | An empty past month opens as a copy of the current month's saved lines, with `Copied from October 2026 — edit and save.`, and `Save` shown. Nothing is stored until Save. |
| PFM-06 | BLOCK | Editing and saving an old month (for example March 2021) stores it. After a reload it reopens with its own lines, and the current month is unchanged. |
| PFM-07 | BLOCK | Storage keeps every saved month from 2020-01 (no 24-month limit): 30+ saved months all survive a save and a reload. No migration. |
| PFM-08 | BLOCK | `Discard unsaved changes?` only after something was typed or changed. Moving on from an untouched copy doesn't ask. Year then Month asks at most once. |
| PFM-09 | BLOCK | The 3-month and 12-month averages, This month and the chart don't change when a month older than their windows is saved. |
| PFM-10 | BLOCK | Read-only (a CFO with Read): any month can be opened; no `Save`. |
| PFM-11 | BLOCK | Layout at 360 / 400 / 1024 / 1440: Month, Year and Save on one row under the title, each control ≥ 44 px tall. No horizontal scroll, strict CLS 0, no gold. |
| PFM-12 | BLOCK | Copy: the only new visible text is `Year` (and the options `Jan`..`Dec` and the years). |
| PFM-13 | BLOCK | The currency model and Equity Coverage are unchanged (their existing PF checks pass). |
| PFM-14 | BLOCK | The #153 report's custom range is still at most 24 months. |

> **Addendum (2026-10-16, #163, PFR-14):** `qa/tools/pf-report-api.mjs` now also checks per-person isolation (with the CFO's report saved, the owner's GET does not return it) and, with `QA_NOGRANT_EMAIL` / `QA_NOGRANT_PASSWORD`, 403 for GET / PUT / DELETE without a Personal Finance grant. This is QA's optional #153 follow-up.

> **Change (2026-10-16, #163, CFO): Q-Y6 rejected.** PFM-05 ("an empty past month opens as a copy") is superseded by PFM-15..PFM-17. The PFM-04/06/08 checks open a past month blank and use the button.

| AC | Tier | Pass when |
|----|------|-----------|
| PFM-15 | BLOCK | An empty past month (for example June 2026 or March 2021) opens blank: no lines, no people, no note, no `Save`. The month control's texts are `Month`, `Year`, `Copy from current month`. |
| PFM-16 | BLOCK | `Copy from current month` (existing button style) is shown only for an empty past month, to a writer, when the current month has saved lines. It isn't on the current month, and it goes once the month has lines. A click copies the current month's lines and people, and shows `Copied from October 2026 — edit and save.` and `Save`. |
| PFM-17 | BLOCK | After the copy nothing is stored (no PUT, the record unchanged) until `Save`. `Save` stores the month. Leaving a copied month asks `Discard unsaved changes?`; leaving a blank one doesn't. |
| PFM-18 | BLOCK | An empty current month is unchanged: it opens as a copy of the most recent month with lines (PF-56), with no button. |
| PFM-19 | BLOCK | Read-only: an empty past month is blank, with no button and no `Save`. |
