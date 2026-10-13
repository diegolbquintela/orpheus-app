// Encryption at rest (#93; design attachments/encryption-at-rest-design.md, ENC-08..ENC-12 in qa/CANONICAL-AC-PACK.md).
// Credentials from env only, never logged or written to the out dir: QA_OWNER_EMAIL / QA_OWNER_PASSWORD (the owner),
// QA_CFO_EMAIL / QA_CFO_PASSWORD (a person who is not the owner). The tool never sees or prints a key.
//
// Preview (HTTP):
//   ENC-08 owner GET /api/account/encryption: 200, no-store, the current kid, per-column counts only (no value, no
//          email, no `enc:v1:` string); the CFO 403, signed out 401, a bad action 400.
//   ENC-09 with --migrate only (writes the preview database; Q-E4): POST encrypt, then 0 plaintext in every column; a
//          second POST changes 0 rows (idempotent). Without --migrate: the counts are reported and the check SKIPs.
//   ENC-10 round trip: the owner's sign-in session is stored under the current key (session.token current > 0);
//          the Personal Finance record is read, saved back unchanged, read again: identical.
// In-process (PGLite, real handlers; no preview needed):
//   ENC-11 missing / malformed key: fail closed (src/lib/crypto/crypto.test.ts ENC-05).
//   ENC-12 rotation k1 → k2 and the decrypt-back path (crypto.test.ts ENC-06, ENC-07).
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { qaConfig } from "./config.mjs";

const CFG = qaConfig(import.meta.url);
const base = CFG.baseUrl;
const MIGRATE = process.argv.includes("--migrate");
const LOCAL_ONLY = process.argv.includes("--local-only");
const R = [];
function check(name, pass, detail) {
  R.push({ name, pass: pass === "skip" ? "skip" : !!pass, detail });
  const tag = pass === "skip" ? "SKIP" : pass ? "PASS" : "FAIL";
  console.log(`${tag} ${name}${detail === undefined ? "" : ` · ${JSON.stringify(detail)}`}`);
}

// ---------------------------------------------------------------- in-process (ENC-11, ENC-12)
{
  const run = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--test", "--test-name-pattern=ENC-0[5-7]|ENC-03|ENC-04", "src/lib/crypto/crypto.test.ts"],
    { encoding: "utf8", env: { ...process.env, DATABASE_URL: "", ORPHEUS_ENCRYPTION_KEY: "", ORPHEUS_ENCRYPTION_KEYS_OLD: "" } },
  );
  const out = `${run.stdout}\n${run.stderr}`;
  const ok = (re) => new RegExp(`^\\s*ok \\d+ - ${re}`, "m").test(out);
  check("ENC-11 in-process: missing / malformed key fails closed (503, readiness off, nothing written)", ok("ENC-05"));
  check("ENC-12 in-process: rotation k1 → k2 (old rows work, reencrypt, k1 retired)", ok("ENC-06"));
  check("ENC-12 in-process: migration encrypt / idempotent / decrypt-back exact", ok("ENC-07"));
}

