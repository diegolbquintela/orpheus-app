import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { allDocsOnly, decide, isDocsOnlyPath, logLine, run } from "./vercel-ignore.mjs";

describe("vercel-ignore path classifier", () => {
  it("docs-only paths skip", () => {
    for (const p of ["README.md", "AGENTS.md", "a/b/c/d.md", "docs/guide.txt", "docs/img/x.png",
      "attachments/personal-finance-spec.md", "qa/runs/2026-10-20/log.json", "qa/evidence/shot.png", "qa/CANONICAL-AC-PACK.md"]) {
      assert.equal(isDocsOnlyPath(p), true, p);
    }
  });
  it("code and look-alikes build", () => {
    for (const p of ["src/app.ts", "src/x.md", "src/lib/notes.md", "public/hero/x-SOURCE.md", "public/a.md", "attachments/x.png", "docsx/a.ts", "qa/runsfoo", "qa/runsfoo/a.json", "qa/evidencex/a",
      "qa/tools/site-shell.mjs", "vercel.json", "package.json", "md", "README.mdx", "docs", "", undefined]) {
      assert.equal(isDocsOnlyPath(p), false, String(p));
    }
  });
  it("public/ and src/ always build, even .md (served files)", () => {
    assert.equal(isDocsOnlyPath("public/hero/x-SOURCE.md"), false);
    assert.equal(isDocsOnlyPath("src/x.md"), false);
    assert.equal(allDocsOnly(["README.md", "public/hero/x-SOURCE.md"]), false);
  });
  it("lists: all docs skip; mixed or empty build", () => {
    assert.equal(allDocsOnly(["README.md", "docs/a.ts", "qa/evidence/x.png"]), true);
    assert.equal(allDocsOnly(["README.md", "src/app.ts"]), false);
    assert.equal(allDocsOnly([]), false);
    assert.equal(allDocsOnly(["src/app.ts"]), false);
  });
});

describe("vercel-ignore decide (exit 0 = skip, 1 = build)", () => {
  const docs = () => ["README.md"];
  it("docs-only preview skips", () => assert.equal(decide({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "chore/x" }, docs).skip, true));
  it("production always builds", () => assert.equal(decide({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "chore/x" }, docs).skip, false));
  it("main always builds", () => assert.equal(decide({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "main" }, docs).skip, false));
  it("errors build", () => {
    const r = decide({ VERCEL_ENV: "preview" }, () => { throw new Error("unknown SHA"); });
    assert.equal(r.skip, false);
    assert.match(r.reason, /unknown SHA/);
  });
  it("empty diff and code diff build", () => {
    assert.equal(decide({ VERCEL_ENV: "preview" }, () => []).skip, false);
    assert.equal(decide({ VERCEL_ENV: "preview" }, () => ["README.md", "src/a.ts"]).skip, false);
  });
});

describe("vercel-ignore base paths (fix/vercel-ignore-base)", () => {
  const env = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "docs/x", VERCEL_GIT_REPO_OWNER: "o", VERCEL_GIT_REPO_SLUG: "r", VERCEL_GIT_COMMIT_SHA: "abc1234" };
  /** Fake git: `known` SHAs are reachable; merge-base returns `mb` or throws; diff returns `diff`. */
  const fakeGit = ({ known = [], origin = true, fetchFails = false, mb = "", diff = "README.md" } = {}) => (args) => {
    const [cmd] = args;
    if (cmd === "remote") { if (origin) return "https://github.com/o/r"; throw new Error("no origin"); }
    if (cmd === "cat-file") { if (known.some((k) => args[2].startsWith(k))) return ""; throw new Error("missing"); }
    if (cmd === "fetch") { if (fetchFails) throw new Error("fetch failed"); return ""; }
    if (cmd === "merge-base") { if (mb) return mb; throw new Error("no merge base"); }
    if (cmd === "diff") return diff;
    throw new Error(`unexpected git ${cmd}`);
  };
  const noFetch = () => { throw new Error("fetch must not be called"); };
  const reply = (body, ok = true) => async () => ({ ok, status: ok ? 200 : 403, json: async () => body });
  const allFail = { git: fakeGit({ fetchFails: true }) };

  it("previous-sha path skips a docs-only diff", async () => {
    const r = await run({ ...env, VERCEL_GIT_PREVIOUS_SHA: "deadbee" }, { git: fakeGit({ known: ["deadbee"] }), fetch: noFetch });
    assert.deepEqual([r.skip, r.base], [true, "previous-sha"]);
    assert.match(logLine(r), /^\[vercel-ignore\] SKIP \(base=previous-sha\): docs-only/);
  });
  it("merge-base path (no origin remote: GitHub URL from env) builds a code diff", async () => {
    const r = await run(env, { git: fakeGit({ origin: false, mb: "1111111", diff: "README.md\nsrc/a.ts" }), fetch: noFetch });
    assert.deepEqual([r.skip, r.base], [false, "git-merge-base"]);
  });
  it("github-compare skips docs-only", async () => {
    const r = await run(env, { ...allFail, fetch: reply({ files: [{ filename: "README.md" }, { filename: "docs/a.txt" }] }) });
    assert.deepEqual([r.skip, r.base], [true, "github-compare"]);
  });
  it("github-compare builds public/ .md", async () => {
    const r = await run(env, { ...allFail, fetch: reply({ files: [{ filename: "public/hero/x-SOURCE.md" }] }) });
    assert.deepEqual([r.skip, r.base], [false, "github-compare"]);
  });
  it("github-compare timeout, HTTP error or bad body builds", async () => {
    // AbortSignal.timeout is unref'd, so hold the loop open with a ref'd timer until the abort fires.
    const hang = (_url, init) => new Promise((_, reject) => {
      const keep = setTimeout(() => {}, 5_000);
      init.signal.addEventListener("abort", () => { clearTimeout(keep); reject(new Error("timeout")); });
    });
    for (const f of [hang, reply({}, false), reply({ nope: 1 }), () => Promise.reject(new Error("offline"))]) {
      const r = await run(env, { ...allFail, fetch: f, timeoutMs: 20 });
      assert.equal(r.skip, false);
      assert.match(r.reason, /^error: no base/);
    }
  });
  it("truncated compare or >= 300 files builds", async () => {
    for (const body of [{ truncated: true, files: [{ filename: "README.md" }] }, { files: Array.from({ length: 300 }, (_, i) => ({ filename: `d${i}.md` })) }]) {
      const r = await run(env, { ...allFail, fetch: reply(body) });
      assert.equal(r.skip, false);
      assert.match(r.reason, /truncated/);
    }
  });
  it("all paths fail (no remote, no repo env) builds", async () => {
    const r = await run({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "x" }, { git: fakeGit({ origin: false }), fetch: noFetch });
    assert.equal(r.skip, false);
    assert.match(logLine(r), /^\[vercel-ignore\] BUILD: error: no base/);
  });
  it("production and main still build without any git or fetch", async () => {
    const boom = () => { throw new Error("must not run"); };
    assert.equal((await run({ ...env, VERCEL_ENV: "production" }, { git: boom, fetch: boom })).skip, false);
    assert.equal((await run({ ...env, VERCEL_GIT_COMMIT_REF: "main" }, { git: boom, fetch: boom })).skip, false);
  });
  it("an empty diff builds", async () => {
    const r = await run(env, { git: fakeGit({ mb: "1111111", diff: "" }), fetch: noFetch });
    assert.equal(r.skip, false);
  });
});
