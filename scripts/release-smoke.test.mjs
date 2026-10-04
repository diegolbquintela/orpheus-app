// Offline test for scripts/release-smoke.mjs (#24, site shell #46): a local stub server shaped like the
// app in each mode; the script must pass, send GET only, and fail when a check breaks.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import { test } from "node:test";

function serve(handler) {
  return new Promise((resolve) => {
    const methods = [];
    const s = http.createServer((req, res) => {
      methods.push(req.method);
      handler(req, res);
    });
    s.listen(0, "127.0.0.1", () =>
      resolve({ s, methods, base: `http://127.0.0.1:${s.address().port}` }),
    );
  });
}
// spawnSync would block the stub server's event loop, so run it async via a child process.
const run = (base, mode) =>
  new Promise((resolve) => {
    const p = spawn(process.execPath, ["scripts/release-smoke.mjs", base, mode]);
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("close", (code) => resolve({ code, out }));
  });

// Markup shaped like the SSR output of src/components/site-menu.tsx, home.tsx and site-footer.tsx.
const menu = (current) =>
  `<nav aria-label="Site" data-testid="site-menu" class="sticky top-0"><div>` +
  [
    ["/", "Orpheus"],
    ["/calculator", "Calculator"],
    ["/dashboard", "Dashboard"],
  ]
    .map(
      ([href, label]) =>
        `<a href="${href}"${label === current ? ' aria-current="page"' : ""} class="x">${label}</a>`,
    )
    .join("") +
  `</div></nav>`;
const shell = (current, main) =>
  `<html><head><meta name="robots" content="noindex, nofollow"/><title>Orpheus Wisdom</title></head><body>${menu(current)}<main>${main}</main>` +
  `<footer class="x"><p class="x" data-testid="site-footer">Orpheus Wisdom</p></footer></body></html>`;
const card = (href, title, text) =>
  `<li><a href="${href}" data-testid="home-card" class="x"><div><h2 class="x">${title}</h2></div><p class="x">${text}</p></a></li>`;
const HOME = shell(
  "Orpheus",
  `<h1>Orpheus Wisdom is a private desk with two tools.</h1><ul>${card("/calculator", "Calculator", "compare a lump sum with contributions")}${card("/dashboard", "Dashboard", "holdings, value, stored figures")}</ul>`,
);
const CALC = shell(
  "Calculator",
  `<h1>DCA vs lump sum</h1><form><p class="x">US, EU and CA listings, one currency per basket.</p><button>Compare plans</button></form>`,
);
const NOT_FOUND = shell(null, `<p>Not Found</p>`);
const html = (res, status, body) =>
  res
    .writeHead(status, { "content-type": "text/html", "x-robots-tag": "noindex, nofollow" })
    .end(body);
const json = (res, status, body) =>
  res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));

/** The app in one mode; `override(req, res)` returns true when it answered instead. */
function app(mode, override = () => false) {
  const on = mode !== "off";
  return (req, res) => {
    if (override(req, res)) return;
    const u = new URL(req.url, "http://x");
    if (u.pathname === "/" && u.search)
      return res.writeHead(307, { location: `/calculator${u.search}` }).end();
    if (u.pathname === "/") return html(res, 200, HOME);
    if (u.pathname === "/calculator") return html(res, 200, CALC);
    if (u.pathname === "/api/chart")
      return json(res, 400, { error: "VOD.L lists on LSE. US, EU, and CA listings only." });
    if (!on)
      return u.pathname.startsWith("/api/")
        ? json(res, 404, { error: "Not found." })
        : html(res, 404, NOT_FOUND);
    if (u.pathname === "/dashboard")
      return res.writeHead(307, { location: "/dashboard/sign-in" }).end();
    if (u.pathname === "/dashboard/sign-in")
      return html(res, 200, shell("Dashboard", "<h1>Sign in</h1>"));
    if (u.pathname === "/api/dashboard/status")
      return mode === "on"
        ? res.writeHead(200).end('{"dashboard":"enabled"}')
        : json(res, 200, { dashboard: "enabled", signIn: "ready" });
    if (u.pathname === "/api/dashboard/db")
      return mode === "preview"
        ? json(res, 200, { state: "connected", tables: 11, missingTables: [] })
        : json(res, 404, { error: "Not found." });
    if (
      ["/api/dashboard/holdings", "/api/dashboard/columns", "/api/cron/daily-refresh"].includes(
        u.pathname,
      )
    )
      return json(res, 401, { error: "Unauthorized." });
    if (u.pathname === "/api/dashboard/refresh")
      return json(res, mode === "preview" ? 405 : 404, { error: "x" });
    return html(res, 404, NOT_FOUND);
  };
}

