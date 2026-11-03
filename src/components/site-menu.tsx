import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
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
 * phone menu: the links come first as full-width rows and the search field + note sit below them (Q5(b): a second
 * search slot after the links, `SearchSlot` below, so the DOM and Tab order match the layout), a lyre + `Orpheus Wisdom` block closes the panel, and the
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

/**
 * #287: displayed (not inside a display:none slot), by `checkVisibility` in the browser. Without it (jsdom, no CSS)
 * the desktop layout is assumed: the mobile search slot counts as hidden.
 */
const shown = (e: HTMLElement) =>
  typeof e.checkVisibility === "function" ? e.checkVisibility() : !e.closest('[data-search-slot="mobile"]');

/**
 * #287 Q5(b) (Diego, 2026-11-02; attachments/header-menu-spec.md "§ #287 mobile"): the search field + note, rendered in
 * two slots so the DOM (and Tab) order follows the layout: `desktop` before the links (display:none below md, so
 * 768 px and wider are #286 exactly) and `mobile` after them (display:none from md). Only one is ever displayed, so
 * only one is in the accessibility tree and the focus order; each has its own id, label and note id.
 */
function SearchSlot({
  uid,
  slot,
  inputRef,
  value,
  onChange,
  onCaret,
}: {
  uid: string;
  slot: "desktop" | "mobile";
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
  onCaret: (e: { currentTarget: HTMLInputElement }) => void;
}) {
  const id = slot === "desktop" ? `${uid}-search` : `${uid}-search-mobile`;
  return (
    <div
      className={slot === "desktop" ? "max-md:hidden" : "mt-10 md:hidden"}
      data-testid={slot === "desktop" ? "site-search-block" : "site-search-block-mobile"}
      data-search-slot={slot}
    >
      <label htmlFor={id} className="sr-only">
        Search
      </label>
      <input
        id={id}
        ref={inputRef}
        type="search"
        placeholder={SEARCH_PLACEHOLDER}
        aria-describedby={`${id}-note`}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        onSelect={onCaret}
        onKeyUp={onCaret}
        onInput={onCaret}
        className={`h-11 w-full max-w-md border-0 border-b border-hair bg-transparent text-base text-chalk placeholder:text-dim ${FOCUS}`}
        data-testid="site-search"
      />
      <p id={`${id}-note`} className="mt-2 text-xs text-dim" data-testid="site-search-note">
        {SEARCH_SOON}
      </p>
    </div>
  );
}

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
  const searchDesktop = useRef<HTMLInputElement | null>(null);
  const searchMobile = useRef<HTMLInputElement | null>(null);
  // #287 Q5(b): below md (Tailwind `max-md:` = width < 48rem) the mobile search slot is rendered after the links;
  // at md and wider it is not rendered at all, so the desktop DOM is #286's exactly. No matchMedia (jsdom): desktop.
  const [phone, setPhone] = useState(false);
  // CH15 (#287 r3): one search value for both slots, so typing survives the slot swap.
  const [query, setQuery] = useState("");
  // CH14 (#287 r3): crossing 768 px while open swaps the slots; remember where focus was so it can be put back.
  const swap = useRef<{ inSearch: boolean } | null>(null);
  // CH17 (#288): the Search caret, kept on every select / key / input in either slot, so it survives a resize even
  // after focus has left Search.
  const sel = useRef<[number, number] | null>(null);
  const onCaret = (e: { currentTarget: HTMLInputElement }) => {
    const { selectionStart: a, selectionEnd: b } = e.currentTarget;
    if (a !== null) sel.current = [a, b ?? a];
  };
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(max-width: 47.99rem)");
    const sync = () => {
      const a = document.activeElement as HTMLInputElement | null;
      const inSearch = a?.tagName === "INPUT" && a.getAttribute("data-testid") === "site-search";
      if (inSearch) onCaret({ currentTarget: a });
      swap.current = { inSearch };
      setPhone(mq.matches);
    };
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);
  // CH14: after the swap commits, if the menu is open and focus was in Search or is now outside the dialog, focus the
  // displayed Search field (caret kept), else X. Never moves focus while the menu is closed.
  useLayoutEffect(() => {
    const w = swap.current;
    swap.current = null;
    if (!w || !opened || !overlay.current) return;
    const fix = () => {
      if (!overlay.current || overlay.current.hidden) return;
      const a = document.activeElement;
      const field = [searchMobile.current, searchDesktop.current].find((i) => i && shown(i));
      const caret = sel.current;
      if (!w.inSearch && a && a !== document.body && overlay.current.contains(a) && shown(a as HTMLElement)) {
        // CH17: focus stays where it is; the displayed field still gets the caret back (setSelectionRange does not focus).
        if (field && caret && field !== a) field.setSelectionRange(caret[0], caret[1]);
        return;
      }
      if (field) {
        field.focus();
        if (caret) field.setSelectionRange(caret[0], caret[1]);
      } else closeBtn.current?.focus();
    };
    fix();
    // The browser may only blur a field hidden by the media query at its next style pass: check again then.
    const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame(fix) : 0;
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);
  const current = currentSection(pathname);
  const links = menuLinks(ownerLink);

  const open = (kind: Exclude<Opened, null>, from: HTMLButtonElement) => {
    trigger.current = from;
    setOpened(kind);
  };
  const close = () => setOpened(null);

  // #288 A (CLS-03): a route change while open closes the menu (SiteMenu lives in __root, so it stays mounted across
  // same-document navigations). The scroll lock and focus are handled by the open effect's cleanup.
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    setOpened(null);
  }, [pathname]);

  useEffect(() => {
    if (!opened) return;
    // Focus into the dialog: the search field when Search opened it, else the close button.
    // #287: the search field shown at this width (desktop slot is display:none below md; mobile slot only below md).
    const search = [searchMobile.current, searchDesktop.current].find((i) => i && shown(i)) ?? searchDesktop.current;
    (opened === "search" ? search : closeBtn.current)?.focus();
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
    // #288 A (CLS-03 / CLS-04): Back / Forward (popstate) and a back/forward-cache restore close it. No history entry.
    const onPop = () => setOpened(null);
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setOpened(null);
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("pageshow", onShow);
    const back = trigger.current;
    const dialog = overlay.current;
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("pageshow", onShow);
      root.style.overflow = before;
      // Focus goes back to the trigger only if it was in the dialog (or lost to body), never stolen from the page.
      const a = document.activeElement;
      if (!a || a === document.body || dialog?.contains(a)) back?.focus();
    };
  }, [opened]);

  // Focus trap: Tab from the last focusable goes to the first, Shift-Tab from the first to the last.
  const trap = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || !overlay.current) return;
    const items = [
      ...overlay.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled])'),
    ].filter(shown); // #287: only what is displayed (the other width's search slot is display:none)
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
            className={`${ICON_BUTTON} max-md:w-auto max-md:min-w-11 max-md:gap-2 max-md:pl-2`}
            aria-label="Close menu"
            onClick={close}
            data-testid="site-menu-close"
          >
            {/* #288 B (CLS-07): visible below md only, inside the same button; the name stays "Close menu". */}
            <span className="text-xs text-chalk sm:text-sm md:hidden" aria-hidden="true" data-testid="site-close-label">
              Close
            </span>
            <Icon d={CLOSE_D} testId="site-close-icon" />
          </button>
        </div>
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 pt-8 pb-16 sm:px-8 md:grid-cols-2">
          <div className="min-w-0" data-testid="site-menu-main">
            <SearchSlot uid={uid} slot="desktop" inputRef={searchDesktop} value={query} onChange={setQuery} onCaret={onCaret} />
            <ul className="mt-8 max-md:mt-0 flex flex-col gap-1" data-testid="site-menu-links">
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
            {phone ? <SearchSlot uid={uid} slot="mobile" inputRef={searchMobile} value={query} onChange={setQuery} onCaret={onCaret} /> : null}
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
