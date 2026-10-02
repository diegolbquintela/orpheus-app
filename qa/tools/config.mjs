/**
 * Shared settings for the QA browser scripts in qa/tools/.
 *
 *   --base-url <url>     or QA_BASE_URL     app under test (default: production)
 *   --out <dir>          or QA_OUT_DIR      where screenshots/JSON go (default: a temp dir, never the repo)
 *   --fixtures <file>    or QA_FIXTURES     fixtures file (default: qa/fixtures.json in this repo)
 *   --compare-url <url>  or QA_COMPARE_URL  second host, only for sidebyside.mjs
 *
 * CLI flags win over env vars. Both `--flag value` and `--flag=value` work.
 */
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_BASE_URL = "https://orpheus-app-beta.vercel.app";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function flag(argv, name) {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === `--${name}`) return argv[i + 1];
    if (arg.startsWith(`--${name}=`)) return arg.slice(name.length + 3);
  }
  return undefined;
}

function cleanUrl(value) {
  const url = new URL(value); // throws on a malformed URL
  return url.href.replace(/\/+$/, "");
}

/** Resolve settings for one script; `scriptUrl` is that script's import.meta.url. */
export function qaConfig(scriptUrl, argv = process.argv.slice(2), env = process.env) {
  const script = basename(fileURLToPath(scriptUrl), ".mjs");
  const baseUrl = cleanUrl(flag(argv, "base-url") ?? env.QA_BASE_URL ?? DEFAULT_BASE_URL);
  const compareRaw = flag(argv, "compare-url") ?? env.QA_COMPARE_URL;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const out = resolve(flag(argv, "out") ?? env.QA_OUT_DIR ?? join(tmpdir(), "orpheus-qa", `${script}-${stamp}`));
  const fixtures = resolve(flag(argv, "fixtures") ?? env.QA_FIXTURES ?? join(REPO_ROOT, "qa", "fixtures.json"));
  mkdirSync(out, { recursive: true });
  console.log(`[${script}] base ${baseUrl}${compareRaw ? ` · compare ${cleanUrl(compareRaw)}` : ""} · out ${out}`);
  return { script, baseUrl, compareUrl: compareRaw ? cleanUrl(compareRaw) : null, out, fixtures };
}
