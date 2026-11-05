// #320: QA runs locally by default (cut CDN request burn). With no --base-url / QA_BASE_URL / --target, a QA tool
// builds with `npx vite build` (never `npm run build`, which also runs db:migrate) and serves the build with
// `npx vite preview --port 4173 --strictPort`, polled with fetch until it answers, and killed when the tool exits.
// The children get the env with every DATABASE_URL* / POSTGRES* var removed (QA never touches a database).
//
//   --target=local         the default (build + preview on 127.0.0.1:4173)
//   --local=dev            `npx vite dev --port 4173 --strictPort` instead (no build)
//   --no-build             reuse the existing .vercel/output build (preview only)
//   --target=preview       opt in: requires --base-url <preview url> (or QA_BASE_URL)
//   --target=prod          opt in: the production alias (tools still refuse writes / sign-in there)
//
// CLI flags only: no new env vars.
import { spawn, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const LOCAL_PORT = 4173;
export const LOCAL_BASE_URL = `http://127.0.0.1:${LOCAL_PORT}`;
export const PROD_BASE_URL = "https://orpheus-app-beta.vercel.app";
export const TARGETS = ["local", "preview", "prod"];
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export function flag(argv, name) {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === `--${name}`) return argv[i + 1];
    if (arg.startsWith(`--${name}=`)) return arg.slice(name.length + 3);
  }
  return undefined;
}
export const hasFlag = (argv, name) => argv.some((a) => a === `--${name}` || a.startsWith(`--${name}=`));

/** The env for a local server child: every DATABASE_URL* / POSTGRES* var removed. */
export const DB_VAR = /^(DATABASE_URL|POSTGRES)/;
export function childEnv(env = process.env) {
  return Object.fromEntries(Object.entries(env).filter(([k]) => !DB_VAR.test(k)));
}

/** The commands the local default runs, in order: [cmd, args][]. `mode` is "preview" (default) or "dev". */
export function localCommands({ mode = "preview", build = true, port = LOCAL_PORT } = {}) {
  const serve = ["--port", String(port), "--strictPort", "--host", "127.0.0.1"];
  if (mode === "dev") return [["npx", ["vite", "dev", ...serve]]];
  return [...(build ? [["npx", ["vite", "build"]]] : []), ["npx", ["vite", "preview", ...serve]]];
}

/**
 * Which target a tool runs against: { target, url, from }. `url` is null for the local default (the server isn't
 * started yet). Throws on an unknown --target or --target=preview without a URL.
 */
export function resolveTarget(argv = process.argv.slice(2), env = process.env) {
  const target = flag(argv, "target");
  if (target !== undefined && !TARGETS.includes(target)) throw new Error(`--target: unknown ${target} (local, preview, prod)`);
  const explicit = flag(argv, "base-url");
  if (explicit !== undefined) return { target: target ?? "url", url: explicit, from: "--base-url" };
  if (target === "prod") return { target, url: PROD_BASE_URL, from: "--target=prod" };
  if (env.QA_BASE_URL) return { target: target ?? "url", url: env.QA_BASE_URL, from: "QA_BASE_URL" };
  if (target === "preview") throw new Error("--target=preview needs --base-url <preview url>");
  return { target: "local", url: null, from: "default (local)" };
}

const POLL = `const u=process.argv[1],end=Date.now()+Number(process.argv[2]);(async()=>{for(;;){try{const r=await fetch(u,{redirect:"manual"});if(r.status>0)process.exit(0)}catch{}if(Date.now()>end)process.exit(1);await new Promise(r=>setTimeout(r,250))}})()`;

/**
 * Starts the local server synchronously (build, then a detached preview / dev child, then a fetch poll until it
 * answers) and kills its process group when this process exits. Returns { url, pid }. Injectable for tests.
 */
export function startLocal({ argv = process.argv.slice(2), env = process.env, spawnImpl = spawn, spawnSyncImpl = spawnSync, onExit = (fn) => process.on("exit", fn), timeoutMs = 60000, log = console.log } = {}) {
  const mode = flag(argv, "local") === "dev" ? "dev" : "preview";
  const cmds = localCommands({ mode, build: !hasFlag(argv, "no-build") });
  const cenv = childEnv(env);
  const serve = cmds.pop();
  for (const [cmd, args] of cmds) {
    log(`[qa local] ${cmd} ${args.join(" ")}`);
    const r = spawnSyncImpl(cmd, args, { cwd: REPO_ROOT, env: cenv, stdio: ["ignore", "ignore", "inherit"] });
    if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed (exit ${r.status})`);
  }
  log(`[qa local] ${serve[0]} ${serve[1].join(" ")}`);
  const child = spawnImpl(serve[0], serve[1], { cwd: REPO_ROOT, env: cenv, detached: true, stdio: "ignore" });
  const kill = () => {
    try { process.kill(-child.pid, "SIGTERM"); } catch { try { child.kill("SIGTERM"); } catch { /* already gone */ } }
  };
  onExit(kill);
  for (const sig of ["SIGINT", "SIGTERM"]) process.once?.(sig, () => { kill(); process.exit(130); });
  const ready = spawnSyncImpl(process.execPath, ["-e", POLL, `${LOCAL_BASE_URL}/`, String(timeoutMs)], { env: cenv, stdio: "ignore" });
  if (ready.status !== 0) { kill(); throw new Error(`local server on ${LOCAL_BASE_URL} did not answer within ${timeoutMs} ms`); }
  log(`[qa local] ready on ${LOCAL_BASE_URL} (pid ${child.pid}; killed on exit)`);
  return { url: LOCAL_BASE_URL, pid: child.pid, kill };
}
