import { describe, it } from "node:test";
describe("outer", () => { it("ok", () => {}); describe("inner", () => { throw new Error("collect boom"); }); });
