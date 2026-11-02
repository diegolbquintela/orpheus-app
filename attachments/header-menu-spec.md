# Site header and menu (#286)

Date: 2026-11-01. Covers #286, #288 and part of #287. Supersedes RM-22..RM-24 (#271's bar item) and the five-link bar
of #46 / #90 / #97. RM-21 (the server-side, fail-closed owner check) is unchanged. ACs: HDR-01..HDR-12 in
`qa/CANONICAL-AC-PACK.md`. Visual reference: the public palantir.com header and full-page menu.

## 1. The bar
One charcoal row (`bg-night`, chalk type, hairline bottom border), sticky at the top of every page, 45 px tall. Left:
the lyre and the word `Orpheus`, a link to `/`. Right, in order: `Get Started` (a chalk button with charcoal type, a
link to `/calculator`), a Search button (magnifier icon, accessible name `Search`) and a Menu button (three lines,
`Menu`). Every target is at least 44 × 44 px. No bar link carries `aria-current`. Get Started shows at every width:
measured at 360 px it sits at x 148–244 with 52 px clear of the logo, so it is never hidden.

## 2. The overlay
A full-page dialog (`role="dialog"`, `aria-modal="true"`, `fixed inset-0`, charcoal), inside the same
`nav[aria-label=Site][data-testid=site-menu]`, rendered on the server with `hidden` until opened, so its links are in
every page's HTML. Top row: the lyre + `Orpheus` (decorative) and an X button (`Close menu`). Then the search
placeholder and the page links, top to bottom, by their full names: Orpheus, Calculator, Dashboard, Personal Finance,
(Renaissance Man, owner only), Account. The current page has `aria-current="page"` (chalk + underline); the others are
dim. Page scroll is locked while open.

## 3. Behaviour
- Menu opens it with focus on X; Search opens it with focus in the search field.
- X or Esc closes it; focus returns to the button that opened it.
- Tab is trapped: Tab from the last item goes to the first, Shift-Tab from the first to the last.
- The search field is a placeholder (`Search Orpheus`, note `Search is coming soon.`): no form, no fetch, no navigation.

## 4. Owner link (RM-21 kept)
The root loader's `ownerLink` (null for everyone but the owner) adds `Renaissance Man` right before Account. With no
owner link the markup is identical for `null`, `undefined` or omitted, and has no `renaissance` or `RM`.

## 5. Hooks
`menuLinks(ownerLink)` in `src/lib/site/site.ts` builds the list; `MENU_EXTRA_SECTIONS` (empty) renders extra columns
(e.g. Obsidian articles, Latest News) beside the links when filled. No Obsidian links yet.

## 6. Invariants
Dark style, the lyre and the `Orpheus Wisdom` footer kept; no gold; no tabular numerals; AA contrast (chalk on night
14.2:1, dim on night 7.2:1, night on chalk 14.2:1); no horizontal overflow and CLS 0 at 360 / 390 / 768 / 1440; no new
dependency, table, env var or storage key.

## Addendum 2026-11-01: no primary action (Diego, via EL, on PR #293)
`Get Started` is removed. The bar is the lyre + `Orpheus` home link, the Search button and the Menu button only, with no
primary action; the Calculator is reached from the overlay. §1's Get Started text and its 360 px measurement no
longer apply. ACs: HDR-01 and HDR-02 amended.

## § #287 mobile (2026-11-02): the menu overlay below 768 px
EL decisions on #287 (option B: refine the #286 overlay; no separate mobile menu; no HARD STOP):
- **Q1** Full-screen on mobile (the #286 overlay already is). No slide-over.
- **Q2** Breakpoint `md` (768 px): below it the mobile layout; 768 px and wider stay pixel-identical to #286 (HDR-01..12
  unchanged).
- **Q3** The links and names are unchanged: Orpheus, Calculator, Dashboard, Personal Finance, `Renaissance Man` (owner
  only, server-decided, fail-closed via `ORPHEUS_OWNER_EMAIL`; RM-21 / HDR-06), Account.
- **Q4** Extend the #286 overlay: the same Menu trigger, dialog, `menuLinks`, Esc, focus trap and return focus.
- **Q5** Below 768 px the links come first; the search field and its `Search is coming soon.` note move below them
  (kept in the panel).

Below 768 px only (`src/components/site-menu.tsx`, every #287 class `max-md:` or `md:hidden`):
- Each link is a full-width row (`flex w-full min-h-12 border-b border-hair`), same type and current-page underline.
- The search block is ordered after the list with CSS `order`; the DOM order (search, then links) is unchanged, so the
  focus trap and HDR-09 hold as written. Tab therefore reaches the search field before the links.
- Under the panel: the lyre + `Orpheus Wisdom` (dim, 12 px) in a `div`, markup only; the page footer
  (`src/components/site-footer.tsx`) is unchanged. Bottom padding includes `env(safe-area-inset-bottom)`.
- The overlay fades in (opacity + a 0.5 rem rise, 160 ms; `.site-overlay-in` in `src/styles.css`); nothing under
  `prefers-reduced-motion: reduce` or at 768 px and wider. Transform only, so no layout shift.
ACs: HBM-01..10 (`qa/CANONICAL-AC-PACK.md`).
- **Q5(b)** (Diego, 2026-11-02, PR #302 r2; supersedes the CSS `order` bullet above): below 768 px the search block
  comes after the links in the DOM too, so Tab follows the layout: X, Orpheus, Calculator, Dashboard, Personal Finance,
  [Renaissance Man, owner only], Account, Search. Two render slots: the #286 slot before the list (`max-md:hidden`) and a
  mobile slot after it, rendered only below 768 px (`matchMedia("(max-width: 47.99rem)")`, also `md:hidden`). Only one
  field is ever displayed, so only one is in the accessibility tree and the focus order; each has its own id, label and
  note id. The focus trap counts displayed elements only (`checkVisibility`). 768 px and wider: DOM, Tab order
  (X, Search, links) and pixels are #286's. ACs: HBM-06 (amended 2026-11-02).
