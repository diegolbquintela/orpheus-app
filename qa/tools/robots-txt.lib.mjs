// Pure checks for robots-txt.mjs (pinned by scripts/qa-robots-txt.test.mjs). `fetchImpl` is injectable.
export const BYPASS_FILE_DEFAULT = "/home/box/secrets/orpheus-vercel-bypass.txt";

/** Returns [{ name, ok, detail }]. `headers` is extra request headers (the bypass); never logged. */
export async function robotsChecks(baseUrl, { fetchImpl = fetch, headers = {} } = {}) {
  const out = [];
  const r = await fetchImpl(`${baseUrl}/robots.txt`, { headers, redirect: "manual" });
  const body = await r.text();
  out.push({ name: "/robots.txt 200", ok: r.status === 200, detail: r.status });
  out.push({ name: "/robots.txt has `User-agent: *`", ok: /^User-agent:\s*\*\s*$/im.test(body) });
  out.push({ name: "/robots.txt has `Disallow: /`", ok: /^Disallow:\s*\/\s*$/im.test(body) });
  const h = await fetchImpl(`${baseUrl}/`, { method: "HEAD", headers, redirect: "manual" });
  const tag = h.headers.get("x-robots-tag") ?? "";
  out.push({ name: "/ X-Robots-Tag noindex", ok: /noindex/i.test(tag), detail: tag || "(absent)" });
  return out;
}
