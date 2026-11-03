// #308 (spec §80.10, AC PFRL-13): pure assertion helpers for qa/tools/pf-stale-reload.mjs (PFRL-08 / PFRL-09
// automated). No network, no browser, no account: every input is a plain object the tool measured in the page.
// Pinned by scripts/qa-pf-stale-reload.test.mjs, whose fixtures stand for the six #308 mutants (each must fail here).

export const API = "/api/personal-finance";
/** The CFO's condition on §80.2 (§80.9): the banner copy states that unsaved edits are discarded. */
export const STALE_WORDING = "discard your unsaved edits";
/** `STALE_MESSAGE` (src/lib/finance/record.ts:16), copied (the tool never imports src/). */
export const STALE_MESSAGE = "Changed in another tab. Reloading will discard your unsaved edits here; reload to see the latest, then save again.";
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

/** PFRL-09: the next PUT names the version the Reload GET returned (`baseVersion`), not the old one. */
export function freshBaseVersion({ reloadVersion, staleVersion, putBody }) {
  const sent = putBody && Object.prototype.hasOwnProperty.call(putBody, "baseVersion") ? putBody.baseVersion : undefined;
  const fresh = reloadVersion === null || reloadVersion === undefined ? null : String(reloadVersion);
  const got = sent === null || sent === undefined ? sent : String(sent);
  const ok = sent !== undefined && got === fresh;
  return { ok, detail: { sent: got, fresh, stale: staleVersion ?? null } };
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
