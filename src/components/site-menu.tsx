import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Lyre } from "@/components/lyre";
import type { OwnerNavLink } from "@/lib/site/owner-nav";
import {
  currentSection,
  MENU_EXTRA_SECTIONS,
  menuLinks,
  SEARCH_PLACEHOLDER,
  SEARCH_SOON,
} from "@/lib/site/site";

/**
 * #286 (header-menu-spec, AC HDR; supersedes RM-22..RM-24, keeps RM-21): the site header, Palantir style.
 *
 * The bar (one 45 px charcoal row, sticky, on every page): the lyre + `Orpheus` home link on the left; on the right a
 * Search button and a Menu (hamburger) button, every target 44 px. No primary action (Diego, 2026-11-01: Get Started removed).
 * The menu is a full-page overlay (not a dropdown): its left column lists every page by its full name (`menuLinks`:
 * Orpheus, Calculator, Dashboard, Personal Finance, the owner's `Renaissance Man` when the server sent it, Account),
 * with `aria-current="page"` on the current one. The overlay is in the server HTML (hidden until opened), so plain
 * links still work everywhere and the owner link stays server-decided and fail-closed (RM-21): non-owners' HTML never
 * holds it. Search opens the same overlay with an inert placeholder field (no search yet). The overlay is a modal
 * dialog: its own close (X) button, Esc closes, Tab is trapped inside, and focus returns to the button that opened it.
 * `MENU_EXTRA_SECTIONS` (empty today) is the hook for later columns (e.g. Obsidian articles, Latest News).
 *
 * #287 (attachments/header-menu-spec.md "§ #287 mobile", AC HBM): below `md` (768 px) only, the same overlay reads as a
 * phone menu: the links come first as full-width rows and the search field + note sit below them (CSS `order`, so
 * the DOM order, the focus trap and HDR-09 are unchanged), a lyre + `Orpheus Wisdom` block closes the panel, and the
 * panel fades in (`.site-overlay-in`, src/styles.css; none under reduced motion). Every #287 class is `max-md:` or
 * `md:hidden`, so 768 px and wider render exactly as #286.
 */
const FOCUS = "focus-visible:outline-chalk";
const ICON_BUTTON = `inline-flex h-11 w-11 items-center justify-center text-chalk ${FOCUS}`;
const OVERLAY_LINK = `inline-flex min-h-11 items-center max-md:flex max-md:w-full max-md:min-h-12 max-md:border-b max-md:border-hair text-2xl leading-tight text-dim underline-offset-[8px] decoration-1 sm:text-3xl aria-[current=page]:text-chalk aria-[current=page]:underline ${FOCUS}`;

function Icon({ d, testId }: { d: string; testId: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      data-testid={testId}
    >
      <path d={d} />
    </svg>
  );
}
const SEARCH_D = "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM15.5 15.5 20 20";
const MENU_D = "M4 7h16M4 12h16M4 17h16";
const CLOSE_D = "M6 6l12 12M18 6 6 18";

type Opened = null | "menu" | "search";

