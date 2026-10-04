import { currentSection, MENU_ITEMS } from "@/lib/site/site";

/**
 * The site menu (#46): a thin bar that stays at the top on scroll, on every page. "Orpheus" on the
 * left links home; "Calculator" and "Dashboard" on the right. No dropdowns. The current page gets
 * aria-current="page" and a visual state (full-strength text, underline) keyed on that attribute.
 * Plain links (full page loads), so /dashboard always goes through its server gate.
 */
export function SiteMenu({ pathname }: { pathname: string }) {
  const current = currentSection(pathname);
  const [home, ...right] = MENU_ITEMS;
  const link =
    "underline-offset-[6px] decoration-1 hover:text-card aria-[current=page]:text-card aria-[current=page]:underline";
  return (
    <nav aria-label="Site" data-testid="site-menu" className="sticky top-0 z-50 bg-ink text-card">
      <div className="mx-auto flex h-11 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
        <a
          href={home.href}
          aria-current={current === home.section ? "page" : undefined}
          className={`text-sm text-card ${link}`}
        >
          {home.label}
        </a>
        <ul className="flex items-center gap-6 text-sm">
          {right.map((item) => (
            <li key={item.section}>
              <a
                href={item.href}
                aria-current={current === item.section ? "page" : undefined}
                className={`text-card/65 ${link}`}
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
