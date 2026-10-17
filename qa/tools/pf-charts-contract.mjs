// Personal Finance chart report API contract, live (#158; spec section 40; AC PFAPI-01..PFAPI-03; contract
// attachments/pf-charts-api-contract.md). Signed out only: never signs in, sends no body and stores nothing. It reads
// the route table (methods / Allow) from the contract doc and checks that the live routes answer as the doc says:
//
//   PFAPI-01 signed out: GET / HEAD /reports, GET /reports/default, GET /reports/default/export → 401 JSON
//            `Unauthorized.`, no-store, X-Robots-Tag.
//   PFAPI-02 wrong method → 405 `Method not allowed.` with the doc's Allow. GET / HEAD probes always; PATCH probes
//            (405 before the session check) only off production; in signed-out prod mode they are SKIPPED.
//   PFAPI-03 every response carries X-Orpheus-Env (preview on a preview).
//
//   node qa/tools/pf-charts-contract.mjs --base-url <preview> --out <dir>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { qaConfig } from "./config.mjs";
import { refuseIfProd } from "./prod-guard.mjs";

const CFG = qaConfig(import.meta.url);
const base = CFG.baseUrl;
const R = { base, checks: [] };
const check = (name, ok, detail) => {
  R.checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail !== undefined ? ` · ${JSON.stringify(detail).slice(0, 400)}` : ""}`);
};

// Before any request (prod guard: one HEAD at most; signed-out prod mode → GET / HEAD only).
const GUARD = await refuseIfProd(base, "pf-charts-contract");

const doc = readFileSync(new URL("../../attachments/pf-charts-api-contract.md", import.meta.url), "utf8");
const row = (label) => {
  const m = new RegExp(`\\| ${label} \\| \`([^\`]+)\`[^|]*\\| \`([^\`]+)\` \\|`).exec(doc);
  if (!m) throw new Error(`contract row ${label} not found`);
  return { path: m[1].replace(/\\\|/g, "|").replace(/\?format=.*$/, "").replace(":id", "default"), allow: m[2] };
};
const ROUTES = Object.fromEntries(["R1", "R2", "R3", "R4", "R5", "L1"].map((k) => [k, row(k)]));
const query = (k) => (k === "R5" ? "?format=pdf" : "");
const wantEnv = GUARD.signedOutProd ? "production" : "preview";
const PA = "/api/personal-finance";
check("contract doc parsed: six routes", ROUTES.R1.path === `${PA}/series` && ROUTES.R5.path === `${PA}/reports/default/export` && ROUTES.L1.path === `${PA}/report`, ROUTES);

const hit = async (method, path) => {
  const r = await fetch(`${base}${path}`, { method, redirect: "manual" });
  const text = method === "HEAD" ? "" : await r.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  return { status: r.status, h: Object.fromEntries(r.headers), json };
};
const envOk = (x) => x.h["x-orpheus-env"] === wantEnv;

// PFAPI-01
for (const [k, method] of [["R3", "GET"], ["R3", "HEAD"], ["R4", "GET"], ["R5", "GET"], ["L1", "GET"]]) {
  const p = ROUTES[k].path + query(k);
  const x = await hit(method, p);
  const body = method === "HEAD" || x.json?.error === "Unauthorized.";
  check(`PFAPI-01 ${k} ${method} signed out → 401 Unauthorized., no-store, noindex`, x.status === 401 && body && x.h["cache-control"] === "no-store" && /noindex/.test(x.h["x-robots-tag"] ?? ""), { status: x.status, json: x.json, cc: x.h["cache-control"] });
  check(`PFAPI-03 ${k} ${method} X-Orpheus-Env: ${wantEnv}`, envOk(x), x.h["x-orpheus-env"] ?? null);
}

// PFAPI-02
const wrong = [["R1", "GET"], ["R1", "HEAD"], ["R2", "GET"], ["R2", "HEAD"]];
for (const [k, method] of wrong) {
  const x = await hit(method, ROUTES[k].path);
  check(`PFAPI-02 ${k} ${method} → 405, Allow: ${ROUTES[k].allow}`, x.status === 405 && x.h.allow === ROUTES[k].allow && (method === "HEAD" || x.json?.error === "Method not allowed.") && x.h["cache-control"] === "no-store", { status: x.status, allow: x.h.allow });
  check(`PFAPI-03 ${k} ${method} X-Orpheus-Env: ${wantEnv}`, envOk(x), x.h["x-orpheus-env"] ?? null);
}
if (GUARD.signedOutProd) console.log("INFO PFAPI-02 PATCH probes (R3, R4, R5, L1) SKIPPED (signed-out prod mode: GET / HEAD only)");
else
  for (const k of ["R3", "R4", "R5", "L1"]) {
    const x = await hit("PATCH", ROUTES[k].path + query(k));
    check(`PFAPI-02 ${k} PATCH → 405, Allow: ${ROUTES[k].allow}`, x.status === 405 && x.h.allow === ROUTES[k].allow && x.json?.error === "Method not allowed.", { status: x.status, allow: x.h.allow });
  }

const failed = R.checks.filter((c) => !c.ok).length;
mkdirSync(CFG.out, { recursive: true });
writeFileSync(join(CFG.out, "pf-charts-contract.json"), JSON.stringify(R, null, 2));
console.log(`${R.checks.length - failed}/${R.checks.length} passed · out ${CFG.out}`);
process.exit(failed ? 1 : 0);
