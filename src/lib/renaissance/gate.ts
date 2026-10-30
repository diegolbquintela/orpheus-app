import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

/**
 * #267 `/renaissance` (owner only): the page's data, computed on the server. Anyone but the owner (signed out, a
 * non-owner, the flag off, no database) gets `notFound()`, so the page is the site's real 404. `today` is the
 * owner's calendar day (America/Toronto). `not_configured`: the owner, but the table isn't migrated yet.
 */
export const getRenaissancePage = createServerFn({ method: "GET" }).handler(async () => {
  const { getRequest } = await import("@tanstack/react-start/server");
  const { loadRenaissance } = await import("./api.server");
  const r = await loadRenaissance(getRequest().headers);
  if (r.status === "not_found") throw notFound();
  if (r.status === "not_configured") return { status: "not_configured" as const };
  const { buildView } = await import("./view");
  const { todayIn } = await import("./derive");
  return { status: "ok" as const, view: buildView(r.entries, todayIn(new Date())) };
});


/**
 * #271: the site bar's owner-only link, for the root loader. The owner gets `{ href, label, short }`; anyone else, or
 * any error (flag off, signed out, no database, `ORPHEUS_OWNER_EMAIL` unset or unmatched), gets null.
 */
export const getOwnerNavLink = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { renaissanceNavLink } = await import("./api.server");
    return await renaissanceNavLink(getRequest().headers);
  } catch {
    return null;
  }
});
