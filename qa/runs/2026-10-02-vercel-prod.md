<!-- Copied into the repo on 2026-10-02 from the shared box (/workspace/orpheus-app/qa/run-2026-10-02-vercel-prod.md). Log text is unchanged. Paths under /workspace/orpheus-app/qa/evidence/ refer to the box; small text/JSON evidence is in qa/runs/2026-10-02-vercel-prod/, screenshots and large raw dumps stay on the box. -->

# QA run: Vercel production (main @ 68270c8)

- **Date:** 2026-10-02, run about 16:20–16:30 ET
- **URL:** https://orpheus-app-beta.vercel.app (Vercel production). Logged out, fresh Playwright Chromium context per case.
- **Interaction (same as the PR #3 run):**
  - Text fields: `click()`/`tap()` then `keyboard.type()`. Dates: `fill()` on the visible inputs. Frequency: `selectOption()`.
  - Mobile swipes: real touch events (CDP `Input.dispatchTouchEvent`).
  - No `page.evaluate` and no JS value setting. Reads go through locator text, attributes and bounding boxes.
- **Deployment:** dpl_9D1CLzx7Vj8EcVBeUWywf2BSZxRT, target production, READY at 16:18:58 ET
- **SHA:** 68270c8. **CONFIRMED** through Vercel deployment metadata, GitHub, and a byte-identical local build (see SHA-verification.txt).
- **Fixtures:** /workspace/orpheus-app/qa/fixtures.json, re-read and used unedited. **Unchanged since the PR #3 run** (sha256 9ce3761c…a008a, mtime 16:00). Commit 68270c8 changed qa/fixtures.json in the repo relative to 4514a86, but its content equals the c5c5666 version already used. No tolerance is stated, so raw diffs are reported.
- **Pack:** CANONICAL-AC-PACK.md, unchanged since the PR #3 run (mtime 16:11, sha256 920b83e2…4e29).
- **Evidence:** /workspace/orpheus-app/qa/evidence/2026-10-02-vercel-prod/ (host diff in hostdiff/)
- **Overall STATUS: PASS**

## A) Canonical rules vs fixtures

| Rule | Case(s) | Expected (fixture) | Observed (Vercel prod) | Result | Evidence |
|---|---|---|---|---|---|
| DCA-01 Dividends reinvested | KO, JNJ/PG/WMT, RY.TO | End values (lump / DCA): KO $10,510 / $12,511 (without reinvestment $9,890 / $12,093); basket $23,358 / $29,316 (without $22,303 / $28,618); RY.TO CA$14,673 / CA$15,920 (without CA$13,537 / CA$15,299) | Shows the reinvested values exactly. Shares: KO 168.811 / 200.9479. Intro states "Dividends are reinvested and splits are handled." API dividend events match the fixture | **PASS** | A-*-result.png, A-rendered-and-recompute-vs-fixture.json |
| DCA-02 DCA = contributions only | KO, basket, RY.TO | DCA invested $12,000 / $26,250 / CA$12,000; 0 missed; MWR 4.1% / 11.5% / 30.0% | DCA invested $12,000 / $26,250 / CA$12,000; MWR +4.1% / +11.5% / +30.0%; no missed-date note. Recompute: first DCA point 500 / 250 / 500 | **PASS** | same |
| DCA-03 Lump sum on day one | KO, basket, RY.TO | Deploy 2023-01-03 at fixture prices; NLV on deploy date = capital | Lump invested $10,000 / $20,000 / CA$10,000. Lump shares exact. Recompute: deploy prices match and day-1 lump NLV = capital (diff 0) | **PASS** | same |
| DCA-04 Weighted basket | JNJ/PG/WMT 50/30/20 weekly | Weights 0.5 / 0.3 / 0.2, not scaled. Shares lump 59.6454 / 41.6036 / 85.8565, DCA 85.98 / 51.5895 / 91.1212. WMT 3:1 split | 50.0% / 30.0% / 20.0% with no scaling note. Shares exact. WMT last 90.35. Split from the API matches | **PASS** | A-us-basket-jnj-pg-wmt-*.png |
| DCA-05 US/EU/CA only | VOD.L, RY.TO | VOD.L 400 "VOD.L lists on LSE. US, EU, and CA listings only."; RY.TO CAD, Toronto | VOD.L: API 400, alert exact, no result. RY.TO: 200, CAD, Toronto. BARC.L refused with the same wording. RELIANCE.BO: "RELIANCE.BO lists on BSE. BSE and other non US/EU/CA venues are not supported." | **PASS** | A-refused-lse-vod-l-result.png, E-state-*.png |
| DCA-06 No advice, however worded | no-advice-copy + 13 page states | Fixture pattern: 0 matches in 5 source files. Pack: no advice wording at all; a missing disclaimer is intended | 13 live states (initial, initial HTML + meta, blank submit, 3 fixture results, 4 refusal/error states, PLTR/TQQQ desktop, mobile result). Fixture pattern and broad advice pattern (consider, suggest, should, good time, favourable, attractive, rating, stars, ★, upside, target price, etc.): **0 hits**. Source scan of the 5 files at 68270c8 (tree = c5c5666): 0. "Not a recommendation" is absent (intended) | **PASS** | DCA06-advice-scan.json |

Precision: rendered strings 71 of 71 match. Full-precision recompute covered 156 fields, with max |diff| = 0.

## B–E) PR #3 checks

| Check | Expected | Observed | Result | Evidence |
|---|---|---|---|---|
| B) PLTR 50 / TQQQ 50, 2020-10-02 to 2026-10-02, $1,000 / $1,000 weekly | DCA invested $314,000; DCA end about $2.02–2.03M; DCA MWR about +65.4%, first among returns; lump about $13k | DCA invested **$314,000** (314 weekly dates × $1,000; 0 missed; independent of capital). DCA end **$2,026,141**. DCA MWR **+65.4%**, the first return row. Lump $1,000 to **$12,971** (MWR +53.3%). Recompute matches. Same caveat as before: the window ends today, so values move with today's close | **PASS** | B-C-result-desktop.png, B-recompute.json |
| C) Summary, headers, axes | Summary above the table; 'Lump sum ($1,000 once)' / 'DCA ($1,000 weekly)'; compact, separate y-axes | Summary: "DCA: $314k in, $2.03M now · Lump sum: $1k in, $13k now". Headers are exact (uppercase via CSS). DCA y-axis $0 / $550k / $1.1M / $1.6M / $2.2M. Lump y-axis $0 / $3.5k / $7k / $11k / $14k. One chart per plan, with the "own scale" note | **PASS** | C-chart-0.png, C-chart-1.png, C-table-desktop.png |
| D) 390×844 touch | DCA reachable by real swipe; cue and dots; pinned labels | Before: DCA column at x = 394.6 (offscreen); "Lump sum / Swipe for DCA →" visible; dots (ink, line); fade visible. After a real swipe: DCA header at x = 168.6, fully visible; dots (line, dca); label "DCA"; cue and fade hidden. Swiping back restores them. Row labels stay at x = 20 before, mid-scroll and after. 0 controls offscreen, 0 page errors | **PASS** | D2-mobile-before.png, D2-mobile-mid-swipe.png, D2-mobile-after-swipe.png, D2-mobile-swipe-back.png, D-mobile-cue.json |
| E) Copy | Shorter intro; hint exactly 'US, EU and CA listings, one currency per basket.'; 'unless you name an exception' nowhere | Intro: "Pick tickers and weights, a date range, and amounts. Lump sum invests your starting capital on day one. DCA adds your contribution on each date. Dividends are reinvested and splits are handled." Hint matches exactly. The phrase appears 0 times in 13 states, the HTML, and the JS/CSS | **PASS** | E-initial.png, DCA06-advice-scan.json |