if (!LOCAL_ONLY) {
  const env = process.env;
  const OWNER = [env.QA_OWNER_EMAIL, env.QA_OWNER_PASSWORD];
  const CFO = [env.QA_CFO_EMAIL, env.QA_CFO_PASSWORD];
  if (!OWNER[0] || !OWNER[1] || !CFO[0] || !CFO[1]) {
    console.error("[encryption] missing QA_OWNER_* / QA_CFO_* credentials in env");
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
  const http = async (jar, method, path, body) => {
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
    return { status: r.status, cc: r.headers.get("cache-control"), json, text };
  };
  const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const signIn = async (email, password) => {
    for (let i = 0; i < 6; i++) {
      const jar = new Jar();
      const r = await http(jar, "POST", "/api/auth/sign-in/email", { email, password });
      if (r.status === 429) {
        await wait(11000);
        continue;
      }
      return { jar: r.status === 200 ? jar : null, status: r.status, body: r.json };
    }
    return { jar: null, status: 429 };
  };

  const st = await http(null, "GET", "/api/dashboard/status");
  if (!st.json || !("signIn" in st.json) || st.json.ownerEmail !== "set") {
    console.error(`[encryption] refusing: ${base} is not a preview with sign-in and ORPHEUS_OWNER_EMAIL set`);
    process.exit(3);
  }
  const owner = await signIn(...OWNER);
  check("sign-in owner", owner.jar, owner.status === 503 ? { status: 503, hint: "sign-in off: is ORPHEUS_ENCRYPTION_KEY set on Preview?" } : owner.status);
  if (!owner.jar) {
    finish();
    process.exit(1);
  }
  const cfo = await signIn(...CFO);
  check("sign-in cfo", cfo.jar, cfo.status);

  // ENC-08
  const s1 = await http(owner.jar, "GET", "/api/account/encryption");
  const cols = s1.json?.columns ?? [];
  check("ENC-08 owner GET 200, no-store", s1.status === 200 && /no-store/.test(s1.cc ?? ""), { status: s1.status, cc: s1.cc });
  check(
    "ENC-08 status: current kid and per-column counts for the 13 sealed columns",
    /^[a-z0-9]{1,8}$/.test(s1.json?.kid ?? "") && cols.length === 13 && cols.every((c) => ["current", "old", "unknown", "plaintext"].every((k) => Number.isInteger(c[k]))),
    { kid: s1.json?.kid, columns: cols.length },
  );
  check("ENC-08 status carries no value: no email, no ciphertext, no key", !/@|enc:v1:|[A-Za-z0-9+/]{40,}={0,2}/.test(s1.text ?? ""));
  check("ENC-08 status: no unknown-key values", cols.every((c) => c.unknown === 0), cols.filter((c) => c.unknown));
  check("ENC-08 CFO 403", (await http(cfo.jar, "GET", "/api/account/encryption")).status === 403);
  check("ENC-08 signed out 401", (await http(null, "GET", "/api/account/encryption")).status === 401);
  check("ENC-08 bad action 400", (await http(owner.jar, "POST", "/api/account/encryption", { action: "decrypt" })).status === 400);

  // ENC-10 round trip
  const sess = cols.find((c) => c.table === "session" && c.column === "token");
  check("ENC-10 the new session is stored under the current key", sess && sess.current > 0, sess);
  const r1 = await http(owner.jar, "GET", "/api/personal-finance");
  const put = await http(owner.jar, "PUT", "/api/personal-finance", { data: r1.json?.data ?? {} });
  const r2 = await http(owner.jar, "GET", "/api/personal-finance");
  check("ENC-10 Personal Finance: read, save back unchanged, read again: identical", r1.status === 200 && put.status === 200 && JSON.stringify(r1.json?.data) === JSON.stringify(r2.json?.data), [r1.status, put.status, r2.status]);
  const s2 = await http(owner.jar, "GET", "/api/account/encryption");
  const pf = (s2.json?.columns ?? []).find((c) => c.table === "personal_finance");
  check("ENC-10 the saved record is sealed (personal_finance.data current > 0)", pf && pf.current > 0, pf);

  // ENC-09
  if (MIGRATE) {
    const m1 = await http(owner.jar, "POST", "/api/account/encryption", { action: "encrypt" });
    const left = (m1.json?.status?.columns ?? []).filter((c) => c.plaintext > 0);
    check("ENC-09 encrypt: 0 plaintext in every sealed column", m1.status === 200 && left.length === 0, { status: m1.status, changed: m1.json?.result?.changed, left });
    const m2 = await http(owner.jar, "POST", "/api/account/encryption", { action: "encrypt" });
    check("ENC-09 a second encrypt changes 0 rows", m2.status === 200 && m2.json?.result?.changed === 0, m2.json?.result?.changed);
    const again = await signIn(...OWNER);
    check("ENC-09 owner still signs in after the migration", again.jar, again.status);
  } else {
    check("ENC-09 migration on the preview DB (needs --migrate; Q-E4)", "skip", { plaintext: s2.json?.plaintext });
  }
}

function finish() {
  const failedN = R.filter((r) => r.pass === false).length;
  const skipped = R.filter((r) => r.pass === "skip").length;
  writeFileSync(join(CFG.out, "encryption.json"), JSON.stringify(R, null, 2));
  console.log(`\n${R.length - failedN - skipped}/${R.length - skipped} passed${skipped ? ` · ${skipped} skipped` : ""}${failedN ? ` · ${failedN} FAILED` : ""} · out ${CFG.out}`);
  return failedN;
}
process.exit(finish() ? 1 : 0);
