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

// ---- CH22 / CH23 (#305 round 2) ----
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { bypassHeaders } from "../qa/tools/robots-txt.lib.mjs";

const LIB = new URL("../qa/tools/robots-txt.lib.mjs", import.meta.url);
const GUARD = new URL("../qa/tools/prod-guard.mjs", import.meta.url).href;
/** Load a mutated copy of the lib (outside qa/tools) to prove a test catches that regression. */
async function mutant(from, to) {
  const src = readFileSync(LIB, "utf8");
  assert.ok(src.includes(from), `mutation anchor missing: ${from}`);
  const dir = mkdtempSync(join(tmpdir(), "robots-mut-"));
  const f = join(dir, "lib.mjs");
  writeFileSync(f, src.replace(from, to).replace('"./prod-guard.mjs"', JSON.stringify(GUARD)));
  return import(pathToFileURL(f).href);
}

// 302 on `/` with the noindex header (e.g. a Vercel Auth redirect): must FAIL.
async function serve302() {
  const s = createServer((req, res) => {
    if (req.url === "/robots.txt") res.writeHead(200, { "x-robots-tag": "noindex, nofollow" }).end(real);
    else res.writeHead(302, { location: "/login", "x-robots-tag": "noindex, nofollow" }).end();
  });
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  return { s, url: `http://127.0.0.1:${s.address().port}` };
}
const redirectCaught = async (lib, url) => !allOk(await lib.robotsChecks(url));

test("CH23: a 302 on / fails the X-Robots-Tag check", async () => {
  const { s, url } = await serve302();
  try {
    const rows = await robotsChecks(url);
    assert.equal(rows.find((r) => r.name.startsWith("/ X-Robots-Tag")).ok, false);
    assert.ok(await redirectCaught({ robotsChecks }, url));
  } finally { s.close(); }
});

test("CH23 mutant: without the status-200 requirement the 302 passes (so the test above catches it)", async () => {
  const src = readFileSync(LIB, "utf8")
    .replace(`ok: h.status === 200, detail: h.status });`, `ok: true, detail: h.status });`)
    .replace(`ok: h.status === 200 && /noindex/i.test(tag)`, `ok: /noindex/i.test(tag)`)
    .replace('"./prod-guard.mjs"', JSON.stringify(GUARD));
  const f = join(mkdtempSync(join(tmpdir(), "robots-mut-")), "lib.mjs");
  writeFileSync(f, src);
  const m = await import(pathToFileURL(f).href);
  const { s, url } = await serve302();
  try { assert.equal(await redirectCaught(m, url), false, "mutant should let the 302 through"); } finally { s.close(); }
});

// Bypass server: answers 200 only when the header is present and correct; never echoes it.
const SECRET = "test-bypass-not-real";
async function serveBypass() {
  const s = createServer((req, res) => {
    const ok = req.headers["x-vercel-protection-bypass"] === SECRET;
    if (!ok) return res.writeHead(401).end("Authentication Required");
    if (req.url === "/robots.txt") res.writeHead(200, { "x-robots-tag": "noindex, nofollow" }).end(real);
    else res.writeHead(200, { "x-robots-tag": "noindex, nofollow" }).end();
  });
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  return { s, url: `http://127.0.0.1:${s.address().port}` };
}
const secretFile = () => {
  const f = join(mkdtempSync(join(tmpdir(), "robots-bp-")), "bypass.txt");
  writeFileSync(f, `${SECRET}\n`);
  return f;
};
const runTool = (args, env) => new Promise((res) => {
  const c = spawn(process.execPath, ["qa/tools/robots-txt.mjs", ...args], { env: { ...process.env, QA_OUT_DIR: "/tmp/orpheus-qa-robots-test", ...env } });
  let o = ""; c.stdout.on("data", (d) => (o += d)); c.stderr.on("data", (d) => (o += d));
  c.on("close", (code) => res({ code, o }));
});

test("CH22: --base-url sends the bypass from the secret file (exit 0), never prints it", async () => {
  const { s, url } = await serveBypass();
  try {
    const r = await runTool(["--base-url", url], { QA_BYPASS_FILE: secretFile() });
    assert.equal(r.code, 0, r.o);
    assert.match(r.o, /bypass header sent/);
    assert.ok(!r.o.includes(SECRET), "secret printed");
  } finally { s.close(); }
});

test("CH22: no bypass for production hosts or a missing file", () => {
  const f = secretFile();
  assert.deepEqual(bypassHeaders("https://orpheus-app-beta.vercel.app", f), {});
  assert.deepEqual(bypassHeaders("http://127.0.0.1:1", "/nonexistent/bypass.txt"), {});
  assert.deepEqual(Object.keys(bypassHeaders("https://orpheus-x-diegolbquintelas-projects.vercel.app", f)), ["x-vercel-protection-bypass"]);
});

test("CH22 mutant: bypassHeaders returning {} → the protected server fails the run", async () => {
  const lib = await mutant(`return secret ? { "x-vercel-protection-bypass": secret } : {};`, `return {};`);
  const { s, url } = await serveBypass();
  try {
    assert.ok(!allOk(await lib.robotsChecks(url, { headers: lib.bypassHeaders(url, secretFile()) })));
  } finally { s.close(); }
});