## SHA verification

| Source | Result |
|---|---|
| Vercel `get_deployment(dpl_9D1CLzx7Vj8EcVBeUWywf2BSZxRT)` | READY, target production, githubCommitSha 68270c8e9e70…, ref main. Aliases include orpheus-app-beta.vercel.app |
| Vercel `get_deployment("orpheus-app-beta.vercel.app")` | Resolves to the same dpl_9D1CLzx7… |
| Vercel `list_deployments(target=production)` | dpl_9D1CLzx7… (68270c8, 16:18:41 ET) is the newest production deploy. The previous one is dpl_8yThUf2Hovu… (4514a86) |
| GitHub | 68270c8 is the PR #3 merge, with parents 4514a86 and c5c5666. It is origin/main HEAD. `git diff c5c5666 68270c8` is empty |
| Byte compare | Served index/routes/styles assets are byte-identical (same names, same sha256) to a local `vite build` of 68270c8 |

**Verdict: CONFIRMED.** Production is main @ 68270c8, which has the same tree as c5c5666.

## Host diff: Vercel prod vs island-pearl-eagle-hill.grok.me

| Area | Result |
|---|---|
| Numbers: KO and PLTR/TQQQ re-run on both hosts now, desktop and 390×844 mobile | Identical: summary, both tables, chart y-ticks and full page text. KO $10,510 / $12,511; PLTR/TQQQ $12,971 / $2,026,141, +65.4%. 0 page errors on either host |
| Layout | Element boxes are identical (h1, intro, hint, button, summary, scroller). Full-page screenshots are **pixel-identical** (0 differing pixels in all 4 pairs) |
| Copy | Identical (same page text; same intro, hint and refusal wording) |
| JS | Same code. routes and index bundles are byte-identical after normalizing the hashed filenames (normalized sha256 9369b935… and f77fcc8a… on both). Only the filenames differ (grok: index-mieVlY8q / routes-B4udfI96; Vercel: index-Cv4kxR1U / routes-Cm76ELHP) |
| CSS | **Differs.** Vercel's styles-DzwM7UtH.css equals a clean build of 68270c8. Grok's styles-C0rGVVtl.css has 4 extra utilities (.mt-6, .mb-6, .h-80, .text-card/55, all from the pre-PR3 desk.tsx) and lacks .contents. There is no visible effect (pixel-identical screenshots) |
| API data | /api/chart KO payload is byte-identical (sha256 3cd72028…) |
| API error messages | Identical on both hosts:<br>VOD.L 400 "VOD.L lists on LSE. US, EU, and CA listings only."<br>ZZQXJ9 404 "ZZQXJ9: No data found, symbol may be delisted"<br>RELIANCE.BO 400 BSE message<br>end before start 400 "End date is before the start date."<br>missing params 400 "Ticker, start, and end are required." |
| Response headers | **Differs.**<br>Grok is fronted by Cloudflare (server: cloudflare, cf-cache-status, `__cf_bm` cookie) and sends `x-robots-tag: noindex` on every response. Vercel prod sends **no x-robots-tag**, so it is indexable.<br>HSTS: grok max-age=31536000; Vercel max-age=63072000 with preload.<br>Hashed assets: Vercel `cache-control: public, max-age=31536000, immutable` (strong etag, content-length); grok `public, max-age=31536000` without immutable (weak etag).<br>HTML: both `public, max-age=0, must-revalidate`. API: both `no-store`.<br>Grok's asset last-modified is 16:07:02 ET; Vercel's is 16:20:24 ET |

