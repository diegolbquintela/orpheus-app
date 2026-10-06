<!-- Canonical copy. Seeded 2026-10-02 from QA's box (/workspace/orpheus-app/qa/CANONICAL-AC-PACK.md);
     from now on edit this repo file, not the box copy. Only change since seeding: the "Fixtures:" line
     now points at the repo's qa/fixtures.json. 2026-10-04 (#54): added the "Dashboard: mobile-first redesign"
     section from epic #53; the DCA rows are unchanged. -->
# Canonical AC pack: orpheus-app DCA calculator and dashboard

Source: Chief of Staff relay, 2026-10-02 (Diego-approved direction). Six rules only; no invented ACs.
Report to: Engineering Lead. Live URL: https://orpheus-app-beta.vercel.app. Fixtures: [`qa/fixtures.json`](fixtures.json) in this repo (an empty array counts as a pack defect).

| AC | Tier | Rule | Pass when (on the live page) |
|----|------|------|------------------------------|
| DCA-01 | BLOCK | Dividends reinvested | The result reflects reinvested dividends (stated, or visible in the output) |
| DCA-02 | BLOCK | DCA = extra cash on each date | Each scheduled date adds the contribution on top of prior holdings |
| DCA-03 | BLOCK | Lump sum on day one | Starting capital is fully deployed on the start date |
| DCA-04 | BLOCK | Multi-ticker weighted basket | The basket accepts several tickers with weights and applies those weights |
| DCA-05 | BLOCK | US/EU/CA listings only | Tickers outside US/EU/CA are refused or not offered |
| DCA-06 | BLOCK | No buy/sell advice | The page outputs no buy, sell, hold, or recommendation, however it's worded. A missing 'Not a recommendation' disclaimer is intended and is not a fail (Diego rule change via Engineering Lead, 2026-10-02). |

Exact expected numbers need fixtures (tickers, dates, amounts) from the owner. Until those exist, numeric checks are BLOCKED rather than guessed.

## Site style: white, mobile first (epic #66)

Source of truth: [`attachments/site-style-spec.md`](../attachments/site-style-spec.md) (approved 2026-10-05,
Diego via CoS and EL; the row text below is copied from its section 6). **White replaces the #53 dark style**:
DR0-01 is superseded per page by ST0 from that page's conversion day.

**Per-page QA (EL decision):** one page a day. Each ticket's QA checks only its own rows (plus ST0, ST1 and ST2
for the page it converts) and a no-regression pass on the pages not converted yet (they must look exactly like
`main` before the ticket: dark bar, same computed colours; DR0-01 still applies to them). #72 runs every row on
every page.

| Day | Ticket | Rows | No-regression pass on |
|---|---|---|---|
| Tue Oct 6 | #67 (docs) | ST0-04 | n/a |
| Tue Oct 6 | #68 shell pieces | unit / dom tests of the themed bar and footer; no page converted | every page unchanged from `main` |
| Tue Oct 6 | #69 home | ST0, ST1, ST2, ST3 on `/` | `/calculator`, `/dashboard`, `/dashboard/sign-in` (dark) |
| Wed Oct 7 | #70 calculator | ST0, ST1, ST4 on `/calculator` | `/` (white, ST3), `/dashboard`, sign-in (dark) |
| Thu Oct 8 | #71 dashboard | ST0, ST1, ST2, ST5a on `/dashboard` | `/`, `/calculator` (white), sign-in (dark) |
| Fri Oct 9 | #73 sign-in | ST0, ST1, ST5b on `/dashboard/sign-in` | `/`, `/calculator`, `/dashboard` (white) |
| Fri Oct 9 | #72 leave-outs + regression | ST6 and every row above, every page | everything |

### ST0: white tokens and the superseding decision (every converted page; ticket that converts it)

| AC | Tier | Pass when (on the preview / live page, at 400, 1024 and 1440) |
|----|------|------------------------------|
| ST0-01 | BLOCK | The page background, bar, footer and every band / panel / card behind content compute to `rgb(255, 255, 255)`; no element wider than a control has a dark background (luminance < 0.5) on a converted page. |
| ST0-02 | BLOCK | Text uses the tokens: body text `#1e2124`, secondary `#636363`, error `#c62828`, borders `#e3e3e3`, focus ring `#2b5945`, hover wash `--color-wash`; no colour outside the token list (plus the chart's DCA series colour and the dashboard donut's neutral greys) and the font is Schibsted Grotesk. |
| ST0-03 | BLOCK | Pages not converted yet are unchanged from `main` (dark bar, dark bands, same colours): no half-converted page in production. |
| ST0-04 | BLOCK | The spec, AGENTS.md and README record that white replaces the #53 dark style; DR0-01 is marked superseded per page. (Docs, #67.) |

