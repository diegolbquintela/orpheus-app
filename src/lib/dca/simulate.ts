import { contributionDates, utcDay, yearsBetween } from "./calendar.ts";
import type { ChartBar, ChartDiv, ChartSplit, DeskRun, Frequency, NameInput, PlanStats } from "./types";

type DatedPx = { date: string; px: number };
type DatedDiv = { date: string; amt: number };
type DatedSplit = { date: string; ratio: number };

type Book = { shares: number[]; invested: number };
type Point = { date: string; nlv: number; deployed: number };
type Flow = { years: number; amt: number };

function series(bars: ChartBar[]): DatedPx[] {
  const byDate = new Map<string, number>();
  for (const bar of bars) {
    if (!(bar.px > 0) || !Number.isFinite(bar.px)) continue;
    byDate.set(utcDay(bar.t), bar.px);
  }
  return [...byDate.entries()]
    .map(([date, px]) => ({ date, px }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function priceOnOrBefore(rows: DatedPx[], day: string): number | null {
  let lo = 0;
  let hi = rows.length - 1;
  let ans: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].date <= day) {
      ans = rows[mid].px;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

export function irr(flows: Flow[]): number | null {
  if (flows.length < 2) return null;
  const npv = (rate: number) => flows.reduce((sum, flow) => sum + flow.amt / (1 + rate) ** flow.years, 0);
  let lo = -0.9;
  let hi = 1;
  let nLo = npv(lo);
  let nHi = npv(hi);
  if (!Number.isFinite(nLo)) return null;
  for (let i = 0; i < 24 && nLo * nHi > 0; i++) {
    hi = hi * 2 + 0.5;
    nHi = npv(hi);
    if (!Number.isFinite(nHi)) return null;
  }
  if (!(nLo * nHi <= 0)) return null;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const value = npv(mid);
    if (!Number.isFinite(value)) return null;
    if (Math.abs(value) < 1e-7 || Math.abs(hi - lo) < 1e-9) return mid;
    if (nLo * value <= 0) {
      hi = mid;
      nHi = value;
    } else {
      lo = mid;
      nLo = value;
    }
  }
  return (lo + hi) / 2;
}

function cagr(startValue: number, endValue: number, years: number): number | null {
  if (!(years > 0) || !(startValue > 0) || !(endValue > 0)) return null;
  return (endValue / startValue) ** (1 / years) - 1;
}

function maxDrop(points: Point[]): Pick<PlanStats, "maxDrop" | "maxDropDate" | "nlvAtDrop" | "returnToDrop"> {
  const live = points.filter((point) => point.deployed > 0);
  const basis = live.length ? live : points;
  let peak = basis[0].nlv;
  let worst = 0;
  let at = basis[0];
  for (const point of basis) {
    if (point.nlv > peak) peak = point.nlv;
    const drop = peak > 0 ? (point.nlv - peak) / peak : 0;
    if (drop < worst) {
      worst = drop;
      at = point;
    }
  }
  return {
    maxDrop: worst,
    maxDropDate: at.date,
    nlvAtDrop: at.nlv,
    returnToDrop: at.deployed > 0 ? at.nlv / at.deployed - 1 : null,
  };
}

function stats(points: Point[], flows: Flow[], years: number): PlanStats {
  const end = points[points.length - 1];
  const drop = maxDrop(points);
  return {
    invested: end.deployed,
    endNlv: end.nlv,
    totalReturn: end.deployed > 0 ? end.nlv / end.deployed - 1 : null,
    cagr: cagr(end.deployed, end.nlv, years),
    mwr: irr(flows),
    ...drop,
  };
}

function book(count: number): Book {
  return { shares: Array.from({ length: count }, () => 0), invested: 0 };
}

/**
 * Lump sum deploys starting capital on the first session every name has a price.
 * DCA adds the contribution on each weekly or monthly date, on the first session
 * on or after that date. Event order each session: split, dividend, then cash.
 */
export function runDesk(input: {
  names: NameInput[];
  weights: number[];
  capital: number;
  contribution: number;
  frequency: Frequency;
  start: string;
  end: string;
}): DeskRun {
  const { names, weights, capital, contribution, frequency, start, end } = input;
  if (!names.length) throw new Error("Add at least one ticker.");
  if (names.length !== weights.length) throw new Error("Each ticker needs a weight.");
  if (!(capital > 0) || !(contribution > 0)) throw new Error("Capital and contribution must be above zero.");
  if (end < start) throw new Error("End date is before the start date.");

  const prices = names.map((name) => series(name.bars));
  const splits: DatedSplit[][] = names.map((name) =>
    name.splits
      .filter((split) => split.ratio > 0 && Number.isFinite(split.ratio))
      .map((split) => ({ date: utcDay(split.t), ratio: split.ratio }))
      .sort((a, b) => (a.date < b.date ? -1 : 1)),
  );
  const dividends: DatedDiv[][] = names.map((name) =>
    name.dividends
      .filter((dividend) => dividend.amt > 0 && Number.isFinite(dividend.amt))
      .map((dividend) => ({ date: utcDay(dividend.t), amt: dividend.amt }))
      .sort((a, b) => (a.date < b.date ? -1 : 1)),
  );

  const calendar = [
    ...new Set(
      prices.flatMap((rows) => rows.map((row) => row.date).filter((date) => date >= start && date <= end)),
    ),
  ].sort();
  if (calendar.length < 2) throw new Error("Need at least two sessions in that window.");

  const contribs = contributionDates(start, end, frequency);
  if (!contribs.length) throw new Error("No contribution dates in that window.");

  const lump = book(names.length);
  const dca = book(names.length);
  const splitAt = names.map(() => 0);
  const divAt = names.map(() => 0);
  const lumpFlows: Flow[] = [];
  const dcaFlows: Flow[] = [];
  const lumpPts: Point[] = [];
  const dcaPts: Point[] = [];
  const chart: DeskRun["chart"] = [];
  let lumpDone = false;
  let contribIndex = 0;
  let placed = 0;

  const priced = (day: string) => prices.every((rows) => (priceOnOrBefore(rows, day) ?? 0) > 0);

  const deploy = (target: Book, amount: number, day: string) => {
    names.forEach((_, index) => {
      const px = priceOnOrBefore(prices[index], day);
      if (!(px && px > 0)) return;
      target.shares[index] += (amount * weights[index]) / px;
    });
    target.invested += amount;
  };

  const mark = (target: Book, day: string) =>
    names.reduce((sum, _, index) => {
      const px = priceOnOrBefore(prices[index], day);
      return sum + (px ? target.shares[index] * px : 0);
    }, 0);

  for (const day of calendar) {
    names.forEach((_, index) => {
      while (splitAt[index] < splits[index].length && splits[index][splitAt[index]].date <= day) {
        const ratio = splits[index][splitAt[index]].ratio;
        lump.shares[index] *= ratio;
        dca.shares[index] *= ratio;
        splitAt[index] += 1;
      }
      while (divAt[index] < dividends[index].length && dividends[index][divAt[index]].date <= day) {
        const px = priceOnOrBefore(prices[index], day);
        if (!(px && px > 0)) break;
        const amt = dividends[index][divAt[index]].amt;
        if (lump.shares[index] > 0) lump.shares[index] += (lump.shares[index] * amt) / px;
        if (dca.shares[index] > 0) dca.shares[index] += (dca.shares[index] * amt) / px;
        divAt[index] += 1;
      }
    });

    if (!lumpDone && priced(day)) {
      deploy(lump, capital, day);
      lumpFlows.push({ years: yearsBetween(start, day), amt: -capital });
      lumpDone = true;
    }

    while (contribIndex < contribs.length && contribs[contribIndex] <= day) {
      if (!priced(day)) break;
      deploy(dca, contribution, day);
      dcaFlows.push({ years: yearsBetween(start, day), amt: -contribution });
      contribIndex += 1;
      placed += 1;
    }

    const lumpNlv = mark(lump, day);
    const dcaNlv = mark(dca, day);
    lumpPts.push({ date: day, nlv: lumpNlv, deployed: lump.invested });
    dcaPts.push({ date: day, nlv: dcaNlv, deployed: dca.invested });
    chart.push({ date: day, lump: lumpNlv, dca: dcaNlv });
  }

  if (!lumpDone) throw new Error("No common session where every name has a price.");
  if (!(dca.invested > 0)) throw new Error("No session to place the contributions.");

  const lastDay = calendar[calendar.length - 1];
  const years = yearsBetween(start, lastDay);
  lumpFlows.push({ years, amt: lumpPts[lumpPts.length - 1].nlv });
  dcaFlows.push({ years, amt: dcaPts[dcaPts.length - 1].nlv });

  return {
    sessions: calendar.length,
    years,
    lastPrices: prices.map((rows) => priceOnOrBefore(rows, lastDay)),
    shares: { lump: lump.shares, dca: dca.shares },
    lump: stats(lumpPts, lumpFlows, years),
    dca: stats(dcaPts, dcaFlows, years),
    chart,
    missedContributions: contribs.length - placed,
  };
}

export function scaleWeights(raw: number[]): { weights: number[]; scaled: boolean; sum: number } {
  const sum = raw.reduce((total, value) => total + value, 0);
  if (!(sum > 0)) throw new Error("Weights must sum above zero.");
  return {
    weights: raw.map((value) => value / sum),
    scaled: Math.abs(sum - 100) > 0.05,
    sum,
  };
}
