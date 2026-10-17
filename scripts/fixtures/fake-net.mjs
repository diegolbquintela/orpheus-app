// Test-only preload for scripts/qa-prod-guard.test.mjs (#157 F7). It guarantees ZERO real traffic: node's net / tls /
// http(s) refuse to connect, `fetch` is answered locally, and `playwright` is replaced by a recording fake (via
// fake-loader.mjs). Every attempted request is appended to $FAKE_LOG as "<METHOD> <url>".
import { appendFileSync } from "node:fs";
import { register } from "node:module";
import net from "node:net";
import tls from "node:tls";
import http from "node:http";
import https from "node:https";

const LOG = process.env.FAKE_LOG;
export const record = (method, url) => LOG && appendFileSync(LOG, `${String(method).toUpperCase()} ${url}\n`);
globalThis.__fakeRecord = record;
const refuse = (what) => (...a) => {
  record("NET", `${what} ${JSON.stringify(a[0])?.slice(0, 80)}`);
  throw new Error(`fake-net: no ${what}`);
};
net.connect = net.createConnection = refuse("net");
tls.connect = refuse("tls");
http.request = http.get = refuse("http");
https.request = https.get = refuse("https");
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === "string" || input instanceof URL ? String(input) : input.url;
  const method = (init.method ?? "GET").toUpperCase();
  record(method, url);
  return new Response(method === "HEAD" ? null : "<!doctype html><title>fake</title>", { status: 200, headers: { "content-type": "text/html" } });
};
register(new URL("./fake-loader.mjs", import.meta.url));
