/**
 * Site shell copy and rules (#46): the menu, the home cards, the footer text and the `/?query`
 * redirect. Pure (no React, no server imports) so tests, the menu and the home route share it.
 * The menu does not read the dashboard flag: the Dashboard item is always shown, and /dashboard
 * itself stays gated (a 404 while the flag is off).
 */

export type SiteSection = "home" | "calculator" | "dashboard";

/** Menu items, left to right. "Orpheus" sits on the left; the other two on the right. */
export const MENU_ITEMS: readonly { section: SiteSection; label: string; href: string }[] = [
  { section: "home", label: "Orpheus", href: "/" },
  { section: "calculator", label: "Calculator", href: "/calculator" },
  { section: "dashboard", label: "Dashboard", href: "/dashboard" },
];

/** The one line on the home page that says what the desk is. */
export const HOME_LINE = "Orpheus Wisdom is a private desk with two tools.";

/** Exactly two home cards; the descriptions are the issue #46 texts, verbatim. */
export const HOME_CARDS: readonly { title: string; text: string; href: string }[] = [
  { title: "Calculator", text: "compare a lump sum with contributions", href: "/calculator" },
  { title: "Dashboard", text: "holdings, value, stored figures", href: "/dashboard" },
];

/** The footer text: exactly "Orpheus Wisdom", nothing else (#46 brief update, 2026-10-04). */
export const FOOTER_LINE = "Orpheus Wisdom";

/** The calculator's listings note under the basket, unchanged from before the move (#46). */
export const CALCULATOR_NOTE = "US, EU and CA listings, one currency per basket.";

/** Which menu item is the current page for a pathname (null: none, e.g. a 404). */
export function currentSection(pathname: string): SiteSection | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (path === "/") return "home";
  if (path === "/calculator") return "calculator";
  if (path === "/dashboard" || path.startsWith("/dashboard/")) return "dashboard";
  return null;
}

/**
 * The calculator used to live at `/`. A request for `/` with a query string goes to `/calculator`
 * with the same query (the calculator reads no URL parameters today, so this only keeps old links
 * landing on the calculator). Plain `/` stays home. Returns null when there is nothing to redirect.
 */
export function homeRedirectHref(searchStr: string): string | null {
  const query = searchStr.startsWith("?") ? searchStr.slice(1) : searchStr;
  return query ? `/calculator?${query}` : null;
}
