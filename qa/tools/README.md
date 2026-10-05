# QA tools

QA's scripts for checking a deployed Orpheus app (PR preview or production). Copied on 2026-10-02 from
QA's box (`/workspace/qa-tools/*.mjs`, `/workspace/dca-handcheck/fetch.py`) and changed only to take
the URL and output paths as parameters; the Grok host is no longer hard-coded.

## Settings (all scripts)

| Flag | Env var | Default |
|---|---|---|
| `--base-url <url>` | `QA_BASE_URL` | `https://orpheus-app-beta.vercel.app` (production) |
| `--out <dir>` | `QA_OUT_DIR` | a temp dir outside the repo: `$TMPDIR/orpheus-qa/<script>-<timestamp>` (e.g. `fetch-<timestamp>` for `fetch.py`) |
| `--fixtures <file>` | `QA_FIXTURES` | `qa/fixtures.json` in this repo (`run.mjs`, `pr3.mjs`) |
| `--compare-url <url>` | `QA_COMPARE_URL` | none; required by `sidebyside.mjs` |
| `--calculator-path <path>` | `QA_CALCULATOR_PATH` | `/calculator` (since #46). Pass `/` for a deployment from before the site redesign |
| `--compare-path <path>` | `QA_COMPARE_PATH` | `/` (calculator path on `--compare-url`; the frozen Grok copy has it at `/`; production after #46 needs `/calculator`) |

Flags win over env vars. Keep `--out` outside the repo: screenshots and raw dumps are not committed
(see `qa/README.md` for what goes into `qa/runs/`).

## Scripts

| Script | What it does |
|---|---|
| `run.mjs` | Baseline (all calculator scripts open `--calculator-path`): enters each `qa/fixtures.json` case in the form and records the rendered result and `/api/chart` responses |
| `full.mjs` | Full round (checks 1-10): load and copy, blank submit, AAPL per frequency, basket not summing to 100, refused and CA listings, broken inputs, mobile |
| `pr3.mjs` | Results table, per-plan charts and the mobile swipe cue (real clicks/taps only, no DOM writes) |
| `pr3-mobile-cue.mjs` | Mobile (390x844) swipe-cue measurements on the results table |
| `c5live.mjs` | Check 5 live: AAPL 2023-01-03..2024-12-31, 50,000 + 500 monthly; dumps the result tables |
| `site.mjs` | Site shell (#46): menu on every route (fixed on scroll, current page, no dropdowns), home with exactly two cards and no price requests, footer exactly "Orpheus Wisdom", noindex, `/?ticker=KO` → `/calculator?ticker=KO`; then at `/calculator` the $313,000 regression (PLTR 50 / TQQQ 50, 2020-10-02..2026-10-01, 1,000 + 1,000 weekly) and VOD.L (400, exact message). Read-only, no sign-in |
| `dashboard-list.mjs` | Dashboard holdings list (#55, DR2) at 400 × 860 and 1440 × 900: signs in with `QA_EMAIL` / `QA_PASSWORD` (env only, never logged; an allow-listed test account with at least one priced holding), then no horizontal scroll, four fields per row, full-digit values, tap opens / closes the detail (Edit and Delete shown, never clicked), no helper paragraph, no old table, one total, metrics sheet present; zero rows SKIPs the row checks (QA N3) instead of failing; signs out at the end. Screenshots `dashboard-<vp>[-detail].png` |
| `dashboard-add.mjs` | Add holding with an optional cost (#56, DR3) at 400 × 860 and 1440 × 900: signs in with `QA_EMAIL` / `QA_PASSWORD` (env only, never logged), then the add form is one compact row (Ticker, Shares, Average cost (optional), Add; under 100 px tall), adds `QA_ADD_SYMBOL` (default `MSFT`) with a blank cost (201, `avgCost` null), detail cost / return blank, Edit enters a cost (they fill) and clears it (blank again). Writes one add and two edits; refuses a symbol already held with a cost; never clicks Delete (the test holding stays); signs out at the end. Screenshots `dashboard-add-<vp>[-nocost\|-withcost].png` |
| `dashboard-metrics.mjs` | Metrics sheet and chips (#57, DR4) at 400 × 860 and 1440 × 900: signs in with `QA_EMAIL` / `QA_PASSWORD` (env only, never logged), then phone: `Holdings` \| `Metrics` switch, one sheet at a time, list unchanged after switching back; desktop: no switch, sheet to the right of the list; no horizontal scroll; headers and row cells = kept chips in order; every missing figure exactly `—`; on the phone pass "gross" offers Gross margin (1y), adding puts it at the end (survives a reload) and its × removes it (skipped if already kept). QA D1: saves all chips, checks a missing figure plus a table wider than its box and the page `scrollWidth` = the viewport at both widths (the scroll box positioned), then restores the account's own chips. QA D2: "Revenue CAGR 3y" + Enter adds 3y (not 10y) and focus stays in the search. Writes chip saves that restore the list; never clicks Delete; signs out. Screenshots `metrics-<vp>[-list\|-sheet\|-added\|-allchips].png` |
| `book-math.mjs` | The Book row's expected figures for `dashboard-book.mjs` (QA D2, #65): recomputed from the page's unrounded data (row values, stored metric values), formatted like the page, compared at display precision. Pinned by `scripts/qa-book-math.test.mjs` |
| `leaveouts-rules.mjs` | The leave-out rules (`KEPT_LINES` etc.) shared by `dashboard-leaveouts.mjs` and `npm test`; includes the preview refresh panel's lines (QA D1, #65) |
| `dashboard-book.mjs` | Book (#58, DR5) at 400 × 860 and 1440 × 900, read-only: signs in with `QA_EMAIL` / `QA_PASSWORD` (env only, never logged); one total (full digits + code, no total cost / return, excluded line only with an unvalued row); a donut (`data-shape="donut"`) whose legend is the rows' share of the book, largest first, 10 + `Other`, no pending lists; the metrics foot is the `Book` row with one figure per kept chip in chip order, each `—` alone or `x.x% · N% covered` (never `0% covered`), EPS labelled `EPS growth 1y (weighted)`, Share of the book 100.0%, and each chip's book figure recomputed by `book-math.mjs` from the page's unrounded data (row values in base currency, stored metric values; dashes left out, renormalised; EPS = weighted EPS growth) and compared at display precision (QA D2, #65: the rounded 1-decimal weights failed at low coverage), with the rows showing a figure equal to the holdings counted. No writes; never clicks Delete; signs out. Screenshots `book-<vp>[-list\|-metrics].png` |
| `dashboard-leaveouts.mjs` | Leave-outs (#59, DR6-01..05 + DR0-07), read-only, at each viewport: signs in with `QA_EMAIL` / `QA_PASSWORD` (env only, never logged); on the list, a detail open and (phone) the metrics sheet, no Connect broker / broker link, no K/M/B and every 4+ digit number grouped, no ownership toggle (no switch / checkbox; only `Holdings` / `Metrics` are pressed buttons), no download / export / CSV, every paragraph one of the kept data lines, no buy / sell wording; an account with no holdings checks the one-line empty page. Rules in `leaveouts-rules.mjs` (shared with `npm test`). Never clicks Edit, Delete or Add; signs out. Screenshots `leaveouts-<vp>[-metrics].png` |
| `dashboard-redesign.mjs` | One-run redesign + site regression (#59, DR6-06): site-wide (`/`, `/calculator`, `/dashboard/sign-in` 200, `X-Robots-Tag` + robots meta, footer, signed-out `/dashboard` 307, flag status, one Analytics script, page views without query, no other tracker host, Referrer-Policy recorded), then `site`, `dashboard-leaveouts`, `-list`, `-add`, `-metrics`, `-book` with `QA_VIEWPORTS=phone,wide,desktop` (400 / 1024 / 1440), each in its own `--out` subfolder. `--read-only` skips add / metrics (they write), `--empty` adds `QA_EMPTY_EMAIL` / `QA_EMPTY_PASSWORD` and implies `--read-only` (so the add tool can't put a holding back before the empty checks; run add / metrics in a separate run without `--empty`), `--smoke <mode>` runs `scripts/release-smoke.mjs`. Without `QA_EMAIL` / `QA_PASSWORD` in env the signed-in tools are SKIPPED (site-wide and signed-out parts only). Never signs in itself; exit 1 on any FAIL |
| `sidebyside.mjs` | Same cases on two hosts (`--base-url` vs `--compare-url`), desktop and mobile; prints what differs |
| `config.mjs` | Shared flag/env parsing used by the scripts above |
| `session.mjs` | Shared signed-in loop for the signed-in `dashboard-*.mjs` tools (QA N4, #58; `QA_VIEWPORTS=phone,wide,desktop` adds 1024 × 800, #59): one context per viewport, sign-in, then the checks, and the sign-out in a `finally`, so an early return, an error or a timeout still signs out (an error is a FAIL "ran to the end"; the next viewport still runs). `scripts/qa-tools-session.test.mjs` pins it |
| `fetch.py` | Raw price data for a hand-check: Yahoo query1/query2, the app's `/api/chart`, stooq. `--tickers`, `--start`, `--end` |

## Requirements

- Node 22 and `npm ci` (Playwright is already a devDependency), then `npx playwright install chromium` once.
- Python 3, standard library only, for `fetch.py`.
- Network access to the target URL (and Yahoo/stooq for `fetch.py`).

```bash
node qa/tools/full.mjs --base-url https://<preview>.vercel.app --out /tmp/qa-full
QA_BASE_URL=https://<preview>.vercel.app node qa/tools/pr3.mjs
python3 qa/tools/fetch.py --base-url https://<preview>.vercel.app --out /tmp/orpheus-fetch --tickers PLTR,TQQQ
```
