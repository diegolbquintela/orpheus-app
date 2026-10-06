// QA N4 (#58): every signed-in qa/tools browser tool signs out on every exit path. The shared loop
// (qa/tools/session.mjs) is exercised with a fake browser: a normal run, an early return and a thrown error
// all end with the sign-out request and a closed context; and every tool that reads QA_PASSWORD goes through it.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { ALL_VIEWPORTS, VIEWPORTS, eachViewport, viewportsFrom } from "../qa/tools/session.mjs";

function fakeBrowser(log, { loginOk = true } = {}) {
  return {
    async newContext({ viewport }) {
      const vp = viewport.width;
      return {
        async newPage() {
          return {
            setDefaultTimeout() {},
            request: {
              async post(url) {
                log.push(`${vp} POST ${new URL(url).pathname}`);
                const ok = url.endsWith("/sign-in/email") ? loginOk : true;
                return { ok: () => ok, status: () => (ok ? 200 : 401) };
              },
            },
          };
        },
        async close() {
          log.push(`${vp} close`);
        },
      };
    },
  };
}
const run = async (fn, opts) => {
  const log = [];
  const checks = [];
  await eachViewport({ browser: fakeBrowser(log, opts), baseUrl: "http://x", email: "e", password: "p", check: (name, ok) => checks.push([name, ok]) }, fn);
  return { log, checks };
};
const ENDED = (w) => [`${w} POST /api/auth/sign-out`, `${w} close`];

describe("QA N4: qa/tools sessions always sign out", () => {
  it("normal run: sign-in, checks, sign-out, close, for both viewports", async () => {
    const { log, checks } = await run(async () => {});
    assert.deepEqual(log, ["400 POST /api/auth/sign-in/email", ...ENDED(400), "1440 POST /api/auth/sign-in/email", ...ENDED(1440)]);
    assert.ok(checks.every(([, ok]) => ok));
    assert.deepEqual(VIEWPORTS.map(([vp]) => vp), ["phone", "desktop"]);
  });

  it("an early return still signs out", async () => {
    const { log } = await run(async ({ mobile }) => {
      if (mobile) return;
    });
    assert.deepEqual(log.filter((l) => l.includes("sign-out")).length, 2);
  });

  it("a thrown error is a FAIL, still signs out, and the next viewport runs", async () => {
    const { log, checks } = await run(async ({ vp }) => {
      if (vp === "phone") throw new Error("Timeout 30000ms exceeded");
    });
    assert.deepEqual(log, ["400 POST /api/auth/sign-in/email", ...ENDED(400), "1440 POST /api/auth/sign-in/email", ...ENDED(1440)]);
    assert.deepEqual(checks.find(([n]) => n === "[phone] ran to the end"), ["[phone] ran to the end", false]);
  });

  it("a failed sign-in skips the checks but still sends the sign-out", async () => {
    let ran = 0;
    const { log, checks } = await run(async () => void ran++, { loginOk: false });
    assert.equal(ran, 0);
    assert.equal(log.filter((l) => l.includes("sign-out")).length, 2);
    assert.deepEqual(checks.find(([n]) => n === "[phone] sign-in"), ["[phone] sign-in", false]);
  });

  it("every qa/tools script that signs in uses eachViewport, with no sign-out or context of its own", () => {
    const dir = join(import.meta.dirname, "..", "qa", "tools");
    const tools = readdirSync(dir).filter((f) => f.endsWith(".mjs") && f !== "session.mjs" && f !== "dashboard-redesign.mjs" /* spawns the tools; own test below */ && readFileSync(join(dir, f), "utf8").includes("QA_PASSWORD"));
    assert.deepEqual(tools.sort(), ["dashboard-add.mjs", "dashboard-book.mjs", "dashboard-leaveouts.mjs", "dashboard-list.mjs", "dashboard-metrics.mjs", "site-shell.mjs"]);
    for (const f of tools) {
      const src = readFileSync(join(dir, f), "utf8");
      assert.match(src, /import \{ eachViewport \} from "\.\/session\.mjs";/, f);
      assert.match(src, /await eachViewport\(/, f);
      assert.doesNotMatch(src, /\/api\/auth\/sign-(in|out)|newContext\(|ctx\.close\(/, `${f} must leave sign-in / sign-out to eachViewport`);
      assert.match(src, /\} finally \{\n\s*await browser\.close\(\);/, `${f} closes the browser in a finally`);
    }
  });

  it("#59: QA_VIEWPORTS picks phone / wide (1024) / desktop; the default stays phone + desktop", async () => {
    assert.equal(viewportsFrom(undefined), VIEWPORTS);
    assert.equal(viewportsFrom(" "), VIEWPORTS);
    assert.deepEqual(viewportsFrom("desktop,phone,wide").map(([vp, v]) => `${vp}:${v.width}`), ["phone:400", "wide:1024", "desktop:1440"]);
    assert.deepEqual(ALL_VIEWPORTS.map(([, v, mobile]) => [v.width, mobile]), [[400, true], [1024, false], [1440, false]]);
    assert.throws(() => viewportsFrom("phone,tablet"), /unknown viewport\(s\) tablet/);
    const log = [];
    await eachViewport({ browser: fakeBrowser(log), baseUrl: "http://x", email: "e", password: "p", check: () => {}, viewports: ALL_VIEWPORTS }, async () => {});
    assert.deepEqual(log.filter((l) => l.includes("sign-out")), ["400 POST /api/auth/sign-out", "1024 POST /api/auth/sign-out", "1440 POST /api/auth/sign-out"]);
  });

  it("the runner (dashboard-redesign.mjs) never signs in itself, never logs a password, never deletes", () => {
    const src = readFileSync(join(import.meta.dirname, "..", "qa", "tools", "dashboard-redesign.mjs"), "utf8");
    assert.doesNotMatch(src, /\/api\/auth\/sign-(in|out)|newContext\(|console\.\w+\([^)]*process\.env\.QA_(EMPTY_)?PASSWORD/);
    assert.doesNotMatch(src, /name: "Delete"|getByText\("Delete"|method: "DELETE"/);
  });
});
