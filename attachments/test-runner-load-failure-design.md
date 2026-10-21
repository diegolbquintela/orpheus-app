# npm test fails when a test file errors while loading (#183; added 2026-10-21)

Tooling only, with no business user (the tech loop). Q-calls go to EL. AC pack: `TLF-01..TLF-08` (`qa/CANONICAL-AC-PACK.md`).

## 1. Problem (reproduced at 958c8be, Node 22.23.3)
- `npm test` ran `node --test` three times (scripts, `src` lib/server, DOM) and chained them with `&&`, so it trusted each stage's exit code.
- `node --test` exits 0 with `# fail 0` when a **nested** `describe` callback throws or rejects while collecting, for example by awaiting a missing import. It still prints `not ok` for that suite and for its parent.
- **Repro:** add `scripts/zz-broken-load.test.mjs` with `describe("outer", () => { it("ok", …); describe("inner", async () => { await import("./does-not-exist.mjs"); }); })`. `npm test` then prints `    not ok 2 - inner` and `not ok 50 - outer`, then `# pass 87 / # fail 0 / # cancelled 0`, and **exits 0**. This happens under both TZ=UTC and TZ=America/Los_Angeles.
- A top-level broken import, a top-level throw, an unhandled rejection or a throw directly inside a top-level `describe` already exit 1 on Node 22. So the gap is the nested-suite case, which is the one #182 hit.

## 2. Fix (built in this PR; no new dependency)
- `scripts/test-runner.mjs` wraps `node <args>`.
  - It forces `--test-reporter=tap` and streams stdout and stderr through unchanged.
  - It exits **1** when node exits non-zero **or** any `not ok` line appears.
  - `not ok … # TODO` and `# SKIP` lines don't count; they are TAP directives, not failures.
  - When node exited 0 but `not ok` lines appeared, it prints `[test-runner] FAIL: node exited 0 but printed N 'not ok' line(s):` followed by those lines.
- `package.json` `test`: the scripts and `src` stages now run as `node scripts/test-runner.mjs …`. The file lists don't change.
- `scripts/run-dom-tests.mjs` runs its bundled files through the same `runNodeTest` instead of `spawnSync`.
- CI is unchanged: it already runs `npm test`.
- **Tests:** `scripts/test-runner.test.mjs` uses fixtures in `test-fixtures/test-runner/*.fixture.mjs`. They are not `*.test.mjs`, so the glob never runs them directly.

## 3. Q-calls (EL), each with a recommendation
- **Q-TLF1 TAP output locally:** **rec** accept. Forcing TAP gives one parseable format. CI output is unchanged, because non-TTY output was already TAP. Locally you lose the coloured spec reporter. **Built.**
- **Q-TLF2 TODO / SKIP:** **rec** not failures (TAP semantics). **Built.**
- **Q-TLF3 Unlisted `src` test files:** the `src` stage uses an explicit file list, so a new `src/**/*.test.ts` that isn't listed never runs. That is a separate silent gap. **rec** a follow-up ticket: a check that every `src/**/*.test.ts` and `*.server.test.ts` is listed. **Not built.**
- **Q-TLF4 Mutation proof:** **rec** keep it as PR history only. One commit adds a broken-import test file and CI goes red; the next removes it and CI goes green. No permanent CI job. **Done in the PR.**
