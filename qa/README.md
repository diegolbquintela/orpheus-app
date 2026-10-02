# QA fixtures for the canonical AC pack (DCA-01..DCA-06)

`qa/fixtures.json` is a non-empty JSON array. Each entry:

| Field | Meaning |
|---|---|
| `id`, `title` | Case name |
| `acs` | `[{ ac, rule }]`, the AC ids from the canonical pack this case evidences |
| `kind` | `run` (engine result), `refused` (listing must be rejected), `content` (copy scan) |
| `inputs` | `tickers`, `weights` (percent, as typed in the form), `start`, `end`, `capital`, `contribution`, `frequency` |
| `data` | `snapshots` (committed raw Yahoo payloads), `queries` (exact Yahoo URLs `loadChart()` requested), `fetchedAt` |
| `expected` | Output of the app engine on that data (see below). Never hand-typed. |

`expected` for `run` cases: `currency`, `exchanges`, `weightsApplied`, `events` (dividends and splits in
window, split-unadjusted), `lumpDeploy` (date, prices, NLV on that date, per-name allocation share),
`contributions` (placed, invested, missed), `run` (the `runDesk` summary: sessions, shares, lump and DCA
stats, first and last chart points) and `withoutDividendReinvestment` (same run with dividends removed,
for DCA-01).

## Cases

| id | ACs | What it pins |
|---|---|---|
| `us-single-dividend-ko` | DCA-01, 02, 03 | KO, 2023-01-03..2024-12-31, 10,000 + 500 monthly, 8 dividends |
| `us-basket-jnj-pg-wmt` | DCA-01..04 | JNJ/PG/WMT 50/30/20 USD basket, 20,000 + 250 weekly, includes WMT 3:1 split (2024-02-26) |
| `ca-single-ry-to` | DCA-01, 02, 03, 05 | RY.TO (Toronto, CAD), 10,000 + 500 monthly; CA listing accepted |
| `refused-lse-vod-l` | DCA-05 | VOD.L (LSE) refused with HTTP 400 and the app's message |
| `no-advice-copy` | DCA-06 | Scan of user-facing copy files for recommendation words; disclaimer present |

## Regenerate

```bash
npm run fixtures:build               # offline: reuse qa/snapshots, recompute expected via the engine
npm run fixtures:build -- --refresh  # re-pull Yahoo through loadChart() and rewrite snapshots (network)
npm run fixtures:hand-check          # independent recomputation, rewrites qa/HAND-CHECK.md
npm test                             # includes src/lib/dca/fixtures.test.ts (offline replay)
```

Snapshots are the raw Yahoo v8 chart responses, recorded by swapping global `fetch` around the app's own
`loadChart()` (src/lib/dca/yahoo.server.ts). The test swaps in a replayer that only answers those URLs.

These numbers are historical simulation outputs for testing. They are not a recommendation.