### ST1: the bar and the footer (#68 pieces; checked on each page on its conversion day)

| AC | Tier | Pass when (on the preview / live page, at 400, 1024 and 1440) |
|----|------|------------------------------|
| ST1-01 | BLOCK | One thin bar (height ≤ 48 px) at the top, sticky on scroll: `Orpheus` on the left (→ `/`), `Calculator` and `Dashboard` on the right (→ `/calculator`, `/dashboard`), in that order, no other items, no dropdowns; at 400 px all three fit on one line with no horizontal page scroll. |
| ST1-02 | BLOCK | The current page's item has `aria-current="page"` and a visible mark (underline and full-strength text); exactly one item is marked on `/`, `/calculator`, `/dashboard`, `/dashboard/sign-in` (Dashboard); none on a 404. |
| ST1-03 | BLOCK | The bar renders in the page's theme: white with ink text and a 1 px line on converted pages; the existing dark bar on unconverted pages. Same items and marker either way. |
| ST1-04 | BLOCK | The footer's only text is exactly `Orpheus Wisdom`, on every page; same theme rule. |

### ST2: hover (converted pages with rows)

| AC | Tier | Pass when (on the preview / live page, at 400, 1024 and 1440) |
|----|------|------------------------------|
| ST2-01 | BLOCK | Hovering a clickable row (home Platforms rows; dashboard holding rows) gives it the light wash background; it is never inverted to ink; the text keeps ≥ 4.5:1 contrast on the wash. |
| ST2-02 | BLOCK | `Open` underlines on hover and on keyboard focus (`:focus-visible` also shows the focus ring). |
| ST2-03 | BLOCK | Nothing is available only on hover (touch at 400 px reaches everything). |

### ST3: home `/` (#69, Tue Oct 6)

| AC | Tier | Pass when (on the preview / live page, at 400, 1024 and 1440) |
|----|------|------------------------------|
| ST3-01 | BLOCK | Under the bar, a full-width band shows Jacob Jordaens, *Triumph of Frederick Henry, Prince of Orange*, 1652. The image is the painting itself (no other artwork) with an `alt` naming it. |
| ST3-02 | BLOCK | `01` (small) and `Investment driven by research.` (the `h1`) sit lower left on a soft white wash; at 400, 1024 and 1440 the prince (Frederick Henry in the chariot) and the horses are fully visible, not covered by the text or the wash (crop / object-position chosen per width). |
| ST3-03 | BLOCK | Source and licence recorded in the repo (spec section 7 and next to the asset): a public-domain image, with the source page and file name. |
| ST3-04 | BLOCK | Optimised: served from the app itself (no request to another host), responsive sizes (e.g. `srcset` 800 / 1600 / 2400 w) in AVIF or WebP with a JPEG fallback, the 1440 px image ≤ 300 KB; explicit dimensions or `aspect-ratio`, so Cumulative Layout Shift is 0 on load. |
| ST3-05 | BLOCK | Section `02` `Platforms` follows with exactly two rows in this order: `Calculator` · `Dollar-cost average calculator.` · `Open` (→ `/calculator`); `Dashboard` · `The portfolio as a business: fundamentals for each name, and the whole.` · `Open` (→ `/dashboard`). Nothing else on the page between the bar and the footer. |
| ST3-06 | BLOCK | On load the hero line fades up once, then the two rows follow (staggered), all within about 1 s; no loop, no re-run on scroll. With `prefers-reduced-motion: reduce` everything shows at once with no movement. The content is in the server HTML and visible without JavaScript (the animation never leaves it hidden). |
| ST3-07 | BLOCK | Home still does no calculating (no price requests, no calculator code) and `/?query` still redirects to `/calculator?query`. |

### ST4: calculator `/calculator` (#70, Wed Oct 7)