for (const mode of ["off", "on", "preview"])
  test(`${mode} mode passes against a matching server and only sends GET`, async () => {
    const { s, methods, base } = await serve(app(mode));
    const r = await run(base, mode);
    s.close();
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, new RegExp(`\\[release-smoke\\] OK \\(${mode}\\)`));
    assert.ok(methods.length >= 12 && methods.every((m) => m === "GET"), methods.join());
  });

test("off mode fails when /dashboard answers", async () => {
  const { s, base } = await serve(
    app("off", (req, res) => req.url === "/dashboard" && (html(res, 200, NOT_FOUND), true)),
  );
  const r = await run(base, "off");
  s.close();
  assert.equal(r.code, 1);
  assert.match(r.out, /FAIL GET \/dashboard -> 200/);
});

test("off mode fails when the flag-off 404 has dashboard copy outside the menu", async () => {
  const leak = shell(null, "<h1>Dashboard</h1>");
  const { s, base } = await serve(
    app("off", (req, res) => req.url === "/dashboard" && (html(res, 404, leak), true)),
  );
  const r = await run(base, "off");
  s.close();
  assert.equal(r.code, 1);
  assert.match(r.out, /FAIL GET \/dashboard -> 404/);
});

test("home fails with a third card, a missing Dashboard menu item, no noindex header or the calculator on /", async () => {
  const third = HOME.replace("</ul>", `${card("/x", "News", "x")}</ul>`);
  const noDash = HOME.replace(/<a href="\/dashboard"[^>]*>Dashboard<\/a>/, "");
  for (const [label, override] of [
    ["third card", (req, res) => req.url === "/" && (html(res, 200, third), true)],
    ["menu without Dashboard", (req, res) => req.url === "/" && (html(res, 200, noDash), true)],
    [
      "no X-Robots-Tag",
      (req, res) =>
        req.url === "/" && (res.writeHead(200, { "content-type": "text/html" }).end(HOME), true),
    ],
    ["calculator still on /", (req, res) => req.url === "/" && (html(res, 200, CALC), true)],
  ]) {
    const { s, base } = await serve(app("on", override));
    const r = await run(base, "on");
    s.close();
    assert.equal(r.code, 1, label);
    assert.match(r.out, /FAIL GET \/ -> /, label);
  }
});

test("fails when / with a query string isn't redirected, or the VOD.L message changes", async () => {
  {
    const { s, base } = await serve(
      app("on", (req, res) => req.url.startsWith("/?") && (html(res, 200, HOME), true)),
    );
    const r = await run(base, "on");
    s.close();
    assert.match(r.out, /FAIL GET \/\?ticker=KO&start=2020-10-02 -> 200/);
  }
  {
    const { s, base } = await serve(
      app(
        "on",
        (req, res) => req.url.startsWith("/api/chart") && (json(res, 400, { error: "nope" }), true),
      ),
    );
    const r = await run(base, "on");
    s.close();
    assert.match(r.out, /FAIL GET \/api\/chart\?ticker=VOD\.L/);
  }
});

test("menu must mark the current page: Calculator on /calculator", async () => {
  const wrong = CALC.replace(' aria-current="page"', "");
  const { s, base } = await serve(
    app("preview", (req, res) => req.url === "/calculator" && (html(res, 200, wrong), true)),
  );
  const r = await run(base, "preview");
  s.close();
  assert.equal(r.code, 1);
  assert.match(r.out, /FAIL GET \/calculator -> 200/);
});

test("fails when the footer isn't exactly 'Orpheus Wisdom' or the calculator loses its listings note", async () => {
  const listings = HOME.replace(">Orpheus Wisdom</p>", ">US, EU and Canada listings only.</p>");
  const noNote = CALC.replace("US, EU and CA listings, one currency per basket.", "");
  for (const [path, body] of [
    ["/", listings],
    ["/calculator", noNote],
  ]) {
    const { s, base } = await serve(
      app("on", (req, res) => req.url === path && (html(res, 200, body), true)),
    );
    const r = await run(base, "on");
    s.close();
    assert.equal(r.code, 1, path);
    assert.ok(r.out.includes(`FAIL GET ${path} -> 200`), path);
  }
});

test("bad usage exits 2", () => {
  assert.equal(spawnSync(process.execPath, ["scripts/release-smoke.mjs"]).status, 2);
});