export function SiteMenu({
  pathname,
  ownerLink = null,
}: {
  pathname: string;
  ownerLink?: OwnerNavLink | null;
}) {
  const uid = useId();
  const overlayId = `${uid}-overlay`;
  const [opened, setOpened] = useState<Opened>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const overlay = useRef<HTMLDivElement | null>(null);
  const closeBtn = useRef<HTMLButtonElement | null>(null);
  const search = useRef<HTMLInputElement | null>(null);
  const current = currentSection(pathname);
  const links = menuLinks(ownerLink);

  const open = (kind: Exclude<Opened, null>, from: HTMLButtonElement) => {
    trigger.current = from;
    setOpened(kind);
  };
  const close = () => setOpened(null);

  useEffect(() => {
    if (!opened) return;
    // Focus into the dialog: the search field when Search opened it, else the close button.
    (opened === "search" ? search.current : closeBtn.current)?.focus();
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpened(null);
      }
    };
    document.addEventListener("keydown", onKey);
    const back = trigger.current;
    return () => {
      document.removeEventListener("keydown", onKey);
      root.style.overflow = before;
      back?.focus();
    };
  }, [opened]);

  // Focus trap: Tab from the last focusable goes to the first, Shift-Tab from the first to the last.
  const trap = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || !overlay.current) return;
    const items = [
      ...overlay.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled])'),
    ];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !overlay.current.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !overlay.current.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <nav
      aria-label="Site"
      data-testid="site-menu"
      className="sticky top-0 z-50 border-b border-hair bg-night text-chalk"
    >
      <div
        className="mx-auto flex h-11 w-full max-w-6xl items-center justify-between gap-2 px-5 sm:px-8"
        data-testid="site-bar"
      >
        <a
          href="/"
          className={`inline-flex h-11 min-w-11 items-center gap-2 whitespace-nowrap text-xs text-chalk sm:text-sm ${FOCUS}`}
          data-testid="site-logo"
        >
          <Lyre className="shrink-0" />
          <span>Orpheus</span>
        </a>
        <div className="flex items-center gap-1 sm:gap-3">
          <button
            type="button"
            className={ICON_BUTTON}
            aria-label="Search"
            aria-expanded={opened === "search"}
            aria-controls={overlayId}
            onClick={(e) => open("search", e.currentTarget)}
            data-testid="site-search-open"
          >
            <Icon d={SEARCH_D} testId="site-search-icon" />
          </button>
          <button
            type="button"
            className={ICON_BUTTON}
            aria-label="Menu"
            aria-expanded={opened === "menu"}
            aria-controls={overlayId}
            onClick={(e) => open("menu", e.currentTarget)}
            data-testid="site-menu-open"
          >
            <Icon d={MENU_D} testId="site-menu-icon" />
          </button>
        </div>
      </div>
      <div
        id={overlayId}
        ref={overlay}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        hidden={!opened}
        onKeyDown={trap}
        className="site-overlay-in fixed inset-0 z-[60] overflow-y-auto bg-night text-chalk"
        data-testid="site-overlay"
      >
        <div className="mx-auto flex h-11 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
          <span className="inline-flex h-11 items-center gap-2 text-xs text-chalk sm:text-sm" aria-hidden="true">
            <Lyre className="shrink-0" />
            <span>Orpheus</span>
          </span>
          <button
            ref={closeBtn}
            type="button"
            className={ICON_BUTTON}
            aria-label="Close menu"
            onClick={close}
            data-testid="site-menu-close"
          >
            <Icon d={CLOSE_D} testId="site-close-icon" />
          </button>
        </div>
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 pt-8 pb-16 sm:px-8 md:grid-cols-2">
          <div className="min-w-0 max-md:flex max-md:flex-col" data-testid="site-menu-main">
            <div className="max-md:order-2 max-md:mt-10" data-testid="site-search-block">
            <label htmlFor={`${uid}-search`} className="sr-only">
              Search
            </label>
            <input
              id={`${uid}-search`}
              ref={search}
              type="search"
              placeholder={SEARCH_PLACEHOLDER}
              aria-describedby={`${uid}-search-note`}
              autoComplete="off"
              className={`h-11 w-full max-w-md border-0 border-b border-hair bg-transparent text-base text-chalk placeholder:text-dim ${FOCUS}`}
              data-testid="site-search"
            />
            <p id={`${uid}-search-note`} className="mt-2 text-xs text-dim" data-testid="site-search-note">
              {SEARCH_SOON}
            </p>
            </div>
            <ul className="mt-8 max-md:order-1 max-md:mt-0 flex flex-col gap-1" data-testid="site-menu-links">
              {links.map((l) => (
                <li key={l.href} data-testid={l.owner ? "site-menu-owner" : undefined}>
                  <a
                    href={l.href}
                    aria-current={l.section ? (current === l.section ? "page" : undefined) : pathname === l.href ? "page" : undefined}
                    className={OVERLAY_LINK}
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          {/* #286 hook: later columns (Obsidian articles, Latest News, …) come from MENU_EXTRA_SECTIONS; none yet. */}
          {MENU_EXTRA_SECTIONS.length ? (
            <div className="min-w-0" data-testid="site-menu-extra">
              {MENU_EXTRA_SECTIONS.map((s) => (
                <section key={s.title} aria-label={s.title} className="mb-8">
                  <p className="text-xs text-dim">{s.title}</p>
                  <ul className="mt-3 flex flex-col gap-1">
                    {s.links.map((l) => (
                      <li key={l.href}>
                        <a href={l.href} className={`inline-flex min-h-11 items-center text-base text-dim ${FOCUS}`}>
                          {l.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : null}
        </div>
        {/* #287 HBM-07: the panel's own lyre + name below md (markup only; src/components/site-footer.tsx is unchanged). */}
        <div
          className="mx-auto flex w-full items-center gap-2 px-5 pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))] text-xs text-dim md:hidden"
          data-testid="site-menu-footer"
        >
          <Lyre className="shrink-0" />
          <span>Orpheus Wisdom</span>
        </div>
      </div>
    </nav>
  );
}