| AC | Tier | Pass when (on the preview / live page, at 400, 1024 and 1440) |
|----|------|------------------------------|
| ST4-01 | BLOCK | The page title (`h1`) is exactly `Dollar-cost average calculator.`; the dark header band and `DCA vs lump sum` are gone; no instruction text (Q2 for the method sentence). |
| ST4-02 | BLOCK | Order: the form (basket, window, amounts, frequency, submit), then the result table, then the chart. |
| ST4-03 | BLOCK | The listings note `US, EU and CA listings, one currency per basket.` is one line (no wrap at 400 px) directly under the form. |
| ST4-04 | BLOCK | Phone (400): one column. Wide (from 1024): two columns (reading, Q3: the form on the left, the result table and chart on the right). No horizontal page scroll at any width (the table may scroll inside its own box). |
| ST4-05 | BLOCK | Calculator unchanged in behaviour: `qa/tools/site.mjs` passes ($313,000; VOD.L 400 with the exact message); DCA-01..06 pass; the calculator logic files are untouched in the diff. |

### ST5a: dashboard `/dashboard` (#71, Thu Oct 8; dashboard only)

| AC | Tier | Pass when (on the preview / live page, at 400, 1024 and 1440) |
|----|------|------------------------------|
| ST5a-01 | BLOCK | The dashboard uses the white shell and bar (ST0, ST1); no painting or image behind any number. |
| ST5a-02 | BLOCK | Every #53 state renders white with AA contrast: empty (`Add a holding`), the list, a detail open (Edit, Delete), the add form and its errors, the `Holdings` / `Metrics` switch (400), the metrics sheet beside the list (1024, 1440), chips, the search combobox and its options, `—` cells, the one total and excluded line, the donut (neutral greys, each slice ≥ 3:1 against white or separated by a white gap) and the `Book` row, the as-of / out-of-date lines, the preview refresh panel. |
| ST5a-03 | BLOCK | DR2–DR6 still pass (the redesign behaviour is unchanged); `qa/tools/dashboard-redesign.mjs` passes. The dashboard stays released (DR0-02). |

### ST5b: sign-in `/dashboard/sign-in` (#73, Fri Oct 9)

| AC | Tier | Pass when (on the preview / live page, at 400, 1024 and 1440) |
|----|------|------------------------------|
| ST5b-01 | BLOCK | White shell and bar (ST0, ST1; `Dashboard` marked). |
| ST5b-02 | BLOCK | The form shows exactly: `Email`, `Password`, the submit button and the `Create an account` link (plus an error line only after a failed attempt); nothing else: no explanatory note (the invite-only paragraph goes) (Q4 on the heading). Create-account mode mirrors it: `Email`, `Password`, the submit button and a `Sign in` link. |
| ST5b-03 | BLOCK | The auth logic is unchanged: sign-in, sign-up (allow-list), the redirect to `/dashboard`, the signed-out matrix (`release-smoke.mjs`). |

### ST6: leave-outs and regression (#72, Fri Oct 9, after #73)

| AC | Tier | Pass when (on the preview / live page, at 400, 1024 and 1440) |
|----|------|------------------------------|
| ST6-01 | BLOCK | No painting or artwork anywhere except the home hero (no `img`, CSS `background-image` or `picture` with artwork on `/calculator`, `/dashboard`, `/dashboard/sign-in`). |
| ST6-02 | BLOCK | No instruction text on any page: home has only the hero and Platforms; the calculator only its title, form, note and results; the dashboard only the #53 kept lines (`qa/tools/leaveouts-rules.mjs`); sign-in only ST5b-02. |
| ST6-03 | BLOCK | WCAG 2.2 AA contrast on every page at every width: normal text ≥ 4.5:1, large text ≥ 3:1, controls' boundaries and the focus ring ≥ 3:1, including hover and disabled-but-readable states (an axe-core run reports no `color-contrast` violation). |
| ST6-04 | BLOCK | No dark remnant: every page passes ST0-01; no page is half converted. |
| ST6-05 | BLOCK | Full regression on the preview, then production, at 400 / 1024 / 1440: every ST row, DR0 (with DR0-01 superseded by ST0), DR2–DR6, DCA-01..06 ($313,000), noindex meta + `X-Robots-Tag`, the analytics rules, `release-smoke.mjs`; `README.md`, `AGENTS.md`, this spec and the QA pack match the shipped site. |

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
| DR0-01 | BLOCK | **Superseded per page by ST0 (epic #66, white) from that page's conversion day; still BLOCK for pages not converted yet.** Dark style unchanged: page, menu, footer and controls use the same colours and fonts as production before the ticket (computed background / text colours match; no light theme, no new accent colour). |
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
