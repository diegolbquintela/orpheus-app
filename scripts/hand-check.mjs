#!/usr/bin/env node
/**
 * Independent cross-check of qa/fixtures.json.
 *
 * Deliberately shares NO code with src/lib/dca (no loadChart, rawBars, runDesk,
 * contributionDates). It reads the raw Yahoo JSON in qa/snapshots directly and
 * recomputes the plan with plain arithmetic, then compares end values with the
 * engine-generated expectations. Writes qa/HAND-CHECK.md.
 *
 *   npm run fixtures:hand-check
 */
import { readFileSync, writeFileSync } from "node:fs";

const fixtures = JSON.parse(readFileSync("qa/fixtures.json", "utf8"));
const CHECK_IDS = ["us-single-dividend-ko", "us-basket-jnj-pg-wmt", "ca-single-ry-to"];
const TOL = 1e-6; // relative

const iso = (sec) => new Date(sec * 1000).toISOString().slice(0, 10);

function loadRaw(path) {
  const snap = JSON.parse(readFileSync(path, "utf8"));
  const r = snap.requests[0].body.chart.result[0];
  const close = r.indicators.quote[0].close;
  const splits = Object.values(r.events?.splits ?? {}).map((s) => ({
    date: iso(s.date),
    sec: s.date,
    ratio: s.numerator / s.denominator,
  }));
  // Yahoo's close and dividend amounts are scaled back by later splits; multiply them out.
  const later = (sec) => splits.filter((s) => s.sec > sec).reduce((f, s) => f * s.ratio, 1);
  const px = new Map();
  r.timestamp.forEach((sec, i) => {
    if (typeof close[i] === "number" && close[i] > 0) px.set(iso(sec), close[i] * later(sec));
  });
  const divs = Object.values(r.events?.dividends ?? {}).map((d) => ({
    date: iso(d.date),
    amt: d.amount * later(d.date),
  }));
  return { px, divs, splits };
}

function monthlyOrWeekly(start, end, frequency) {
  const out = [];
  const [y0, m0, d0] = start.split("-").map(Number);
  for (let k = 0; ; k++) {
    let d;
    if (frequency === "weekly") d = new Date(Date.UTC(y0, m0 - 1, d0 + 7 * k));
    else {
      const lastDay = new Date(Date.UTC(y0, m0 - 1 + k + 1, 0)).getUTCDate();
      d = new Date(Date.UTC(y0, m0 - 1 + k, Math.min(d0, lastDay)));
    }
    const s = d.toISOString().slice(0, 10);
    if (s > end) return out;
    out.push(s);
  }
}

function handRun(fx) {
  const { tickers, weights, start, end, capital, contribution, frequency } = fx.inputs;
  const total = weights.reduce((a, b) => a + b, 0);
  const w = weights.map((x) => x / total);
  const names = fx.data.snapshots.map(loadRaw);
  const days = [...new Set(names.flatMap((n) => [...n.px.keys()]))]
    .filter((d) => d >= start && d <= end)
    .sort();
  const last = (n, day) => {
    let best = null;
    for (const [d, p] of n.px) if (d <= day && (best == null || d > best[0])) best = [d, p];
    return best ? best[1] : null;
  };
  const lump = tickers.map(() => 0);
  const dca = tickers.map(() => 0);
  const doneDiv = names.map(() => new Set());
  const doneSplit = names.map(() => new Set());
  const plan = monthlyOrWeekly(start, end, frequency);
  let next = 0;
  let lumpIn = false;
  let dcaInvested = 0;
  const log = [];
  for (const day of days) {
    names.forEach((n, i) => {
      for (const s of n.splits)
        if (s.date <= day && !doneSplit[i].has(s.date)) {
          doneSplit[i].add(s.date);
          lump[i] *= s.ratio;
          dca[i] *= s.ratio;
          log.push(`${day} ${tickers[i]} split ${s.ratio}:1`);
        }
      for (const dv of n.divs)
        if (dv.date <= day && !doneDiv[i].has(dv.date)) {
          doneDiv[i].add(dv.date);
          const p = last(n, day);
          const before = lump[i];
          lump[i] += (lump[i] * dv.amt) / p;
          dca[i] += (dca[i] * dv.amt) / p;
          log.push(
            `${day} ${tickers[i]} div ${dv.amt.toFixed(4)} @ ${p.toFixed(4)}: lump ${before.toFixed(6)} -> ${lump[i].toFixed(6)} sh`,
          );
        }
    });
    if (!lumpIn) {
      names.forEach((n, i) => (lump[i] = (capital * w[i]) / last(n, day)));
      lumpIn = true;
      log.push(
        `${day} lump ${capital} -> ${tickers.map((t, i) => `${t} ${lump[i].toFixed(6)} sh`).join(", ")}`,
      );
    }
    while (next < plan.length && plan[next] <= day) {
      names.forEach((n, i) => (dca[i] += (contribution * w[i]) / last(n, day)));
      dcaInvested += contribution;
      next++;
    }
  }
  const lastDay = days[days.length - 1];
  const value = (sh) => sh.reduce((s, x, i) => s + x * last(names[i], lastDay), 0);
  return {
    lumpEnd: value(lump),
    dcaEnd: value(dca),
    lumpShares: lump,
    dcaShares: dca,
    dcaInvested,
    lastDay,
    log,
  };
}

