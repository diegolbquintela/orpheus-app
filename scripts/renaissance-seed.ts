#!/usr/bin/env node
/**
 * #267 one-time seed for the Renaissance Man dashboard (attachments/renaissance-spec.md section 8).
 *
 *   node --experimental-strip-types scripts/renaissance-seed.ts <tracker.md>                 # dry run: prints the bodies
 *   node --experimental-strip-types scripts/renaissance-seed.ts <tracker.md> --post <origin>  # sends them
 *
 * `--post` sends each day to `<origin>/api/renaissance/checkin` with `Authorization: Bearer $RENAISSANCE_INGEST_TOKEN`
 * (read from the environment, never printed). It never opens a database connection: the endpoint's upsert on
 * (date, item) makes a re-run a no-op. Only the owner/EL runs `--post`, once, after the migration is applied.
 */
import { readFileSync } from "node:fs";
import { parseTracker } from "../src/lib/renaissance/seed.ts";
import { parseCheckin } from "../src/lib/renaissance/model.ts";

const [file, flag, origin] = process.argv.slice(2);
if (!file) {
  console.error("usage: renaissance-seed.ts <tracker.md> [--post <origin>]");
  process.exit(2);
}
const bodies = parseTracker(readFileSync(file, "utf8"));
for (const b of bodies) {
  const v = parseCheckin(b);
  if (!v.ok) {
    console.error(`[seed] ${b.date}: ${v.error}`);
    process.exit(1);
  }
}
if (flag !== "--post") {
  console.log(JSON.stringify(bodies, null, 2));
  console.error(`[seed] dry run: ${bodies.length} day(s). Add --post <origin> to send.`);
} else {
  const token = process.env.RENAISSANCE_INGEST_TOKEN;
  if (!origin || !token) {
    console.error("[seed] --post needs an origin and RENAISSANCE_INGEST_TOKEN set.");
    process.exit(2);
  }
  for (const b of bodies) {
    const res = await fetch(new URL("/api/renaissance/checkin", origin), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(b),
    });
    console.log(`[seed] ${b.date}: ${res.status}`);
    if (!res.ok) process.exit(1);
  }
}
