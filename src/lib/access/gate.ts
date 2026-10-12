import { createServerFn } from "@tanstack/react-start";
import { dashboardEnabledFromEnv } from "../dashboard/flag.server";
import type { Grants } from "./access";
import type { Person } from "./access.server";

export type AccountPageData = {
  signedIn: boolean;
  name: string;
  email: string;
  owner: boolean;
  mustChange: boolean;
  grants: Grants | null;
  roles: string[];
  people: Person[];
};

/**
 * `/account` (#90): who is signed in, their roles, the forced-change flag and "Who has access" (the owner: everyone;
 * a grantee: the people on their surfaces, Q-D14). From the session cookie and the database on this request only.
 * The flag off: 404 (sign-in lives behind it), like `/dashboard/sign-in`.
 */
export const getAccountPage = createServerFn({ method: "GET" }).handler(async (): Promise<AccountPageData> => {
  const empty: AccountPageData = {
    signedIn: false,
    name: "",
    email: "",
    owner: false,
    mustChange: false,
    grants: null,
    roles: [],
    people: [],
  };
  if (!dashboardEnabledFromEnv()) {
    const { notFound } = await import("@tanstack/react-router");
    throw notFound();
  }
  const { getRequest } = await import("@tanstack/react-start/server");
  const { viewerAndAccess } = await import("./viewer.server");
  const v = await viewerAndAccess(getRequest().headers);
  if (!v) return empty;
  if (!v.db || !v.access) return { ...empty, signedIn: true, email: v.user.email ?? "", roles: ["No access"] };
  const { peopleFor, userById } = await import("./access.server");
  const { roleLines } = await import("./access");
  const me = await userById(v.db, v.user.id);
  return {
    signedIn: true,
    name: me?.name ?? "",
    email: me?.email ?? v.user.email ?? "",
    owner: v.access.owner,
    mustChange: v.access.mustChange,
    grants: v.access.grants,
    roles: roleLines(v.access.owner, v.access.grants),
    people: v.access.mustChange ? [] : await peopleFor(v.db, v.access),
  };
});
