// #308 (spec §80.10, AC PFRL-13): pure assertion helpers for qa/tools/pf-stale-reload.mjs (PFRL-08 / PFRL-09
// automated). No network, no browser, no account: every input is a plain object the tool measured in the page.
// Pinned by scripts/qa-pf-stale-reload.test.mjs, whose fixtures stand for the six #308 mutants (each must fail here).

export const API = "/api/personal-finance";
/** The CFO's condition on §80.2 (§80.9): the banner copy states that unsaved edits are discarded. */
export const STALE_WORDING = "discard your unsaved edits";
/** `STALE_MESSAGE` (src/lib/finance/record.ts:16), copied (the tool never imports src/). */
export const STALE_MESSAGE = "Changed in another tab. Reloading will discard your unsaved edits here; reload to see the latest, then save again.";
/** `BASE_VERSION_REQUIRED_MESSAGE` (src/lib/finance/record.ts:18), copied the same way. */
export const BASE_VERSION_REQUIRED_MESSAGE = "This save was not based on a loaded version. Reload to see the latest, then save again.";
/**
 * CH43 (#308 QA round 3): the faked refusal bodies are exactly what the server sends for a record PUT
 * (src/lib/finance/account.server.ts:220 409 `{ error: STALE_MESSAGE, code: "stale" }`, :199 428
 * `{ error: BASE_VERSION_REQUIRED_MESSAGE, code: "base_version_required" }`). History renders a 409's `error` text, so a
 * shorthand like `{ error: "stale" }` would show "stale" instead of the real banner. Pinned to the live server by
 * src/lib/finance/stale-save.server.test.ts and to record.ts by scripts/qa-pf-stale-reload.test.mjs.
 */
export function refusalBody(status) {
  if (status === 409) return { error: STALE_MESSAGE, code: "stale" };
  if (status === 428) return { error: BASE_VERSION_REQUIRED_MESSAGE, code: "base_version_required" };
  throw new Error(`refusalBody: no record PUT refusal for ${status}`);
}
export const MIN_TAP = 44;

const pathOf = (url) => {
  try {
    return new URL(url, "http://x").pathname;
  } catch {
    return "";
  }
};

/** Requests on exactly `/api/personal-finance` (not /view, /report, …): `{ get, put, other }`. `log` is [{ method, url }]. */
export function countRecordRequests(log) {
  const out = { get: 0, put: 0, other: 0 };
  for (const q of log ?? []) {
    if (pathOf(q.url) !== API) continue;
    // Counted by name (a lookup, not a write: this module only reads a request log).
    out[{ GET: "get", PUT: "put" }[String(q.method).toUpperCase()] ?? "other"]++;
  }
  return out;
}

/** PFRL-08: Reload re-fetches in place: exactly 1 record GET, 0 PUT (or other write), no main-frame navigation. */
export function reloadInPlace({ log, navigations }) {
  const c = countRecordRequests(log);
  const nav = Number(navigations ?? 0);
  return { ok: c.get === 1 && c.put === 0 && c.other === 0 && nav === 0, detail: { ...c, navigations: nav } };
}

/** The version a reply body carries (string or number), else null. */
export const versionOf = (body) => (body && (typeof body.version === "string" || typeof body.version === "number") ? String(body.version) : null);

/**
 * PFRL-09: the next PUT names the version the Reload GET returned (`baseVersion`), not the old one. CH41: the fresh
 * version must be non-null AND differ from the stale one (null === null, or an unchanged version, is a FAIL: it can't
 * show the PUT moved on to the reloaded record).
 */
export function freshBaseVersion({ reloadVersion, staleVersion, putBody }) {
  const sent = putBody && Object.prototype.hasOwnProperty.call(putBody, "baseVersion") ? putBody.baseVersion : undefined;
  const fresh = reloadVersion === null || reloadVersion === undefined ? null : String(reloadVersion);
  const stale = staleVersion === null || staleVersion === undefined ? null : String(staleVersion);
  const got = sent === null || sent === undefined ? sent : String(sent);
  const ok = fresh !== null && fresh !== stale && sent !== undefined && got === fresh;
  return { ok, detail: { sent: got, fresh, stale } };
}

