// Test-only stand-in for playwright: every object is a recording proxy that is callable, awaitable (resolves to itself),
// iterable (empty) and coerces to "" / NaN, so tool code runs through without a browser. Navigations and API requests
// are logged through the preload's recorder: "GET <url>" for goto, the method for request.get/post/put/delete/patch/
// fetch, and "CLICK <selector>" for a click on a locator (so a form submit shows up).
const record = (m, u) => globalThis.__fakeRecord?.(m, u);
const METHODS = { goto: "GET", get: "GET", post: "POST", put: "PUT", delete: "DELETE", patch: "PATCH", head: "HEAD" };
function fake(name, selector = "") {
  const fn = function () {};
  return new Proxy(fn, {
    get(_t, k) {
      if (k === "then") return undefined;
      if (k === Symbol.iterator) return function* () {};
      if (k === Symbol.asyncIterator) return async function* () {};
      if (k === Symbol.toPrimitive) return (hint) => (hint === "number" ? NaN : "");
      if (typeof k === "symbol") return undefined;
      if (k === "length") return 0;
      return fake(String(k), selector);
    },
    apply(_t, _this, args) {
      if (typeof args[0] === "string" && /^https?:/.test(args[0])) {
        if (name in METHODS) record(METHODS[name], args[0]);
        else if (name === "fetch") record(args[1]?.method ?? "GET", args[0]);
      }
      if (name === "click" || name === "press" || name === "dispatchEvent") record("CLICK", selector || "?");
      const sel = ["locator", "getByRole", "getByText", "getByLabel", "$"].includes(name) ? `${selector} ${JSON.stringify(args[0])}${args[1]?.name ? `[${args[1].name}]` : ""}`.trim() : selector;
      return fake(`${name}()`, sel);
    },
  });
}
export const chromium = fake("chromium");
export const devices = {};
export default { chromium, devices };
