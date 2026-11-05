// #320: `vite preview` (the local default) doesn't apply the Vercel Build Output routes in .vercel/output/config.json,
// so response-header checks (X-Robots-Tag, cache headers, X-Orpheus-Env) can't pass or fail against a local server.
// On local they are reported SKIPPED (NOT A PASS) and the tool exits 3; scripts/cache-headers.test.mjs (and the
// other config.json tests) are the real coverage. Previews and production still check the headers.
let skipped = 0;
export const LOCAL_HEADER_REASON = "local server: vite preview doesn't apply .vercel/output/config.json headers (covered by the config.json tests)";

/**
 * True when response headers can be checked: anything but the local target (the default, or --target=local, which
 * site-style-regression passes on to its children). `cfg` is a qaConfig() result or a target string. An explicit
 * --base-url http://127.0.0.1:… without --target=local (e.g. a test server that sets headers) still checks them.
 */
export const headersApply = (cfg) => (typeof cfg === "string" ? cfg : cfg?.target) !== "local";

/** Prints the SKIPPED (NOT A PASS) line for a header check on local and counts it. */
export function headerSkip(name, log = console.log) {
  skipped++;
  log(`SKIPPED (NOT A PASS): ${name} (${LOCAL_HEADER_REASON})`);
}
export const headerSkips = () => skipped;
