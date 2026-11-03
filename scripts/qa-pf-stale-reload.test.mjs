// #308 (spec §80.10, AC PFRL-13): the pure assertions of qa/tools/pf-stale-reload.mjs. A passing fixture (the page as
// built) passes every helper; each of the six #308 mutants, as the measurements the tool would take on it, fails.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  API, STALE_MESSAGE, STALE_WORDING, bannerGoneFocusH1, bannerThenReload, countRecordRequests, freshBaseVersion,
  matchesStaleMessage, noOverflow, reloadInPlace, staleOnBoth, tapTarget, versionOf,
} from "../qa/tools/pf-stale-reload.lib.mjs";

const U = `http://localhost:4173${API}`;
const GOOD = {
  reload: { log: [{ method: "GET", url: U }], navigations: 0 },
  put: { reloadVersion: "v-2", staleVersion: "v-1", putBody: { data: {}, baseVersion: "v-2" } },
  button: { width: 76.4, height: 44 },
  layout: { scrollWidth: 390, clientWidth: 390, viewportWidth: 390, rects: [{ name: "banner", left: 16, right: 374 }, { name: "reload", left: 16, right: 92 }] },
  banner: { bannerText: `${STALE_MESSAGE}Reload`, buttonText: "Reload", buttonAfterMessage: true },
  both: { 409: STALE_MESSAGE, 428: STALE_MESSAGE },
};
const MUTANTS = {
  "1 location.reload() instead of the in-place GET": () =>
    reloadInPlace({ log: [{ method: "GET", url: "http://localhost:4173/personal-finance" }, { method: "GET", url: U }, { method: "GET", url: U }], navigations: 1 }),
  "2 a PUT on Reload": () => reloadInPlace({ log: [{ method: "PUT", url: U }, { method: "GET", url: U }], navigations: 0 }),
  "3 min-width / 44px height lost": () => tapTarget({ width: 38.2, height: 30 }),
  "4 flex-wrap lost (overflow at 360)": () =>
    noOverflow({ scrollWidth: 431, clientWidth: 360, viewportWidth: 360, rects: [{ name: "banner", left: 16, right: 344 }, { name: "reload", left: 351, right: 427 }] }),
  "5 the old baseVersion kept": () => freshBaseVersion({ reloadVersion: "v-2", staleVersion: "v-1", putBody: { data: {}, baseVersion: "v-1" } }),
  "6 the 428 branch removed from isStale": () => staleOnBoth({ 409: STALE_MESSAGE, 428: null }),
};

test("PFRL-13: the page as built passes every helper", () => {
  assert.equal(reloadInPlace(GOOD.reload).ok, true);
  assert.equal(freshBaseVersion(GOOD.put).ok, true);
  assert.equal(tapTarget(GOOD.button).ok, true);
  assert.equal(noOverflow(GOOD.layout).ok, true);
  assert.equal(bannerThenReload(GOOD.banner).ok, true);
  assert.equal(staleOnBoth(GOOD.both).ok, true);
  assert.equal(bannerGoneFocusH1({ bannerPresent: false, activeTag: "h1" }).ok, true);
});

for (const [name, f] of Object.entries(MUTANTS)) test(`PFRL-13 mutant ${name} fails the lib assertions`, () => assert.equal(f().ok, false, JSON.stringify(f().detail)));

test("countRecordRequests: only exactly /api/personal-finance; GET / PUT / other", () => {
  const c = countRecordRequests([
    { method: "GET", url: U }, { method: "get", url: `${U}?x=1` }, { method: "PUT", url: U }, { method: "DELETE", url: U },
    { method: "GET", url: `${U}/view` }, { method: "PUT", url: `${U}/reports/1` }, { method: "GET", url: "http://localhost:4173/personal-finance" },
  ]);
  assert.deepEqual(c, { get: 2, put: 1, other: 1 });
  assert.deepEqual(countRecordRequests(undefined), { get: 0, put: 0, other: 0 });
  assert.equal(reloadInPlace({ log: [], navigations: 0 }).ok, false, "no GET at all fails");
  assert.equal(reloadInPlace({ log: [{ method: "GET", url: U }, { method: "GET", url: U }], navigations: 0 }).ok, false, "two GETs fail");
  assert.equal(reloadInPlace({ log: [{ method: "GET", url: U }], navigations: 1 }).ok, false, "one GET but a framenavigated (a full reload) fails");
});

