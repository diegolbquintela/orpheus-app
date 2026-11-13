// #328: any QA run that names a non-local host needs --release, prints a CDN estimate before any request,
// and refuses (exit 2) when the estimate is over the per-process budget. --budget-only prints the estimate
// and exits 0 before startLocal and before any HEAD. CLI flags only: no new env var.
//
// Estimate (Plan A): pages × viewports × runs × 20, plus calls × 1 for API-style tools. Spawners add the
// children they will actually start. Local (localhost, 127.0.0.1, ::1) prints "CDN estimate: 0 (local)".
import { flag, hasFlag } from "./base-url.mjs";
import { pickViewports, viewportsFromArgv } from "./viewports.mjs";

export const REQUESTS_PER_PAGE = 20;
export const DEFAULT_BUDGET = 10000;
export const LOCAL_ESTIMATE_LINE = "CDN estimate: 0 (local)";
export const RELEASE_WARNING = "WARNING --release: remote QA run (every load is a CDN request)";

// Node reports http://[::1]/ as hostname "[::1]"; a bare ::1 is accepted too.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export const SSR_CHILDREN = [
  "site-shell",
  "home-page",
  "calculator-page",
  "saved-searches",
  "signin-page",
  "personal-finance",
  "site",
  "pf-stale-reload",
  "release-smoke",
];

// pages / calls are declared ceilings for the formula, not a trace of every goto.
// #331: site-style-regression's default run spawns exactly SSR_CHILDREN (creds, --read-only and --smoke do not
// add or drop one; --own-only drops them all). QA's 1800 across 30 suites at 1440 / CLS_RUNS=1 is a navigation
// trace (90 × 20). This formula's children at that setting sum to 656, including release-smoke's 16 calls.
// The default parent total stays 1542. Do not retune pages/runs to chase individual reloads.
// viewports: "argv" (--viewports, else 390+1440), "session" (QA_VIEWPORTS else argv), "stale" (2, or 4 with
// --all-widths), or a fixed count. runs: "cls" (CLS_RUNS, default 2), "nav+cls" (one navigation + CLS_RUNS), or a count.
export const PROFILES = {
  "site-style-regression": { pages: 4, viewports: "argv", runs: "nav+cls", calls: 6 },
  "site-shell": { pages: 4, viewports: "argv", runs: 2, alsoCompare: true },
  "home-page": { pages: 1, viewports: "argv", runs: "cls" },
  "calculator-page": { pages: 1, viewports: "argv", runs: "cls" },
  "research-page": { pages: 3, viewports: "argv", runs: 1 },
  "saved-searches": { pages: 1, viewports: "argv", runs: 1 },
  "signin-page": { pages: 1, viewports: "argv", runs: 2 },
  "personal-finance": { pages: 1, viewports: "argv", runs: "cls" },
  "personal-finance-e2e": { pages: 6, viewports: "argv", runs: "cls" },
  "pf-scenario-e2e": { pages: 2, viewports: 2, runs: 1 },
  "pf-months": { pages: 1, viewports: "argv", runs: 1 },
  "pf-stale-reload": { pages: 3, viewports: "stale", runs: 1 },
  "roles": { pages: 4, viewports: "argv", runs: 1, calls: 40 },
  "audit": { pages: 1, viewports: "argv", runs: 1, calls: 15 },
  "no-grok": { pages: 6, viewports: "argv", runs: 1, calls: 4 },
  site: { pages: 6, viewports: 2, runs: 1 },
  run: { pages: 5, viewports: 1, runs: 1 },
  full: { pages: 1, viewports: 2, runs: 1 },
  pr3: { pages: 1, viewports: 2, runs: 1 },
  "pr3-mobile-cue": { pages: 1, viewports: 1, runs: 1 },
  c5live: { pages: 1, viewports: 1, runs: 1 },
  sidebyside: { pages: 2, viewports: 2, runs: 1, alsoCompare: true },
  "dashboard-list": { pages: 1, viewports: "session", runs: 1 },
  "dashboard-add": { pages: 1, viewports: "session", runs: 1 },
  "dashboard-book": { pages: 1, viewports: "session", runs: 1 },
  "dashboard-metrics": { pages: 1, viewports: "session", runs: 1 },
  "dashboard-leaveouts": { pages: 1, viewports: "session", runs: 1 },
  "dashboard-company": { pages: 4, viewports: "session", runs: 1 },
  "dashboard-redesign": { pages: 3, viewports: 1, runs: 1, calls: 2 },
  "pf-chart-api": { calls: 20, viewports: 1, runs: 1 },
  "pf-series-api": { calls: 20, viewports: 1, runs: 1 },
  "pf-report-api": { calls: 25, viewports: 1, runs: 1 },
  "pf-reports-api": { calls: 20, viewports: 1, runs: 1 },
  "pf-export-api": { calls: 20, viewports: 1, runs: 1 },
  "pf-charts-contract": { calls: 13, viewports: 1, runs: 1 },
  "robots-txt": { calls: 2, viewports: 1, runs: 1, alsoPreview: true },
  "release-smoke": { calls: 16, viewports: 1, runs: 1 },
};

