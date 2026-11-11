// #319: long-cache headers in the generated Build Output config (.vercel/output/config.json).
// `vite preview` does not apply these routes, so the built config is the local verification.
// Needs `npx vite build` first; without the file the test is skipped (it says so).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const CONFIG = new URL("../.vercel/output/config.json", import.meta.url);
const IMMUTABLE = "public, max-age=31536000, immutable";
const WEEK = "public, max-age=604800, stale-while-revalidate=86400";
const ICON_SRC = "/(icons/(.*)|favicon\\.svg|manifest\\.webmanifest)";
const has = existsSync(CONFIG);
const skip = has ? false : "no .vercel/output/config.json — run `npx vite build` first";

/** Headers Vercel's route phase would add to `path` (before `handle`), lower-cased keys. */
function headersFor(routes, path) {
  const out = {};
  for (const r of routes) {
    if (r.handle) break;
    if (!r.headers || !new RegExp(`^${r.src}$`).test(path)) continue;
    for (const [k, v] of Object.entries(r.headers)) out[k.toLowerCase()] = v;
    if (!r.continue) break;
  }
  return out;
}
const routes = () => JSON.parse(readFileSync(CONFIG, "utf8")).routes;

test("#319: /assets, /fonts and /hero are immutable", { skip }, () => {
  for (const p of [
    "/assets/index-AbC123.js",
    "/fonts/schibsted-grotesk/schibsted-grotesk-latin.woff2",
    "/hero/venus-phone-480.avif",
    "/hero/frederick-wide-1440.webp",
  ])
    assert.equal(headersFor(routes(), p)["cache-control"], IMMUTABLE, p);
});

test("#319: noindex still on /(.*)", { skip }, () => {
  const first = routes()[0];
  assert.equal(first.src, "/(.*)");
  assert.equal(first.headers["X-Robots-Tag"], "noindex, nofollow");
  for (const p of ["/", "/fonts/x.woff2", "/hero/x.avif", "/api/x", "/icons/x", "/favicon.svg", "/manifest.webmanifest"])
    assert.equal(headersFor(routes(), p)["x-robots-tag"], "noindex, nofollow", p);
});

test("#324: icons, favicon.svg and the manifest use the 7-day header", { skip }, () => {
  const all = routes();
  const fonts = all.findIndex((r) => r.src === "/(fonts|hero)/(.*)");
  const icon = all.findIndex((r) => r.src === ICON_SRC);
  assert.ok(fonts >= 0 && icon === fonts + 1, "route sits immediately after fonts/hero");
  assert.equal(all[icon].continue, true);
  assert.equal(all[icon].headers["Cache-Control"], WEEK);
  for (const p of [
    "/icons/icon-180.png",
    "/icons/icon-512.png",
    "/icons/apple-touch-icon.png",
    "/icons/x",
    "/favicon.svg",
    "/manifest.webmanifest",
  ]) {
    const h = headersFor(all, p);
    assert.equal(h["cache-control"], WEEK, p);
    assert.equal(h["x-robots-tag"], "noindex, nofollow", p);
  }
});

test("#324: HTML, API, robots.txt and favicon.ico stay short", { skip }, () => {
  for (const p of ["/", "/calculator", "/api/x", "/api/personal-finance", "/robots.txt", "/favicon.ico"]) {
    const cc = headersFor(routes(), p)["cache-control"];
    assert.ok(!cc || !/immutable|max-age=[1-9]/.test(cc), `${p}: ${cc}`);
  }
});
