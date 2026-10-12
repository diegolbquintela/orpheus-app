import { Lyre } from "@/components/lyre";
import { PersonGlyph } from "@/components/person-glyph";
import { currentSection, MENU_ITEMS } from "@/lib/site/site";

/**
 * #90 (ROLE-01): a fifth, right-most item `Account` (to `/account`), always shown; below 640 px a person glyph whose
 * link keeps the accessible name `Account` (the word is visually hidden), from 640 px the word.
 *
 * The site menu (#46; dark shell, epic #66 #68; the lyre mark #84 before `Orpheus`, decorative): one thin charcoal bar that stays at the top on scroll, on
 * every page, including /dashboard, sign-in and the 404 (same markup everywhere). "Orpheus" on the left links
 * home; "Calculator", "Dashboard" and (#97) "Personal finance" on the right, text only. Below 640 px the text is 12 px
 * and the right links 8 px apart so all four fit on one line at 360 px (site-style Q21). No dropdowns, no hover rule. The current page gets
 * aria-current="page" and a visual mark keyed on that attribute (off-white and underlined; the other items
 * are dim). Off-white focus ring (the site's green focus colour is too dark on charcoal). Plain links (full page
 * loads), so /dashboard always goes through its server gate.
 */
/**
 * #90: below 640 px the glyph link keeps a 44 × 44 box but takes only the glyph's 20 px in the row: it reaches 8 px
 * back over the gap before it and 16 px into the bar's right padding, with the glyph at its right edge, so the glyph
 * still ends on the column edge (20 px from the screen) and sits 8 px from `Personal finance` like the other items.
 * That is what lets the five items keep 12 px text and 8 px gaps (Q21). From 640 px it is a plain text link.
 */
const GLYPH_LINK = "-ml-2 -mr-4 justify-end pr-4 sm:m-0 sm:justify-center sm:pr-0";

/**
 * #90: five items don't fit on one row below 384 px at Q21's 12 px text and 8 px gaps with the word `Orpheus`
 * (360 px is 18 px short even with the glyph), so there `Personal finance` sets on two short lines inside its 44 px
 * box; nothing else changes. An open question for EL in the #90 PR (alternatives: Q-D8 (c) `Finance` on phones, or
 * 11 px text below 400 px).
 */
const NARROW_WRAP = "max-[383px]:w-min max-[383px]:leading-[14px]";

export function SiteMenu({ pathname }: { pathname: string }) {
  const current = currentSection(pathname);
  const [home, ...right] = MENU_ITEMS;
  // Each link is a 44 px tall hit area (the bar's inner height; #72, QA N1 on #73, ST6-08): the text, its underline
  // and the current mark stay where they were, and the bar stays 45 px (44 + the 1 px rule).
  const link =
    "inline-flex h-11 min-w-11 items-center underline-offset-[6px] decoration-1 focus-visible:outline-chalk aria-[current=page]:text-chalk aria-[current=page]:underline";
  return (
    <nav
      aria-label="Site"
      data-testid="site-menu"
      className="sticky top-0 z-50 border-b border-hair bg-night text-chalk"
    >
      <div className="mx-auto flex h-11 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
        <a
          href={home.href}
          aria-current={current === home.section ? "page" : undefined}
          className={`gap-2 text-xs text-chalk sm:text-sm ${link}`}
        >
          <Lyre className="shrink-0" />
          <span>{home.label}</span>
        </a>
        <ul className="flex items-center gap-2 text-xs sm:gap-6 sm:text-sm">
          {right.map((item) => (
            <li key={item.section}>
              <a
                href={item.href}
                aria-current={current === item.section ? "page" : undefined}
                className={`text-dim ${link}${item.section === "account" ? ` ${GLYPH_LINK}` : item.section === "personal-finance" ? ` ${NARROW_WRAP}` : ""}`}
              >
                {item.section === "account" ? (
                  <>
                    <PersonGlyph className="sm:hidden" />
                    <span className="sr-only sm:not-sr-only">{item.label}</span>
                  </>
                ) : (
                  item.label
                )}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
