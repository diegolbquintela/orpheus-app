import { Fragment } from "react";
import { Lyre } from "@/components/lyre";
import { PersonGlyph } from "@/components/person-glyph";
import type { OwnerNavLink } from "@/lib/site/owner-nav";
import { currentSection, MENU_ITEMS } from "@/lib/site/site";

/**
 * #90 (ROLE-01): a fifth, right-most item `Account` (to `/account`), always shown; below 640 px a person glyph whose
 * link keeps the accessible name `Account` (the word is visually hidden), from 640 px the word.
 *
 * The site menu (#46; dark shell, epic #66 #68; the lyre mark #84 before `Orpheus`, decorative): one thin charcoal bar that stays at the top on scroll, on
 * every page, including /dashboard, sign-in and the 404 (same markup everywhere). "Orpheus" on the left links
 * home; "Calculator", "Dashboard" and (#97) "Personal Finance" on the right, text only. Below 640 px the text is 12 px
 * and the right links 8 px apart so all four fit on one line at 360 px (site-style Q21). No dropdowns, no hover rule. The current page gets
 * aria-current="page" and a visual mark keyed on that attribute (off-white and underlined; the other items
 * are dim). Off-white focus ring (the site's green focus colour is too dark on charcoal). Plain links (full page
 * loads), so /dashboard always goes through its server gate.
 */
/**
 * #90: below 640 px the glyph link keeps a 44 × 44 box but takes only the glyph's 20 px in the row: it reaches 8 px
 * back over the gap before it and 16 px into the bar's right padding, with the glyph at its right edge, so the glyph
 * still ends on the column edge (20 px from the screen) and sits 8 px from `Personal Finance` like the other items.
 * That is what lets the five items keep 8 px gaps (Q21; text 11 px through 399 px, 12 px to 640 px, EL). From 640 px it is a plain text link.
 */
// #90 (EL, Q21 amended): through 399 px the bar text is 11 px so five items fit on one line at 360.
const LINK =
  "inline-flex h-11 min-w-11 items-center whitespace-nowrap underline-offset-[6px] decoration-1 focus-visible:outline-chalk aria-[current=page]:text-chalk aria-[current=page]:underline";
// #271: the owner's bar may wrap. Six items don't fit on one 45 px line below about 400 px, so there the right-hand
// list moves under `Orpheus` (a second 44 px row) instead of overflowing or clipping; wherever it fits it stays one row.
// Everyone else keeps the fixed one-row `h-11` bar, byte for byte.
const OWNER_ROW =
  "mx-auto flex min-h-11 w-full max-w-6xl flex-wrap items-center justify-between px-5 sm:px-8";
const GLYPH_LINK = "-ml-2 -mr-4 justify-end pr-4 sm:m-0 sm:justify-center sm:pr-0";

/**
 * #271 (RM-21..): the owner, and only the owner, gets one more item before `Account`: `ownerLink` comes from the
 * server (the root loader, the same owner check as /renaissance) and is null for everyone else, so their bar is
 * unchanged. Below 768 px it shows its short text (`RM`, aria-hidden) with the full label as its accessible name
 * (visually hidden); from 768 px the label. Same 44 px link box as the others. Where six items don't fit on one line
 * (phones), the owner's bar wraps to two rows (OWNER_ROW): no overflow, nothing clipped.
 */
export function SiteMenu({
  pathname,
  ownerLink = null,
}: {
  pathname: string;
  ownerLink?: OwnerNavLink | null;
}) {
  const current = currentSection(pathname);
  const [home, ...right] = MENU_ITEMS;
  // Each link is a 44 px tall hit area (the bar's inner height; #72, QA N1 on #73, ST6-08): the text, its underline
  // and the current mark stay where they were, and the bar stays 45 px (44 + the 1 px rule).
  const ownerItem = ownerLink ? (
    <li data-testid="site-menu-owner">
      <a
        href={ownerLink.href}
        aria-current={pathname === ownerLink.href ? "page" : undefined}
        className={`text-dim ${LINK}`}
      >
        <span aria-hidden="true" className="md:hidden">
          {ownerLink.short}
        </span>
        <span className="sr-only md:not-sr-only">{ownerLink.label}</span>
      </a>
    </li>
  ) : null;
  return (
    <nav
      aria-label="Site"
      data-testid="site-menu"
      className="sticky top-0 z-50 border-b border-hair bg-night text-chalk"
    >
      <div
        className={
          ownerLink
            ? OWNER_ROW
            : "mx-auto flex h-11 w-full max-w-6xl items-center justify-between px-5 sm:px-8"
        }
      >
        <a
          href={home.href}
          aria-current={current === home.section ? "page" : undefined}
          className={`gap-2 text-xs text-chalk max-[400px]:text-[11px] sm:text-sm ${LINK}`}
        >
          <Lyre className="shrink-0" />
          <span>{home.label}</span>
        </a>
        <ul className="flex items-center gap-2 text-xs max-[400px]:text-[11px] sm:gap-6 sm:text-sm">
          {right.map((item) => (
            <Fragment key={item.section}>
              {item.section === "account" ? ownerItem : null}
              <li>
                <a
                  href={item.href}
                  aria-current={current === item.section ? "page" : undefined}
                  className={`text-dim ${LINK}${item.section === "account" ? ` ${GLYPH_LINK}` : ""}`}
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
            </Fragment>
          ))}
        </ul>
      </div>
    </nav>
  );
}
