import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deniedLine,
  isLevel,
  LEVEL_LABEL,
  levelOf,
  normaliseEmail,
  ownerEmailFromEnv,
  roleLines,
  SURFACE_ROLE,
} from "./access.ts";
import { temporaryPassword } from "./access.server.ts";

// #90 (attachments/roles-and-account-design.md; Q-D1..Q-D18 decided): the pure access rules and copy.
describe("access rules (#90)", () => {
  it("roles: CFO → Personal finance, Portfolio Manager → Dashboard; three levels, no write without read (Q-D2)", () => {
    assert.deepEqual(SURFACE_ROLE, { personal_finance: "CFO", dashboard: "Portfolio Manager" });
    assert.deepEqual(LEVEL_LABEL, { none: "No access", read: "Read", read_write: "Read and write" });
    assert.equal(levelOf(undefined), "none");
    assert.equal(levelOf({ can_read: true, can_write: false }), "read");
    assert.equal(levelOf({ can_read: true, can_write: true }), "read_write");
    assert.equal(levelOf({ can_read: false, can_write: true }), "none", "write without read is no access");
    assert.equal(isLevel("write"), false);
  });

  it("role lines (ROLE-04): Owner; one line per grant (Q-D3 both); No access", () => {
    assert.deepEqual(roleLines(true, { personal_finance: "none", dashboard: "none" }), ["Owner"]);
    assert.deepEqual(roleLines(false, { personal_finance: "read", dashboard: "read_write" }), [
      "CFO · Personal finance · Read",
      "Portfolio Manager · Dashboard · Read and write",
    ]);
    assert.deepEqual(roleLines(false, { personal_finance: "none", dashboard: "none" }), ["No access"]);
  });

  it("the owner comes only from ORPHEUS_OWNER_EMAIL (any case); unset → nobody (fail closed)", () => {
    assert.equal(ownerEmailFromEnv({ ORPHEUS_OWNER_EMAIL: " Diego@Example.com " }), "diego@example.com");
    assert.equal(ownerEmailFromEnv({}), null);
    assert.equal(ownerEmailFromEnv({ ORPHEUS_OWNER_EMAIL: "not-an-email" }), null);
    assert.equal(normaliseEmail("a@b"), null);
  });

  it("denied copy (ROLE-14)", () => {
    assert.equal(deniedLine("personal_finance"), "You don't have access to Personal finance.");
    assert.equal(deniedLine("dashboard"), "You don't have access to the Dashboard.");
  });

  it("temporary passwords (Q-D4): 18 characters, no look-alikes, different every time", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = temporaryPassword();
      assert.equal(p.length, 18);
      assert.match(p, /^[a-km-zA-HJ-NP-Z2-9]+$/);
      seen.add(p);
    }
    assert.equal(seen.size, 200);
  });
});