test("freshBaseVersion: must be sent; null matches a null reload version; numbers compare as strings", () => {
  assert.equal(freshBaseVersion({ reloadVersion: "v-2", putBody: { data: {} } }).ok, false, "omitted baseVersion");
  assert.equal(freshBaseVersion({ reloadVersion: "v-2", putBody: undefined }).ok, false, "no PUT");
  assert.equal(freshBaseVersion({ reloadVersion: null, putBody: { baseVersion: null } }).ok, true);
  assert.equal(freshBaseVersion({ reloadVersion: 7, putBody: { baseVersion: "7" } }).ok, true);
  assert.equal(versionOf({ version: "v" }), "v");
  assert.equal(versionOf({ version: 3 }), "3");
  assert.equal(versionOf(null), null);
});

test("tapTarget / noOverflow edges", () => {
  assert.equal(tapTarget({ width: 44, height: 44 }).ok, true);
  assert.equal(tapTarget({ width: 44, height: 43.9 }).ok, false);
  assert.equal(tapTarget(undefined).ok, false);
  assert.equal(noOverflow({ scrollWidth: 391, clientWidth: 390, viewportWidth: 390 }).ok, false, "document scrolls sideways");
  assert.equal(noOverflow({ scrollWidth: 390, clientWidth: 390, viewportWidth: 390, rects: [{ name: "reload", left: 300, right: 390.4 }] }).ok, true, "0.5 px slack");
  assert.equal(noOverflow({ scrollWidth: 390, clientWidth: 390, viewportWidth: 390, rects: [{ name: "reload", left: -4, right: 40 }] }).ok, false);
});

test("STALE_MESSAGE: pinned wording, same text as src/lib/finance/record.ts; Reload must follow it", () => {
  assert.equal(STALE_WORDING, "discard your unsaved edits");
  assert.ok(readFileSync("src/lib/finance/record.ts", "utf8").includes(`export const STALE_MESSAGE = ${JSON.stringify(STALE_MESSAGE)};`), "copy of STALE_MESSAGE drifted from src");
  assert.equal(matchesStaleMessage(`  ${STALE_MESSAGE}  `).ok, true);
  assert.equal(matchesStaleMessage(STALE_MESSAGE.replace("discard your unsaved edits", "keep your edits")).ok, false);
  assert.equal(matchesStaleMessage(null).ok, false);
  assert.equal(bannerThenReload({ ...GOOD.banner, buttonAfterMessage: false }).ok, false, "button before the message");
  assert.equal(bannerThenReload({ ...GOOD.banner, buttonText: "Reloading…" }).ok, false);
  assert.equal(bannerGoneFocusH1({ bannerPresent: true, activeTag: "H1" }).ok, false);
  assert.equal(bannerGoneFocusH1({ bannerPresent: false, activeTag: "BODY" }).ok, false);
});

test("the tool: guarded, no --real flag, PUTs only fulfilled (never continued), default widths 390 + 1440, --all-widths adds 360 + 768", () => {
  const s = readFileSync("qa/tools/pf-stale-reload.mjs", "utf8");
  const code = s.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  assert.ok(code.indexOf("await refuseIfProd(") > 0 && code.indexOf("await refuseIfProd(") < code.indexOf("chromium.launch("));
  assert.doesNotMatch(code, /--real/);
  assert.match(code, /r\.fulfill\(/);
  assert.match(code, /SKIPPED \(NOT A PASS\)/);
  assert.match(code, /finish\(3\)/);
  assert.match(code, /\["390", \{ width: 390[^\n]*\n\s*\["1440", \{ width: 1440/);
  assert.match(code, /--all-widths"\)\) \{\n\s*WIDTHS\.splice\(0, 0, \["360"[^\n]*\n\s*WIDTHS\.splice\(2, 0, \["768"/);
});
