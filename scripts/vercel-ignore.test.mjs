import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { allDocsOnly, decide, isDocsOnlyPath } from "./vercel-ignore.mjs";

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
