/**
 * Site-wide response headers (#50). `vite.config.ts` writes them as one Vercel route rule
 * (`src: "/(.*)"`, `continue: true`), so HTML pages, `/api/*` and static assets all carry them.
 *
 * - `X-Robots-Tag`: keep the app out of search engines (the robots meta in `__root.tsx` pairs with it).
 * - `Referrer-Policy`: see `REFERRER_POLICY`.
 */

/**
 * `no-referrer` (#50, QA N1): the browser sends no Referer at all, on same-origin requests too (the
 * Vercel Analytics beacon at `/_vercel/insights/*`, `/api/*`) and on cross-origin ones (Google
 * Fonts), and `document.referrer` stays empty on in-app page loads, so a path or a query string such
 * as `?email=` never leaves the page in a Referer.
 *
 * It keeps Better Auth working: Better Auth's origin check (`better-auth` `validateOrigin`) reads
 * `Origin`, falling back to `Referer` only when `Origin` is missing, and rejects a missing or `null`
 * value. The policy nulls `Origin` only on non-CORS-mode requests (navigations, form posts,
 * `sendBeacon`); `fetch()` POSTs, which Better Auth's client and the dashboard use, keep the real
 * Origin. Verified on Chromium, Firefox and WebKit (PR #52). Do not add a plain HTML form POST to
 * `/api/auth/*`: under this policy it would carry `Origin: null` and get a 403.
 */
export const REFERRER_POLICY = "no-referrer";

export const SITE_HEADERS = {
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": REFERRER_POLICY,
} as const;
