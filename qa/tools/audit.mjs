// Audit log of actions (#91; design attachments/audit-log-design.md, AUDIT-01..12 in qa/CANONICAL-AC-PACK.md), on a
// preview with the #90 QA accounts. Credentials from env only, never logged or written to the out dir:
//   QA_OWNER_EMAIL / QA_OWNER_PASSWORD (the owner), QA_CFO_* (Personal Finance Read),
//   QA_PM_* (Dashboard Read and write), QA_NONE_* (no grant).
// API: AUDIT-02 (dash.settings by the PM, sign-in rows), -03 masking (codes only; no email, no person's name from
// Who has access), -04 detail codes, -05 a failed sign-in as anonymous, -06 denials (CFO PF PUT, no-grant Dashboard
// GET), -07 the reader (owner 200 newest first / paging / no-store; CFO 403; signed out 401; POST 405).
// Browser at 360 × 780 and 1440 × 900: AUDIT-08 / -09 (`06 Activity` for the owner only, columns, ET times, the
// dark shell with the lyre and footer, no gold, the table scrolls in its box, no page scroll, strict CLS 0, noindex).
// Writes: the PM saves the Dashboard base currency it already has (no change); nothing else is changed.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { qaConfig } from "./config.mjs";
import { refuseIfProd } from "./prod-guard.mjs";

