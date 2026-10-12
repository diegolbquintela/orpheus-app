/**
 * #90 page gates (server-only): who is looking and what they may do on a surface. Used by the `/personal-finance`,
 * `/dashboard` and `/account` routes through their server functions. Everything comes from the session cookie and
 * the database on this request; nothing from the client.
 */
import type { Surface } from "./access.ts";
import { accessOf, surfaceAccess, type AccountAccess } from "./access.server.ts";

export type PageAccess = {
  signedIn: boolean;
  mustChange: boolean;
  read: boolean;
  write: boolean;
  owner: boolean;
  /** Whose data the page shows (the owner), when it may read. */
  dataUserId: string | null;
};

const NONE: PageAccess = {
  signedIn: false,
  mustChange: false,
  read: false,
  write: false,
  owner: false,
  dataUserId: null,
};

export async function viewerAndAccess(headers: Headers) {
  const { sessionFromRequestHeaders, defaultGetDb } = await import("../dashboard/session.server");
  const user = await sessionFromRequestHeaders(headers);
  if (!user) return null;
  const db = await defaultGetDb(process.env);
  if (!db) return { user, db: null, access: null as AccountAccess | null };
  return { user, db, access: await accessOf(db, user, process.env) };
}

export async function pageAccess(headers: Headers, surface: Surface): Promise<PageAccess> {
  const v = await viewerAndAccess(headers);
  if (!v) return NONE;
  if (!v.access) return { ...NONE, signedIn: true };
  const s = surfaceAccess(v.access, surface);
  return {
    signedIn: true,
    mustChange: v.access.mustChange,
    read: s.read,
    write: s.write,
    owner: v.access.owner,
    dataUserId: s.read ? s.dataUserId : null,
  };
}

/**
 * ROLE-14: a denied page answers 403 (the HTML shell, no data). Only on the page request itself: a server-function
 * RPC (client navigation) keeps 200 so the router can render the same denied page.
 */
export async function markDenied(): Promise<void> {
  const { getRequest, setResponseStatus } = await import("@tanstack/react-start/server");
  const request = getRequest();
  const base = process.env.TSS_SERVER_FN_BASE ?? "/_serverFn/";
  if (request && new URL(request.url).pathname.startsWith(base)) return;
  setResponseStatus(403);
}
