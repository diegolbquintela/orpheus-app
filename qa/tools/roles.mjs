// Roles and account (#90; design attachments/roles-and-account-design.md, ROLE-01..22 in qa/CANONICAL-AC-PACK.md):
// four accounts — the owner (ORPHEUS_OWNER_EMAIL), a CFO with Personal Finance `Read`, a Portfolio Manager with
// Dashboard `Read and write` and one with no grant — through the API and in a real browser at 360 × 780, 400 × 860,
// 1024 × 800 and 1440 × 900.
//
//   API: ROLE-02 (307 + safeNext), -03/-04 (/account sections and role lines per person), -07 (Add person: a
//   temporary password once, no-store; an existing email gets grants only), -08 (forced change: 307 to /account, APIs
//   403, then open), -05 (password errors, other sessions signed out, old password refused), -06 (email: in use,
//   success, owner 403), -09 (sign-up refused off the allow-list; no Create an account), -10..13 (CFO / Portfolio
//   Manager Read and Read and write on the OWNER's data; own section toggles; PF DELETE owner-only), -14 (no grant:
//   403 page and APIs), -15, -16 (grant change applies on the next request; Remove signs out, account stays), -17
//   (/api/account/access owner-only, no widening by userId), -18 (Reset password), -19 (Who has access per person),
//   -20 (Fetch Metadata: cross-site / same-site writes 403); #215 PFSC-03 / -13 / -15 / -16 (scenario save gating; #208 HTL-05 no grant).
//   Browser: ROLE-01 (bar: the person glyph below 640 px, the word from 640, accessible name Account, one line),
//   ROLE-10 / -12 read-only pages, ROLE-14 the 403 page, ROLE-21 (/account, the forced-change view and the 403 page:
//   44 px controls, AA contrast scan + axe-core with AXE_PATH, no horizontal scroll, strict CLS 0).
//
// Accounts. Never logged, never written to the out dir:
//   --bootstrap (localhost only, a THROWAWAY database): the owner signs up (QA_OWNER_EMAIL, default
//     qa-owner@orpheus.test, must equal the server's ORPHEUS_OWNER_EMAIL and be on its allow-list) with a password
//     generated in memory, then creates the three others through Add person; their temporary passwords stay in
//     memory and are changed at once (ROLE-08). The account-changing checks (-05, -06, -07, -18) use one more
//     throwaway person.
//   Otherwise (a preview with ORPHEUS_OWNER_EMAIL and the four QA accounts set by EL): QA_OWNER_EMAIL /
//     QA_OWNER_PASSWORD, QA_CFO_EMAIL / QA_CFO_PASSWORD, QA_PM_EMAIL / QA_PM_PASSWORD, QA_NONE_EMAIL /
//     QA_NONE_PASSWORD from env. The owner sets the three grants; the owner's Personal Finance record and dashboard
//     settings are restored at the end. Checks that create, reset or rename accounts are skipped (INFO) unless
//     --mutate-accounts.
// Refuses production (the status diagnostics must be present) and stops with BLOCKED when ORPHEUS_OWNER_EMAIL is not
// set on the deployment.
//
//   [AXE_PATH=…] node qa/tools/roles.mjs --base-url http://127.0.0.1:<port> --out <dir> --bootstrap
import { chromium } from "playwright";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { qaConfig } from "./config.mjs";
import { refuseIfProd } from "./prod-guard.mjs";
import { contrastScan } from "./pf-helpers.mjs";

