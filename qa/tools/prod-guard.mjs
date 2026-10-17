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

export const SIGNED_OUT_PROD_LINE = "signed-out prod mode (prod: signed-out only)";

/**
 * Env vars that make a run "signed in or writing" (#157 F7, EL option 1): any non-empty sign-in variable the tools read
 * (`QA_*_EMAIL` / `QA_*_PASSWORD`, incl. the plain QA email and password, and `ORPHEUS_OWNER_EMAIL`), or `QA_WRITE`.
 * Unrelated *_PASSWORD variables on the machine (not read by any tool) don't count.
 */
export const CREDENTIAL_VAR = /^(QA_(\w+_)?(EMAIL|PASSWORD)|ORPHEUS_OWNER_EMAIL|QA_WRITE)$/;
export function credentialVars(env = process.env) {
  return Object.keys(env).filter((k) => CREDENTIAL_VAR.test(k) && env[k]).sort();
}

/** True once a tool entered signed-out prod mode (session.mjs and tools skip sign-in / writes on it). */
export const signedOutProd = () => globalThis.__orpheusSignedOutProd === true;

/**
 * #157 F7 (EL option 1, 2026-10-17). Same detection as before (static hosts; one HEAD / otherwise).
 * - Not production → `{ signedOutProd: false }`.
 * - Production (or unconfirmed) WITH any credential env var or QA_WRITE → prints `REFUSED …`, exits 2 (a static
 *   prod host makes no request at all).
 * - Production with none → prints exactly SIGNED_OUT_PROD_LINE and returns `{ signedOutProd: true }`. From then on
 *   the process never signs in or writes: tools skip those steps on the returned mode, session.mjs skips sign-in,
 *   and as a safety net `fetch` refuses any method other than GET / HEAD and any /api/auth/ path.
 */
export async function refuseIfProd(baseUrl, script, fetchImpl = fetch, env = process.env) {
  const why = await prodReason(baseUrl, fetchImpl);
  if (!why) return { signedOutProd: false };
  const creds = credentialVars(env);
  if (creds.length) {
    console.log(`REFUSED ${script}: production or unconfirmed target (${why}) with sign-in / write env set (${creds.join(", ")}). Run it with --base-url <preview>, or unset them for a signed-out run.`);
    process.exit(2);
  }
  console.log(SIGNED_OUT_PROD_LINE);
  await enterSignedOutProd();
  return { signedOutProd: true };
}

const writeOrAuth = (method, url) => !["GET", "HEAD"].includes(String(method).toUpperCase()) || new URL(url).pathname.startsWith("/api/auth/");

async function enterSignedOutProd() {
  if (globalThis.__orpheusSignedOutProd) return;
  globalThis.__orpheusSignedOutProd = true;
  const inner = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    const method = String(init.method ?? (typeof input === "object" && "method" in input ? input.method : "GET")).toUpperCase();
    if (writeOrAuth(method, url)) throw new Error(`BLOCKED ${method} ${url.pathname} (signed-out prod mode)`);
    return inner(input, init);
  };
  // Browser safety net: every context a tool opens aborts non-GET / HEAD and /api/auth/ requests.
  try {
    const { chromium } = await import("playwright");
    const launch = chromium.launch.bind(chromium);
    chromium.launch = async (...a) => {
      const browser = await launch(...a);
      const newContext = browser.newContext.bind(browser);
      browser.newContext = async (...o) => {
        const ctx = await newContext(...o);
        await ctx.route("**/*", (r) => {
          const q = r.request();
          if (!writeOrAuth(q.method(), q.url())) return r.continue();
          console.log(`BLOCKED ${q.method()} ${new URL(q.url()).pathname} (signed-out prod mode)`);
          return r.abort();
        });
        return ctx;
      };
      browser.newPage = async (...o) => (await browser.newContext(...o)).newPage();
      return browser;
    };
  } catch {
    // playwright not installed: nothing to wrap
  }
}
