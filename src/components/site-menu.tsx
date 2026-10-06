import { currentSection, MENU_ITEMS } from "@/lib/site/site";

/**
 * The site menu (#46; dark shell, epic #66 #68): one thin charcoal bar that stays at the top on scroll, on
 * every page, including /dashboard, sign-in and the 404 (same markup everywhere). "Orpheus" on the left links
 * home; "Calculator" and "Dashboard" on the right. No dropdowns, no hover rule. The current page gets
 * aria-current="page" and a visual mark keyed on that attribute (off-white and underlined; the other two items
 * are dim). Off-white focus ring (the site's green focus colour is too dark on charcoal). Plain links (full page
 * loads), so /dashboard always goes through its server gate.
 */
export function SiteMenu({ pathname }: { pathname: string }) {
  const current = currentSection(pathname);
  const [home, ...right] = MENU_ITEMS;
  const link =
    "underline-offset-[6px] decoration-1 focus-visible:outline-chalk aria-[current=page]:text-chalk aria-[current=page]:underline";
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
          className={`text-sm text-chalk ${link}`}
        >
          {home.label}
        </a>
        <ul className="flex items-center gap-6 text-sm">
          {right.map((item) => (
            <li key={item.section}>
              <a
                href={item.href}
                aria-current={current === item.section ? "page" : undefined}
                className={`text-dim ${link}`}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
