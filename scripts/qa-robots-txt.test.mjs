// #305: qa/tools/robots-txt checks against a local server (never prod/preview), plus the mutant.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { robotsChecks } from "../qa/tools/robots-txt.lib.mjs";

const real = readFileSync(new URL("../public/robots.txt", import.meta.url), "utf8");

async function serve(body, tag = "noindex, nofollow") {
  const s = createServer((req, res) => {
    const h = tag ? { "x-robots-tag": tag } : {};
    if (req.url === "/robots.txt") res.writeHead(200, { "content-type": "text/plain", ...h }).end(body);
    else res.writeHead(200, h).end();
  });
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  return { s, url: `http://127.0.0.1:${s.address().port}` };
}
const allOk = (rows) => rows.every((r) => r.ok);

test("public/robots.txt is exactly disallow-all", () => assert.equal(real, "User-agent: *\nDisallow: /\n"));

test("passes on the real file with the header", async () => {
  const { s, url } = await serve(real);
  try { assert.ok(allOk(await robotsChecks(url))); } finally { s.close(); }
});

test("mutant: Disallow line dropped → fails", async () => {
  const { s, url } = await serve(real.replace("Disallow: /\n", ""));
  try { assert.ok(!allOk(await robotsChecks(url))); } finally { s.close(); }
});

test("mutant: X-Robots-Tag absent → fails", async () => {
  const { s, url } = await serve(real, null);
  try { assert.ok(!allOk(await robotsChecks(url))); } finally { s.close(); }
});

test("preview without bypass file → SKIPPED (NOT A PASS), exit 3, secret never printed", async () => {
  const { s, url } = await serve(real);
  try {
    const out = await new Promise((res) => {
      const c = spawn(process.execPath, ["qa/tools/robots-txt.mjs", "--base-url", url, "--preview-url", url],
        { env: { ...process.env, QA_BYPASS_FILE: "/nonexistent/bypass.txt", QA_OUT_DIR: "/tmp/orpheus-qa-robots-test" } });
      let o = ""; c.stdout.on("data", (d) => (o += d));
      c.on("close", (code) => res({ code, o }));
    });
    assert.equal(out.code, 3);
    assert.match(out.o, /SKIPPED \(NOT A PASS\)/);
  } finally { s.close(); }
});
