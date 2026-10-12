

## Shared page parts (#92)

- New page code uses `.ow-label` / `.ow-button` (`src/styles/parts.css`); do not copy their declarations into a page
  rule. Fonts only in `src/styles/fonts.css`; the preload path only in `src/lib/site/fonts.ts`.
- `scripts/shared-parts.test.mjs` enforces it (SP-01..SP-05). Site-style-spec section 16.