const CFG = qaConfig(import.meta.url);
// #157 (QA run 2026-10-17 F2, EL): refuse production before any request or sign-in (qa/tools/prod-guard.mjs).
await refuseIfProd(CFG.baseUrl, "roles");
const base = CFG.baseUrl;
const argv = process.argv.slice(2);
const LOCAL = ["localhost", "127.0.0.1"].includes(new URL(base).hostname);
const BOOTSTRAP = argv.includes("--bootstrap");
const MUTATE = LOCAL || argv.includes("--mutate-accounts");
const R = { base, checks: [], shots: [], info: [] };
const check = (name, ok, detail) => {
  R.checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail !== undefined ? ` · ${JSON.stringify(detail)}` : ""}`);
};
const info = (msg) => {
  R.info.push(msg);
  console.log(`INFO ${msg}`);
};
const secret = () => `qa-${randomBytes(18).toString("base64url")}`;
const VIEWPORTS = [
  ["360", { width: 360, height: 780 }, true],
  ["400", { width: 400, height: 860 }, true],
  ["1024", { width: 1024, height: 800 }, false],
  ["1440", { width: 1440, height: 900 }, false],
];
const AXE = process.env.AXE_PATH ? readFileSync(process.env.AXE_PATH, "utf8") : null;
if (!AXE) info("axe-core not run (set AXE_PATH to axe.min.js); the contrast scan still runs");

// ------------------------------------------------------------------ HTTP with a cookie jar per person
class Jar {
  c = new Map();
  header() {
    return [...this.c].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  take(res) {
    for (const sc of res.headers.getSetCookie()) {
      const kv = sc.split(";")[0];
      const i = kv.indexOf("=");
      const k = kv.slice(0, i);
      const v = kv.slice(i + 1);
      if (!v || /max-age=0\b/i.test(sc)) this.c.delete(k);
      else this.c.set(k, v);
    }
  }
}
async function http(jar, method, path, body, extra = {}) {
  const headers = { origin: base, accept: "application/json, text/html", ...extra };
  if (jar?.c.size) headers.cookie = jar.header();
  if (body !== undefined) headers["content-type"] = "application/json";
  const r = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
  jar?.take(r);
  const text = await r.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined; // HTML or empty
  }
  return { status: r.status, location: r.headers.get("location"), cc: r.headers.get("cache-control"), robots: r.headers.get("x-robots-tag"), text, json };
}
const err = (r) => r.json?.error;
// Better Auth rate-limits sign-in (a few per 10 s per IP on Vercel): wait and retry on 429.
async function signIn(email, password) {
  for (let i = 0; i < 6; i++) {
    const jar = new Jar();
    const r = await http(jar, "POST", "/api/auth/sign-in/email", { email, password });
    if (r.status === 429) {
      await new Promise((ok) => setTimeout(ok, 11000));
      continue;
    }
    return r.status === 200 ? jar : null;
  }
  return null;
}
const h2s = (html) => [...html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1]);
const roleLines = (html) => [...html.matchAll(/data-testid="account-role"[^>]*>([^<]*)</g)].map((m) => m[1]);
const pathOf = (loc) => (loc ? new URL(loc, base).pathname : null);

// ------------------------------------------------------------------ guard
const status = await http(null, "GET", "/api/dashboard/status");
if (!status.json || !("signIn" in status.json)) {
  console.error(`[roles] refusing: ${base} shows no sign-in diagnostics (production, or the flag is off): ${status.status} ${status.text.slice(0, 80)}`);
  process.exit(2);
}
if (status.json.ownerEmail !== "set") {
  console.error(`[roles] BLOCKED: ORPHEUS_OWNER_EMAIL is not set on ${base} (status ownerEmail=${status.json.ownerEmail}); nobody has access to Personal Finance or the Dashboard until EL sets it.`);
  writeFileSync(join(CFG.out, "roles.json"), JSON.stringify({ ...R, blocked: "ORPHEUS_OWNER_EMAIL not set" }, null, 2));
  process.exit(3);
}
if (BOOTSTRAP && !LOCAL) {
  console.error("[roles] --bootstrap is for a local throwaway database only");
  process.exit(2);
}

// ------------------------------------------------------------------ accounts
const people = {};
const P = (key, name, email, password) => (people[key] = { key, name, email, password, jar: null, id: null });
const OWNER_EMAIL = process.env.QA_OWNER_EMAIL ?? "qa-owner@orpheus.test";
const PF_RECORD = {
  "orpheus.finance.income.v1": JSON.stringify({ people: [{ id: "p1", name: "Ana", wages: "100000", bonus: "", tax: "30", share: "100", countWages: true, countBonus: true }] }),
  "orpheus.finance.currency.v1": JSON.stringify("CAD"),
  // #119 (ROLE-10 amendment): two accounts and a category so the read-only filters can be exercised.
  "orpheus.finance.expenses.v2": JSON.stringify({
    fixed: [
      { id: "r1", name: "Rent", amount: "1000", per: "month", equity: "", account: "Chase", currency: "", rate: "", category: "Home" },
      { id: "r2", name: "Car", amount: "300", per: "month", equity: "", account: "Amex", currency: "", rate: "", category: "" },
    ],
    variable: [{ id: "r3", name: "Food", amount: "200", per: "month", equity: "", account: "", currency: "", rate: "", category: "" }],
    accounts: ["Chase", "Amex"],
    categories: ["Home"],
  }),
};
let restore = null;

if (BOOTSTRAP) {
  const owner = P("owner", "QA Owner", OWNER_EMAIL, secret());
  const up = await http(new Jar(), "POST", "/api/auth/sign-up/email", { email: owner.email, password: owner.password, name: owner.name });
  check("bootstrap: the owner signs up (allow-listed)", up.status === 200, up.status);
} else {
  for (const [key, env] of [["owner", "OWNER"], ["cfo", "CFO"], ["pm", "PM"], ["none", "NONE"]]) {
    const email = process.env[`QA_${env}_EMAIL`];
    const password = process.env[`QA_${env}_PASSWORD`];
    if (!email || !password) {
      console.error(`[roles] QA_${env}_EMAIL / QA_${env}_PASSWORD not set in env (or use --bootstrap locally)`);
      process.exit(2);
    }
    P(key, key, email, password);
  }
}
people.owner.jar = await signIn(people.owner.email, people.owner.password);
check("owner signs in", Boolean(people.owner.jar));
if (!people.owner.jar) process.exit(1);
const ownerMe = await http(people.owner.jar, "GET", "/api/account/me");
check("owner: /api/account/me owner=true, roles [Owner]", ownerMe.json?.owner === true && JSON.stringify(ownerMe.json?.roles) === '["Owner"]', ownerMe.json && { owner: ownerMe.json.owner, roles: ownerMe.json.roles });
const O = people.owner.jar;
const access = (method, body, query = "") => http(O, method, `/api/account/access${query}`, body);
const grants = (pf, dash) => ({ personal_finance: pf, dashboard: dash });

async function addPerson(key, name, email, g) {
  const r = await access("POST", { name, email, ...g });
  const temporary = r.json?.temporaryPassword;
  const p = P(key, name, email, null);
  p.id = r.json?.people?.find((x) => x.email === email)?.id ?? null;
  return { r, temporary, p };
}
// The forced change (ROLE-08) on a fresh person: the temporary password works only for /account.
async function forcedChange(p, temporary, tag) {
  const jar = await signIn(p.email, temporary);
  check(`${tag} ROLE-08 the temporary password signs in`, Boolean(jar));
  if (!jar) return;
  const pf = await http(jar, "GET", "/personal-finance");
  const dash = await http(jar, "GET", "/dashboard");
  check(`${tag} ROLE-08 /personal-finance and /dashboard → 307 /account`, pf.status === 307 && pathOf(pf.location) === "/account" && dash.status === 307 && pathOf(dash.location) === "/account", [pf.status, pf.location, dash.status, dash.location]);
  const apis = await Promise.all(["/api/personal-finance", "/api/dashboard/holdings", "/api/dashboard/settings", "/api/dashboard/columns", "/api/account/who"].map((u) => http(jar, "GET", u)));
  check(`${tag} ROLE-08 every PF / Dashboard API → 403 (Who has access empty)`, apis.slice(0, 4).every((a) => a.status === 403) && apis[4].json?.people?.length === 0, apis.map((a) => a.status));
  const page = await http(jar, "GET", "/account");
  check(`${tag} ROLE-08 /account shows You and Password only, with "Set a new password to continue."`, page.status === 200 && JSON.stringify(h2s(page.text)) === '["You","Password"]' && /Set a new password to continue\./.test(page.text), h2s(page.text));
  p.password = secret();
  const ch = await http(jar, "POST", "/api/account/password", { currentPassword: temporary, newPassword: p.password });
  check(`${tag} ROLE-08 Save the new password`, ch.status === 200, ch.status);
  p.jar = jar;
}

const created = [];
if (BOOTSTRAP) {
  for (const [key, name, email, g] of [
    ["cfo", "QA CFO", "qa-cfo@orpheus.test", grants("read", "none")],
    ["pm", "QA Portfolio Manager", "qa-pm@orpheus.test", grants("none", "read_write")],
    ["none", "QA No access", "qa-none@orpheus.test", grants("none", "none")],
  ]) {
    const { r, temporary, p } = await addPerson(key, name, email, g);
    check(`ROLE-07 Add person ${key}: 201, a temporary password ≥ 16 characters, Cache-Control no-store`, r.status === 201 && typeof temporary === "string" && temporary.length >= 16 && /no-store/.test(r.cc ?? ""), { status: r.status, length: temporary?.length, cc: r.cc });
    await forcedChange(p, temporary, `[${key}]`);
    created.push(key);
  }
} else {
  const list = await access("GET");
  for (const key of ["cfo", "pm", "none"]) {
    people[key].id = list.json?.people?.find((x) => x.email.toLowerCase() === people[key].email.toLowerCase())?.id ?? null;
    check(`preview: ${key} exists`, Boolean(people[key].id));
  }
  for (const [key, g] of [["cfo", grants("read", "none")], ["pm", grants("none", "read_write")], ["none", grants("none", "none")]]) {
    const r = await access("PUT", { userId: people[key].id, ...g });
    check(`preview: the owner sets ${key}'s grants`, r.status === 200, r.status);
  }
  for (const key of ["cfo", "pm", "none"]) {
    people[key].jar = await signIn(people[key].email, people[key].password);
    check(`preview: ${key} signs in (EL-provided preview password used)`, Boolean(people[key].jar));
  }
}
const { cfo, pm, none } = people;
if (!cfo.jar || !pm.jar || !none.jar) {
  console.error("[roles] a person could not sign in; stopping");
  process.exit(1);
}
const ids = Object.fromEntries(Object.values(people).map((p) => [p.key, p.id]));
ids.owner = ownerMe.json ? (await access("GET")).json?.people?.find((x) => x.owner)?.id : null;