export function isRemoteUrl(url) {
  if (url == null || url === "") return false;
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return true;
  }
  return !LOCAL_HOSTS.has(host);
}

export function parseBudget(argv) {
  const present = argv.some((a) => a === "--budget" || a.startsWith("--budget="));
  if (!present) return { ok: true, budget: DEFAULT_BUDGET };
  const raw = flag(argv, "budget");
  if (raw === undefined || !/^[1-9]\d*$/.test(raw)) return { ok: false, raw: raw ?? "" };
  return { ok: true, budget: Number(raw) };
}

/** Flags a spawner copies onto each child argv. Not an env var. --budget-only is not forwarded (the parent already exited). */
export function forwardedRemoteArgs(argv) {
  const out = [];
  if (hasFlag(argv, "release")) out.push("--release");
  if (hasFlag(argv, "allow-over-budget")) out.push("--allow-over-budget");
  if (argv.some((a) => a === "--budget" || a.startsWith("--budget="))) {
    const b = flag(argv, "budget");
    if (b !== undefined) out.push(`--budget=${b}`);
  }
  return out;
}

/**
 * The parent's last `--viewports` value, as one `--viewports=<value>` token.
 * Equals form so release-smoke's positional parser cannot see the value.
 * Empty when the parent did not set the flag (children keep their own default).
 */
export function forwardedViewportArgs(argv) {
  let value;
  let seen = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--viewports") {
      const next = argv[i + 1];
      seen = true;
      if (next !== undefined && !next.startsWith("--")) {
        value = next;
        i += 1;
      } else value = undefined;
    } else if (argv[i].startsWith("--viewports=")) {
      seen = true;
      value = argv[i].slice("--viewports=".length);
    }
  }
  if (!seen || value === undefined || value === "") return [];
  return [`--viewports=${value}`];
}

function clsRuns(env) {
  const n = Number(env.CLS_RUNS ?? 2);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 2;
}

function runsOf(profile, env) {
  if (profile.runs === "cls") return clsRuns(env);
  if (profile.runs === "nav+cls") return 1 + clsRuns(env);
  return profile.runs ?? 1;
}

function viewportCount(profile, argv, env) {
  const v = profile.viewports ?? "argv";
  if (typeof v === "number") return v;
  if (v === "stale") return argv.includes("--all-widths") ? 4 : 2;
  if (v === "session" && env.QA_VIEWPORTS) return pickViewports(env.QA_VIEWPORTS).length;
  return viewportsFromArgv(argv).length;
}

/** Children a spawner will start for this argv/env. Empty for every other script. */
export function plannedChildren(script, argv, env) {
  if (script === "site-style-regression") {
    if (argv.includes("--own-only")) return [];
    return SSR_CHILDREN.map((name) => ({ script: name }));
  }
  if (script === "dashboard-redesign") {
    const out = [{ script: "site" }];
    const readOnly = argv.includes("--read-only") || argv.includes("--empty");
    if (env.QA_EMAIL && env.QA_PASSWORD) {
      out.push({ script: "dashboard-leaveouts" }, { script: "dashboard-list" });
      if (!readOnly) out.push({ script: "dashboard-add" }, { script: "dashboard-metrics" });
      out.push({ script: "dashboard-book" });
    }
    if (argv.includes("--empty") && env.QA_EMPTY_EMAIL && env.QA_EMPTY_PASSWORD) {
      out.push({ script: "dashboard-leaveouts" }, { script: "dashboard-list" });
    }
    const smokeAt = argv.indexOf("--smoke");
    if (smokeAt >= 0 && argv[smokeAt + 1]) out.push({ script: "release-smoke" });
    return out;
  }
  return [];
}

function pieceFor(script, argv, env, hosts, profiles) {
  const profile = profiles[script] ?? { pages: 1, viewports: "argv", runs: 1 };
  const viewports = viewportCount(profile, argv, env);
  const runs = runsOf(profile, env);
  const per = profile.per ?? REQUESTS_PER_PAGE;
  const pages = profile.pages ?? 0;
  const calls = profile.calls ?? 0;
  const one = pages * viewports * runs * per + calls;
  let hostN = 0;
  if (hosts.baseRemote) hostN += 1;
  if (hosts.compareRemote && profile.alsoCompare) hostN += 1;
  if (hosts.previewRemote && profile.alsoPreview) hostN += 1;
  return {
    label: script,
    total: hostN === 0 ? 0 : one * hostN,
    pages,
    viewports,
    runs,
    per,
    calls,
    hosts: hostN,
  };
}

