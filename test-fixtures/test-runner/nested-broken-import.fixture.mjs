// #183 repro: node prints `not ok` for "inner" but reports `# fail 0` and exits 0.
import { describe, it } from "node:test";
describe("outer", () => { it("ok", () => {}); describe("inner", async () => { await import("./does-not-exist.mjs"); }); });
