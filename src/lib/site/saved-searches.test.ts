import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addSearch,
  asSearch,
  LAST_KEY,
  readLast,
  readSaved,
  SAVED_KEY,
  SAVED_MAX,
  saveSearch,
  searchLine,
  type SavedSearch,
} from "./saved-searches.ts";

class Memory {
  map = new Map<string, string>();
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
}

const search = (over: Partial<SavedSearch> = {}): SavedSearch => ({
  rows: [
    { ticker: "PLTR", weight: "50" },
    { ticker: "TQQQ", weight: "50" },
  ],
  start: "2020-10-02",
  end: "2026-10-01",
  capital: "1000",
  contribution: "1000",
  frequency: "weekly",
  currency: "USD",
  ...over,
});

describe("saved searches (#80, spec §7b; ST4-20..24)", () => {
  it("the two localStorage keys, exactly", () => {
    assert.equal(LAST_KEY, "orpheus.calculator.last.v1");
    assert.equal(SAVED_KEY, "orpheus.calculator.saved.v1");
    assert.equal(SAVED_MAX, 5);
  });

  it("the line: tickers · start – end · DCA <the search's own contribution>", () => {
    assert.equal(searchLine(search()), "PLTR, TQQQ · 2020-10-02 – 2026-10-01 · DCA $1,000");
    assert.equal(
      searchLine(search({ contribution: "100", rows: [{ ticker: "VOO", weight: "1" }] })),
      "VOO · 2020-10-02 – 2026-10-01 · DCA $100",
    );
    assert.equal(
      searchLine(search({ contribution: "2,500", currency: "CAD" })),
      "PLTR, TQQQ · 2020-10-02 – 2026-10-01 · DCA CA$2,500",
    );
  });

  it("save: the last search and the list newest first; a repeat moves to the top; 5 at most, the oldest drops", () => {
    const store = new Memory();
    for (let i = 1; i <= 6; i++) saveSearch(store, search({ contribution: String(i * 100) }));
    const list = readSaved(store);
    assert.deepEqual(
      list.map((s) => s.contribution),
      ["600", "500", "400", "300", "200"],
    );
    assert.equal(readLast(store)?.contribution, "600");
    saveSearch(store, search({ contribution: "300" }));
    assert.deepEqual(
      readSaved(store).map((s) => s.contribution),
      ["300", "600", "500", "400", "200"],
    );
    assert.deepEqual(addSearch([], search()).length, 1);
  });

  it("nothing stored, malformed values, or no storage read as empty (never throws)", () => {
    const store = new Memory();
    assert.deepEqual(readSaved(store), []);
    assert.equal(readLast(store), null);
    store.setItem(SAVED_KEY, "{not json");
    store.setItem(LAST_KEY, JSON.stringify({ rows: [] }));
    assert.deepEqual(readSaved(store), []);
    assert.equal(readLast(store), null);
    store.setItem(
      SAVED_KEY,
      JSON.stringify([search(), { nope: 1 }, search({ frequency: "daily" as "weekly" })]),
    );
    assert.equal(readSaved(store).length, 1);
    assert.deepEqual(readSaved(null), []);
    assert.equal(asSearch("x"), null);
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    assert.deepEqual(readSaved(blocked), []);
    assert.equal(
      saveSearch(blocked, search()).length,
      1,
      "a blocked storage keeps nothing but doesn't throw",
    );
  });

  it("no account: the module imports nothing from auth, the dashboard or the network", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./saved-searches.ts", import.meta.url), "utf8");
    assert.doesNotMatch(src, /auth|dashboard|fetch\(|cookie|sessionStorage|indexedDB/i);
  });
});
