// #156 / PR #174 (docs/release/pf-reports-rollback.md): the runbook's SQL, run against local PGlite only. The
// SELECT, the count and the restore are read from the doc itself, so the doc can't drift from what was tested.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const doc = readFileSync(new URL("../docs/release/pf-reports-rollback.md", import.meta.url), "utf8");
const block = (marker) => {
  const m = doc.match(new RegExp(`<!-- ${marker} -->\\n\`\`\`sql\\n([\\s\\S]*?)\`\`\``));
  assert.ok(m, marker);
  return m[1];
};
const SELECT = block("pf-reports-select");
const COUNT = block("pf-reports-count");
const RESTORE = block("pf-reports-restore");
const restoreFile = readFileSync(new URL("../docs/release/pf-reports-rollback.restore.sql", import.meta.url), "utf8");

const REPORT = JSON.stringify({ series: [{ kind: "group", id: "all" }], range: { preset: "12m" }, chart: "line" });
const NAMED = JSON.stringify([{ id: "r-0a1b2c3d", name: "Spend", report: JSON.parse(REPORT), created_at: "2026-10-17T14:00:00.000Z", updated_at: "2026-10-17T14:00:00.000Z" }]);

async function db() {
  const pg = new PGlite();
  await pg.exec('CREATE TABLE "user" (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT \'\', email TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now())');
  await pg.exec(readFileSync(new URL("../migrations/0010_personal_finance.sql", import.meta.url), "utf8"));
  for (const id of ["alice", "bob", "carol", "dan"]) await pg.query('INSERT INTO "user" (id, email) VALUES ($1, $2)', [id, `${id}@x`]);
  const put = (id, data) => pg.query("INSERT INTO personal_finance (user_id, data) VALUES ($1, $2::jsonb)", [id, JSON.stringify(data)]);
  await put("alice", { "orpheus.finance.expenses.v2": "{}", "orpheus.finance.report.v1": REPORT, "orpheus.finance.reports.v1": NAMED });
  await put("bob", { "orpheus.finance.reports.v1": NAMED });
  await put("carol", { "orpheus.finance.report.v1": REPORT });
  await put("dan", { "orpheus.finance.expenses.v2": "{}" });
  return pg;
}

describe("#156 PF reports rollback runbook SQL (PGlite only)", () => {
  it("the SELECT returns every row with a report key (and only those), keys as JSON strings", async () => {
    const pg = await db();
    const rows = (await pg.query(SELECT)).rows;
    assert.deepEqual(rows.map((r) => r.user_id), ["alice", "bob", "carol"]);
    assert.equal(rows[0].report_v1, REPORT);
    assert.equal(rows[0].reports_v1, NAMED);
    assert.equal(rows[1].report_v1, null);
    assert.equal(rows[2].reports_v1, null);
    assert.equal(Number((await pg.query(COUNT)).rows[0].count), 3);
  });

  it("the restore (WRITE) puts the keys back after a pre-#174 save dropped them, keeping other keys", async () => {
    const pg = await db();
    const lines = (await pg.query(`SELECT row_to_json(t) AS line FROM (${SELECT.replace(/;\s*$/, "")}) t`)).rows.map((r) => r.line);
    // A pre-#174 record save: the row is rewritten without the report keys.
    await pg.query(`UPDATE personal_finance SET data = '{"orpheus.finance.expenses.v2":"{\\"x\\":1}"}'::jsonb WHERE user_id = 'alice'`);
    await pg.query("DELETE FROM personal_finance WHERE user_id = 'bob'");
    await pg.query(`DELETE FROM "user" WHERE id = 'carol'`);
    assert.equal(RESTORE, restoreFile.split("\n").slice(1).join("\n"), "the .sql file is the doc's SQL");
    const sql = RESTORE.split("\n")
      .map((l) => (l.startsWith("\\copy") ? lines.map((x) => `INSERT INTO pf_reports_restore (line) VALUES ('${JSON.stringify(x).replace(/'/g, "''")}'::jsonb);`).join("\n") : l))
      .join("\n");
    await pg.exec(sql);
    const data = Object.fromEntries((await pg.query("SELECT user_id, data FROM personal_finance ORDER BY user_id")).rows.map((r) => [r.user_id, r.data]));
    assert.deepEqual(data.alice, { "orpheus.finance.expenses.v2": '{"x":1}', "orpheus.finance.report.v1": REPORT, "orpheus.finance.reports.v1": NAMED });
    assert.deepEqual(data.bob, { "orpheus.finance.reports.v1": NAMED });
    assert.equal(data.carol, undefined, "a deleted user is skipped");
    assert.deepEqual(data.dan, { "orpheus.finance.expenses.v2": "{}" });
    assert.equal(Number((await pg.query(COUNT)).rows[0].count), 2);
  });
});
