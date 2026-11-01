// #258 (personal-finance-spec 80, AC PFRL): the stale banner's Reload copy and the focus hand-off after it.
export const RELOAD_BUTTON = "Reload";
export const RELOADING = "Reloading…";
export const RELOAD_ERROR = "Couldn't reload. Your edits are kept; try again.";

/** Focus the page's `h1` (made programmatically focusable) once the banner has gone. */
export function focusPageHeading(doc: Document = document): void {
  const h = doc.querySelector<HTMLElement>("main h1") ?? doc.querySelector<HTMLElement>("h1");
  if (!h) return;
  if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1");
  h.focus();
}

