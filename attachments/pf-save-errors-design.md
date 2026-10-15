# #143 Save blocked by field errors: design note

| Piece | Where |
|---|---|
| One shared check | `src/lib/finance/field-errors.ts`: `fieldErrors(state, { blankRateIsError })` lists the first and every error as a path (`fixed.0.amount`, `people.1.tax`, `rates.withdrawal`, `overview.start`, ...) |
| Page | `expenses-page.tsx` `save()`: with `fieldErrors(...)` not empty → no write, no PUT; note `SAVE_BLOCKED`; focus the first `[aria-invalid=true]` field |
| API | `account.server.ts` PUT → `recordFieldError(record)` (parses each name with the page's own readers; every month in `MONTHS_KEY`; blank FX rate allowed) → 400 `{ error: "Invalid value.", field }`, before any write |

## Q-numbered product calls (CFO via EL): recommendations, built as recommended
- **Q-S1 Block or warn:** block. Save stays visible (no disabled button, which is easy to miss and not focusable); pressing it saves nothing, shows `Fix the fields marked in red before saving.`, and focuses the first field in error.
- **Q-S2 Which fields:** every field that shows an error (spec 28.1). That includes the FX rate on a foreign line, so a foreign line without a rate now blocks Save on the page.
- **Q-S3 Is 0 allowed:** yes (blank is 0, as before). Negatives, non-numbers and percents above 100 are errors.
- **Q-S4 API shape and message:** 400 `{ "error": "Invalid value.", "field": "<path>" }`. It never clamps and nothing is stored. A blank FX rate is accepted (it isn't a typed bad value; Q14).
- **Q-S5 Refused PUT on the page:** the existing `Not saved.` status, and the edits stay unsaved.
- **Q-S6 Records already holding a bad value:** the page shows the error and blocks Save; the API refuses the record until it's fixed. That also refuses a section toggle's save for such a record. A follow-up could name the month in the note when the bad value is in a month other than the one shown.
- Q-S1..Q-S5 accepted by the CFO via EL. Q-S6 accepted on condition that a refused section-toggle save shows a persistent `Not saved.` and keeps the edits (PF-141). 8ecd2fc already did both: `saveFailed` changes only when a save resolves, and the toggle saves the stored record without touching the page state. Pinned by a DOM test.
- Correction (QA, f307e46): the "already true at 8ecd2fc" finding was wrong. Its DOM test faked a server refusal, but a real toggle PUT returned 200 with no client check. Fixed in `toggle()`: with `fieldErrors` not empty, the section toggles locally and its view is written to the store (it rides along with the next successful Save); no PUT; `setSaveFailed(true)`, which a successful save clears (PF-142).
