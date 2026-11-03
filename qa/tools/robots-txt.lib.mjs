// Pure checks for robots-txt.mjs (pinned by scripts/qa-robots-txt.test.mjs). `fetchImpl` is injectable.
import { existsSync, readFileSync } from "node:fs";
import { staticProdReason } from "./prod-guard.mjs";

export const BYPASS_FILE_DEFAULT = "/home/box/secrets/orpheus-vercel-bypass.txt";

/** CH22: bypass headers for a non-production host when the secret file exists, else {}. Never logs the secret. */
export function bypassHeaders(baseUrl, file = BYPASS_FILE_DEFAULT) {
  if (staticProdReason(baseUrl) || !existsSync(file)) return {};
  const secret = readFileSync(file, "utf8").trim();
  return secret ? { "x-vercel-protection-bypass": secret } : {};
}

/** Returns [{ name, ok, detail }]. `headers` is extra request headers (the bypass); never logged. */
export async function robotsChecks(baseUrl, { fetchImpl = fetch, headers = {} } = {}) {
  const out = [];
  const r = await fetchImpl(`${baseUrl}/robots.txt`, { headers, redirect: "manual" });
  const body = await r.text();
  out.push({ name: "/robots.txt 200", ok: r.status === 200, detail: r.status });
  out.push({ name: "/robots.txt has `User-agent: *`", ok: /^User-agent:\s*\*\s*$/im.test(body) });
  out.push({ name: "/robots.txt has `Disallow: /`", ok: /^Disallow:\s*\/\s*$/im.test(body) });
  // CH23: redirect "manual", and the header only counts on a 200 (a 302 to a login page is a FAIL).
  const h = await fetchImpl(`${baseUrl}/`, { method: "HEAD", headers, redirect: "manual" });
  const tag = h.headers.get("x-robots-tag") ?? "";
  out.push({ name: "/ 200 (no redirect)", ok: h.status === 200, detail: h.status });
  out.push({ name: "/ X-Robots-Tag noindex on a 200", ok: h.status === 200 && /noindex/i.test(tag), detail: tag || "(absent)" });
  return out;
}
