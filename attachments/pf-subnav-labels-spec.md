# Personal Finance sub-nav labels spec (#275, MEDIUM; added 2026-11-01)

Diego confirmed the names on 2026-11-01. AC pack: `qa/CANONICAL-AC-PACK.md` section **PFNL** (PFNL-01..PFNL-06).

## 1. Labels (visible text only)
| Sub-nav link (test id, unchanged) | Before | After | Route (unchanged) |
|---|---|---|---|
| `pf-charts-link` | Charts | Report Builder | `/personal-finance/charts` |
| `pf-history-link` | History | Yearly Ledger | `/personal-finance/history` |
| `pf-scenario-link` | Scenario | Scenario Analysis | `/personal-finance/scenario` |

- One source: `src/lib/finance/pf-nav.ts` (`PF_NAV_LABELS`, `PF_PAGE_TITLES`, `pfDocTitle`, `reportDocTitle`).
  `HISTORY_LINK`, `HISTORY_TITLE` and `SCENARIO_TITLE` now read from it.
- Unchanged: routes, URLs, query params, `next=` sign-in targets, test ids, data, storage keys, API paths and behaviour.

## 2. Titles and headings changed (they named the old pages, so leaving them would be an obvious mismatch)
| File | Before | After |
|---|---|---|
| `src/components/personal-finance/charts-page.tsx` (h1) | `Charts.` | `Report Builder.` |
| `src/lib/finance/history.ts` `HISTORY_TITLE` (History page h1) | `History.` | `Yearly Ledger.` |
| `src/components/personal-finance/expenses-page.tsx` (scenario h1; via `SCENARIO_TITLE`) | `Scenario.` | `Scenario Analysis.` |
| `src/components/personal-finance/charts-builder.tsx` (back link `pf-builder-back`) | `Charts` | `Report Builder` |
| `src/routes/personal-finance_.charts.tsx` (`<title>`) | `Charts · Personal Finance · Orpheus Wisdom` | `Report Builder · Personal Finance · Orpheus Wisdom` |
| `src/routes/personal-finance_.history.tsx` (`<title>`) | `History · Personal Finance · Orpheus Wisdom` | `Yearly Ledger · Personal Finance · Orpheus Wisdom` |
| `src/routes/personal-finance_.scenario.tsx` (`<title>`) | `Scenario · Personal Finance · Orpheus Wisdom` | `Scenario Analysis · Personal Finance · Orpheus Wisdom` |
| `src/routes/personal-finance_.charts_.$id.tsx` (`<title>`) | `Report · Charts · Orpheus Wisdom` | `Report · Report Builder · Orpheus Wisdom` |
| `src/routes/personal-finance_.charts_.new.tsx` (`<title>`) | `New report · Charts · Orpheus Wisdom` | `New report · Report Builder · Orpheus Wisdom` |
| `src/routes/personal-finance_.charts_.$id_.edit.tsx` (`<title>`) | `Edit report · Charts · Orpheus Wisdom` | `Edit report · Report Builder · Orpheus Wisdom` |

Kept on purpose: the builder's own h1 `Report.`, the section headings inside each page, "Scenario name", the
"Scenario totals" labels, and code comments.

## 3. Phone width (minimal wrap)
The longer labels don't fit on one line at 360 or 390 px. The sub-nav `<p>` gets `.pf-subnav` (flex, wrap,
`column-gap: 1.5rem`), replacing the per-link `ml-6`. The links wrap whole, and a wrapped row starts flush left.
Wide, the spacing is the same 1.5rem as before. Links keep `min-height: 2.75rem` (44 px). There's no new color,
font or size, no tnum and no gold. It's `:not([hidden])`, so the scenario screen still hides it.

## 4. QA
Signed-in surfaces are QA-owned on the preview: each label opens its page, and the titles match §2.
