/**
 * #257 (spec §79): test-only. Since #257 `PUT /api/personal-finance` refuses a body without `baseVersion` (428).
 * The many server tests that SEED a record with a plain `{ data }` PUT act like a real tab: `loaded(handler)` reads
 * the version with a GET (same URL, cookies and deps) first and sends it as `baseVersion`, exactly what the client
 * does. A PUT that already names `baseVersion` (or is not JSON) is passed through untouched, so the 428 / 409 / 200
 * contract itself is tested raw in `stale-save.server.test.ts`. Never imported by app code.
 */
type Handler<D, C extends unknown[]> = (request: Request, deps: D, ...rest: C) => Promise<Response>;

export function loaded<D, C extends unknown[]>(handler: Handler<D, C>): Handler<D, C> {
  return async (request, deps, ...rest) => {
    if (request.method.toUpperCase() !== "PUT") return handler(request, deps, ...rest);
    const text = await request.clone().text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return handler(request, deps, ...rest);
    }
    if (!body || typeof body !== "object" || Array.isArray(body) || "baseVersion" in body) return handler(request, deps, ...rest);
    const headers = new Headers(request.headers);
    headers.delete("content-type");
    const got = await handler(new Request(request.url, { method: "GET", headers }), deps, ...rest);
    let version: string | null = null;
    if (got.ok) {
      const v = ((await got.json()) as { version?: unknown }).version;
      if (typeof v === "string") version = v;
    }
    return handler(new Request(request.url, { method: "PUT", headers: request.headers, body: JSON.stringify({ ...body, baseVersion: version }) }), deps, ...rest);
  };
}
