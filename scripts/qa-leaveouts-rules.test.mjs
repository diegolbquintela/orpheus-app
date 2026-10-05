// The leave-out rules shared by qa/tools/dashboard-leaveouts.mjs and leaveouts.dom.test.tsx (#59, DR6-01..05,
// DR0-07): each rule catches its leave-out, and the dashboard's kept lines pass.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { leaveOutFindings } from "../qa/tools/leaveouts-rules.mjs";

const ctl = (o) => ({ tag: "button", role: null, type: null, name: "", href: null, download: false, pressed: null, ...o });
const clean = {
  text: "Holdings Metrics Apple Inc. 3,803.00 CAD 8 shares 17.5% Total 21,749.53 CAD Prices as of 2026-10-02 close · FX 2026-10-02 EPS 3.04 USD 1,234.5%",
  controls: [ctl({ name: "Holdings", pressed: "true" }), ctl({ name: "Metrics", pressed: "false" }), ctl({ name: "Add" }), ctl({ tag: "a", name: "Calculator", href: "/calculator" })],
  paragraphs: [
    { text: "Signed in as book@example.com", alert: false },
    { text: "Prices as of 2026-10-02 close · FX 2026-10-02", alert: false },
    { text: "Prices are out of date. No daily refresh has completed yet.", alert: false },
    { text: "Total 1 holding without a price excluded 1,690,149.30 CAD", alert: false },
    { text: "Total 21,749.53 CAD", alert: false },
    { text: "Database: connected · 11/11 tables", alert: false },
    { text: "Shares must be greater than 0.", alert: true },
  ],
};
const found = (snap) => Object.fromEntries(Object.entries(leaveOutFindings(snap)).filter(([, v]) => v.length));

describe("leave-out rules (#59)", () => {
  it("the dashboard's kept lines and controls pass", () => assert.deepEqual(found(clean), {}));
  it("DR6-01 Connect broker", () => {
    assert.ok(found({ text: "Connect broker" })["DR6-01 no Connect broker"]);
    assert.ok(found({ text: "", controls: [ctl({ tag: "a", name: "Link", href: "https://link.plaid.com/x" })] })["DR6-01 no Connect broker"]);
  });
  it("DR6-02 K/M/B and unseparated numbers (dates and years aside)", () => {
    for (const t of ["1.2M CAD", "Total 3K", "4 B", "17500 shares", "1234.5 USD"]) assert.ok(found({ text: t })["DR6-02 no K/M/B, full digits"], t);
    assert.deepEqual(found({ text: "2026-10-02 close FY2025 2025 1,234,567.89 CAD 999 KO" }), {});
  });
  it("DR6-03 ownership toggle", () => {
    assert.ok(found({ text: "Show % owned" })["DR6-03 no ownership toggle"]);
    assert.ok(found({ text: "", controls: [ctl({ role: "switch", name: "Mine" })] })["DR6-03 no ownership toggle"]);
    assert.ok(found({ text: "", controls: [ctl({ tag: "input", type: "checkbox", name: "x" })] })["DR6-03 no ownership toggle"]);
    assert.ok(found({ text: "", controls: [ctl({ name: "Joint", pressed: "true" })] })["DR6-03 no ownership toggle"]);
  });
  it("DR6-04 download / export", () => {
    for (const t of ["Download", "Export holdings", "CSV"]) assert.ok(found({ text: t })["DR6-04 no download / export"], t);
    assert.ok(found({ text: "", controls: [ctl({ tag: "a", name: "x", href: "blob:abc", download: true })] })["DR6-04 no download / export"]);
  });
  it("DR6-05 instructions: any paragraph that isn't a kept line", () => {
    const p = { text: "US, EU and CA listings only. Average cost is per share, in the listing currency.", alert: false };
    assert.deepEqual(found({ text: "", paragraphs: [p] })["DR6-05 no instructions (kept lines only)"], [p.text]);
  });
  it("DR0-07 wording", () => {
    for (const t of ["Buy", "sell now", "hold", "Not a recommendation", "undervalued", "price target"]) assert.ok(found({ text: t })["DR0-07 no buy / sell wording or disclaimer"], t);
    assert.deepEqual(found({ text: "Holdings · Add a holding · Share of the book" }), {});
  });
});
