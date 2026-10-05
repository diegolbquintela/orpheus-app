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
| `dashboard-list.mjs` | Dashboard holdings list (#55, DR2) at 400 × 860 and 1440 × 900: signs in with `QA_EMAIL` / `QA_PASSWORD` (env only, never logged; an allow-listed test account with at least one priced holding), then no horizontal scroll, four fields per row, full-digit values, tap opens / closes the detail (Edit and Delete shown, never clicked), no helper paragraph, no old table, one total, metrics reachable. Screenshots `dashboard-<vp>[-detail].png` |
| `dashboard-add.mjs` | Add holding with an optional cost (#56, DR3) at 400 × 860 and 1440 × 900: signs in with `QA_EMAIL` / `QA_PASSWORD` (env only, never logged), then the add form is one compact row (Ticker, Shares, Average cost (optional), Add; under 100 px tall), adds `QA_ADD_SYMBOL` (default `MSFT`) with a blank cost (201, `avgCost` null), detail cost / return blank, Edit enters a cost (they fill) and clears it (blank again). Writes one add and two edits; refuses a symbol already held with a cost; never clicks Delete (the test holding stays). Screenshots `dashboard-add-<vp>[-nocost\|-withcost].png` |
| `sidebyside.mjs` | Same cases on two hosts (`--base-url` vs `--compare-url`), desktop and mobile; prints what differs |
| `config.mjs` | Shared flag/env parsing used by the scripts above |
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