// The owner's record and settings, restored at the end.
{
  const pf = await http(O, "GET", "/api/personal-finance");
  const st = await http(O, "GET", "/api/dashboard/settings");
  const cols = await http(O, "GET", "/api/dashboard/columns");
  restore = { pf: pf.json?.data ?? null, settings: st.json?.settings, columns: cols.json?.columns };
  const put = await http(O, "PUT", "/api/personal-finance", { data: PF_RECORD });
  check("owner: PUT a known Personal Finance record", put.status === 200, put.status);
}

try {
  // ---------------------------------------------------------------- ROLE-02 / -03 / -04 / -09
  {
    const out = await http(null, "GET", "/account");
    const to = out.location ? new URL(out.location, base) : null;
    check("ROLE-02 signed out /account → 307 /dashboard/sign-in?next=/account", out.status === 307 && to?.pathname === "/dashboard/sign-in" && to.searchParams.get("next") === "/account", [out.status, out.location]);
    const back = await http(O, "GET", "/dashboard/sign-in?next=%2Faccount");
    check("ROLE-02 signed in, ?next=/account returns to /account", back.status >= 300 && back.status < 400 && pathOf(back.location) === "/account", [back.status, back.location]);
    const signIn = await http(null, "GET", "/dashboard/sign-in");
    check("ROLE-09 sign-in has no Create an account / create-account mode", signIn.status === 200 && !/Create an account|Create account|sign-in-switch/.test(signIn.text.replace(/<nav[\s\S]*?<\/nav>/, "")));
    const up = await http(new Jar(), "POST", "/api/auth/sign-up/email", { email: `qa-not-invited-${Date.now()}@example.invalid`, password: secret(), name: "x" });
    check("ROLE-09 sign-up off the allow-list → 403", up.status === 403, up.status);
    const want = {
      owner: [["You", "Password", "Email", "Who has access", "Grant access", "Activity"], ["Owner"]], // #91 AUDIT-08 adds 06 Activity
      cfo: [["You", "Password", "Email", "Who has access"], ["CFO · Personal Finance · Read"]],
      pm: [["You", "Password", "Email", "Who has access"], ["Portfolio Manager · Dashboard · Read and write"]],
      none: [["You", "Password", "Email", "Who has access"], ["No access"]],
    };
    for (const [key, [sections, roles]] of Object.entries(want)) {
      const r = await http(people[key].jar, "GET", "/account");
      check(`[${key}] ROLE-03 / -04 /account: sections ${sections.join(" / ")}; role lines ${roles.join(" / ")}; title, noindex`, r.status === 200 && JSON.stringify(h2s(r.text)) === JSON.stringify(sections) && JSON.stringify(roleLines(r.text)) === JSON.stringify(roles) && /<title>Account · Orpheus Wisdom<\/title>/.test(r.text) && /noindex/.test(r.robots ?? "") && !(key !== "owner" && /data-testid="account-grant"/.test(r.text)), { sections: h2s(r.text), roles: roleLines(r.text) });
    }
    const ownerEmail = await http(O, "POST", "/api/account/email", { newEmail: "qa-other@orpheus.test", currentPassword: people.owner.password });
    check("ROLE-06 the owner's email can't change: 403 and the line on /account", ownerEmail.status === 403 && err(ownerEmail) === "Owner email can't be changed here.", [ownerEmail.status, err(ownerEmail)]);
  }

  // ---------------------------------------------------------------- ROLE-10 / -11 (CFO)
  {
    const r = await http(cfo.jar, "GET", "/api/personal-finance");
    const same = Object.entries(PF_RECORD).every(([k, v]) => r.json?.data?.[k] === v);
    check("ROLE-10 CFO Read: GET /api/personal-finance → the owner's record, access write=false", r.status === 200 && same && r.json?.access?.write === false && r.json?.access?.owner === false, { status: r.status, same, access: r.json?.access });
    const put = await http(cfo.jar, "PUT", "/api/personal-finance", { data: { ...PF_RECORD, "orpheus.finance.currency.v1": JSON.stringify("USD") } });
    const del = await http(cfo.jar, "DELETE", "/api/personal-finance");
    check("ROLE-10 CFO Read: PUT / DELETE → 403", put.status === 403 && del.status === 403, [put.status, del.status]);
    // #197 (spec 54, PFVW, 2026-10-21): PUT /view needs write; Read → 403 and nothing stored (this replaces the Q-D11 check).
    const before = await http(cfo.jar, "GET", "/api/personal-finance");
    const view = await http(cfo.jar, "PUT", "/api/personal-finance/view", { view: JSON.stringify({ closed: ["income"] }) });
    const again = await http(cfo.jar, "GET", "/api/personal-finance");
    const ownerRec = await http(O, "GET", "/api/personal-finance");
    check("ROLE-10 / PFVW-03 CFO Read: PUT /api/personal-finance/view → 403, the CFO's view and the owner's record unchanged", view.status === 403 && again.json?.data?.["orpheus.finance.view.v1"] === before.json?.data?.["orpheus.finance.view.v1"] && ownerRec.json?.data?.["orpheus.finance.view.v1"] !== JSON.stringify({ closed: ["income"] }), { view: view.status, cfoView: again.json?.data?.["orpheus.finance.view.v1"] ?? null, ownerView: ownerRec.json?.data?.["orpheus.finance.view.v1"] ?? null });
    const page = await http(cfo.jar, "GET", "/personal-finance");
    check("ROLE-10 CFO Read: /personal-finance 200 with `Read only` (the locked fields are checked in the browser)", page.status === 200 && /data-testid="read-only"[^>]*>Read only</.test(page.text), page.status);
    // #215 (spec 55, PFSC-15 / -16 / -13; QA AK1, 2026-10-22): the scenario save uses the record route, so it needs
    // write. #208 AL3 (spec 61.3): these run while the CFO still has the Read grant from setup, BEFORE the ROLE-11
    // Read-and-write flip, and the no-grant user is checked too. The owner's record is restored to PF_RECORD at the end.
    const SC = "orpheus.finance.scenario.v1";
    const lev = JSON.stringify({ income: {}, expenses: {}, rate: 3, growth: null, start: null });
    const scRead = await http(cfo.jar, "PUT", "/api/personal-finance", { data: { ...PF_RECORD, [SC]: lev } });
    const scAfterRead = await http(O, "GET", "/api/personal-finance");
    const scNone = await http(none.jar, "PUT", "/api/personal-finance", { data: { ...PF_RECORD, [SC]: lev } });
    const scAfterNone = await http(O, "GET", "/api/personal-finance");
    check("HTL-05 no grant: saving a scenario → 403 and nothing stored", scNone.status === 403 && scAfterNone.json?.data?.[SC] === undefined, [scNone.status, scAfterNone.json?.data?.[SC] ?? null]);
    const scNonePage = await http(none.jar, "GET", "/personal-finance/scenario");
    check("HTL-05 no grant: /personal-finance/scenario → 403", scNonePage.status === 403, scNonePage.status);
    check("PFSC-15 CFO Read: saving a scenario → 403 and nothing stored", scRead.status === 403 && scAfterRead.json?.data?.[SC] === undefined, [scRead.status, scAfterRead.json?.data?.[SC] ?? null]);
    const scBad = await http(O, "PUT", "/api/personal-finance", { data: { ...PF_RECORD, [SC]: JSON.stringify({ income: { a: 5000 } }) } });
    check("PFSC-16 an invalid scenario value → 400 { field: scenario }", scBad.status === 400 && scBad.json?.field === "scenario", [scBad.status, scBad.json]);
    const scSave = await http(O, "PUT", "/api/personal-finance", { data: { ...PF_RECORD, [SC]: lev } });
    const scSeen = await http(cfo.jar, "GET", "/api/personal-finance");
    const scSame = Object.entries(PF_RECORD).every(([k, v]) => scSeen.json?.data?.[k] === v);
    check("PFSC-13 the owner saves a scenario (200); Read GETs it; every other record value unchanged", scSave.status === 200 && scSeen.json?.data?.[SC] === lev && scSame, [scSave.status, scSeen.json?.data?.[SC] ?? null, scSame]);
    const scReset = await http(O, "PUT", "/api/personal-finance", { data: PF_RECORD });
    const scGone = await http(O, "GET", "/api/personal-finance");
    check("PFSC-13 reset: the owner's record is back to PF_RECORD (no scenario value)", scReset.status === 200 && scGone.json?.data?.[SC] === undefined, scReset.status);
    const scPage = await http(cfo.jar, "GET", "/personal-finance/scenario");
    check("PFSC-03 CFO Read: /personal-finance/scenario 200", scPage.status === 200, scPage.status);
    // ROLE-11: Read and write.
    await access("PUT", { userId: cfo.id, ...grants("read_write", "none") });
    const w = await http(cfo.jar, "PUT", "/api/personal-finance", { data: { ...PF_RECORD, "orpheus.finance.currency.v1": JSON.stringify("USD") } });
    const seen = await http(O, "GET", "/api/personal-finance");
    check("ROLE-11 CFO Read and write: the edit lands on the owner's record (the owner sees it)", w.status === 200 && seen.json?.data?.["orpheus.finance.currency.v1"] === JSON.stringify("USD"), [w.status, seen.json?.data?.["orpheus.finance.currency.v1"]]);
    // #197 PFVW-02: with Read and write the CFO's toggles are stored, and stay theirs (never the owner's record).
    const vw = await http(cfo.jar, "PUT", "/api/personal-finance/view", { view: JSON.stringify({ closed: ["income"] }) });
    const cfoView = await http(cfo.jar, "GET", "/api/personal-finance");
    const seen2 = await http(O, "GET", "/api/personal-finance");
    check("ROLE-11 / PFVW-02 the CFO's toggles are stored (200) and stay theirs", vw.status === 200 && cfoView.json?.data?.["orpheus.finance.view.v1"] === JSON.stringify({ closed: ["income"] }) && seen2.json?.data?.["orpheus.finance.view.v1"] !== JSON.stringify({ closed: ["income"] }), vw.status);
    const del2 = await http(cfo.jar, "DELETE", "/api/personal-finance");
    check("ROLE-11 / Q-D13 DELETE /api/personal-finance → 403 for the CFO with Read and write", del2.status === 403, del2.status);
    const pageW = await http(cfo.jar, "GET", "/personal-finance");
    check("ROLE-11 no `Read only` line with Read and write", pageW.status === 200 && !/data-testid="read-only"/.test(pageW.text));
    await access("PUT", { userId: cfo.id, ...grants("read", "none") });
    await http(O, "PUT", "/api/personal-finance", { data: PF_RECORD });
  }

  // ---------------------------------------------------------------- ROLE-12 / -13 (Portfolio Manager)
  {
    const writes = async (jar) => [
      (await http(jar, "POST", "/api/dashboard/holdings", { symbol: "KO", shares: "1", avgCost: "1" })).status,
      (await http(jar, "PUT", "/api/dashboard/holdings/1", { shares: "2" })).status,
      (await http(jar, "DELETE", "/api/dashboard/holdings/1")).status,
      (await http(jar, "PUT", "/api/dashboard/settings", { baseCurrency: "EUR" })).status,
      (await http(jar, "PUT", "/api/dashboard/columns", { columns: ["eps_1y"] })).status,
    ];
    await access("PUT", { userId: pm.id, ...grants("none", "read") });
    const reads = await Promise.all(["/api/dashboard/holdings", "/api/dashboard/settings", "/api/dashboard/columns"].map((u) => http(pm.jar, "GET", u)));
    const ownerReads = await Promise.all(["/api/dashboard/holdings", "/api/dashboard/settings", "/api/dashboard/columns"].map((u) => http(O, "GET", u)));
    check("ROLE-12 PM Read: holdings / settings / columns → the owner's data", reads.every((r, i) => r.status === 200 && r.text === ownerReads[i].text), reads.map((r) => r.status));
    const w = await writes(pm.jar);
    check("ROLE-12 PM Read: POST / PUT / DELETE on holdings, settings, columns → 403", w.every((s) => s === 403), w);
    const refresh = await http(pm.jar, "POST", "/api/dashboard/refresh", {});
    check("ROLE-12 PM Read: POST refresh → 403 (404 off previews)", refresh.status === 403 || (refresh.status === 404 && LOCAL), refresh.status);
    const page = await http(pm.jar, "GET", "/dashboard");
    check("ROLE-12 PM Read: /dashboard 200 with `Read only` and the locked fieldset", page.status === 200 && /data-testid="read-only"[^>]*>Read only</.test(page.text) && /data-testid="dashboard-lock"/.test(page.text), page.status);
    await access("PUT", { userId: pm.id, ...grants("none", "read_write") });
    const put = await http(pm.jar, "PUT", "/api/dashboard/settings", { baseCurrency: "EUR" });
    const seen = await http(O, "GET", "/api/dashboard/settings");
    const cols = await http(pm.jar, "PUT", "/api/dashboard/columns", { columns: ["eps_1y", "roic_1y"] });
    const seenCols = await http(O, "GET", "/api/dashboard/columns");
    check("ROLE-13 PM Read and write: settings and columns land on the owner's portfolio", put.status === 200 && seen.json?.settings?.baseCurrency === "EUR" && cols.status === 200 && JSON.stringify(seenCols.json?.columns) === '["eps_1y","roic_1y"]', [put.status, seen.json?.settings, cols.status, seenCols.json?.columns]);
    const pageW = await http(pm.jar, "GET", "/dashboard");
    check("ROLE-13 no `Read only` line with Read and write", pageW.status === 200 && !/data-testid="read-only"/.test(pageW.text));
    if (restore.settings) await http(O, "PUT", "/api/dashboard/settings", restore.settings);
    if (restore.columns) await http(O, "PUT", "/api/dashboard/columns", { columns: restore.columns });
  }

  // ---------------------------------------------------------------- ROLE-14 / -15
  {
    for (const [who, jar] of [["none", none.jar], ["cfo", cfo.jar]]) {
      const d = await http(jar, "GET", "/dashboard");
      check(`[${who}] ROLE-14 / -15 /dashboard → 403, "You don't have access to the Dashboard.", Account + Home, no data`, d.status === 403 && /data-testid="access-denied-line"[^>]*>You don(&#x27;|')t have access to the Dashboard\.</.test(d.text) && /href="\/account"[^>]*>Account</.test(d.text.replace(/<nav[\s\S]*?<\/nav>/, "")) && !/data-testid="(holding-form|holdings-|dashboard-user)/.test(d.text) && /noindex/.test(d.robots ?? ""), d.status);
    }
    for (const [who, jar] of [["none", none.jar], ["pm", pm.jar]]) {
      const p = await http(jar, "GET", "/personal-finance");
      check(`[${who}] ROLE-14 / -15 /personal-finance → 403, "You don't have access to Personal Finance.", no figures`, p.status === 403 && /You don(&#x27;|')t have access to Personal Finance\./.test(p.text) && !/data-testid="pf-/.test(p.text), p.status);
    }
    const apis = await Promise.all(["/api/personal-finance", "/api/dashboard/holdings", "/api/dashboard/settings", "/api/dashboard/columns"].map((u) => http(none.jar, "GET", u)));
    check("[none] ROLE-14 every PF / Dashboard API → 403", apis.every((a) => a.status === 403), apis.map((a) => a.status));
    // Q-D3: one person with both grants opens both.
    await access("PUT", { userId: cfo.id, ...grants("read", "read") });
    const both = [(await http(cfo.jar, "GET", "/personal-finance")).status, (await http(cfo.jar, "GET", "/dashboard")).status];
    check("ROLE-15 / Q-D3 both grants: both pages open", both.every((s) => s === 200), both);
    const me = await http(cfo.jar, "GET", "/api/account/me");
    check("ROLE-04 both grants: two role lines", JSON.stringify(me.json?.roles) === JSON.stringify(["CFO · Personal Finance · Read", "Portfolio Manager · Dashboard · Read"]), me.json?.roles);
    await access("PUT", { userId: cfo.id, ...grants("read", "none") });
  }

  // ---------------------------------------------------------------- ROLE-16 / -17 / -19 / -20
  {
    await access("PUT", { userId: none.id, ...grants("read", "none") });
    const now = await http(none.jar, "GET", "/api/personal-finance");
    await access("PUT", { userId: none.id, ...grants("none", "none") });
    const gone = await http(none.jar, "GET", "/api/personal-finance");
    check("ROLE-16 a grant change applies on the next request (no new sign-in)", now.status === 200 && gone.status === 403, [now.status, gone.status]);
    const second = await signIn(none.email, none.password);
    const rm = await access("DELETE", undefined, `?userId=${encodeURIComponent(none.id)}`);
    const after = [(await http(none.jar, "GET", "/api/account/me")).status, (await http(second, "GET", "/api/account/me")).status];
    const listed = (await access("GET")).json?.people?.some((x) => x.id === none.id);
    check("ROLE-16 Remove: signs the person out everywhere; the account stays", rm.status === 200 && after.every((s) => s === 401) && listed, { rm: rm.status, after, listed });
    none.jar = await signIn(none.email, none.password);
    check("ROLE-16 the removed person can still sign in (no access)", Boolean(none.jar));

    for (const [who, jar] of [["cfo", cfo.jar], ["pm", pm.jar], ["none", none.jar]]) {
      const s = [
        (await http(jar, "GET", "/api/account/access")).status,
        (await http(jar, "POST", "/api/account/access", { name: "x", email: "qa-x@orpheus.test", ...grants("read_write", "read_write") })).status,
        (await http(jar, "PUT", "/api/account/access", { userId: people[who].id, ...grants("read_write", "read_write") })).status,
        (await http(jar, "DELETE", `/api/account/access?userId=${encodeURIComponent(ids.owner ?? "x")}`)).status,
        (await http(jar, "POST", "/api/account/reset", { userId: ids.owner ?? "x" })).status,
      ];
      check(`[${who}] ROLE-17 /api/account/access (every method) and reset → 403`, s.every((x) => x === 403), s);
    }
    const peek = await http(none.jar, "GET", `/api/personal-finance?userId=${encodeURIComponent(ids.owner ?? "")}`);
    const widen = await http(cfo.jar, "PUT", "/api/personal-finance", { userId: ids.owner, data: PF_RECORD });
    check("ROLE-17 ?userId / a body userId can't widen access", peek.status === 403 && widen.status === 403, [peek.status, widen.status]);
    const self = [(await access("PUT", { userId: ids.owner, ...grants("none", "none") })).status, (await access("DELETE", undefined, `?userId=${encodeURIComponent(ids.owner ?? "")}`)).status];
    check("ROLE-17 the owner's own access can't be edited or removed", self.every((s) => s === 403), self);

    const who = async (jar) => ((await http(jar, "GET", "/api/account/who")).json?.people ?? []).map((x) => x.email.toLowerCase()).sort();
    const all = (await access("GET")).json?.people ?? [];
    const ownerRow = all.find((x) => x.owner);
    check("ROLE-19 the owner sees every person; `Owner` on their own row", [people.owner, cfo, pm, none].every((p) => all.some((x) => x.email.toLowerCase() === p.email.toLowerCase())) && ownerRow?.email.toLowerCase() === people.owner.email.toLowerCase(), all.length);
    const cfoSees = await who(cfo.jar);
    const pmSees = await who(pm.jar);
    const noneSees = await who(none.jar);
    check("ROLE-19 / Q-D14 the CFO sees the owner and the people on Personal Finance, not the Dashboard-only PM or no-grant", cfoSees.includes(people.owner.email.toLowerCase()) && cfoSees.includes(cfo.email) && !cfoSees.includes(pm.email) && !cfoSees.includes(none.email), cfoSees.length);
    check("ROLE-19 the PM sees the owner and the people on the Dashboard only", pmSees.includes(pm.email) && !pmSees.includes(cfo.email) && !pmSees.includes(none.email), pmSees.length);
    check("ROLE-19 no grant: only the owner", noneSees.length === 1 && noneSees[0] === people.owner.email.toLowerCase(), noneSees.length);
    const page = await http(O, "GET", "/account");
    // #91 (AUDIT-08) amends ROLE-19: the history lives only in the owner's 06 Activity; "Who has access" stays current state.
    const whoPart = (page.text.match(/data-testid="account-who"[\s\S]*?<\/section>/) ?? [""])[0];
    check("ROLE-19 no history / timestamps in Who has access (history only in 06 Activity, #91)", whoPart.length > 0 && !/granted_at|updated_at|\b20\d\d-\d\d-\d\d/.test(whoPart));

    const sites = ["cross-site", "same-site"];
    const targets = [
      ["POST", "/api/account/password", { currentPassword: "x", newPassword: "y".repeat(10) }],
      ["POST", "/api/account/email", { newEmail: "x@example.invalid", currentPassword: "x" }],
      ["POST", "/api/account/access", { name: "x", email: "x@example.invalid" }],
      ["PUT", "/api/account/access", { userId: cfo.id, ...grants("read_write", "read_write") }],
      ["DELETE", `/api/account/access?userId=${encodeURIComponent(cfo.id)}`, undefined],
      ["POST", "/api/account/reset", { userId: cfo.id }],
    ];
    const res = [];
    for (const site of sites) for (const [m, u, b] of targets) res.push((await http(O, m, u, b, { "sec-fetch-site": site })).status);
    const cfoStill = (await access("GET")).json?.people?.find((x) => x.id === cfo.id)?.grants;
    check("ROLE-20 cross-site / same-site writes to every /api/account/* → 403 (nothing changed)", res.every((s) => s === 403) && cfoStill?.personal_finance === "read", res);
  }

  // ---------------------------------------------------------------- ROLE-05 / -06 / -07 / -18 (a throwaway person)
  if (!MUTATE) info("ROLE-05 / -06 / -07 / -18 skipped: they create, reset or rename an account (run locally with --bootstrap, or pass --mutate-accounts)");
  else {
    const tmpEmail = `qa-roles-tmp-${Date.now()}@orpheus.test`;
    const { r, temporary, p } = await addPerson("tmp", "QA Temporary", tmpEmail, grants("read", "none"));
    check("[tmp] ROLE-07 Add person: 201 + one temporary password, no-store", r.status === 201 && temporary?.length >= 16 && /no-store/.test(r.cc ?? ""), { status: r.status, cc: r.cc });
    const again = await access("POST", { name: "QA Temporary", email: tmpEmail.toUpperCase(), ...grants("read", "read") });
    check("[tmp] ROLE-07 an existing email gets grants only (no new password)", again.status === 200 && again.json?.created === false && again.json?.temporaryPassword == null, { status: again.status, created: again.json?.created });
    const reload = await http(O, "GET", "/account");
    check("[tmp] ROLE-07 nothing of the temporary password after a reload", !reload.text.includes(temporary ?? "\u0000"));
    await forcedChange(p, temporary, "[tmp]");
    const jar = p.jar;
    const other = await signIn(p.email, p.password);
    const e1 = await http(jar, "POST", "/api/account/password", { currentPassword: "", newPassword: secret() });
    const e2 = await http(jar, "POST", "/api/account/password", { currentPassword: p.password, newPassword: "short" });
    const e3 = await http(jar, "POST", "/api/account/password", { currentPassword: "not-the-password-1", newPassword: secret() });
    check("[tmp] ROLE-05 errors: Enter your current password. / Use 8 or more characters. / That password is not right.", err(e1) === "Enter your current password." && err(e2) === "Use 8 or more characters." && err(e3) === "That password is not right.", [err(e1), err(e2), err(e3)]);
    const old = p.password;
    p.password = secret();
    const ok = await http(jar, "POST", "/api/account/password", { currentPassword: old, newPassword: p.password });
    const otherMe = await http(other, "GET", "/api/account/me");
    const stillMe = await http(jar, "GET", "/api/account/me");
    check("[tmp] ROLE-05 Save: this session stays, the other session is signed out", ok.status === 200 && otherMe.status === 401 && stillMe.status === 200, [ok.status, otherMe.status, stillMe.status]);
    check("[tmp] ROLE-05 the new password signs in and the old one doesn't", Boolean(await signIn(p.email, p.password)) && !(await signIn(p.email, old)));
    const inUse = await http(jar, "POST", "/api/account/email", { newEmail: cfo.email, currentPassword: p.password });
    const ownerTaken = await http(jar, "POST", "/api/account/email", { newEmail: people.owner.email, currentPassword: p.password });
    const wrong = await http(jar, "POST", "/api/account/email", { newEmail: `x-${tmpEmail}`, currentPassword: "not-the-password-1" });
    check("[tmp] ROLE-06 an email in use (the owner's too) → That email is already in use.; a wrong password refused", err(inUse) === "That email is already in use." && err(ownerTaken) === "That email is already in use." && err(wrong) === "That password is not right.", [err(inUse), err(ownerTaken), err(wrong)]);
    const second = await signIn(p.email, p.password);
    const newEmail = `qa-roles-renamed-${Date.now()}@orpheus.test`;
    const moved = await http(jar, "POST", "/api/account/email", { newEmail, currentPassword: p.password });
    const secondMe = await http(second, "GET", "/api/account/me");
    check("[tmp] ROLE-06 email changed: the new email signs in, the old one doesn't, other sessions signed out", moved.status === 200 && Boolean(await signIn(newEmail, p.password)) && !(await signIn(p.email, p.password)) && secondMe.status === 401, [moved.status, secondMe.status]);
    p.email = newEmail;
    const reset = await http(O, "POST", "/api/account/reset", { userId: p.id });
    const temp2 = reset.json?.temporaryPassword;
    const meAfter = await http(jar, "GET", "/api/account/me");
    check("[tmp] ROLE-18 Reset password: a new temporary password (no-store), sessions revoked, the old password refused", reset.status === 200 && temp2?.length >= 16 && /no-store/.test(reset.cc ?? "") && meAfter.status === 401 && !(await signIn(p.email, p.password)), { status: reset.status, me: meAfter.status });
    // The browser's forced-change view uses this person (temporary password in memory only).
    p.temporary = temp2;
  }

  // ---------------------------------------------------------------- browser: ROLE-01 / -10 / -12 / -14 / -21
  const browser = await chromium.launch();
  const NIGHT = "rgb(30, 33, 36)";
  try {
    const visits = [
      ["signed-out", null, "/", "home"],
      ["owner", people.owner, "/account", "account-owner"],
      ["cfo", cfo, "/personal-finance", "pf-read-only"],
      ["cfo", cfo, "/dashboard", "denied-dashboard"],
      ["none", none, "/personal-finance", "denied-pf"],
      ["none", none, "/account", "account-none"],
      ["pm", pm, "/dashboard", "dashboard-pm"],
    ];
    if (people.tmp?.temporary) visits.push(["tmp", { ...people.tmp, password: people.tmp.temporary }, "/account", "account-forced-change"]);
    for (const [vp, viewport, mobile] of VIEWPORTS) {
      for (const [who, person, path, name] of visits) {
        // The forced-change view is checked once, at the last width (the temporary password is one-time use only in spirit: it stays valid until changed).
        const tag = `[${vp}] [${who}] ${path}`;
        const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
        await ctx.addInitScript(() => {
          window.__cls = 0;
          new PerformanceObserver((l) => {
            for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
          }).observe({ type: "layout-shift", buffered: true });
        });
        const page = await ctx.newPage();
        page.setDefaultTimeout(30000);
        try {
          if (person) {
            let login;
            for (let i = 0; i < 6; i++) {
              login = await page.request.post(`${base}/api/auth/sign-in/email`, { data: { email: person.email, password: person.password }, headers: { origin: base } });
              if (login.status() !== 429) break;
              await page.waitForTimeout(11000);
            }
            if (!login.ok()) {
              check(`${tag} sign-in`, false, login.status());
              continue;
            }
          }
          const resp = await page.goto(base + path, { waitUntil: "networkidle" });
          await page.waitForTimeout(800);
          const st = resp?.status();
          const bar = await page.locator('nav[aria-label="Site"]').evaluate((n) => {
            const a = n.querySelector('a[href="/account"]');
            const svg = a.querySelector("svg");
            const span = a.querySelector("span");
            const r = a.getBoundingClientRect();
            const links = [...n.querySelectorAll("a")].map((x) => Math.round(x.getBoundingClientRect().top + x.getBoundingClientRect().height / 2));
            return { glyph: getComputedStyle(svg).display !== "none", word: span.getBoundingClientRect().width > 1, w: Math.round(r.width), h: Math.round(r.height), last: a === [...n.querySelectorAll("a")].at(-1), oneLine: Math.max(...links) - Math.min(...links) <= 2, right: Math.round(r.right), current: a.getAttribute("aria-current") };
          });
          const named = await page.locator('nav[aria-label="Site"]').getByRole("link", { name: "Account", exact: true }).count();
          const phone = viewport.width < 640;
          check(`${tag} ROLE-01 Account last, ${phone ? "the person glyph (word visually hidden)" : "the word"}, accessible name Account, ≥ 44 × 44, one line`, bar.last && bar.glyph === phone && bar.word === !phone && named === 1 && bar.w >= 44 && bar.h >= 44 && bar.oneLine && bar.right <= viewport.width, bar);
          check(`${tag} ROLE-01 aria-current on /account only`, (bar.current === "page") === (path === "/account"), bar.current);
          const m = await page.evaluate(() => ({
            scroll: document.scrollingElement.scrollWidth - window.innerWidth,
            cls: window.__cls,
            small: [...document.querySelectorAll("main button, main input, main select, main a")].filter((e) => {
              const r = e.getBoundingClientRect();
              const cs = getComputedStyle(e);
              return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && !e.closest(".sr-only") && r.height < 44 && e.type !== "checkbox";
            }).map((e) => `${e.tagName}:${e.getAttribute("data-testid") ?? e.textContent.trim().slice(0, 20)}:${Math.round(e.getBoundingClientRect().height)}`),
            bg: getComputedStyle(document.body).backgroundColor,
          }));
          check(`${tag} ROLE-21 no horizontal scroll`, m.scroll <= 0, m.scroll);
          check(`${tag} ROLE-21 strict CLS 0`, m.cls === 0, m.cls);
          if (path === "/account" || name.startsWith("denied")) check(`${tag} ROLE-21 dark shell; every control ≥ 44 px tall`, m.bg === NIGHT && m.small.length === 0, m.small.slice(0, 8));
          const scan = await contrastScan(page);
          check(`${tag} ROLE-21 AA contrast for every visible text`, scan.bad.length === 0, scan.bad.length ? scan.bad.slice(0, 5) : { texts: scan.n });
          if (AXE) {
            await page.addScriptTag({ content: AXE });
            const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } })).violations.map((x) => ({ id: x.id, nodes: x.nodes.length })));
            check(`${tag} ROLE-21 axe-core (WCAG 2 A / AA): no violation`, v.length === 0, v);
          }
          if (name === "pf-read-only") {
            await page.locator("[data-testid=pf-area][data-ready=true]").waitFor();
            // #197 (Q-VW1): a Read user's section toggle works for this visit and sends no PUT /view.
            const income = page.locator("[data-testid=pf-toggle-income]");
            const was = await income.getAttribute("aria-expanded");
            let viewPuts = 0;
            const onReq = (q) => { if (new URL(q.url()).pathname === "/api/personal-finance/view" && q.method() === "PUT") viewPuts++; };
            page.on("request", onReq);
            await income.click();
            await page.waitForTimeout(1500);
            page.off("request", onReq);
            const now = await income.getAttribute("aria-expanded");
            check(`${tag} ROLE-10 / PFVW-07 a section toggle works read-only and sends no PUT /view`, now !== was && viewPuts === 0, { was, now, viewPuts });
            if (now !== was) await income.click();
            const lock = await page.evaluate(() => {
              const ctl = [...document.querySelectorAll("main input, main select, main textarea, main button")];
              return { open: ctl.filter((c) => !c.matches(":disabled")).map((c) => c.getAttribute("data-testid")), n: ctl.length, line: document.querySelector("[data-testid=read-only]")?.textContent, ana: [...document.querySelectorAll("main input")].some((i) => i.value === "Ana") || document.querySelector("main").innerText.includes("Ana") };
            });
            check(`${tag} ROLE-10 Read only: the owner's figures (Ana), every control disabled but the section toggles`, st === 200 && lock.line === "Read only" && lock.ana && lock.n > 5 && lock.open.every((t) => /^pf-toggle-|^pf-month$|^pf-filter$|^pf-acct-filter$/.test(t ?? "")), lock);
            // #119 ROLE-10 amendment (S7, EL 07:51): both filters are enabled and work; totals unchanged; writes locked.
            {
              const tot = () => page.evaluate(() => ["fixed", "variable", "all"].map((g) => [...document.querySelectorAll(`[data-testid=pf-total-${g}] .pf-value`)].map((v) => v.textContent.trim())));
              const count = () => page.evaluate(() => ["fixed", "variable"].map((g) => document.querySelectorAll(`[data-testid=pf-group-${g}] [data-testid=pf-line]`).length));
              const t0 = await tot();
              const en = await page.evaluate(() => ["pf-filter", "pf-acct-filter"].map((id) => document.querySelector(`[data-testid=${id}]`)?.matches(":disabled")));
              await page.getByTestId("pf-acct-filter").selectOption("Amex");
              const amex = await count();
              const mark = await page.locator("[data-testid=pf-acct-row][aria-current=true]").getAttribute("data-account").catch(() => null);
              await page.getByTestId("pf-filter").selectOption("Home");
              const both = await count();
              await page.getByTestId("pf-acct-filter").selectOption("");
              const home = await count();
              const t1 = await tot();
              await page.getByTestId("pf-filter").selectOption("");
              const writes = await page.evaluate(() => ["pf-add-fixed", "pf-add-variable", "pf-rename-category", "pf-remove", "pf-name", "pf-monthly", "pf-account", "pf-category", "pf-roic", "pf-household"].map((id) => [id, document.querySelector(`[data-testid=${id}]`)?.matches(":disabled") ?? "absent"]));
              const save = await page.getByTestId("pf-month-save").count();
              check(`${tag} ROLE-10a (#119 S7) read-only filters enabled and work: Amex → 1 line (marked), Amex+Home → 0, Home → 1; totals unchanged`, JSON.stringify(en) === "[false,false]" && JSON.stringify(amex) === "[1,0]" && mark === "Amex" && JSON.stringify(both) === "[0,0]" && JSON.stringify(home) === "[1,0]" && JSON.stringify(t0) === JSON.stringify(t1), { en, amex, mark, both, home, t0, t1 });
              check(`${tag} ROLE-10a (#119 S7) every write stays locked (add incl. the S4 filtered-account path, rename, remove, fields); no Save`, writes.every(([, d]) => d === true) && save === 0, { writes, save });
            }
          }
          if (name.startsWith("denied")) {
            const d = await page.evaluate(() => ({ h1: document.querySelector("h1")?.textContent, line: document.querySelector("[data-testid=access-denied-line]")?.textContent, links: [...document.querySelectorAll("main a")].map((a) => a.textContent) }));
            check(`${tag} ROLE-14 403 page: h1, one line, Account and Home`, st === 403 && d.line && JSON.stringify(d.links) === '["Account","Home"]', { st, ...d });
          }
          if (name === "account-forced-change") {
            const v = await page.evaluate(() => [...document.querySelectorAll("main h2")].map((h) => h.textContent));
            check(`${tag} ROLE-08 / -21 forced-change view: You and Password only`, JSON.stringify(v) === '["You","Password"]', v);
          }
          if (name === "account-owner") {
            const v = await page.evaluate(() => ({ rows: document.querySelectorAll("[data-testid=account-grant-row]").length, add: Boolean(document.querySelector("[data-testid=account-add-form]")) }));
            check(`${tag} ROLE-03 owner: Grant access rows and Add person`, v.rows >= 3 && v.add, v);
          }
          const file = join(CFG.out, `roles-${name}-${vp}.png`);
          await page.screenshot({ path: file, fullPage: true });
          R.shots.push(file);
        } catch (e) {
          check(`${tag} ran to the end`, false, String(e?.message ?? e).split("\n")[0]);
        } finally {
          if (person) await page.request.post(`${base}/api/auth/sign-out`, { data: {}, headers: { origin: base } }).catch(() => {});
          await ctx.close().catch(() => {});
        }
      }
    }
  } finally {
    await browser.close();
  }
} finally {
  // Put the owner's data back.
  if (restore) {
    if (restore.pf) await http(O, "PUT", "/api/personal-finance", { data: restore.pf });
    else await http(O, "DELETE", "/api/personal-finance");
    if (restore.settings) await http(O, "PUT", "/api/dashboard/settings", restore.settings);
    if (restore.columns) await http(O, "PUT", "/api/dashboard/columns", { columns: restore.columns });
  }
  if (!BOOTSTRAP && people.cfo?.id) {
    await access("PUT", { userId: people.cfo.id, ...grants("read", "none") });
    await access("PUT", { userId: people.pm.id, ...grants("none", "read_write") });
  }
  await http(O, "POST", "/api/auth/sign-out", {});
}

const failed = R.checks.filter((c) => !c.ok);
writeFileSync(join(CFG.out, "roles.json"), JSON.stringify(R, null, 2));
console.log(`[roles] ${R.checks.length - failed.length}/${R.checks.length} passed · ${R.shots.length} screenshots · ${CFG.out}`);
process.exit(failed.length ? 1 : 0);
