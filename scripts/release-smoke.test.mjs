// Offline test for scripts/release-smoke.mjs (#24): a local stub server shaped like production with the
// flag off; the script must pass, send GET only, and fail when a dashboard path answers.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import http from "node:http";
import { test } from "node:test";

function serve(handler) {
  return new Promise((resolve) => {
    const methods = [];
    const s = http.createServer((req, res) => {
      methods.push(req.method);
      handler(req, res);
    });
    s.listen(0, "127.0.0.1", () => resolve({ s, methods, base: `http://127.0.0.1:${s.address().port}` }));
  });
}
const run = (base, mode) =>
  new Promise((resolve) => {
    // spawnSync would block the stub server's event loop, so run it async via a child process.
    import("node:child_process").then(({ spawn }) => {
      const p = spawn(process.execPath, ["scripts/release-smoke.mjs", base, mode]);
      let out = "";
      p.stdout.on("data", (d) => (out += d));
      p.on("close", (code) => resolve({ code, out }));
    });
  });

test("off mode passes against a flag-off server and only sends GET", async () => {
  const { s, methods, base } = await serve((req, res) => {
    if (req.url === "/") return res.writeHead(200, { "content-type": "text/html" }).end('<meta name="robots" content="noindex, nofollow">');
    res.writeHead(404).end("Not found");
  });
  const r = await run(base, "off");
  s.close();
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /\[release-smoke\] OK \(off\)/);
  assert.ok(methods.length >= 9 && methods.every((m) => m === "GET"));
});

test("off mode fails when /dashboard answers", async () => {
  const { s, base } = await serve((req, res) => {
    if (req.url === "/" || req.url === "/dashboard") return res.writeHead(200).end("noindex");
    res.writeHead(404).end();
  });
  const r = await run(base, "off");
  s.close();
  assert.equal(r.code, 1);
  assert.match(r.out, /FAIL GET \/dashboard -> 200/);
});

test("bad usage exits 2", () => {
  assert.equal(spawnSync(process.execPath, ["scripts/release-smoke.mjs"]).status, 2);
});
