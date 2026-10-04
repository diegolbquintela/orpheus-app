#!/usr/bin/env node
/**
 * Runs the click-level component tests (`src/**\/*.dom.test.tsx`) in jsdom with node:test.
 * Node can't load TSX, so each test is bundled with rolldown (already in the toolchain via Vite) into
 * node_modules/.cache/dom-tests (git-ignored), keeping packages external, then run with `node --test`.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { rolldown } from "rolldown";

const root = resolve(import.meta.dirname, "..");
const out = join(root, "node_modules/.cache/dom-tests");
const find = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? find(join(dir, e.name)) : e.name.endsWith(".dom.test.tsx") ? [join(dir, e.name)] : [],
  );
const tests = find(join(root, "src"));
if (!tests.length) {
  console.error("[dom-tests] no *.dom.test.tsx files found");
  process.exit(1);
}
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const files = [];
for (const input of tests) {
  const bundle = await rolldown({
    input,
    platform: "node",
    tsconfig: join(root, "tsconfig.json"),
    resolve: { alias: { "@": join(root, "src") } },
    external: (id) => !id.startsWith(".") && !id.startsWith("/") && !id.startsWith("@/") && !/^[A-Za-z]:/.test(id),
    logLevel: "warn",
  });
  const file = join(out, relative(join(root, "src"), input).replace(/[\\/]/g, "__").replace(/\.tsx$/, ".mjs"));
  await bundle.write({ file, format: "esm" });
  await bundle.close();
  files.push(file);
}
const r = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
process.exit(r.status ?? 1);
