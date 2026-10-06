# Orpheus site style: dark, mobile first (epic #66): spec

Status: **approved brief, dark** (epic #66, re-scoped by Diego via CoS and EL, 2026-10-05 21:26 ET). Written out
in #67 (ticket 1, docs only; no product code). This file is the source of truth for the shell (every page), the
calculator, home and sign-in in tickets #68, #70, #69, #73 and #72. The dashboard's content is on hold (#71).
The calculator rules stay in `attachments/dca-app-spec.md` and the dashboard data rules in
`attachments/dashboard-spec.md`; both are unchanged by this epic. If chat and this file disagree, stop and ask EL.

## 1. Decision log

| When | Decision |
|---|---|
| 2026-10-04 | Epic #53 (dashboard redesign) keeps the **dark style**: charcoal bar (`#1e2124`), same tokens and fonts. |
| 2026-10-05, evening | A **white** site style was proposed for epic #66 (PR #74 first drafts, with a same-day schedule revision at 21:04 ET). |
| **2026-10-05 21:26 ET** | **White is dropped; dark wins** (Diego via CoS and EL). Nothing white gets merged. **The #53 dark style stands and is extended** to a charcoal page with off-white type on every page this epic ships, under a dark shell on every page. EL's earlier answers to the white-draft questions are void wherever they assume white. The white drafts survive only in the PR #74 history (commits `1aa2192`..`a9d8cca`). |
| 2026-10-05, after 21:26 ET | Diego approved the calculator's **phone layout** (via EL): fields stack, chart full width, Lump sum and DCA in two columns if they fit, short painting band (section 7a); it replaces "Phone is one column". |
| 2026-10-05, ≈ 22:00 ET | EL accepted **every section 12 default** (Q0, Q2, Q4, Q5, Q6, Q8, Q10, Q11, Q12, Q13, Q14, Q15) and the green `#5cc08a`. Q12 with a caveat: the per-name table, the summary line and the swipe hint go unless a DCA rule or acceptance row needs those figures shown (none does; #70 checked `attachments/dca-app-spec.md` and the QA pack). |
| 2026-10-05, ≈ 22:05 ET | EL amendments folded into #70: **A1 / A9** (ST4-10: short `Lump sum` / `DCA` row labels, the metric labels word for word as full-width captions, two columns while each is ≥ 150 px), **A2** (ST4-08: rows full width, remove control beside the ticker), **A3** (new ST4-14: the hero text clear of Venus), **A4** (new ST4-15: the wash contains the hero text), **A11** (ST4-04: the note 13 px dim, one line at 360 without changing its wording), exact sizes (section 7), a primary-button row (ST4-16), the 300 KB limit at 2x and CLS by PerformanceObserver (ST4-01), phone below 1024 px / wide from 1024 px (section 7a), the bar on one line at 360 (ST1-01), `color-scheme: dark` (section 6), the `/dashboard` screenshot compare against production (ST0-05). |

What "extended" means against today's site (`main`): today the bar is charcoal (`bg-ink`), the calculator has a
charcoal header band, and the pages and the footer are white (`--color-paper`). The dark brief makes the bar,
the footer and the page charcoal, with off-white type.

Unchanged by this epic: the calculator rules (DCA-01..06) and logic files (`src/lib/dca/*`,
`src/routes/api/chart.ts`), the `$313,000` regression value in `qa/tools/site.mjs`; the dashboard data rules and
its content (holdings, chips, book, its styles and data); the dashboard stays released and visible
(`DASHBOARD_ENABLED` and every env var untouched); `noindex` meta and `X-Robots-Tag: noindex, nofollow` on every
page; the analytics rules (#48); no buy / sell / hold wording and no disclaimer. No hires. #50, #51 and PR #52
stay paused until Oct 12; this epic doesn't touch them.

## 2. The brief (verbatim from epic #66, dark)

Rules: no hires. Calculator rules and dashboard data rules are unchanged. The dashboard stays released and
visible; its content is on hold until a new brief. #50, #51 and PR #52 stay paused until Oct 12. No extra
instructions anywhere, and AA contrast on dark. One PR at a time: draft PR, EL answers, QA on the preview, merge,
prod check.

- **Shell on every page (#68):** charcoal bar and page, off-white type. The bar has 'Orpheus' on the left, then
  'Calculator' and 'Dashboard' on the right, with the current page marked. Footer: 'Orpheus Wisdom'. On
  /dashboard only the shared bar and footer may change; the dashboard content (holdings, chips, book, its styles
  and data) is untouched.
- **Calculator `/calculator` (#70):**
  - Dark charcoal page under the shell.
  - Hero band: Botticelli, 'The Birth of Venus'. Public-domain image with source and license recorded,
    optimised, explicit width and height. A small '01' and the title 'Dollar-cost average calculator.' sit lower
    left on a soft wash, in plain type, not a poster.
  - Borderless fields with a thin underline only: tickers, start, end, starting capital, contribution, and
    weekly or monthly. The listings note is one line under the form.
  - Chart: one green line with a soft green fill, and the last value in a small green pill.
  - Results: Lump sum and DCA as label-value rows. No boxes, no spreadsheet table.
  - Logic untouched; the $313,000 regression unchanged. Phone is one column.

- **Home `/` (#69):** in the dark shell. The Jordaens hero, the line 'Investment driven by research.' and the
  Platforms lines all stay.
- **Sign-in (#73):** dark. Email, password and a 'Create an account' link only.

**Phone layout for the calculator (Diego via EL, 2026-10-05, after the dark brief; replaces "Phone is one
column"):** on a phone the fields stack, one under another; the chart is full width; Lump sum and DCA sit in two
columns if they fit, and stack only if they don't (check at 360 and 400); the painting is a short band;
otherwise the same: dark page, Botticelli hero, borderless underlines, green line, green pill. The wide page
stays as briefed. Section 7a.

## 3. Schedule (one PR at a time)

| Day | Ticket | What ships |
|---|---|---|
| Mon Oct 5 (tonight) | #67 | This spec and the harness (PR #74, rewritten to dark; docs only) |
| Mon Oct 5 (tonight) | #68 | Dark shell on every page: bar, footer, page and base type (on `/dashboard`: bar and footer only) |
| Mon Oct 5 (tonight) | #70 | Calculator: Botticelli hero, underline form, green chart, label-value results |
| Sat Oct 10 | #69 | Home in the dark shell: Jordaens hero, `Investment driven by research.`, Platforms lines |
| Sun Oct 11 | #73, then #72 | Sign-in, dark; then leave-outs, contrast and regression on the shipped pages |
| On hold | #71 | Dashboard content: waits for a new brief via CoS |

## 4. Exact copy (verbatim; tests and QA compare these strings)

| Where | String |
|---|---|
| Bar, left (→ `/`) | `Orpheus` |
| Bar, right (→ `/calculator`, `/dashboard`) | `Calculator`, `Dashboard` |
| Footer (only text) | `Orpheus Wisdom` |
| Hero numeral (calculator; home, Q11) | `01` |
| Calculator title (`h1`) | `Dollar-cost average calculator.` |
| Home line (`h1`) | `Investment driven by research.` |
| Home Platforms section (Q11) | `02`, `Platforms` |
| Home Platforms line 1 (→ `/calculator`) | `Calculator`, `Dollar-cost average calculator.`, `Open` |
| Home Platforms line 2 (→ `/dashboard`) | `Dashboard`, `The portfolio as a business: fundamentals for each name, and the whole.`, `Open` |
| Calculator listings note (unchanged) | `US, EU and CA listings, one currency per basket.` |
| Sign-in link | `Create an account` |

The Platforms lines are the ones in the approved home brief, unchanged (Q11: `main` itself still shows the #46
home, one line `Orpheus Wisdom is a private desk with two tools.` and two cards; #69 replaces it).

## 5. Tokens (dark) and AA contrast

New tokens, added next to the existing ones by #68. **No existing token value changes** (`--color-ink`,
`--color-paper`, `--color-line`, `--color-muted`, `--color-card`, `--color-dca`, `--color-focus` and the shared
`.field` / `.kicker` / `.section` classes stay exactly as on `main`), because the dashboard content renders with
them and must not change.

| Token (proposed name) | Value | Use |
|---|---|---|
| `--color-night` (charcoal) | `#1e2124` | Page, bar, footer (the #53 bar colour, extended) |
| `--color-chalk` (off-white) | `#f2f0eb` | Body text, headings, current bar item, values, primary button fill |
| `--color-dim` | `#a8aeb4` | Secondary text: labels, other bar items, footer, captions |
| `--color-rule` | `#8b9298` | Field underlines (the only boundary of a field) |
| `--color-hair` | `#3a3f44` | Decorative hairlines only (bar / footer edge, chart grid); never a control boundary, never text |
| `--color-green` | `#5cc08a` | The one green: chart line, chart fill (at 16% over charcoal = `#283a34`), the last-value pill |
| `--color-alert` | `#ff8f87` | Error text (Q8) |
| focus ring | `--color-chalk` | `:focus-visible` outline on dark pages (the green stays for the chart only) |
| hero wash | `--color-night` at ≥ 85% opacity behind the hero text, fading out toward the painting | Soft wash under `01` and the title |

Measured contrast (WCAG 2.x relative luminance; 4.5:1 for text, 3:1 for large text and non-text UI):

| Pair | Ratio | Needed |
|---|---|---|
| chalk `#f2f0eb` on night `#1e2124` | 14.2:1 | 4.5 |
| dim `#a8aeb4` on night | 7.2:1 | 4.5 |
| rule `#8b9298` (field underline) on night | 5.1:1 | 3 (non-text) |
| green `#5cc08a` (chart line) on night | 7.2:1 | 3 (non-text) |
| green line on the green fill `#283a34` | 5.4:1 | 3 (non-text) |
| chalk on the green fill | 10.6:1 | 4.5 |
| dim (axis labels) on the green fill | 5.4:1 | 4.5 |
| night text on the green pill `#5cc08a` | 7.2:1 | 4.5 |
| alert `#ff8f87` on night | 7.3:1 | 4.5 |
| chalk focus ring on night | 14.2:1 | 3 (non-text) |
| night text on a chalk button | 14.2:1 | 4.5 |
| chalk on the hero wash, worst case (85% night over a pure white pixel = `#404245`) | 8.9:1 | 4.5 |
| dim on the hero wash, worst case | 4.5:1 | 4.5 (borderline: hero text uses chalk only) |
| hair `#3a3f44` on night | 1.5:1 | decorative only, exempt |

## 6. Shell (#68, every page)

- **Bar:** today's single `SiteMenu`, restyled: charcoal, thin (≈ 44 px), sticky on scroll, `Orpheus` left,
  `Calculator` and `Dashboard` right, no dropdowns; the current page `aria-current="page"` in chalk with an
  underline, the others in dim; plain links (full page loads), so `/dashboard` keeps its server gate. Same
  component and items on every page, including `/dashboard`, `/dashboard/sign-in` and a 404.
- **Footer:** today's single `SiteFooter`, restyled charcoal; the only text is `Orpheus Wisdom` (dim), on every
  page.
- **Page and base type:** charcoal page and chalk base text on every page except `/dashboard`.
- **`/dashboard`: only the bar and footer change.** The dashboard content (holdings, chips, book, its styles,
  its data, its `bg-paper` wrapper) is untouched and stays visible; no file under `src/routes/dashboard.tsx` or
  `src/components/dashboard/` changes, and no existing token or shared class changes (Q13 on the page
  background around the content).
- **Pages whose content converts later** (home until #69, sign-in until #73): #68 changes only the shell around
  them; their content keeps its current look and must stay AA-readable on the new page background (e.g. the
  home line inherits chalk; the home cards and the sign-in form keep their own white panels until their day).
- **`theme-color` meta:** `#1e2124` (already the value in `__root.tsx`).
- **`color-scheme: dark`** on the dark pages (EL, 2026-10-05; landed in #70 on the shell: `scheme-dark` in
  `shellBodyClass()`), so native date pickers and select popups open dark. Not on `/dashboard` (its content stays
  as on `main`, Q13).

## 7. Calculator (#70, tonight)

- **Page:** charcoal under the shell; no white surface left on `/calculator` (the header band, the
  `bg-paper` wrappers, the sticky table cells and the right-edge fade all go dark or go away).
- **Hero band:** Sandro Botticelli, *The Birth of Venus* (c. 1484–1486), under the bar. `01` (small) and the
  `h1` `Dollar-cost average calculator.` lower left on the soft wash, in plain type: the site font
  (Schibsted Grotesk), normal weight, no all caps, no text effects, the title ≤ 48 px at 1440 and ≤ 32 px on a
  phone: a page title, not a poster. Venus and her scallop shell stay clear of the text and wash at 360, 400,
  1024 and 1440 (crop / `object-position` per width). On a phone the band is short (section 7a).
- **Image:** public domain; source and licence recorded in the repo by #70 next to the asset (e.g.
  `public/hero/calculator-SOURCE.md`); served from the app (no request to another host); optimised
  (responsive `srcset`, AVIF or WebP with a JPEG fallback, ≤ 300 KB at 1440 px); explicit `width` and `height`
  attributes, so layout shift is 0; `alt` names the painting; no visible credit (Q5).
  Candidate: Wikimedia Commons, `File:Sandro_Botticelli_-_La_nascita_di_Venere_-_Google_Art_Project_-_edited.jpg`
  (https://commons.wikimedia.org/wiki/File:Sandro_Botticelli_-_La_nascita_di_Venere_-_Google_Art_Project_-_edited.jpg),
  from the Google Art Project; tempera on canvas, 172.5 × 278.5 cm, Uffizi, Florence (inv. 1890 no. 878).
  Licence on the file page (checked 2026-10-05): public domain (author died 1510; PD-old-100 and PD-US-expired;
  a faithful reproduction of a 2D public-domain work, PD-Art). #70 re-checks and records the exact tags.
- **Form:** borderless fields with a thin underline only (rule `#8b9298`, no box, no fill, no radius): the
  basket's tickers (each with its weight, Q14), start, end, starting capital, contribution, and weekly or monthly
  (the existing select, styled the same). Labels stay visible. Section numbering continues from the hero `01`
  (today `02` Basket, `03` window and amounts, `04` Result). The calculator gets its own field class; the shared
  `.field` stays as it is for the dashboard (Q10).
- **Listings note:** `US, EU and CA listings, one currency per basket.` stays one line (no wrap at 360 or 400 px)
  under the form. Q2 for the dividends rule.
- **Chart (today: two charts, one series each; see section 10):** one chart, one series, the DCA portfolio value
  (DCA NLV over time) by default: a green line, a soft green fill under it, and the last value in a small green
  pill (night text on green, full digits, the same money format as the results). No second chart, no legend
  paragraph, no "each plan has its own scale" note.
- **Results:** `Lump sum` and `DCA` as label-value rows: for each plan, the existing metric labels
  (`METRIC_ROWS`: Total invested, NLV at end, Money-weighted return, Total return, CAGR on total invested, Max
  drop, NLV at that drop, Return to the drop) each with its value. No boxes, no borders around them, no `<table>`
  (Q12 for the per-name table, the summary line and the method note). For PLTR 50 / TQQQ 50, 2020-10-02..
  2026-10-01, 1,000 + 1,000 weekly, DCA `Total invested` reads `$313,000`.
- **Layout:** the wide page (1024, 1440) as briefed above; the phone layout is section 7a. No horizontal page
  scroll at 360, 400, 1024 or 1440.
- **Logic untouched:** no change to `src/lib/dca/*` or `src/routes/api/chart.ts`; `qa/tools/site.mjs` keeps
  `$313,000` and may only change how it finds the value (label-value rows instead of a table row).
- **No extra instructions:** the intro paragraph (`Pick tickers and weights, …`), the swipe hint and the chart
  scale note go (and the two field hints, `Used only by the lump-sum plan.` and `New cash on each DCA date.`).
- **Exact sizes (EL, 2026-10-05; as built in #70):**

  | Part | Size |
  |---|---|
  | Hero `01` | 12 px, line-height 1.2, weight 400, chalk, no letter-spacing |
  | Hero title | 22 px on a phone (one word per line), 40 px at 1024, 44 px from 1280 (≤ 48 at 1440); line-height 1.1; weight 400; chalk |
  | Hero wash | night at 88% behind `01` and the title, 10–12 px padding on a phone, 16–20 px wide; a soft edge (`box-shadow 0 0 12px 4px` night at 50%); radius 0 |
  | Phone band | `min(50vw, 200px)` tall (180 at 360, 200 at 400 and up to 1023); wide band at the crop's aspect ratio (250 at 1024, 351 at 1440), ≤ 460 px |
  | Field | 44 px tall, no box border, no fill, radius 0, 16 px text; the underline 1 px solid rule `#8b9298` (chalk while focused) |
  | Focus ring | 2 px solid chalk, offset 2 px, on every field (a date field's calendar button too), button and link |
  | Field label | 12 px, letter-spacing 0.14em, upper case, dim |
  | Primary button (Q6) | 48 px tall, 24 px side padding, 14 px text, chalk `#f2f0eb` fill, night `#1e2124` text (14.2:1), radius 0; while reading prices: dim fill, night text (7.2:1) |
  | Listings note (A11) | 13 px, line-height 1.4, dim (the "muted" colour on dark), one line, `nowrap` (302 px wide at 360, inside the 320 px column) |
  | Chart | 224 px tall; line 2 px green `#5cc08a`; fill green at 16% opacity (`#283a34` over night); grid hair; axis ticks 12 px dim |
  | Last-value pill | 22 px tall, radius 11 px, 8 px side padding, 12 px weight 500, night text on green (7.2:1), the results' money format |
  | Results | caption (metric label) 13 px dim, full width; row label (`Lump sum`, `DCA`) 14 px dim; value 13 px on a phone, 14 px wide, chalk, `nowrap`; two columns while each is ≥ 150 px (`repeat(auto-fit, minmax(150px, 1fr))`, 16 px gap) |
  | Captions under the results | 13 px dim: `Dividends reinvested.` (DCA-01, Q2), then only the run-specific lines (Q12) |
  | Error line (Q8) | 14 px `#ff8f87` (7.3:1), under the listings note |

## 7a. Calculator on a phone (approved by Diego via EL, 2026-10-05; replaces "Phone is one column")

Phone = below 1024 px wide (EL, 2026-10-05): the phone rules apply below 1024 px and the wide layout (form left,
results right) from 1024 px. QA checks the phone rules at 360 and 400 and the wide layout at 1024 and 1440.

- **Fields stack**, one under another; the field rows span the full width (A2; Q15: a basket row's ticker sits
  above its weight, with the row's remove control beside the ticker). The listings note is still one line under
  the form.
- **The chart is full width** (the full content column, same left and right edges as the fields; the y-axis
  labels inside it, the pill not clipped).
- **Lump sum and DCA sit in two columns if they fit, and stack only if they don't** (EL A1 / A9). Each metric's
  label (`METRIC_ROWS`, word for word, e.g. `Money-weighted return (XIRR, per year)`) is a full-width caption;
  under it the short row labels `Lump sum` and `DCA`, each with its value. Two columns while each column is at
  least 150 px wide, otherwise stacked (Lump sum above DCA): `repeat(auto-fit, minmax(150px, 1fr))`. Every value
  stays whole on one line, nothing is clipped, no horizontal scroll. Expected: two columns at 360 and at 400.
- **The painting is a short band** (≤ 200 px tall at 360 and 400), with `01` and the title still lower left on
  the wash and Venus visible.
- **Otherwise the same as wide:** dark page, Botticelli hero, borderless underlines, green line, green fill and
  green pill, label-value results. Calculator rules unchanged.

## 8. Home (#69, Sat Oct 10)

- In the dark shell, charcoal page. The Jordaens band under the bar (Jacob Jordaens, *Triumph of Frederick
  Henry, Prince of Orange*, 1652, Oranjezaal, Huis ten Bosch). `01` and the `h1` `Investment driven by research.`
  lower left on the same soft wash and plain type as the calculator, so the prince and the horses stay clear.
- Then `02` `Platforms` with the two lines of section 4, each `Open` a link. Nothing else between the bar and the
  footer (the #46 line and cards go).
- Image rules as for the calculator (public domain, recorded in the repo by #69, optimised, explicit width and
  height, `alt` names the painting, no visible credit). Candidate: Wikimedia Commons,
  `File:The_Triumph_of_Frederik_Hendrik,_by_Jacob_Jordaens_(I).jpg` (4,587 × 4,385 px; from RKD, digital ID
  249278); public domain (author died 1678; the RKD copy carries the Public Domain Mark 1.0), checked 2026-10-05.
- Home still does no calculating, and `/?query` still redirects to `/calculator?query`.

## 9. Sign-in (#73, Sun Oct 11)

- `/dashboard/sign-in` is its own route (`src/routes/dashboard_.sign-in.tsx`, not nested in `/dashboard`), so
  #73 changes that file only (plus sign-in-only classes, Q10). Dark: charcoal page, chalk type, underline fields.
- Shows exactly `Email`, `Password`, the submit button and the `Create an account` link (Q4: plus the heading;
  an error line only after a failed attempt). Create-account mode mirrors it with a `Sign in` link. The
  invite-only note goes. The auth logic is unchanged.

## 10. What the code has today (for #70)

- **Chart:** two charts (`PlanChart` in `src/components/desk.tsx`), one per plan, each a recharts `LineChart`
  with **one series**: DCA NLV in `--color-dca` `#2b5945` and lump-sum NLV in `--color-ink`, each on its own
  y-axis, with a caption line per chart and the note `Each plan has its own scale, so the two charts are not
  drawn to the same height.` So: two series in total, across two charts. The dark default keeps the DCA series
  only (2.0:1 for `#2b5945` on charcoal, below 3:1, hence the new green).
- **Results:** the `result-summary` line, a plan comparison `<table>` (8 metric rows × Lump sum / DCA, sticky
  white label column, swipe hint and dots on phone), a per-name `<table>` (Name, Weight, Last, Lump sum shares,
  DCA shares), then the method paragraph (`Prices are raw daily closes. …`, plus run-specific lines).
- **Fields:** already underline-only (`.field`: no border, 1 px ink underline, transparent), shared with the
  dashboard and sign-in.

## 11. Acceptance (ST rows; QA at phone 400 × 860, 1024 × 800 and 1440 × 900, plus 360 × 780 for the calculator's phone rows)

Each row is checked on the PR preview at 400, 1024 and 1440 (the calculator's phone rows also at 360), then on production after the merge. "Shipped page" =
`/calculator` (from #70), `/` (from #69), `/dashboard/sign-in` (from #73). ST2 (hover) is retired: the dark brief
has no hover rule.

**ST0: tokens and the decision**

| ID | Pass when |
|---|---|
| ST0-01 | On every shipped page the page, bar and footer backgrounds compute to `#1e2124` and body text to `#f2f0eb`; no white surface remains on a shipped page (only the hero image itself is light). |
| ST0-02 | Shipped pages use only the section 5 tokens; the green `#5cc08a` appears only on the chart line, the chart fill and the last-value pill; the font is Schibsted Grotesk. |
| ST0-03 | Every text / token pair on a shipped page meets AA on dark (section 5 table: text ≥ 4.5:1, large text and non-text UI such as underlines, focus ring, chart line and pill ≥ 3:1); an axe-core run reports no `color-contrast` violation. |
| ST0-04 | Docs: the decision log records that white was proposed on 2026-10-05 and dropped at 21:26 ET, and that the #53 dark style stands and is extended; no doc says white supersedes dark. (#67) |
| ST0-05 | `/dashboard` content is untouched: only the bar and footer differ from `main`; holdings, chips, book, their styles and data render as before; released and visible; signed-out `/dashboard` still 307s to sign-in; no diff in `src/routes/dashboard.tsx`, `src/components/dashboard/*`, existing token values or `.field` / `.kicker` / `.section`; `qa/tools/dashboard-redesign.mjs --read-only` still passes. "Only the bar and footer differ" is checked by a screenshot compare of the main content (the dashboard's `bg-paper` wrapper, bar and footer hidden) against production with the same account: `qa/tools/site-shell.mjs --compare-url <production>` signed in, pixel-identical. |

**ST1: bar and footer on every page (#68)**

| ID | Pass when |
|---|---|
| ST1-01 | On every page (`/`, `/calculator`, `/dashboard`, `/dashboard/sign-in`, a 404) one thin charcoal bar (height ≤ 48 px), sticky on scroll: `Orpheus` left (→ `/`), `Calculator` and `Dashboard` right (→ `/calculator`, `/dashboard`), in that order, no other items, no dropdowns; at 360 and 400 px all three fit on one line with no horizontal page scroll. |
| ST1-02 | The current page's item has `aria-current="page"` and a visible mark (chalk and underline; the others dim): exactly one item on `/` (Orpheus), `/calculator`, `/dashboard` and `/dashboard/sign-in` (Dashboard); none on a 404. |
| ST1-03 | On every page the footer is charcoal and its only text is exactly `Orpheus Wisdom`. |
| ST1-04 | One bar component and one footer component serve every page (same markup on `/dashboard` as elsewhere); plain links, so every page reaches every other in one click and `/dashboard` stays server-gated. |

**ST3: home `/` (#69, Sat Oct 10)**

| ID | Pass when |
|---|---|
| ST3-01 | Charcoal page in the dark shell; under the bar the Jordaens band (*Triumph of Frederick Henry, Prince of Orange*, 1652), `alt` naming it; source and licence recorded in the repo; optimised, served from the app, explicit `width` and `height`, layout shift 0. |
| ST3-02 | `01` and the `h1` `Investment driven by research.` sit lower left on the soft wash in plain type; at 400, 1024 and 1440 the prince and the horses are not covered by the text or the wash. |
| ST3-03 | `02` `Platforms` follows with exactly the two lines of section 4 (`Calculator` · `Dollar-cost average calculator.` · `Open` → `/calculator`; `Dashboard` · `The portfolio as a business: fundamentals for each name, and the whole.` · `Open` → `/dashboard`); nothing else between the bar and the footer. |
| ST3-04 | Home does no calculating (no price requests, no calculator code) and `/?query` still redirects to `/calculator?query`. |

**ST4: calculator `/calculator` (#70, Mon Oct 5)**

| ID | Pass when |
|---|---|
| ST4-01 | Charcoal page in the dark shell; under the bar the Botticelli band (*The Birth of Venus*), `alt` naming it; source and licence recorded in the repo; optimised (`srcset`, AVIF or WebP + JPEG; the largest file served at 1440 px on a 2x screen ≤ 300 KB), served from the app, explicit `width` and `height`; layout shift 0: CLS = 0, measured with a `PerformanceObserver` (`layout-shift`, buffered) on load (Q16 for the shell's web-font swap). |
| ST4-02 | `01` (small) and the `h1` `Dollar-cost average calculator.` sit lower left on the soft wash, in plain type (site font, normal weight, no all caps or effects, ≤ 48 px at 1440 and ≤ 32 px on a phone; `01` 12 px; sizes in section 7); chalk on the wash ≥ 4.5:1 at the worst pixel. |
| ST4-03 | The fields (tickers with weights, start, end, starting capital, contribution, weekly or monthly) are borderless with a thin underline only (no box border, fill or radius; a 1 px rule `#8b9298` underline, 5.1:1), with visible labels and a visible focus ring (2 px solid chalk, offset 2 px). |
| ST4-04 | `US, EU and CA listings, one currency per basket.` (wording unchanged) is one line at 13 px in dim (no wrap at 360 or 400 px, nothing clipped) directly under the form; no other note there (Q2, A11). |
| ST4-05 | One chart with one series (the DCA portfolio value): a green line (2 px), a soft green fill (green at 16%) and the last value in a small green pill (22 px tall, night text on green, same money format as the results); no second chart and no chart note. |
| ST4-06 | Results are `Lump sum` and `DCA` as label-value rows with the existing metric labels; no boxes, no borders around them, no `<table>` (Q12); the regression case shows DCA `Total invested` `$313,000`. |
| ST4-07 | No instruction text: the intro paragraph, the swipe hint and the chart scale note are gone (Q2, Q12). |
| ST4-08 | Phone (360 and 400; phone rules below 1024 px): the fields stack, one under another; the field rows span the full width, a basket row's ticker above its weight with the remove control beside the ticker (Q15, A2); the listings note is still one line under the form. |
| ST4-09 | Phone (360 and 400): the chart is full width (the content column's full width, same edges as the fields), with the green line, the soft fill and the pill unclipped. |
| ST4-10 | Results rows (EL A1 / A9): each metric's label, word for word (`Money-weighted return (XIRR, per year)`, `CAGR on total invested, as if all invested day one`, …), is a full-width caption; under it the short row labels `Lump sum` and `DCA` with their values, in two columns while each column is ≥ 150 px wide and stacked (Lump sum above DCA) otherwise; every value whole on one line, nothing clipped, no horizontal scroll. Expected and checked: two columns at 360 and 400. |
| ST4-11 | Phone (360 and 400): the painting is a short band (≤ 200 px tall), with `01` and the title lower left on the wash and Venus visible. |
| ST4-12 | Phone otherwise the same as wide: dark page, Botticelli hero, borderless underlines, green line, fill and pill, label-value results (ST4-01..07 hold at 360 and 400); the wide page (1024, 1440) as briefed; no horizontal page scroll at 360, 400, 1024 or 1440. |
| ST4-13 | Logic untouched: `qa/tools/site.mjs` passes (`$313,000`; VOD.L 400 with the exact message; it may only change how it finds the value); DCA-01..06 pass; no diff in `src/lib/dca/*` or `src/routes/api/chart.ts`. |
| ST4-14 | (EL A3) At 360, 400, 1024 and 1440 the `01` / title block and its wash (with its soft edge) don't overlap Venus; her region is defined by the crop and `object-position` (the figure box per crop in `src/lib/site/hero.ts`); checked by geometry and by a screenshot with both boxes outlined. |
| ST4-15 | (EL A4) The wash box fully contains the bounding boxes of `01` and the title (element and text-line rects), checked by bounding rect plus screenshot, at 360, 400, 1024 and 1440. |
| ST4-16 | (Q6) The primary button `Compare plans` is a chalk fill with night text (14.2:1), radius 0, the section 7 size, a chalk focus ring; while reading prices a dim fill with night text (7.2:1); not green. |

**ST5a: dashboard content (#71): ON HOLD, deferred**

| ID | Pass when |
|---|---|
| ST5a-01 | *(deferred)* Rewritten from the dashboard's new brief when it lands (via CoS). Not checked in this epic; until then ST0-05 applies. |

**ST5b: sign-in `/dashboard/sign-in` (#73, Sun Oct 11)**

| ID | Pass when |
|---|---|
| ST5b-01 | Dark: charcoal page, chalk type, underline fields (as ST4-03) using sign-in-only classes; `.field` and `.kicker` unchanged. |
| ST5b-02 | The page shows exactly `Email`, `Password`, the submit button and the `Create an account` link, plus the heading (Q4) and an error line only after a failed attempt; the invite-only note is gone. Create-account mode mirrors it with a `Sign in` link. |
| ST5b-03 | The auth logic is unchanged: sign-in, sign-up (allow-list), the redirect to `/dashboard`, the signed-out matrix in `scripts/release-smoke.mjs`. |

**ST6: leave-outs, contrast and regression (#72, Sun Oct 11, shipped pages)**

| ID | Pass when |
|---|---|
| ST6-01 | No painting except the Jordaens on home and the Botticelli on the calculator (no artwork `img`, `picture` or CSS `background-image` on sign-in or elsewhere). |
| ST6-02 | No instruction text on the shipped pages: home only hero and Platforms; the calculator only hero, form, note, chart and results (Q2, Q12); sign-in only ST5b-02. |
| ST6-03 | AA on dark on every shipped page at every width, including focus, error and disabled-but-readable states (ST0-03). |
| ST6-04 | The shell holds everywhere: ST1 passes on `/`, `/calculator`, `/dashboard`, `/dashboard/sign-in` and a 404; ST0-05 passes. |
| ST6-05 | Regression on the preview, then production, at 400 / 1024 / 1440: every ST row except ST5a, DCA-01..06 (`$313,000`), noindex meta + `X-Robots-Tag` on every page, the analytics rules, `release-smoke.mjs`; `README.md`, `AGENTS.md`, this spec and the QA pack match the shipped site. The dashboard's full regression waits for its new brief. |

## 12. Questions for EL (#67, dark defaults)

Each has a default; the tickets follow the default unless EL says otherwise. Earlier answers are void where they
assumed white.

- **Q0. Spec location.** Keep `attachments/site-style-spec.md` as the epic's spec, with short pointers in the two
  older specs? (Default: yes.)
- **Q2. Dividends rule (DCA-01) vs no extra instructions.** Default: the listings note stays the single line
  under the form. If DCA-01 needs the rule stated, it joins that line only if it still fits on one line at 360 px
  (e.g. `US, EU and CA listings, one currency per basket. Dividends reinvested.`); otherwise it is a short caption
  under the results, never a paragraph.
- **Q4. Sign-in.** Default: keep the `Sign in` heading and the submit button; the link reads `Create an account`
  (today `New here? Create an account`); the invite-only note goes.
- **Q5. Hero credit.** Default: no visible credit on either painting; the `alt` names the painting; source and
  licence live in the repo.
- **Q6. Buttons on dark.** Default: the primary button (`Compare plans`, sign-in submit) is a chalk fill with
  night text (14.2:1); not green, which stays for the chart.
- **Q8. Error colour on dark.** Default: `#ff8f87` (7.3:1 on charcoal) for the calculator's error line and, in
  #73, sign-in errors.
- **Q10. Shared classes.** Default: the calculator (#70) and sign-in (#73) get their own field / label classes;
  the shared `.field` and `.kicker` (used by the dashboard) are not touched.
- **Q11. Home copy (new).** `main`'s home is still the #46 line and two cards; the Jordaens hero, `Investment
  driven by research.` and the Platforms lines exist only in the approved briefs. Default: #69 builds them with
  the section 4 copy, including `01` on the hero and `02` `Platforms`.
- **Q12. Calculator results and notes (new).** Default: results are only the two label-value groups; the
  per-name table, the `result-summary` line and the swipe hint go; the method paragraph keeps only its
  run-specific single lines (`Weights summed to … and were scaled to 100.`, `N contribution dates had no later
  session.`) as captions, and the fixed `Prices are raw daily closes. …` sentence goes. Or keep any of these?
- **Q13. `/dashboard` page background (new).** The dashboard content sits in its own white wrapper. Default: on
  `/dashboard` #68 changes the bar and footer only, and the page background around the content stays as on
  `main` (white), so nothing but the shell changes. Or should the area outside the content go charcoal too?
- **Q14. Weights (new).** The brief's field list says "tickers"; each basket row also has a weight (DCA-04).
  Default: the weight fields stay, styled the same.
- **Q15. Basket rows on a phone (new).** "The fields stack, one under another." Default: literally, so each
  basket row's ticker sits above its weight (with the row's remove button beside the ticker). Or keep ticker and
  weight side by side on one line?

- **Q16. Web-font swap and CLS (new, from #70).** The shell loads Schibsted Grotesk from Google Fonts with
  `display=swap` (since #46). On load the fallback text is re-rendered in the web font, which moves text glyphs
  and the right-aligned bar links by a few px: measured CLS 0.0005 at 1024 and ≈ 0.00002 at 1440 (0 on phones),
  cold and warm. The hero itself causes no shift (its band is sized by CSS). Default: accept the font swap (QA
  checks the hero causes 0 and the page stays < 0.001). Exact 0 needs a shell change on every page (self-hosted
  font with a preload and `font-display: optional`, or metric-matched fallback overrides). Which?

## 13. Landed

- **#68, dark shell (PR #75, stacked on #74; 2026-10-05).** New tokens `night` / `chalk` / `dim` / `rule` /
  `hair` / `green` / `alert` in `src/styles.css` next to the old ones (no existing value changed). `SiteMenu`:
  charcoal bar with a `hair` bottom line, `Orpheus` in chalk on the left, `Calculator` / `Dashboard` in dim on the
  right, the current page chalk + underline (keyed on `aria-current`), a chalk focus ring, no hover rule; one
  markup on every page. `SiteFooter`: charcoal band, `Orpheus Wisdom` in dim. `__root.tsx` puts `bg-night
  text-chalk` on `<body>` for every page except `/dashboard` (`shellPage()` / `shellBodyClass()` in
  `src/lib/site/site.ts`; exact path, so `/dashboard/sign-in` and the 404 are dark; Q13 default). The content
  that sits in its own white panel today (the calculator below its header band, the sign-in form, the home
  cards) pins `text-ink` on that panel so it renders exactly as on `main` until #70 / #73 / #69 convert it.
  Defaults used (EL hasn't answered): Q6, Q8 and Q10 are recorded but not exercised yet (no button, error or
  field on a dark surface in #68); Q13 as written.
  - Looks off until the page's own ticket (by design, not restyled here): the calculator's charcoal header
    band now runs straight into the bar and page (#70 replaces it with the Botticelli hero); on short pages a
    charcoal gap sits between the white panel and the footer (sign-in, the calculator before a result; #73,
    #70); home shows the #46 line in chalk over the page with the two white cards (#69); the 404 is the
    router's bare `Not Found` at the top left, now chalk on charcoal (unchanged content; no ticket owns it yet).
  - Checks: `src/components/site.dom.test.tsx` (menu on every route: current item, classes, one markup;
    footer), `src/lib/site/site.test.ts` (`shellPage`, token values, AA ratios), `qa/tools/site-shell.mjs`
    (ST0 / ST1 at 360 / 400 / 1024 / 1440; signed in for `/dashboard` with `QA_EMAIL` / `QA_PASSWORD`;
    `--compare-url` pixel-diffs the content panels against a build of the base branch on the same data, which
    is how ST0-05 "dashboard content unchanged" was shown locally).
- **#70, calculator (PR #76, stacked on #75; 2026-10-05).** Built to sections 7 / 7a with EL's accepted defaults
  and amendments A1 / A9, A2, A3, A4, A11 (decision log). The page has no white panel: the Botticelli band
  (`public/hero/`, source and licence in `public/hero/calculator-SOURCE.md`: Wikimedia Commons, Google Art
  Project "edited" file, public domain, PD-Art / PD-old-100-expired, checked 2026-10-05), two crops (phone 2:1
  below 1024 px, wide ≈ 4.1:1 from 1024 px), AVIF / WebP / JPEG `srcset`s with `width` / `height`, the band sized
  by CSS; `01` and the title in the wash lower left; the calculator's own classes (`.calc-*`, sizes in section 7);
  the listings note one line under the form (A11: 302 px of the 320 px column at 360, wording unchanged); one
  chart, one series; label-value results per A1 / A9 (two columns at 360 and 400); captions `Dividends
  reinvested.` (Q2: it doesn't fit on the listings line at 360 px, so it is the short caption under the results;
  DCA-01) plus the run-specific lines; error `#ff8f87`; `color-scheme: dark` on the dark shell. Removed: the
  intro paragraph, the per-name table, the `result-summary` line, the plan table with its swipe hint, dots and
  fade, the lump-sum chart, the scale note, the fixed `Prices are raw daily closes…` sentence and the two field
  hints. **Q12 outcome:** no DCA rule (DCA-01..06) or acceptance row requires the per-name figures, the summary
  line or the swipe hint (`attachments/dca-app-spec.md` "Output" describes the old presentation that this brief
  replaces, not a rule); they go. Logic files untouched; `$313,000` unchanged.
  - Checks: `src/components/calculator/calculator.dom.test.tsx`, `src/lib/site/site.test.ts` (hero files,
    `scheme-dark`), `qa/tools/calculator-page.mjs` (ST4-01..16 at 360 / 400 / 1024 / 1440, ST0-01..03 on the page,
    Q8, before and after the regression run), `qa/tools/site.mjs` (`$313,000` from the label-value rows).
  - Open: Q16 (the shell's web-font swap and CLS).
