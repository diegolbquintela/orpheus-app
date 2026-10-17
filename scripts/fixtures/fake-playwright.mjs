// Test-only stand-in for playwright: every object is a recording proxy. Navigations and API requests are logged
// through the preload's recorder ("GET <url>" for goto, the method for request.get/post/put/delete/patch/fetch).
const record = (m, u) => globalThis.__fakeRecord?.(m, u);
const METHODS = { goto: "GET", get: "GET", post: "POST", put: "PUT", delete: "DELETE", patch: "PATCH", head: "HEAD" };
function fake(name) {
  const fn = function () {};
  return new Proxy(fn, {
    get(_t, k) {
      if (k === "then" || typeof k === "symbol") return undefined;
      if (k === "ok") return () => false;
      if (k === "status") return () => 0;
      return fake(String(k));
    },
    apply(_t, _this, args) {
      if (typeof args[0] === "string" && /^https?:/.test(args[0])) {
        if (name in METHODS) record(METHODS[name], args[0]);
        else if (name === "fetch") record(args[1]?.method ?? "GET", args[0]);
      }
      return Promise.resolve(fake(`${name}()`));
    },
  });
}
export const chromium = fake("chromium");
export const devices = {};
export default { chromium, devices };
