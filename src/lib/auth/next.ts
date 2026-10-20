/**
 * #102 QA D1: where the sign-in page sends the visitor afterwards. Only the exact relative paths `/personal-finance`
 * and (#90, ROLE-02) `/account` are allowed; anything else (missing, an absolute URL, protocol-relative `//host`, a backslash trick, any other path,
 * a query or fragment, a non-string) is `/dashboard`. Used on load (validateSearch, beforeLoad, loader) AND again
 * right before the post-auth navigation, so a raw `?next=` never reaches `window.location` or a redirect.
 */
// #160 (spec 45, PFCL-01): the exact path /personal-finance/charts too. #161 (Q-AK1, PFCB-01): and /personal-finance/charts/new.
export const NEXT_ALLOWED = ["/personal-finance", "/personal-finance/charts", "/personal-finance/charts/new", "/account"] as const;
export type SafeNext = (typeof NEXT_ALLOWED)[number] | "/dashboard";
export const DEFAULT_NEXT = "/dashboard" as const;

export function safeNext(value: unknown): SafeNext {
  return typeof value === "string" && (NEXT_ALLOWED as readonly string[]).includes(value)
    ? (value as SafeNext)
    : DEFAULT_NEXT;
}