const rel = (a, b) => Math.abs(a - b) / Math.max(1, Math.abs(b));
let ok = true;
const sections = [];
for (const id of CHECK_IDS) {
  const fx = fixtures.find((f) => f.id === id);
  const hand = handRun(fx);
  const e = fx.expected;
  const rows = [
    ["Lump end value", hand.lumpEnd, e.run.lump.endNlv],
    ["DCA end value", hand.dcaEnd, e.run.dca.endNlv],
    ["DCA cash invested", hand.dcaInvested, e.run.dca.invested],
    ...fx.inputs.tickers.map((t, i) => [
      `${t} lump shares`,
      hand.lumpShares[i],
      e.run.shares.lump[i],
    ]),
    ...fx.inputs.tickers.map((t, i) => [`${t} DCA shares`, hand.dcaShares[i], e.run.shares.dca[i]]),
  ];
  const caseOk = rows.every(([, h, x]) => rel(h, x) < TOL);
  ok &&= caseOk;
  sections.push(
    [
      `## ${id}: ${caseOk ? "MATCH" : "MISMATCH"}`,
      "",
      `Inputs: ${fx.inputs.tickers.join(", ")} weights ${fx.inputs.weights.join("/")}, ${fx.inputs.start} to ${fx.inputs.end}, capital ${fx.inputs.capital}, contribution ${fx.inputs.contribution} ${fx.inputs.frequency}. Last session ${hand.lastDay}.`,
      "",
      "| Quantity | Hand calc | Engine fixture | Rel. diff |",
      "|---|---:|---:|---:|",
      ...rows.map(
        ([k, h, x]) =>
          `| ${k} | ${h.toFixed(6)} | ${x.toFixed(6)} | ${rel(h, x).toExponential(2)} |`,
      ),
      "",
      "Event log (hand path):",
      "",
      "```",
      ...hand.log,
      "```",
      "",
    ].join("\n"),
  );
}

const md = [
  "# Hand check of qa/fixtures.json",
  "",
  "Generated by `npm run fixtures:hand-check` (scripts/hand-check.mjs). That script shares no code with",
  "`src/lib/dca`: it reads the raw Yahoo payloads in `qa/snapshots/` directly and redoes the arithmetic:",
  "",
  "1. Raw price = Yahoo `close` x every split ratio dated after the bar (Yahoo back-adjusts closes for splits only, not dividends). Dividend amounts are un-scaled the same way.",
  "2. Lump sum: on the first session, shares_i = capital x weight_i / price_i (all capital on day one).",
  "3. DCA: contribution dates are start + k months (clamped to month end) or start + 7k days; each date adds `contribution x weight_i / price_i` on the first session on or after it. No starting capital in the DCA plan.",
  "4. Each session, before any cash: split => shares x ratio; dividend on its ex-date => shares += shares x amount / close (reinvested in the same name).",
  "5. End value = sum(shares_i x last close_i).",
  "",
  `Tolerance: relative difference < ${TOL}. Overall: **${ok ? "MATCH" : "MISMATCH"}**.`,
  "",
  ...sections,
].join("\n");
writeFileSync("qa/HAND-CHECK.md", md);
console.log(`hand check: ${ok ? "MATCH" : "MISMATCH"}`);
process.exit(ok ? 0 : 1);