const CFG = qaConfig(import.meta.url);
// #157 (QA run 2026-10-17 F2, EL): refuse production before any request or sign-in (qa/tools/prod-guard.mjs).
await refuseIfProd(CFG.baseUrl, "audit");
const base = CFG.baseUrl;
const R = [];
function check(name, pass, detail) {
  R.push({ name, pass: !!pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail === undefined ? "" : ` · ${JSON.stringify(detail)}`}`);
}
const env = process.env;
const ACC = {
  owner: [env.QA_OWNER_EMAIL, env.QA_OWNER_PASSWORD],
  cfo: [env.QA_CFO_EMAIL, env.QA_CFO_PASSWORD],
  pm: [env.QA_PM_EMAIL, env.QA_PM_PASSWORD],
  none: [env.QA_NONE_EMAIL, env.QA_NONE_PASSWORD],
};
for (const [k, [e, p]] of Object.entries(ACC))
  if (!e || !p) {
    console.error(`[audit] missing credentials for ${k} in env`);
    process.exit(2);
  }

class Jar {
  c = new Map();
  header() {
    return [...this.c].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  take(res) {
    for (const sc of res.headers.getSetCookie()) {
      const kv = sc.split(";")[0];
      const i = kv.indexOf("=");
      if (!kv.slice(i + 1) || /max-age=0\b/i.test(sc)) this.c.delete(kv.slice(0, i));
      else this.c.set(kv.slice(0, i), kv.slice(i + 1));
    }
  }
}
async function http(jar, method, path, body) {
  const headers = { origin: base, accept: "application/json" };
  if (jar?.c.size) headers.cookie = jar.header();
  if (body !== undefined) headers["content-type"] = "application/json";
  const r = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
  jar?.take(r);
  const text = await r.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: r.status, cc: r.headers.get("cache-control"), json };
}
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
async function signIn(email, password) {
  for (let i = 0; i < 6; i++) {
    const jar = new Jar();
    const r = await http(jar, "POST", "/api/auth/sign-in/email", { email, password });
    if (r.status === 429) {
      await wait(11000);
      continue;
    }
    return { jar: r.status === 200 ? jar : null, status: r.status };
  }
  return { jar: null, status: 429 };
}

// ---------------------------------------------------------------- guard
const st = await http(null, "GET", "/api/dashboard/status");
if (!st.json || !("signIn" in st.json) || st.json.ownerEmail !== "set") {
  console.error(`[audit] refusing: ${base} is not a preview with sign-in and ORPHEUS_OWNER_EMAIL set`);
  process.exit(3);
}

const jars = {};
async function login(k) {
  const s = await signIn(...ACC[k]);
  jars[k] = s.jar;
  check(`sign-in ${k}`, s.jar, s.status);
  if (!s.jar) process.exit(1);
}
await login("owner");
const top = (await http(jars.owner, "GET", "/api/account/audit?limit=1")).json?.events?.[0]?.id ?? 0;
for (const k of ["cfo", "pm", "none"]) await login(k);

// actions
const failed = await signIn(ACC.none[0], `${ACC.none[1]}-wrong`);
check("AUDIT-05 a wrong password is refused", failed.status !== 200, failed.status);
await wait(1200);
const relog = await signIn(...ACC.pm);
jars.pm = relog.jar ?? jars.pm;
const settings = await http(jars.pm, "GET", "/api/dashboard/settings");
const cur = settings.json?.settings?.baseCurrency;
const put = await http(jars.pm, "PUT", "/api/dashboard/settings", { baseCurrency: cur });
check("PM saves the same base currency (no change)", put.status === 200 && put.json?.settings?.baseCurrency === cur, [put.status, cur]);
const cfoPut = await http(jars.cfo, "PUT", "/api/personal-finance", { data: {} });
check("CFO Read: PUT /api/personal-finance → 403", cfoPut.status === 403, cfoPut.status);
const noneGet = await http(jars.none, "GET", "/api/dashboard/holdings");
check("no grant: GET /api/dashboard/holdings → 403", noneGet.status === 403, noneGet.status);

// reader
const all = await http(jars.owner, "GET", "/api/account/audit?limit=100");
check("AUDIT-07 owner 200, no-store", all.status === 200 && all.cc === "no-store", [all.status, all.cc]);
const events = all.json?.events ?? [];
const ids = events.map((e) => e.id);
check("AUDIT-07 newest first", ids.every((id, i) => i === 0 || id < ids[i - 1]), ids.slice(0, 5));
const fresh = events.filter((e) => e.id > top).reverse();
const has = (f) => fresh.find(f);
const pmIn = has((e) => e.action === "auth.sign_in" && e.outcome === "ok" && e.role === "pm");
check("AUDIT-05 sign-in ok rows (cfo, pm, person)", ["cfo", "pm", "person"].every((r) => has((e) => e.action === "auth.sign_in" && e.outcome === "ok" && e.role === r)), fresh.filter((e) => e.action === "auth.sign_in").map((e) => [e.role, e.outcome]));
check("AUDIT-05 failed sign-in as anonymous, no detail", has((e) => e.action === "auth.sign_in" && e.outcome === "failed" && e.actor === "anonymous" && e.role === "anonymous" && e.detail === null));
const pmSet = has((e) => e.action === "dash.settings");
check("AUDIT-02 dash.settings by the PM (same masked code as the PM's sign-in)", pmSet && pmSet.role === "pm" && pmSet.outcome === "ok" && pmSet.actor === pmIn?.actor && /^p-[0-9a-f]{8}$/.test(pmSet.actor), pmSet);
check("AUDIT-06 access.denied personal_finance PUT (cfo)", has((e) => e.action === "access.denied" && e.outcome === "denied" && e.role === "cfo" && e.detail === "personal_finance PUT"));
check("AUDIT-06 access.denied dashboard GET (person)", has((e) => e.action === "access.denied" && e.outcome === "denied" && e.role === "person" && e.detail === "dashboard GET"));
const people = (await http(jars.owner, "GET", "/api/account/access")).json?.people ?? [];
const secrets = [...people.flatMap((p) => [p.email, p.name]), ...Object.values(ACC).map(([e]) => e)].filter((s) => s && s.length > 2);
const blob = JSON.stringify(events);
check("AUDIT-03 masked: actor / target codes only", events.every((e) => /^(owner|anonymous|p-[0-9a-f]{8})$/.test(e.actor) && (e.target === null || /^(owner|[ph]-[0-9a-f]{8})$/.test(e.target))));
check("AUDIT-03 no email, no name from Who has access, no @", !blob.includes("@") && secrets.every((s) => !blob.toLowerCase().includes(s.toLowerCase())), { names: secrets.length });
check("AUDIT-04 detail from the fixed list", events.every((e) => e.detail === null || /^(pf:(none|read|read_write) dash:(none|read|read_write)|(personal_finance|dashboard) [A-Z]+|format:(pdf|png) id:[a-zA-Z_]+)$/.test(e.detail)), [...new Set(events.map((e) => e.detail))]);
check("AUDIT-03 fields exactly id, at, actor, role, action, target, outcome, detail", events.every((e) => JSON.stringify(Object.keys(e)) === '["id","at","actor","role","action","target","outcome","detail"]'));
if (events.length > 3) {
  const p1 = (await http(jars.owner, "GET", "/api/account/audit?limit=2")).json;
  const p2 = (await http(jars.owner, "GET", `/api/account/audit?limit=2&before=${p1.events[1].id}`)).json;
  check("AUDIT-07 paging: limit, more, before", p1.events.length === 2 && p1.more === true && p2.events[0].id < p1.events[1].id, [p1.events.map((e) => e.id), p2.events.map((e) => e.id)]);
}
check("AUDIT-07 CFO 403", (await http(jars.cfo, "GET", "/api/account/audit")).status === 403);
check("AUDIT-07 PM 403", (await http(jars.pm, "GET", "/api/account/audit")).status === 403);
check("AUDIT-07 signed out 401", (await http(null, "GET", "/api/account/audit")).status === 401);
check("AUDIT-07 POST 405", (await http(jars.owner, "POST", "/api/account/audit", {})).status === 405);

// ---------------------------------------------------------------- browser
const browser = await chromium.launch();
const NIGHT = "rgb(30, 33, 36)";
const toCookies = (jar) => [...jar.c].map(([name, value]) => ({ name, value, url: base }));
try {
  for (const [vp, viewport] of [["phone360", { width: 360, height: 780 }], ["desktop", { width: 1440, height: 900 }]]) {
    for (const who of ["owner", "cfo"]) {
      const tag = `[${vp}] [${who}] /account`;
      const ctx = await browser.newContext({ viewport });
      await ctx.addCookies(toCookies(jars[who]));
      await ctx.addInitScript(() => {
        window.__cls = 0;
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
        }).observe({ type: "layout-shift", buffered: true });
      });
      const page = await ctx.newPage();
      const resp = await page.goto(`${base}/account`, { waitUntil: "networkidle" });
      await page.waitForTimeout(800);
      const section = page.locator('[data-testid="account-activity"]');
      if (who === "cfo") {
        check(`${tag} AUDIT-08 no Activity section for a grantee`, resp?.status() === 200 && (await section.count()) === 0);
        await ctx.close();
        continue;
      }
      const m = await page.evaluate(() => {
        const sec = document.querySelector('[data-testid="account-activity"]');
        const box = sec?.querySelector(".account-audit-box");
        const all = [...document.querySelectorAll("body *")];
        const colours = new Set(all.flatMap((el) => { const s = getComputedStyle(el); return [s.color, s.backgroundColor, s.borderTopColor]; }));
        return {
          numeral: sec?.querySelector(".pf-label")?.textContent,
          title: sec?.querySelector("h2")?.textContent,
          cols: [...(sec?.querySelectorAll("th") ?? [])].map((t) => t.textContent),
          rows: [...(sec?.querySelectorAll('[data-testid="account-activity-row"]') ?? [])].map((r) => [...r.querySelectorAll("td")].map((c) => c.textContent)),
          more: !!sec?.querySelector('[data-testid="account-activity-older"]'),
          boxScroll: box ? box.scrollWidth > box.clientWidth : null,
          scroll: document.scrollingElement.scrollWidth - window.innerWidth,
          bg: getComputedStyle(document.body).backgroundColor,
          scheme: getComputedStyle(document.documentElement).colorScheme,
          lyre: !!document.querySelector('nav[aria-label="Site"] svg'),
          footer: document.querySelector("footer")?.textContent?.trim(),
          robots: document.querySelector('meta[name="robots"]')?.content,
          gold: [...colours].filter((c) => { const m = c.match(/rgba?\((\d+), (\d+), (\d+)/); if (!m) return false; const [r, g, b] = m.slice(1).map(Number); return r > 150 && g > 110 && b < 90 && r - b > 90; }),
          cls: window.__cls,
        };
      });
      check(`${tag} 200`, resp?.status() === 200, resp?.status());
      check(`${tag} AUDIT-08 06 Activity, columns`, m.numeral === "06" && m.title === "Activity" && JSON.stringify(m.cols) === '["When","Who","Role","Action","Target","Result"]', [m.numeral, m.title, m.cols]);
      check(`${tag} AUDIT-08 rows newest first, ET times, masked codes`, m.rows.length > 0 && m.rows.every((r) => /^\d{4}-\d\d-\d\d \d\d:\d\d ET$/.test(r[0]) && /^(owner|anonymous|p-[0-9a-f]{8})$/.test(r[1])) && !JSON.stringify(m.rows).includes("@"), m.rows.slice(0, 3));
      if (m.more) {
        const before = m.rows.length;
        await page.locator('[data-testid="account-activity-older"]').click();
        await page.waitForFunction((n) => document.querySelectorAll('[data-testid="account-activity-row"]').length > n, before, { timeout: 15000 }).catch(() => {});
        const after = await page.locator('[data-testid="account-activity-row"]').count();
        check(`${tag} AUDIT-08 Show older appends`, after > before, [before, after]);
      }
      check(`${tag} AUDIT-09 dark shell: charcoal, color-scheme dark, lyre, footer Orpheus Wisdom, noindex`, m.bg === NIGHT && /dark/.test(m.scheme) && m.lyre && m.footer === "Orpheus Wisdom" && m.robots === "noindex, nofollow" && resp?.headers()["x-robots-tag"] === "noindex, nofollow", m);
      check(`${tag} AUDIT-09 no gold`, m.gold.length === 0, m.gold);
      check(`${tag} AUDIT-09 no horizontal page scroll${viewport.width < 640 ? " (the table scrolls in its box)" : ""}`, m.scroll <= 0, [m.scroll, m.boxScroll]);
      check(`${tag} AUDIT-09 strict CLS 0`, m.cls === 0, m.cls);
      await page.screenshot({ path: join(CFG.out, `audit-${vp}.png`), fullPage: true });
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  // Leave no QA session behind (each API sign-in above; the browser contexts reused them).
  for (const jar of Object.values(jars)) if (jar) await http(jar, "POST", "/api/auth/sign-out", {});
}
const failedN = R.filter((r) => !r.pass).length;
writeFileSync(join(CFG.out, "audit.json"), JSON.stringify(R, null, 2));
console.log(`\n${R.length - failedN}/${R.length} passed${failedN ? ` · ${failedN} FAILED` : ""} · out ${CFG.out}`);
process.exit(failedN ? 1 : 0);