## Known and minor issues (not failed)
- **Known (noted, not failed):** on mobile, the result headers are clipped under the right-edge fade until you scroll. Before scrolling, the lump header spans x 164–394.6 inside a scroller ending at 370, and the DCA header is offscreen. Same on both hosts.
- Mobile: the shares table also scrolls sideways and has no cue.
- The nonsense-ticker message is passed through from the price feed.
- Vercel production has no `noindex` header while the grok host does. Flagged for awareness, since it may or may not be intended.
- Fixture/pack carry-overs:
  - No tolerance is stated.
  - `qa/snapshots/` is missing from /workspace.
  - DCA-05 has no EU-acceptance case.
  - The pack's "until fixtures exist" line is stale.
- PLTR/TQQQ figures include today's (2026-10-02) close and can drift.

```yaml
status: PASS
url: https://orpheus-app-beta.vercel.app
deployment: dpl_9D1CLzx7Vj8EcVBeUWywf2BSZxRT
sha: 68270c8
sha_status: confirmed  # Vercel meta githubCommitSha + current production alias + GitHub main HEAD + byte-identical local build
fixtures_sha256: 9ce3761ce69b5bd5b82efa5fceb7aee50388e9869078a4e2131088c6b17a008a
fixtures_changed_since_pr3_run: false
rules:
  DCA-01: PASS
  DCA-02: PASS
  DCA-03: PASS
  DCA-04: PASS
  DCA-05: PASS
  DCA-06: PASS
checks:
  B_pltr_tqqq_weekly: PASS
  C_summary_headers_axes: PASS
  D_mobile_swipe_cue_pinned: PASS
  E_intro_hint_no_exception_phrase: PASS
failed_rules: []
failed_checks: []
blocked_reasons: []
host_diff:
  numbers: identical
  layout: pixel_identical
  copy: identical
  js: identical_modulo_hashed_filenames
  css: differs_grok_has_4_stale_utilities_missing_contents_no_visual_effect
  api_errors: identical
  headers: differs_cloudflare_vs_vercel_noindex_hsts_immutable
known_issues:
  - "Mobile: result headers clipped under right-edge fade until scrolled (known, not failed)"
```
