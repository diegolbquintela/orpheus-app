// #157 (QA's #174 note 1): refuse production up front in tools that sign in or can write (pf-report-api,
// pf-reports-api, pf-export-api). Called before any GET and before any sign-in. No secrets.
//
// Method, in order:
//   1. Static (no request at all): the production alias https://orpheus-app-beta.vercel.app and the other known
//      production hosts (the project's production-branch aliases) → refuse.
//      localhost / 127.0.0.1 / ::1 → allowed (a local server).
//   2. One HEAD request to `/` (no cookies, no redirects followed, nothing read but headers): every deployment built
//      from #157 on sends `X-Orpheus-Env` (vite.config.ts: Vercel's VERCEL_ENV at build time). `production` → refuse.
//      Missing (a deployment from before #157, or a non-Orpheus host) → refuse too: it can't be shown to be a preview.
//      `preview` (or `development` / `local`) → allowed.
//   A production deployment's own unique URL (orpheus-<hash>-…vercel.app) can't be told from a preview by its name;
//   step 2 catches it.
export const PROD_ALIAS = "https://orpheus-app-beta.vercel.app";
export const KNOWN_PROD_HOSTS = [
  "orpheus-app-beta.vercel.app",
  "orpheus-app-diegolbquintelas-projects.vercel.app",
  "orpheus-app-git-main-diegolbquintelas-projects.vercel.app",
];
const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
export const ENV_HEADER = "x-orpheus-env";

/** Step 1 only: a reason to refuse from the URL alone, or null. Never makes a request. */
export function staticProdReason(baseUrl) {
  let host;
  try {
    host = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return `not a URL: ${String(baseUrl).slice(0, 80)}`;
  }
  if (KNOWN_PROD_HOSTS.includes(host)) return `${host} is a production host`;
  return null;
}
export const isLocal = (baseUrl) => LOCAL.has(new URL(baseUrl).hostname.toLowerCase());

/** Steps 1 and 2: a reason to refuse, or null. `fetchImpl` is injectable for tests. */
export async function prodReason(baseUrl, fetchImpl = fetch) {
  const s = staticProdReason(baseUrl);
  if (s) return s;
  if (isLocal(baseUrl)) return null;
  let env;
  try {
    const r = await fetchImpl(`${new URL(baseUrl).origin}/`, { method: "HEAD", redirect: "manual" });
    env = r.headers.get(ENV_HEADER);
  } catch (e) {
    return `could not check ${ENV_HEADER} (${e instanceof Error ? e.message : e})`;
  }
  if (env === null || env === undefined || env === "") return `no ${ENV_HEADER} header: can't confirm a preview (deployment from before #157?)`;
  if (env.toLowerCase() === "production") return `${ENV_HEADER}: production`;
  return null;
}

/** Prints `REFUSED …` and exits 2 when the target is (or may be) production. */
export async function refuseIfProd(baseUrl, script, fetchImpl = fetch) {
  const why = await prodReason(baseUrl, fetchImpl);
  if (why) {
    console.log(`REFUSED ${script}: production or unconfirmed target (${why}). Run it with --base-url <preview>.`);
    process.exit(2);
  }
}
