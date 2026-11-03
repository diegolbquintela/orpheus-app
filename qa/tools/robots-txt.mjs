// #305 robots.txt + X-Robots-Tag, signed out, read-only (2 requests per host).
//   node qa/tools/robots-txt.mjs [--base-url <prod>] [--preview-url <preview>]
// Preview: sends `x-vercel-protection-bypass` read from QA_BYPASS_FILE (default
// /home/box/secrets/orpheus-vercel-bypass.txt); the secret is never printed. With --preview-url and no
// secret file: prints SKIPPED (NOT A PASS) and exits 3. Exit 1 on any FAIL.
import { existsSync, readFileSync } from "node:fs";
import { qaConfig } from "./config.mjs";
import { BYPASS_FILE_DEFAULT, robotsChecks } from "./robots-txt.lib.mjs";

const cfg = qaConfig(import.meta.url);
const argv = process.argv.slice(2);
const pi = argv.findIndex((a) => a === "--preview-url" || a.startsWith("--preview-url="));
const previewUrl = pi < 0 ? process.env.QA_PREVIEW_URL : argv[pi].includes("=") ? argv[pi].split("=")[1] : argv[pi + 1];

let fail = 0;
const report = (label, rows) => {
  for (const c of rows) {
    if (!c.ok) fail++;
    console.log(`${c.ok ? "PASS" : "FAIL"} [${label}] ${c.name}${c.detail !== undefined ? ` (${c.detail})` : ""}`);
  }
};
report("base", await robotsChecks(cfg.baseUrl));
if (previewUrl) {
  const file = process.env.QA_BYPASS_FILE || BYPASS_FILE_DEFAULT;
  if (!existsSync(file)) {
    console.log(`SKIPPED (NOT A PASS) [preview] no bypass secret file at ${file}`);
    process.exit(fail ? 1 : 3);
  }
  const secret = readFileSync(file, "utf8").trim();
  report("preview", await robotsChecks(previewUrl.replace(/\/+$/, ""), { headers: { "x-vercel-protection-bypass": secret } }));
}
process.exit(fail ? 1 : 0);
