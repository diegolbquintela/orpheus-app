// #331: Vercel's deployment-pinning cookie. Exact name only (never a prefix or a substring).
export const PLATFORM_COOKIE_NAME = "__vdpl";

function cookieName(cookie) {
  return typeof cookie === "string" ? cookie : cookie?.name ?? "";
}

/** True only when the name is exactly `__vdpl`. */
export function isPlatformCookie(name) {
  return name === PLATFORM_COOKIE_NAME;
}

/** Site cookies with the exact platform name removed. Objects and bare names both work. */
export function nonPlatformCookies(cookies) {
  return cookies.filter((cookie) => !isPlatformCookie(cookieName(cookie)));
}

/**
 * PF-07 / PF-36: drop the exact platform name first. Every remaining name must match `/auth/`.
 * An empty remainder passes (no non-platform cookie).
 */
export function siteCookiesOk(cookies) {
  return nonPlatformCookies(cookies).every((cookie) => /auth/.test(cookieName(cookie)));
}
