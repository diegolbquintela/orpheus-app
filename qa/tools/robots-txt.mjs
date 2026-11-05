// #305 robots.txt + X-Robots-Tag, signed out, read-only (2 requests per host).
//   node qa/tools/robots-txt.mjs [--base-url <prod>] [--preview-url <preview>]
// Preview: sends `x-vercel-protection-bypass` read from QA_BYPASS_FILE (default
// /home/box/secrets/orpheus-vercel-bypass.txt); --base-url gets it too on a non-production host. Never printed. With --preview-url and no
// secret file: prints SKIPPED (NOT A PASS) and exits 3. Exit 1 on any FAIL.
import { existsSync } from "node:fs";
import { qaConfig } from "./config.mjs";
import { headerSkip, headerSkips, headersApply } from "./lib/local-headers.mjs";
import { BYPASS_FILE_DEFAULT, bypassHeaders, robotsChecks } from "./robots-txt.lib.mjs";

const cfg = qaConfig(import.meta.url);
const argv = process.argv.slice(2);
const pi = argv.findIndex((a) => a === "--preview-url" || a.startsWith("--preview-url="));
const previewUrl = pi < 0 ? process.env.QA_PREVIEW_URL : argv[pi].includes("=") ? argv[pi].split("=")[1] : argv[pi + 1];

let fail = 0;
const report = (label, rows, local = false) => {
  for (const c of rows) {
    // #320: on a local server (vite preview, no config.json headers) the header rows are SKIPPED (NOT A PASS), exit 3.
    if (local && /x-robots-tag|header/i.test(c.name)) { headerSkip(`[${label}] ${c.name}`); continue; }
    if (!c.ok) fail++;
    console.log(`${c.ok ? "PASS" : "FAIL"} [${label}] ${c.name}${c.detail !== undefined ? ` (${c.detail})` : ""}`);
  }
};
const file = process.env.QA_BYPASS_FILE || BYPASS_FILE_DEFAULT;
// CH22: --base-url gets the bypass too when the secret file exists and the host isn't a known production host.
const baseHeaders = bypassHeaders(cfg.baseUrl, file);
console.log(`[base] bypass header ${Object.keys(baseHeaders).length ? "sent" : "not sent"}`);
report("base", await robotsChecks(cfg.baseUrl, { headers: baseHeaders }), !headersApply(cfg));
if (previewUrl) {
  if (!existsSync(file)) {
    console.log(`SKIPPED (NOT A PASS) [preview] no bypass secret file at ${file}`);
    process.exit(fail ? 1 : 3);
  }
  const pu = previewUrl.replace(/\/+$/, "");
  report("preview", await robotsChecks(pu, { headers: bypassHeaders(pu, file) }));
}
process.exit(fail ? 1 : headerSkips() ? 3 : 0);
