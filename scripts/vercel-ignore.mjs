// Vercel "Ignored Build Step" (vercel.json ignoreCommand).
// Vercel semantics: exit 0 = SKIP the build, exit 1 = BUILD.
// Skips PREVIEW builds only when every changed path is docs-only. Fails safe: any doubt => build.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const DOCS_PREFIXES = ["docs/", "qa/runs/", "qa/evidence/"];
// Served or bundled: always build, even for .md (public/ files are served as-is).
const ALWAYS_BUILD_PREFIXES = ["public/", "src/"];

/** True when a repo-relative path is docs-only (never needs a build). */
export function isDocsOnlyPath(path) {
  if (typeof path !== "string") return false;
  const p = path.trim().replace(/^\.\//, "");
  if (!p) return false;
  if (ALWAYS_BUILD_PREFIXES.some((prefix) => p.startsWith(prefix))) return false;
  if (p.toLowerCase().endsWith(".md")) return true; // *.md anywhere, incl. attachments/*.md
  return DOCS_PREFIXES.some((prefix) => p.startsWith(prefix) && p.length > prefix.length);
}

/** True only for a non-empty list where every path is docs-only. */
export function allDocsOnly(paths) {
  return Array.isArray(paths) && paths.length > 0 && paths.every(isDocsOnlyPath);
}

/**
 * Decide whether to skip. Returns { skip, reason }. Never throws.
 * env: process.env-like; changedPaths: () => string[] (may throw).
 */
export function decide(env, changedPaths) {
  try {
    if (env.VERCEL_ENV === "production") return { skip: false, reason: "production deploy" };
    if (env.VERCEL_GIT_COMMIT_REF === "main") return { skip: false, reason: "main branch" };
    const paths = changedPaths();
    if (!Array.isArray(paths) || paths.length === 0) return { skip: false, reason: "empty or unknown diff" };
    if (allDocsOnly(paths)) return { skip: true, reason: `docs-only change (${paths.length} path(s))` };
    const other = paths.find((p) => !isDocsOnlyPath(p));
    return { skip: false, reason: `non-docs change: ${other}` };
  } catch (error) {
    return { skip: false, reason: `error: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 }).trim();
}

function reachable(sha) {
  try {
    git(["cat-file", "-e", `${sha}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

/** Changed paths between the base and HEAD; throws on any failure. */
export function gitChangedPaths(env) {
  let base = "";
  const prev = env.VERCEL_GIT_PREVIOUS_SHA;
  if (prev && /^[0-9a-f]{7,40}$/i.test(prev)) {
    if (!reachable(prev)) {
      try { git(["fetch", "--depth=50", "origin", prev]); } catch { /* fall through to merge-base */ }
    }
    if (reachable(prev)) base = prev;
  }
  if (!base) {
    git(["fetch", "--depth=200", "origin", "main"]);
    try {
      base = git(["merge-base", "FETCH_HEAD", "HEAD"]);
    } catch {
      git(["fetch", "--deepen=500", "origin", "main"]);
      base = git(["merge-base", "FETCH_HEAD", "HEAD"]);
    }
  }
  if (!base) throw new Error("no base commit");
  const out = git(["diff", "--name-only", "--no-renames", base, "HEAD"]);
  return out ? out.split("\n").filter(Boolean) : [];
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const { skip, reason } = decide(process.env, () => gitChangedPaths(process.env));
  console.log(`[vercel-ignore] ${skip ? "SKIP" : "BUILD"}: ${reason}`);
  process.exit(skip ? 0 : 1);
}