/**
 * CH41 seed: the populated record the tool's route-faked `GET /api/personal-finance` returns (months with figures and
 * saved scenarios), so History and Scenario have something to save / rename / update / delete. `version` is the reply
 * version (CH42: a new one per Reload, see versionClock, so the Reload GET's version differs from the stale one). Pure.
 */
export const SEED_KEYS = { expenses: "orpheus.finance.expenses.v2", income: "orpheus.finance.income.v1", months: "orpheus.finance.months.v1", scenario: "orpheus.finance.scenario.v1" };
export function seedRecord(current = "2026-11") {
  const [y, m] = current.split("-").map(Number);
  const key = (back) => { const i = y * 12 + (m - 1) - back; return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`; };
  const line = (id, name, amount, category) => ({ id, name, amount, per: "month", equity: "", account: "Chequing", currency: "", rate: "", category, note: "" });
  const person = { id: "qa308-p1", name: "QA Person", wages: "96000", bonus: "10", tax: "25", share: "100", countWages: true, countBonus: true, foreign: false, currency: "", rate: "" };
  const fixed = [line("qa308-f1", "Rent", "2400", "Housing"), line("qa308-f2", "Internet", "80", "Utilities")];
  const variable = [line("qa308-v1", "Groceries", "650", "Food")];
  const months = {};
  for (const back of [3, 2, 1, 0]) months[key(back)] = { fixed: fixed.map((l) => ({ ...l, amount: String(Number(l.amount) + back * 10) })), variable, people: [person] };
  const entry = (id, name) => ({
    id, name, savedAt: "2026-11-01T12:00:00.000Z", basis: key(0),
    inputs: { start: 50000, income: 6000, expenses: 3130, growth: 5, rate: null }, values: {}, lines: JSON.stringify(months[key(0)]),
  });
  return {
    [SEED_KEYS.expenses]: JSON.stringify({ fixed, variable, accounts: ["Chequing"], categories: ["Housing", "Utilities", "Food"] }),
    [SEED_KEYS.income]: JSON.stringify({ people: [person] }),
    [SEED_KEYS.months]: JSON.stringify(months),
    [SEED_KEYS.scenario]: JSON.stringify({ income: {}, expenses: {}, rate: null, growth: null, start: null, saved: [entry("qa308-s1", "QA308 A"), entry("qa308-s2", "QA308 B")] }),
  };
}
/** The route-faked GET reply body: the seeded record, owner + write access, and version `qa308-seed-<n>`. */
export const seedReply = (n, current) => ({ data: seedRecord(current), access: { owner: true, write: true }, version: `qa308-seed-${n}` });

/**
 * CH42 (EL): the faked record version moves once per Reload, not once per GET. Every GET between one Reload and the
 * next returns the same version (Scenario's `changeSaved` makes a fresh GET before each PUT, src/lib/finance/
 * scenario-client.ts:44; with a per-GET bump that extra GET moved the version past the Reload GET's and PFRL-09
 * compared against the wrong GET). `onGet()` → the `n` for seedReply; `reload()` is called as Reload is clicked.
 * `perGet: true` is the old CH41 clock, kept only so the tests can show it fails the real sequence.
 */
export function versionClock({ perGet = false } = {}) {
  let n = 0;
  let pending = true;
  return {
    onGet() {
      if (perGet || pending) {
        n++;
        pending = false;
      }
      return n;
    },
    reload() {
      pending = true;
    },
  };
}

/**
 * CH42: replays the Scenario save sequence against a clock, as the app sends it (no browser): page-load GET; Save →
 * fresh GET + PUT (answered 409); Reload → 1 GET; Save again → an extra fresh GET + PUT carrying that GET's version
 * as `baseVersion`. Returns what the tool measures: `{ staleVersion, reloadVersion, putBody }` plus the request log (`kind` get / put: a replay, nothing is sent).
 * `extraGet: false` is the Overview / History shape (the PUT uses the version loaded last, no fresh GET).
 */
export function replaySave(clock, { extraGet = true } = {}) {
  const log = [];
  const get = () => {
    const v = versionOf(seedReply(clock.onGet()));
    log.push({ kind: "get", version: v });
    return v;
  };
  const put = (base) => {
    log.push({ kind: "put", baseVersion: base });
    return { data: {}, baseVersion: base };
  };
  const staleVersion = get();
  put(extraGet ? get() : staleVersion);
  clock.reload();
  const reloadVersion = get();
  const putBody = put(extraGet ? get() : reloadVersion);
  return { staleVersion, reloadVersion, putBody, log };
}

/**
 * CH41 summary: a case not covered is a SKIP, never a PASS. `checks` [{ name, ok }], `skipped` [string]. `code`: 1 on
 * any FAIL, else 3 when anything was skipped, else 0. `line` lists every skipped case.
 */
export function summarize({ checks = [], skipped = [] }) {
  const fail = checks.filter((c) => c.ok !== true).length;
  const pass = checks.length - fail;
  const skip = skipped.length;
  const line = `${pass}/${checks.length} passed${fail ? `, ${fail} FAIL` : ""}${skip ? `, ${skip} SKIPPED (NOT A PASS): ${skipped.join("; ")}` : ""}`;
  return { pass, fail, skip, line, code: fail ? 1 : skip ? 3 : 0 };
}

/** 44 × 44 px tap target. `rect` is { width, height } (a getBoundingClientRect). */
export function tapTarget(rect, min = MIN_TAP) {
  const w = Math.round(Number(rect?.width ?? 0) * 10) / 10;
  const h = Math.round(Number(rect?.height ?? 0) * 10) / 10;
  return { ok: w >= min && h >= min, detail: { w, h } };
}

/**
 * No overflow: the document does not scroll sideways (`scrollWidth <= clientWidth`) and every given element rect
 * (banner, button, message) lies inside the viewport (0.5 px rounding slack).
 */
export function noOverflow({ scrollWidth, clientWidth, viewportWidth, rects = [] }) {
  const vw = Number(viewportWidth ?? clientWidth);
  const out = rects.filter((r) => r && (r.left < -0.5 || r.right > vw + 0.5)).map((r) => ({ name: r.name, left: r.left, right: r.right }));
  return { ok: Number(scrollWidth) <= Number(clientWidth) && out.length === 0, detail: { scrollWidth, clientWidth, out } };
}

/** The banner text is STALE_MESSAGE (with the pinned `discard your unsaved edits` wording). */
export function matchesStaleMessage(text) {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  return { ok: t.includes(STALE_MESSAGE) && t.includes(STALE_WORDING), detail: t.slice(0, 160) };
}

/** The banner shows STALE_MESSAGE and the Reload button comes right after it (`text` = message then button, in DOM order). */
export function bannerThenReload({ bannerText, buttonText, buttonAfterMessage }) {
  const m = matchesStaleMessage(bannerText);
  const ok = m.ok && /^Reload$/.test(String(buttonText ?? "").trim()) && buttonAfterMessage === true;
  return { ok, detail: { message: m.detail, button: buttonText ?? null, after: buttonAfterMessage ?? null } };
}

/** Both refusals (409 `stale`, 428 `base_version_required`) show the banner: `shown` maps status → bannerText|null. */
export function staleOnBoth(shown) {
  const bad = [409, 428].filter((s) => !matchesStaleMessage(shown?.[s]).ok);
  return { ok: bad.length === 0, detail: { missing: bad } };
}

/** After Reload: the banner is gone and focus is on the page h1. */
export function bannerGoneFocusH1({ bannerPresent, activeTag }) {
  return { ok: bannerPresent === false && String(activeTag ?? "").toUpperCase() === "H1", detail: { bannerPresent, activeTag } };
}