function formatOne(piece) {
  const bits = [];
  if (piece.pages) bits.push(`${piece.pages} pages × ${piece.viewports} viewports × ${piece.runs} runs × ${piece.per}`);
  if (piece.calls) bits.push(`${piece.calls} calls × 1`);
  const body = bits.join(" + ") || "0";
  return piece.hosts > 1 ? `(${body}) × ${piece.hosts} hosts` : body;
}

function remoteHostNames(urls) {
  const out = [];
  for (const url of urls) {
    if (!isRemoteUrl(url)) continue;
    try {
      out.push(new URL(url).hostname.toLowerCase());
    } catch {
      out.push("invalid URL");
    }
  }
  return [...new Set(out)];
}

/**
 * Decide a run. `baseUrl` null means the local default (the server is not started yet).
 * Does not fetch and does not start a server.
 */
export function assessRemote({ script, baseUrl = null, compareUrl = null, previewUrl = null, argv = [], env = {}, profiles = PROFILES }) {
  const budget = parseBudget(argv);
  const flags = {
    baseRemote: isRemoteUrl(baseUrl),
    compareRemote: isRemoteUrl(compareUrl),
    previewRemote: isRemoteUrl(previewUrl),
  };
  const local = !flags.baseRemote && !flags.compareRemote && !flags.previewRemote;
  const ownHosts = script === "site-style-regression" || script === "dashboard-redesign"
    ? { baseRemote: flags.baseRemote, compareRemote: false, previewRemote: false }
    : flags;
  const pieces = [pieceFor(script, argv, env, ownHosts, profiles)];
  for (const child of plannedChildren(script, argv, env)) {
    const childEnv = script === "dashboard-redesign" ? { ...env, QA_VIEWPORTS: env.QA_VIEWPORTS || "phone,desktop" } : env;
    // #331: regression children are estimated with the forwarded --viewports. Fixed profiles (site, pf-stale-reload,
    // release-smoke) ignore that argv. dashboard-redesign keeps an empty argv and its QA_VIEWPORTS override.
    const childArgv = script === "site-style-regression" ? forwardedViewportArgs(argv) : [];
    const childHosts = {
      baseRemote: flags.baseRemote,
      compareRemote: child.script === "site-shell" && flags.compareRemote,
      previewRemote: false,
    };
    pieces.push(pieceFor(child.script, childArgv, childEnv, childHosts, profiles));
  }
  const total = pieces.reduce((sum, piece) => sum + piece.total, 0);
  const names = remoteHostNames([baseUrl, compareUrl, previewUrl]);
  const budgetLabel = budget.ok ? String(budget.budget) : "invalid";
  let line;
  if (local) line = LOCAL_ESTIMATE_LINE;
  else if (total === 0) line = `CDN estimate: 0 (remote host ${names.join(", ")}) budget ${budgetLabel}`;
  else if (pieces.length === 1) line = `CDN estimate: ${total} (${formatOne(pieces[0])}) budget ${budgetLabel}`;
  else line = `CDN estimate: ${total} (${pieces.map((piece) => `${piece.label} ${piece.total} (${formatOne(piece)})`).join(" + ")}) budget ${budgetLabel}`;

  const budgetOnly = hasFlag(argv, "budget-only");
  const release = hasFlag(argv, "release");
  const allow = hasFlag(argv, "allow-over-budget");
  let action = "allow";
  let refusal = "";
  if (!budget.ok) {
    action = "refuse";
    refusal = `REFUSED ${script}: --budget must be a positive integer`;
  } else if (budgetOnly) {
    action = "budget-only";
  } else if (!local && !release) {
    action = "refuse";
    refusal = `REFUSED ${script}: remote host ${names.join(", ")} needs --release`;
  } else if (!local && total > budget.budget && !allow) {
    action = "refuse";
    refusal = `REFUSED ${script}: CDN estimate ${total} is over the budget ${budget.budget}. Pass --allow-over-budget to run it.`;
  }
  return {
    action,
    exitCode: action === "budget-only" ? 0 : action === "refuse" ? 2 : 0,
    line,
    refusal,
    warning: action === "allow" && !local ? RELEASE_WARNING : "",
    total,
    local,
    pieces,
  };
}

/** Print the estimate (and the warning or the refusal) and exit on refuse / --budget-only. Allow returns. */
export function applyRemoteDecision(decision, { exit = process.exit, log = console.log } = {}) {
  log(decision.line);
  if (decision.action === "allow") {
    if (decision.warning) log(decision.warning);
    return decision;
  }
  if (decision.refusal) log(decision.refusal);
  exit(decision.exitCode);
  throw Object.assign(new Error(`exit ${decision.exitCode}`), { exitCode: decision.exitCode });
}
