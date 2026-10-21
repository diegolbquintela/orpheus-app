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

function realGit(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 }).trim();
}

const COMPARE_MAX_FILES = 300;

function splitNames(out) {
  return out ? out.split("\n").filter(Boolean) : [];
}

function reachable(git, sha) {
  try {
    git(["cat-file", "-e", `${sha}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

/** (1) VERCEL_GIT_PREVIOUS_SHA if present and reachable (one shallow fetch tried). Returns a base or "". */
function previousShaBase(env, git, remote) {
  const prev = env.VERCEL_GIT_PREVIOUS_SHA;
  if (!prev || !/^[0-9a-f]{7,40}$/i.test(prev)) return "";
  if (!reachable(git, prev) && remote) {
    try { git(["fetch", "--depth=50", remote, prev]); } catch { /* next path */ }
  }
  return reachable(git, prev) ? prev : "";
}

/** The fetch remote: `origin` when it exists, else the GitHub URL from Vercel's env (Vercel clones may have no origin). */
function fetchRemote(env, git) {
  try {
    if (git(["remote", "get-url", "origin"])) return "origin";
  } catch { /* no origin remote */ }
  const { VERCEL_GIT_REPO_OWNER: owner, VERCEL_GIT_REPO_SLUG: slug } = env;
  return owner && slug ? `https://github.com/${owner}/${slug}.git` : "";
}

/** (2) shallow fetch of main, then merge-base (deepen once). Returns a base or "". */
function mergeBase(git, remote) {
  if (!remote) return "";
  try {
    git(["fetch", "--depth=50", remote, "main"]);
    try {
      return git(["merge-base", "FETCH_HEAD", "HEAD"]);
    } catch {
      git(["fetch", "--deepen=500", remote, "main"]);
      return git(["merge-base", "FETCH_HEAD", "HEAD"]);
    }
  } catch {
    return "";
  }
}

/** (3) unauthenticated GitHub compare main...SHA; throws on error, timeout, truncation or >= 300 files. */
async function githubCompare(env, fetchImpl, timeoutMs) {
  const { VERCEL_GIT_REPO_OWNER: owner, VERCEL_GIT_REPO_SLUG: slug, VERCEL_GIT_COMMIT_SHA: sha } = env;
  if (!owner || !slug || !sha) throw new Error("compare: missing repo env");
  const url = `https://api.github.com/repos/${owner}/${slug}/compare/main...${sha}`;
  const response = await fetchImpl(url, {
    headers: { accept: "application/vnd.github+json", "user-agent": "vercel-ignore" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`compare: HTTP ${response.status}`);
  const body = await response.json();
  const files = Array.isArray(body?.files) ? body.files : null;
  if (!files) throw new Error("compare: no files list");
  if (body.truncated || files.length >= COMPARE_MAX_FILES) throw new Error(`compare: truncated (${files.length} files)`);
  return files.map((f) => f?.filename).filter((n) => typeof n === "string");
}

/**
 * Changed paths and the base path used. Throws when every path fails.
 * deps (for tests): git(args) => stdout, fetch(url, init), timeoutMs.
 */
export async function changedPaths(env, deps = {}) {
  const git = deps.git ?? realGit;
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const timeoutMs = deps.timeoutMs ?? 5_000;
  let remote = "";
  try { remote = fetchRemote(env, git); } catch { /* none */ }
  const tried = [];
  for (const [label, find] of [["previous-sha", () => previousShaBase(env, git, remote)], ["git-merge-base", () => mergeBase(git, remote)]]) {
    try {
      const base = find();
      if (base) return { base: label, paths: splitNames(git(["diff", "--name-only", "--no-renames", base, "HEAD"])) };
      tried.push(`${label}: none`);
    } catch (error) {
      tried.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  try {
    return { base: "github-compare", paths: await githubCompare(env, fetchImpl, timeoutMs) };
  } catch (error) {
    tried.push(error instanceof Error ? error.message : String(error));
  }
  throw new Error(`no base (${tried.join("; ")})`);
}

/** Full decision with the base path named. Never throws. */
export async function run(env, deps = {}) {
  if (env.VERCEL_ENV === "production" || env.VERCEL_GIT_COMMIT_REF === "main") return decide(env, () => []);
  let found;
  try {
    found = await changedPaths(env, deps);
  } catch (error) {
    return decide(env, () => { throw error; });
  }
  const result = decide(env, () => found.paths);
  return { ...result, base: found.base };
}

export function logLine({ skip, reason, base }) {
  return `[vercel-ignore] ${skip ? "SKIP" : "BUILD"}${base ? ` (base=${base})` : ""}: ${reason}`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  run(process.env)
    .catch((error) => ({ skip: false, reason: `error: ${error instanceof Error ? error.message : String(error)}` }))
    .then((result) => {
      console.log(logLine(result));
      process.exit(result.skip ? 0 : 1);
    });
}
