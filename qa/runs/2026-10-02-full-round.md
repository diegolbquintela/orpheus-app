<!-- Copied into the repo on 2026-10-02 from the shared box (/workspace/orpheus-app/qa/run-2026-10-02-full-round.md). Log text is unchanged. Paths under /workspace/orpheus-app/qa/evidence/ refer to the box; small text/JSON evidence is in qa/runs/2026-10-02-full-round/, screenshots and large raw dumps stay on the box. -->

# QA full functional round: orpheus-app (live)

- **Date:** 2026-10-02, about 15:10 ET
- **URL:** https://island-pearl-eagle-hill.grok.me (Orpheus Wisdom, "DCA vs lump sum")
- **Mode:** Live page, logged out. Each check runs in a fresh Playwright headless Chromium context (/workspace/qa-tools/full.mjs, c5live.mjs, c5calc.ts).
- **Default inputs** (unless noted): window 2023-01-03 to 2024-12-31, starting capital 10000, contribution 500, monthly.
- **Evidence:** /workspace/orpheus-app/qa/evidence/2026-10-02-full-round/. Raw scrape is in observed.json.
- **Result:** 10 PASS / 0 FAIL / 0 BLOCKED. **Overall STATUS: PASS**

| # | Check | Result | Evidence (one line) | File(s) |
|---|---|---|---|---|
| 1 | Page loads, title right, Compare button visible | PASS | Title "Orpheus Wisdom", H1 "DCA vs lump sum", "Compare plans" button visible. 0 JS page errors | c01-load.png |
| 2 | Blank inputs don't invent a result | PASS | Clicking Compare on an empty form shows alert "Add a ticker.", with no result section, no table, no chart, and 0 /api/chart calls | c02-blank.png |
| 3 | One US name (AAPL 100) runs with metrics and chart | PASS | Table shows Total invested $10,000 / $12,000, NLV at end (ending value) $20,232 / $16,480, Total return +102.3% / +37.3%, CAGR +42.4% / +17.3%, Max drop −16.6% (2024-04-19) / −10.2% (2023-09-27). Extras: MWR, NLV at drop, return to drop. Chart has 2 lines (legend "Lump sum NLV", "DCA NLV"). No metric missing ("ending value" is labelled "NLV at end") | c03-c08-aapl-monthly.png |
| 4 | Two names, weights not summing to 100 | PASS | KO 60 + JNJ 60 (sum 120). Note says "Weights summed to 120.0 and were scaled to 100." Weights shown are 50.0% / 50.0%, and both KO and JNJ rows appear (lump shares 84.4055 / 29.8227) | c04-basket-120.png |
| 5 | Lump = capital on day 1; DCA = extra cash, not from capital; dividends reinvested stated and used | PASS | AAPL: lump invested $10,000 and DCA $12,000 (24×500). Raising capital to 50,000 changes lump only ($50,000, 403.9683 shares = 5×80.7937). DCA stays exactly $12,000 / $16,480 / 65.8112 shares, so it is not drawn from capital. Day-1 point (recomputed from the page's own price data with the app's calculation code @778832c) is lump 10000, DCA 500. The page states "Dividends are reinvested in the name that paid them." It applies them: shown lump shares 80.7937 vs 79.9552 with no reinvestment (10000/125.07), and NLV $20,232 vs $20,022 with no reinvestment | c03-c08-aapl-monthly.png, c05-aapl-capital50k.png, c05-aapl-capital50k.json, c05-recompute.json |
| 6 | LSE refused, Canadian listing accepted | PASS | VOD.L: API 400, alert "VOD.L lists on LSE. US, EU, and CA listings only, unless you name an exception.", no result. BARC.L is refused the same way. RY.TO: 200, CAD, exchange Toronto, result in CA$ (last 173.32, NLV CA$14,673 / CA$15,920). SHOP.TO also accepted (last 152.99) | c06-VOD.L.png, c06-BARC.L.png, c06-RY.TO.png, c06-SHOP.TO.png |
| 7 | No buy/sell wording or rating, button says compare, disclaimer present | PASS | Case-insensitive scan for buy/sell/hold/recommend*/strong buy/outperform/underperform/under/overweight/rating/rated/target price: 0 matches in initial text, initial HTML (incl. meta), and every result, note and alert. Buttons: "↳ Add name", "Compare plans", "Remove name" (icon). "Not a recommendation" appears in the hero, footer, every result note and the meta description | c07-wording-scan.json, c01-load.png |
| 8 | Weekly and monthly both run | PASS | The Frequency control exists (blank / Weekly / Monthly). For AAPL, monthly gives DCA invested $12,000 (24 dates) and weekly gives $52,500 (105 dates) and NLV $71,114. Both render tables and charts, with 0 errors | c03-c08-aapl-monthly.png, c03-c08-aapl-weekly.png |
| 9a | Broken input: empty ticker (weight 100, other fields filled) | PASS | Message: "Each name needs a ticker and a weight." No API call, no crash, button still enabled | c09-emptyTicker.png |
| 9b | Broken input: nonsense symbol ZZQXJ9 | PASS | Message: "ZZQXJ9: No data found, symbol may be delisted" (API 404). No result, 0 page errors, button still enabled | c09-nonsense.png |
| 9c | Broken input: end before start (2024-12-31 to 2023-01-03) | PASS | Message: "End date is before the start date." No API call, no crash | c09-endBeforeStart.png |
| 10 | Mobile 390x844 (touch, DPR 3) | PASS | documentElement scrollWidth 390 = viewport 390, before and after results. 0 inputs/buttons outside the viewport. Compare plans is 350×48 px and a real touch tap ran KO/JNJ 50/50 to a result. The result tables scroll horizontally inside their own wrapper (350 px box, 576 px content) without causing page overflow | c10-mobile-initial.png, c10-mobile-filled.png, c10-mobile-result.png |

Check 9 counts as one check (three sub-tests, all passing), so the totals are 10 PASS / 0 FAIL / 0 BLOCKED.

## Observations (not failures)
- **Mobile:** the "Remove name" minus button is only 16 px tall, well under a 44 px touch target. It works, but it is small.
- **Mobile:** you have to scroll the result tables sideways to see the DCA column at 390 px. The content is reachable and nothing is hidden by page overflow.
- **Nonsense-symbol wording:** the message is passed through from the price feed ("symbol may be delisted"). It is clear enough, but not app-authored copy.
- **Console:** the browser logs a 404 resource error for the nonsense-symbol request. This is expected and no JS exception occurs.
- **Check 5 day-one value:** the chart tooltip could not be read headlessly. I recomputed the day-1 point from the page's own /api/chart data using the app source @778832c, which is supporting evidence rather than an on-page read. The live capital-change test is the on-page proof that DCA is independent of capital.
- **Deployed build:** not hash-verified against a git SHA.

```yaml
status: PASS
url: https://island-pearl-eagle-hill.grok.me
date: 2026-10-02
counts: {pass: 10, fail: 0, blocked: 0}
checks:
  1_load_title_button: PASS
  2_blank_no_result: PASS
  3_single_us_name_metrics_chart: PASS
  4_basket_rescale: PASS
  5_lump_dca_dividends: PASS
  6_us_eu_ca_only: PASS
  7_no_advice_disclaimer: PASS
  8_weekly_monthly: PASS
  9_broken_input: PASS   # empty ticker, nonsense symbol, end<start all messaged, no crash
  10_mobile_390x844: PASS
failed_checks: []
blocked_reasons: []
```
