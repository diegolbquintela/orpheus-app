// Offline seed for the Research heatmap (#333). One Yahoo chart request per ticker through the
// existing pull() (no key). Writes src/lib/research/yearly-returns.seed.json. Not part of npm test.
import { writeFileSync } from "node:fs";
import { pull } from "../src/lib/dca/yahoo.server.ts";
import { dateInNewYork, pointsFromYahooChart, yearlyReturnsFromCloses, RETURN_SOURCE } from "../src/lib/research/returns.ts";

const UNIVERSE = [
  { ticker: "SPY", firstYear: 1994, from: "1993-01-01" },
  { ticker: "QQQ", firstYear: 1999, from: "1999-01-01" },
  { ticker: "VT", firstYear: 2008, from: "2008-01-01" },
  { ticker: "UPRO", firstYear: 2009, from: "2009-01-01" },
  { ticker: "TQQQ", firstYear: 2010, from: "2010-01-01" },
];

function daySeconds(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 1000);
}

const asOf = dateInNewYork(new Date());
const period2 = Math.floor(Date.now() / 1000) + 86400 * 4;
const rows = [];
for (const item of UNIVERSE) {
  const payload = await pull(item.ticker, `period1=${daySeconds(item.from)}&period2=${period2}&interval=1d&events=div%2Csplit`);
  const points = pointsFromYahooChart(payload);
  if (points.length < 2) throw new Error(`${item.ticker}: ${points.length} adjusted closes`);
  const part = yearlyReturnsFromCloses(points, { ticker: item.ticker, firstYear: item.firstYear, asOf });
  if (!part.length) throw new Error(`${item.ticker}: no yearly rows`);
  rows.push(...part);
  const last = part[part.length - 1];
  console.log(`${item.ticker} ${part.length} ${part[0].year}-${last.year} partial=${part[0].partial} ytd=${last.is_ytd} ${last.return_pct}`);
}
writeFileSync(
  new URL("../src/lib/research/yearly-returns.seed.json", import.meta.url),
  `${JSON.stringify({ asOf, source: RETURN_SOURCE, rows }, null, 2)}\n`,
);
console.log(`wrote ${rows.length} rows as of ${asOf}`);
