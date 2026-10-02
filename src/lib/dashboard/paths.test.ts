import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DASHBOARD_OFF_PATH, dashboardOffRewrite, isDashboardPagePath } from "./paths.ts";
import { dashboardMethodNotAllowedResponse, dashboardUnsupportedMethod } from "./flag.server.ts";

const u = (path: string) => new URL(path, "http://localhost");
const path = (r: URL | undefined) => r?.pathname + (r?.search ?? "");

describe("dashboard flag-off rewrite (server router)", () => {
  it("recognises dashboard page paths only", () => {
    for (const p of ["/dashboard", "/dashboard/", "/dashboard/x", "/dashboard/a/b"])
      assert.ok(isDashboardPagePath(p), p);
    for (const p of ["/", "/dashboards", "/api/dashboard", "/api/dashboard/status", "/x/dashboard"])
      assert.equal(isDashboardPagePath(p), false, p);
  });

  it("flag off: /dashboard… is read as an unmatched path and written back unchanged", () => {
    const r = dashboardOffRewrite(false);
    assert.equal(path(r.input({ url: u("/dashboard?a=1") })), `${DASHBOARD_OFF_PATH}?a=1`);
    assert.equal(r.output({ url: u(DASHBOARD_OFF_PATH) })?.pathname, "/dashboard");
    const s = dashboardOffRewrite(false);
    assert.equal(s.input({ url: u("/dashboard/x/") })?.pathname, `${DASHBOARD_OFF_PATH}/`);
    assert.equal(s.output({ url: u(`${DASHBOARD_OFF_PATH}/`) })?.pathname, "/dashboard/x/");
    // trailing-slash normalisation redirects to the slash-less public path, like any unknown URL
    assert.equal(s.output({ url: u(DASHBOARD_OFF_PATH) })?.pathname, "/dashboard/x");
  });

  it("flag off: other URLs are untouched", () => {
    const r = dashboardOffRewrite(false);
    for (const p of ["/", "/api/dashboard/status", "/_serverFn/abc", "/dashboards"])
      assert.equal(r.input({ url: u(p) }), undefined, p);
    assert.equal(r.output({ url: u("/") }), undefined);
    assert.equal(
      r.output({ url: u(DASHBOARD_OFF_PATH) }),
      undefined,
      "no input seen: no output rewrite",
    );
  });

  it("flag on: no rewrite at all", () => {
    const r = dashboardOffRewrite(true);
    assert.equal(r.input({ url: u("/dashboard") }), undefined);
    assert.equal(r.output({ url: u("/dashboard") }), undefined);
  });
});

describe("dashboard API: unsupported methods answer JSON", () => {
  it("flag off: 404 JSON (route does not exist)", async () => {
    for (const env of [{}, { DASHBOARD_ENABLED: "TRUE" }]) {
      const res = dashboardUnsupportedMethod(["GET", "HEAD"], env);
      assert.equal(res.status, 404);
      assert.match(res.headers.get("content-type") ?? "", /application\/json/);
      assert.equal(res.headers.get("allow"), null);
      assert.deepEqual(await res.json(), { error: "Not found." });
    }
  });

  it("flag on: 405 JSON with Allow", async () => {
    const res = dashboardUnsupportedMethod(["GET", "HEAD"], { DASHBOARD_ENABLED: "true" });
    assert.equal(res.status, 405);
    assert.equal(res.headers.get("allow"), "GET, HEAD");
    assert.match(res.headers.get("content-type") ?? "", /application\/json/);
    assert.deepEqual(await res.json(), { error: "Method not allowed." });
    assert.equal(dashboardMethodNotAllowedResponse(["GET"]).headers.get("allow"), "GET");
  });
});
