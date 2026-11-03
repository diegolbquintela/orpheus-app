// #308 (spec §80.10, AC PFRL-13): the pure assertions of qa/tools/pf-stale-reload.mjs. A passing fixture (the page as
// built) passes every helper; each of the six #308 mutants, as the measurements the tool would take on it, fails.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  API, STALE_MESSAGE, STALE_WORDING, bannerGoneFocusH1, bannerThenReload, countRecordRequests, freshBaseVersion,
  matchesStaleMessage, noOverflow, reloadInPlace, replaySave, seedRecord, seedReply, staleOnBoth, summarize, tapTarget,
  versionClock, versionOf,
} from "../qa/tools/pf-stale-reload.lib.mjs";
// CH42: the seed is checked with the app's own parsers / validators (the tool itself never imports src/).
import { checkRecord, prepareRecord } from "../src/lib/finance/record.ts";
import { applyHistoryEdit, isEditableCell, storedYears, yearTable } from "../src/lib/finance/history.ts";
import { readScenario, scenarioValueOk } from "../src/lib/finance/scenario-key.ts";
import { addSaved, nameError, removeSaved, renameError, renameSaved, updateSaved } from "../src/lib/finance/saved-scenarios.ts";

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

test("freshBaseVersion: must be sent; numbers compare as strings", () => {
  assert.equal(freshBaseVersion({ reloadVersion: "v-2", putBody: { data: {} } }).ok, false, "omitted baseVersion");
  assert.equal(freshBaseVersion({ reloadVersion: "v-2", putBody: undefined }).ok, false, "no PUT");
  assert.equal(freshBaseVersion({ reloadVersion: 7, staleVersion: 6, putBody: { baseVersion: "7" } }).ok, true);
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

// CH41 (#308 QA): PFRL-09 needs a non-null fresh version that differs from the stale one.
test("CH41 PFRL-09: null/null fails, equal non-null versions fail, a correct fresh version passes", () => {
  assert.equal(freshBaseVersion({ reloadVersion: null, staleVersion: null, putBody: { baseVersion: null } }).ok, false, "null === null must FAIL");
  assert.equal(freshBaseVersion({ reloadVersion: undefined, staleVersion: undefined, putBody: { baseVersion: null } }).ok, false);
  assert.equal(freshBaseVersion({ reloadVersion: "v-1", staleVersion: "v-1", putBody: { baseVersion: "v-1" } }).ok, false, "unchanged version must FAIL");
  assert.equal(freshBaseVersion({ reloadVersion: 5, staleVersion: "5", putBody: { baseVersion: 5 } }).ok, false, "equal after String()");
  assert.equal(freshBaseVersion({ reloadVersion: "v-2", staleVersion: "v-1", putBody: { baseVersion: "v-1" } }).ok, false, "stale sent");
  assert.equal(freshBaseVersion({ reloadVersion: "v-2", staleVersion: "v-1", putBody: { baseVersion: "v-2" } }).ok, true);
  assert.equal(freshBaseVersion({ reloadVersion: "v-2", staleVersion: null, putBody: { baseVersion: "v-2" } }).ok, true, "a first record (stale null) moving to v-2");
});

test("CH41 seed: the faked GET is a populated record (months with figures + saved scenarios); each GET a new version", () => {
  const r = seedRecord("2026-11");
  const months = JSON.parse(r["orpheus.finance.months.v1"]);
  assert.ok(Object.keys(months).length >= 2 && Object.keys(months).every((k) => /^\d{4}-(0[1-9]|1[0-2])$/.test(k) && k <= "2026-11"));
  assert.ok(Object.values(months).every((m) => m.fixed.length > 0 && m.fixed.every((l) => Number(l.amount) > 0)), "months carry figures");
  const sc = JSON.parse(r["orpheus.finance.scenario.v1"]);
  assert.ok(sc.saved.length >= 2 && new Set(sc.saved.map((e) => e.name.toLowerCase())).size === sc.saved.length);
  assert.equal(seedRecord("2026-01")["orpheus.finance.months.v1"].includes("2025-10"), true, "year rollover");
  const a = seedReply(1, "2026-11");
  const b = seedReply(2, "2026-11");
  assert.notEqual(versionOf(a), null);
  assert.notEqual(versionOf(a), versionOf(b), "the Reload GET's version differs from the stale one");
  assert.equal(freshBaseVersion({ reloadVersion: versionOf(b), staleVersion: versionOf(a), putBody: { baseVersion: versionOf(b) } }).ok, true);
  const tool = readFileSync("qa/tools/pf-stale-reload.mjs", "utf8");
  assert.match(tool, /m === "GET" && p === API\)\s*return r\.fulfill\([^\n]*seedReply\(clock\.onGet\(\)/, "record GETs route-faked with the seed (CH42: version from the per-Reload clock)");
  assert.match(tool, /return skip\(`\$\{tag\}: nothing to/, "an uncovered case is a SKIP");
  assert.doesNotMatch(tool, /return info\(/);
});

test("CH41 summary: an uncovered case counts as SKIP and is listed; a SKIP is never a PASS", () => {
  const skipped = ["[390] History save 409: nothing to save (not covered)", "[390] Scenario rename 409: nothing to rename (not covered)"];
  const s = summarize({ checks: [{ name: "a", ok: true }], skipped });
  assert.equal(s.pass, 1, "skips add no PASS");
  assert.equal(s.skip, 2);
  assert.equal(s.fail, 0);
  assert.equal(s.code, 3, "skipped → exit 3, not 0");
  for (const k of skipped) assert.ok(s.line.includes(k), `summary lists ${k}`);
  assert.match(s.line, /SKIPPED \(NOT A PASS\)/);
  assert.match(s.line, /^1\/1 passed/);
  const only = summarize({ checks: [], skipped: ["x"] });
  assert.equal(only.pass, 0);
  assert.equal(only.code, 3);
  assert.equal(summarize({ checks: [{ name: "a", ok: false }], skipped: ["x"] }).code, 1);
  assert.equal(summarize({ checks: [{ name: "a", ok: true }] }).code, 0);
  assert.equal(summarize({ checks: [{ name: "a", ok: "yes" }] }).fail, 1, "only ok === true passes");
});

// CH42 (#308 QA round 2): History save and Scenario rename / update / delete must run, not SKIP.
const CH42_NOW = { "2026-11": new Date("2026-11-15T12:00:00Z"), "2026-01": new Date("2026-01-15T12:00:00Z") };

test("CH42 endpoints: History, Scenario and Overview read only GET /api/personal-finance (no query); the tool fakes exactly that", () => {
  for (const f of ["src/lib/finance/history-client.ts", "src/lib/finance/scenario-client.ts", "src/lib/finance/account-client.ts"]) {
    const src = readFileSync(f, "utf8");
    const calls = [...src.matchAll(/fetch\(([^,)]+)/g)].map((m) => m[1].trim());
    assert.ok(calls.length > 0 && calls.every((c) => c === "API"), `${f} fetches only API: ${calls}`);
  }
  assert.match(readFileSync("src/lib/finance/history-client.ts", "utf8"), /const API = "\/api\/personal-finance";/);
  assert.match(readFileSync("src/lib/finance/account-client.ts", "utf8"), /export const API = "\/api\/personal-finance";/);
  assert.equal(API, "/api/personal-finance");
  const tool = readFileSync("qa/tools/pf-stale-reload.mjs", "utf8");
  assert.match(tool, /if \(m === "GET" \|\| m === "HEAD"\) return r\.continue\(\);/, "other GETs (assets, server fns) pass through");
  assert.match(tool, /realPut\.push\(`\$\{m\} \$\{p\}`\);\s*return r\.abort\(\);/, "every other write (POST / PATCH / DELETE / non-record PUT) aborted");
});

for (const cur of Object.keys(CH42_NOW)) {
  const now = CH42_NOW[cur];
  const reply = seedReply(1, cur);
  const r = reply.data;

  test(`CH42 seed (${cur}): a storable record the pages load without writing (no import, no migration)`, () => {
    assert.equal(checkRecord(r).ok, true, "the server would accept it (names allowed, strings, ≤ 1 MB)");
    const p = prepareRecord(r, null);
    assert.equal(p.imported, false);
    assert.equal(p.migrated, false, "Overview sends no PUT on load");
    assert.equal(typeof reply.version, "string", "scenario-client / account-client keep only a string version");
    assert.equal(reply.access.write, true, "scenario-client needs access.write === true for the Save / Rename / Update / Delete controls");
    assert.notEqual(reply.access.owner, false);
  });

  test(`CH42 seed (${cur}): History has a year to pick, rows, and an editable cell whose edit makes Save enabled`, () => {
    const years = storedYears(r, cur);
    assert.ok(years.length > 0, "the Year select has a choice (else pf-history-empty)");
    const t = yearTable(r, years[0], now);
    assert.ok(t.rows.length > 0 && t.columns.length > 0);
    const cells = t.rows.flatMap((row) => t.columns.map((c, i) => ({ month: row.month, id: c.id, val: row.cells[i] }))).filter((c) => isEditableCell(r, c.month, c.id));
    assert.ok(cells.length > 0, "at least one pf-history-input");
    const c = cells[0];
    const next = String((Number(c.val.replace(/,/g, "")) || 0) + 1); // what dirtyInput types
    const edited = applyHistoryEdit(r, c.month, c.id, next, now);
    assert.ok(edited && JSON.stringify(edited) !== JSON.stringify(r), "the edit changes the record (dirty → Save enabled)");
  });

  test(`CH42 seed (${cur}): Scenario parses saved entries the Save / Rename / Update / Delete paths accept`, () => {
    assert.equal(scenarioValueOk(r), true);
    const sc = readScenario(r);
    assert.ok(sc && sc.saved.length >= 1, "the saved table has rows (else pf-saved-none)");
    const e = sc.saved[0];
    assert.equal(nameError("QA308 12345", sc.saved), null, "Save scenario: name accepted");
    assert.ok(!("error" in addSaved(sc, { ...e, id: "qa308-new", name: "QA308 12345" })));
    assert.equal(renameError("QA308 r12345", sc.saved, e.id), null, "Rename accepted");
    assert.ok(!("error" in renameSaved(sc, e.id, "QA308 r12345")));
    const { id: _id, name: _name, ...rest } = e;
    assert.ok(!("error" in updateSaved(sc, e.id, rest)), "Update accepted");
    assert.equal(removeSaved(sc, e.id).saved.length, sc.saved.length - 1, "Delete removes it");
  });
}

test("CH42 UI preconditions: the tool picks a History year and opens the Scenario saved table before acting", () => {
  const hp = readFileSync("src/components/personal-finance/history-page.tsx", "utf8");
  assert.match(hp, /useState<number \| null>\(null\)/, "History's year starts unset");
  assert.match(hp, /data-testid="pf-history-year"/);
  const sp = readFileSync("src/components/personal-finance/scenario-page.tsx", "utf8");
  assert.match(sp, /\) : open \? \(/, "the saved table renders only when open");
  assert.match(sp, /aria-expanded=\{open\}\s*data-testid="pf-saved-toggle"/);
  const tool = readFileSync("qa/tools/pf-stale-reload.mjs", "utf8");
  assert.match(tool, /save: async \(p\) => \(await pickYear\(p\), await dirtyInput\(p, "\[data-testid=pf-history-input\]/);
  for (const a of ["rename", "update", "delete"]) assert.match(tool, new RegExp(`${a}: async \\(p\\) => \\{\\n\\s*await openSaved\\(p\\);`), `${a} opens the saved table first`);
  assert.match(tool, /aria-expanded"\)\) !== "true"\) await t\.click\(\)/);
});

test("CH42 PFRL-09: the version moves once per Reload; the real Scenario sequence passes, the old per-GET bump fails", () => {
  const c = versionClock();
  assert.equal(c.onGet(), 1);
  assert.equal(c.onGet(), 1, "a second GET before any Reload: same version");
  c.reload();
  assert.equal(c.onGet(), 2);
  assert.equal(c.onGet(), 2, "every GET between one Reload and the next: same version");

  // stale PUT, Reload, GET, an extra GET, then PUT.
  const ok = replaySave(versionClock());
  assert.deepEqual(ok.log.map((q) => q.kind), ["get", "get", "put", "get", "get", "put"]);
  assert.notEqual(ok.putBody.baseVersion, null);
  assert.equal(ok.putBody.baseVersion, ok.reloadVersion, "PUT baseVersion = the post-Reload version");
  assert.notEqual(ok.putBody.baseVersion, ok.staleVersion);
  assert.equal(freshBaseVersion(ok).ok, true);

  const old = replaySave(versionClock({ perGet: true }));
  assert.notEqual(old.putBody.baseVersion, old.reloadVersion, "per-GET: the extra GET moved the version past the Reload GET's");
  assert.equal(freshBaseVersion(old).ok, false, "the old per-GET bump fails this sequence");

  // Overview (no extra GET) passes under the per-Reload clock.
  const ov = replaySave(versionClock(), { extraGet: false });
  assert.deepEqual(ov.log.map((q) => q.kind), ["get", "put", "get", "put"]);
  assert.equal(freshBaseVersion(ov).ok, true);
  assert.equal(ov.reloadVersion, "qa308-seed-2");
  assert.equal(ov.staleVersion, "qa308-seed-1");

  const tool = readFileSync("qa/tools/pf-stale-reload.mjs", "utf8");
  assert.match(tool, /const clock = versionClock\(\);/);
  assert.match(tool, /clock\.reload\(\);\s*await page\.getByTestId\(surface\.reload\)\.click\(\);/, "bumped once, as Reload is clicked");
  assert.doesNotMatch(tool, /\+\+gets/);
});
