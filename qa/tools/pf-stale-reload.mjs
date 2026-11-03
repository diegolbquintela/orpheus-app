// #308 (spec §80.10, AC PFRL-13; automates PFRL-08 / PFRL-09; EL GO, Plan A ONLY): the stale-save `Reload` banner
// on Overview, History and Scenario (Save / Rename / Update / Delete where they exist), with ZERO server writes.
// Every record PUT is intercepted with page.route and never reaches the server: the first one is answered with a
// synthetic 409 `{ code: "stale" }` (second pass: 428 `{ code: "base_version_required" }`), the one after Reload
// with a synthetic 200. Any other non-GET / HEAD request from the page is aborted. Per surface, action and pass:
//   - the banner shows STALE_MESSAGE (pinned `discard your unsaved edits`) with `Reload` right after it;
//   - Reload: exactly 1 GET /api/personal-finance (route-faked, CH41), 0 PUT, no framenavigated;
//   - the banner is gone and focus is on the h1;
//   - the next (intercepted) PUT carries the Reload GET's version as `baseVersion`;
//   - the Reload button is ≥ 44 × 44 px and nothing overflows (scrollWidth <= clientWidth, rects in the viewport);
//   - CH41: record GETs are route-faked (a populated seed record) so every case runs; a case with nothing to act on
//     is a SKIP listed in the summary, never a PASS. CH42: the version moves once per Reload (versionClock), not per
//     GET; History picks a year first and Scenario opens its saved list, so their actions exist;
//   - CLS 0 on the surface's load (CLS_RUNS=1: the one load of each case, no extra cold loads).
// Widths 390 and 1440 by default; --all-widths adds 360 and 768. Signs in with QA_EMAIL / QA_PASSWORD (env only,
// never logged); unset → `SKIPPED (NOT A PASS)`, exit 3. Refuses production (qa/tools/prod-guard.mjs). The Vercel
// bypass header (bypassHeaders) is sent, never printed; output is email-masked. There is no --real flag.
// Assertions live in pf-stale-reload.lib.mjs (pure; scripts/qa-pf-stale-reload.test.mjs).
//
//   QA_EMAIL=… QA_PASSWORD=… node qa/tools/pf-stale-reload.mjs --base-url <local or preview> --out <dir> [--all-widths]
// Exit 1 on any FAIL, 3 when skipped, else 0.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { qaConfig } from "./config.mjs";
import { refuseIfProd } from "./prod-guard.mjs";
import { bypassHeaders } from "./robots-txt.lib.mjs";
import { eachViewport } from "./session.mjs";
import { installConsoleMask, maskDeep, maskedJson } from "./redact.mjs";
import { API, bannerGoneFocusH1, bannerThenReload, freshBaseVersion, noOverflow, refusalBody, reloadInPlace, seedReply, summarize, versionClock, tapTarget, versionOf } from "./pf-stale-reload.lib.mjs";
import { torontoMonth } from "./pf-plan-seed.mjs";

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log("usage: node qa/tools/pf-stale-reload.mjs --base-url <local or preview> --out <dir> [--all-widths]  (QA_EMAIL / QA_PASSWORD from env; zero server writes)");
  process.exit(0);
}
installConsoleMask();
const CFG = qaConfig(import.meta.url);
const mode = await refuseIfProd(CFG.baseUrl, "pf-stale-reload");
const base = CFG.baseUrl;
const R = { base, checks: [], info: [], skipped: [] };
const check = (name, ok, detail) => {
  R.checks.push(maskDeep({ name, ok: Boolean(ok), detail }));
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail !== undefined ? ` · ${JSON.stringify(maskDeep(detail))}` : ""}`);
};
// CH41: a case that can't run is a SKIP (listed in the summary), never a PASS.
const skip = (m) => {
  R.skipped.push(m);
  console.log(`SKIP ${m} (NOT A PASS)`);
};
const finish = (code) => {
  writeFileSync(join(CFG.out, "pf-stale-reload.json"), maskedJson(R));
  const sum = summarize(R);
  console.log(`\n${sum.line} · out ${CFG.out}`);
  process.exit(code ?? sum.code);
};

const email = process.env.QA_EMAIL;
const password = process.env.QA_PASSWORD;
if (mode.signedOutProd || !email || !password) {
  const why = mode.signedOutProd ? "signed-out prod mode" : "QA_EMAIL / QA_PASSWORD not set";
  R.skipped.push(why);
  console.log(`SKIPPED (NOT A PASS): pf-stale-reload (${why})`);
  finish(3);
}

const WIDTHS = [
  ["390", { width: 390, height: 844 }, true],
  ["1440", { width: 1440, height: 900 }, false],
];
if (process.argv.includes("--all-widths")) {
  WIDTHS.splice(0, 0, ["360", { width: 360, height: 780 }, true]);
  WIDTHS.splice(2, 0, ["768", { width: 768, height: 1024 }, false]);
}
const BYPASS = bypassHeaders(base); // never printed
const SYN_VERSION = "qa308-synthetic";

const dirtyInput = async (page, sel) => {
  const el = page.locator(sel).first();
  if (!(await el.count())) return false;
  const v = await el.inputValue().catch(() => "");
  await el.fill(/^-?\d/.test(v) || (await el.getAttribute("inputmode")) ? String((Number(v.replace(/,/g, "")) || 0) + 1) : `${v} x`);
  return true;
};
// CH42: History shows its grid (and its inputs) only once a Year is picked (history-page.tsx: `year` starts null).
const pickYear = async (p) => {
  const sel = p.getByTestId("pf-history-year");
  if (!(await sel.count())) return;
  if (!(await sel.inputValue())) {
    const v = await sel.locator("option").nth(1).getAttribute("value").catch(() => null);
    if (v) await sel.selectOption(v);
  }
  await p.getByTestId("pf-history-input").first().waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
};
// CH42: Scenario's Rename / Update / Delete live in the saved table, shown only once `pf-saved-toggle` is expanded
// (closed again after Reload: the screen remounts).
const openSaved = async (p) => {
  const t = p.getByTestId("pf-saved-toggle");
  if (!(await t.count())) return;
  if ((await t.getAttribute("aria-expanded")) !== "true") await t.click();
  await p.getByTestId("pf-saved-item").first().waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
};
// Each action makes the page send one record PUT; returns false when the surface has nothing to act on.
const SURFACES = [
  {
    name: "Overview", path: "/personal-finance", banner: "pf-save", reload: "pf-stale-reload",
    actions: { save: async (p) => (await dirtyInput(p, "[data-testid=pf-area] input[type=text]:visible, [data-testid=pf-area] input:not([type]):visible")) && (await p.getByTestId("pf-month-save").click(), true) },
  },
  {
    name: "History", path: "/personal-finance/history", banner: "pf-stale-error", reload: "pf-stale-reload",
    actions: { save: async (p) => (await pickYear(p), await dirtyInput(p, "[data-testid=pf-history-input]:visible")) && (await p.getByTestId("pf-history-save").click(), true) },
  },
  {
    name: "Scenario", path: "/personal-finance/scenario", banner: "pf-saved-stale", reload: "pf-saved-reload",
    actions: {
      save: async (p) => {
        if (!(await p.getByTestId("pf-saved-name").count())) return false;
        await p.getByTestId("pf-saved-name").fill(`QA308 ${Date.now() % 100000}`);
        await p.getByTestId("pf-saved-save").click();
        return true;
      },
      rename: async (p) => {
        await openSaved(p);
        if (!(await p.getByTestId("pf-saved-rename").count())) return false;
        await p.getByTestId("pf-saved-rename").first().click();
        await p.getByTestId("pf-saved-rename-name").fill(`QA308 r${Date.now() % 100000}`);
        await p.getByTestId("pf-saved-rename-save").click();
        return true;
      },
      update: async (p) => {
        await openSaved(p);
        if (!(await p.getByTestId("pf-saved-update").count())) return false;
        await p.getByTestId("pf-saved-update").first().click(); // window.confirm: accepted by the dialog handler
        return true;
      },
      delete: async (p) => {
        await openSaved(p);
        if (!(await p.getByTestId("pf-saved-delete").count())) return false;
        await p.getByTestId("pf-saved-delete").first().click(); // window.confirm: accepted by the dialog handler
        return true;
      },
    },
  },
];

async function measure(page, bannerId, reloadId) {
  return page.evaluate(([b, r]) => {
    const banner = document.querySelector(`[data-testid=${b}]`);
    const btn = document.querySelector(`[data-testid=${r}]`);
    const box = (e, name) => { if (!e) return null; const x = e.getBoundingClientRect(); return { name, left: x.left, right: x.right, width: x.width, height: x.height }; };
    // The message's own element (banner text without the button), then the button after it in document order.
    const scope = banner && btn && !banner.contains(btn) ? banner.parentElement : banner;
    const text = scope ? scope.textContent : null;
    const after = !!(banner && btn && (banner.contains(btn) ? true : banner.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING));
    return {
      present: !!banner && banner.getBoundingClientRect().height > 0 && !!(text ?? "").trim(),
      text, buttonText: btn?.textContent ?? null, after,
      rects: [box(banner, "banner"), box(btn, "reload"), box(btn?.closest(".pf-stale-reload"), "row")].filter(Boolean),
      scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth,
      activeTag: document.activeElement?.tagName ?? null,
    };
  }, [bannerId, reloadId]);
}

// One case on a fresh page of the signed-in context (eachViewport signs in and always signs out).
async function run(ctx, [vp, viewport], surface, action, status) {
  const tag = `[${vp}] ${surface.name} ${action} ${status}`;
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  page.on("dialog", (d) => d.accept().catch(() => {}));
  const log = [];
  const realPut = [];
  // CH41: every record GET is route-faked with a populated record (months with figures + saved scenarios), so History
  // and Scenario have something to act on. CH42 (EL): the version moves once per Reload, not per GET.
  const clock = versionClock();
  const month = torontoMonth(new Date());
  let nav = 0;
  // CH43: the faked 409 / 428 body is the server's own (account.server.ts:220 / :199), not a shorthand.
  let reply = { status, body: refusalBody(status) };
  const puts = [];
  // Zero writes: every non-GET / HEAD request from the page is fulfilled (record PUT) or aborted, never continued.
  await page.route("**/*", async (r) => {
    const q = r.request();
    const m = q.method().toUpperCase();
    const p = new URL(q.url()).pathname;
    if (m === "GET" && p === API)
      return r.fulfill({ status: 200, contentType: "application/json", headers: { "cache-control": "no-store" }, body: JSON.stringify(seedReply(clock.onGet(), month)) });
    if (m === "GET" || m === "HEAD") return r.continue();
    if (m === "PUT" && p === API) {
      let body = null;
      try { body = q.postDataJSON(); } catch { body = null; }
      puts.push(body);
      const out = typeof reply === "function" ? reply(body) : reply;
      return r.fulfill({ status: out.status, contentType: "application/json", body: JSON.stringify(out.body) });
    }
    realPut.push(`${m} ${p}`);
    return r.abort();
  });
  page.on("request", (q) => { if (new URL(q.url()).pathname === API) log.push({ method: q.method(), url: q.url() }); });
  const versions = [];
  page.on("response", async (res) => {
    if (res.request().method() === "GET" && new URL(res.url()).pathname === API) versions.push(versionOf(await res.json().catch(() => null)));
  });
  try {
    await page.addInitScript(() => {
      window.__cls = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto(`${base}${surface.path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const cls = await page.evaluate(() => window.__cls);
    const staleVersion = versions.at(-1) ?? null;
    page.on("framenavigated", (f) => { if (f === page.mainFrame()) nav++; });
    if (!(await surface.actions[action](page))) return skip(`${tag}: nothing to ${action} (not covered)`);
    await page.getByTestId(surface.reload).waitFor({ state: "visible" });
    const m1 = await measure(page, surface.banner, surface.reload);
    const b = bannerThenReload({ bannerText: m1.text, buttonText: m1.buttonText, buttonAfterMessage: m1.after });
    check(`${tag} PFRL-08 banner shows STALE_MESSAGE ('discard your unsaved edits'), then Reload`, b.ok, b.detail);
    const t = tapTarget(m1.rects.find((x) => x.name === "reload"));
    check(`${tag} Reload ≥ 44 × 44 px`, t.ok, t.detail);
    const o = noOverflow({ scrollWidth: m1.scrollWidth, clientWidth: m1.clientWidth, viewportWidth: viewport.width, rects: m1.rects });
    check(`${tag} no overflow with the banner`, o.ok, o.detail);
    // Reload: count only what Reload sends.
    log.length = 0;
    nav = 0;
    const before = versions.length;
    clock.reload();
    await page.getByTestId(surface.reload).click();
    await page.getByTestId(surface.reload).waitFor({ state: "detached", timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(600);
    const rl = reloadInPlace({ log, navigations: nav });
    check(`${tag} PFRL-08 Reload: exactly 1 GET ${API}, 0 PUT, no framenavigated`, rl.ok, rl.detail);
    const m2 = await measure(page, surface.banner, surface.reload);
    const g = bannerGoneFocusH1({ bannerPresent: m2.present && (await page.getByTestId(surface.reload).count()) > 0, activeTag: m2.activeTag });
    check(`${tag} PFRL-08 banner gone, focus on the h1`, g.ok, g.detail);
    const reloadVersion = versions.length > before ? versions.at(-1) : null;
    // The next save: intercepted, synthetic 200.
    reply = (body) => ({ status: 200, body: { data: body?.data ?? null, version: SYN_VERSION } });
    const n = puts.length;
    if (!(await surface.actions[action](page))) return check(`${tag} PFRL-09 a second ${action} possible after Reload`, false);
    for (let i = 0; i < 50 && puts.length === n; i++) await page.waitForTimeout(100);
    const f = freshBaseVersion({ reloadVersion, staleVersion, putBody: puts[n] });
    check(`${tag} PFRL-09 next PUT (intercepted → 200) carries the fresh baseVersion`, puts.length > n && f.ok, f.detail);
    check(`${tag} CLS 0 on load`, cls === 0, cls);
  } catch (e) {
    check(`${tag} ran to the end`, false, String(e?.message ?? e).split("\n")[0]);
  } finally {
    check(`${tag} zero server writes (no PUT / POST / DELETE / PATCH continued)`, realPut.length === 0, realPut);
    await page.close().catch(() => {});
  }
}

const browser = await chromium.launch();
try {
  for (const w of WIDTHS)
    await eachViewport({ browser, baseUrl: base, email, password, check, viewports: [w], headers: BYPASS }, async ({ ctx }) => {
      for (const s of SURFACES)
        for (const a of Object.keys(s.actions))
          for (const status of [409, 428]) await run(ctx, w, s, a, status);
    });
} finally {
  await browser.close();
}
finish();
