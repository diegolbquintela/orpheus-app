import { i as __toESM } from "../_runtime.mjs";
import { K as require_react, b as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as Plus, r as Minus } from "../_libs/lucide-react.mjs";
import { a as CartesianGrid, i as Line, n as YAxis, o as ResponsiveContainer, r as XAxis, s as Tooltip, t as LineChart } from "../_libs/recharts+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-Qg3YMm3Z.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function money(value, currency) {
	try {
		return value.toLocaleString("en-US", {
			style: "currency",
			currency: currency || "USD",
			maximumFractionDigits: 0
		});
	} catch {
		return `${currency} ${Math.round(value).toLocaleString("en-US")}`;
	}
}
function pct(value) {
	if (value == null || !Number.isFinite(value)) return "—";
	const points = value * 100;
	const body = `${Math.abs(points).toFixed(1)}%`;
	if (points < 0) return `−${body}`;
	if (points > 0) return `+${body}`;
	return "0.0%";
}
function quote(value) {
	if (value == null || !Number.isFinite(value)) return "—";
	const digits = value >= 1e3 ? 0 : value >= 1 ? 2 : 4;
	return value.toLocaleString("en-US", {
		minimumFractionDigits: digits,
		maximumFractionDigits: digits
	});
}
function shareCount(value) {
	return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}
function weightLabel(weight) {
	return `${(weight * 100).toFixed(1)}%`;
}
function utcDay(ms) {
	return new Date(ms).toISOString().slice(0, 10);
}
function yearsBetween(origin, day) {
	const a = Date.parse(`${origin}T00:00:00Z`);
	return (Date.parse(`${day}T00:00:00Z`) - a) / 315576e5;
}
function addDays(iso, days) {
	const [y, m, d] = iso.split("-").map(Number);
	return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
/** Same day-of-month, or the last day when the next month is shorter. */
function addMonths(iso) {
	const [y, m, d] = iso.split("-").map(Number);
	const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
	const day = Math.min(d, last);
	return new Date(Date.UTC(y, m, day)).toISOString().slice(0, 10);
}
function contributionDates(start, end, frequency) {
	const dates = [];
	let cursor = start;
	while (cursor <= end) {
		dates.push(cursor);
		const next = frequency === "weekly" ? addDays(cursor, 7) : addMonths(cursor);
		if (next <= cursor) break;
		cursor = next;
	}
	return dates;
}
function series(bars) {
	const byDate = /* @__PURE__ */ new Map();
	for (const bar of bars) {
		if (!(bar.px > 0) || !Number.isFinite(bar.px)) continue;
		byDate.set(utcDay(bar.t), bar.px);
	}
	return [...byDate.entries()].map(([date, px]) => ({
		date,
		px
	})).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
}
function priceOnOrBefore(rows, day) {
	let lo = 0;
	let hi = rows.length - 1;
	let ans = null;
	while (lo <= hi) {
		const mid = lo + hi >> 1;
		if (rows[mid].date <= day) {
			ans = rows[mid].px;
			lo = mid + 1;
		} else hi = mid - 1;
	}
	return ans;
}
function irr(flows) {
	if (flows.length < 2) return null;
	const npv = (rate) => flows.reduce((sum, flow) => sum + flow.amt / (1 + rate) ** flow.years, 0);
	let lo = -.9;
	let hi = 1;
	let nLo = npv(lo);
	let nHi = npv(hi);
	if (!Number.isFinite(nLo)) return null;
	for (let i = 0; i < 24 && nLo * nHi > 0; i++) {
		hi = hi * 2 + .5;
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
function cagr(startValue, endValue, years) {
	if (!(years > 0) || !(startValue > 0) || !(endValue > 0)) return null;
	return (endValue / startValue) ** (1 / years) - 1;
}
function maxDrop(points) {
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
		returnToDrop: at.deployed > 0 ? at.nlv / at.deployed - 1 : null
	};
}
function stats(points, flows, years) {
	const end = points[points.length - 1];
	const drop = maxDrop(points);
	return {
		invested: end.deployed,
		endNlv: end.nlv,
		totalReturn: end.deployed > 0 ? end.nlv / end.deployed - 1 : null,
		cagr: cagr(end.deployed, end.nlv, years),
		mwr: irr(flows),
		...drop
	};
}
function book(count) {
	return {
		shares: Array.from({ length: count }, () => 0),
		invested: 0
	};
}
/**
* Lump sum deploys starting capital on the first session every name has a price.
* DCA adds the contribution on each weekly or monthly date, on the first session
* on or after that date. Event order each session: split, dividend, then cash.
*/
function runDesk(input) {
	const { names, weights, capital, contribution, frequency, start, end } = input;
	if (!names.length) throw new Error("Add at least one ticker.");
	if (names.length !== weights.length) throw new Error("Each ticker needs a weight.");
	if (!(capital > 0) || !(contribution > 0)) throw new Error("Capital and contribution must be above zero.");
	if (end < start) throw new Error("End date is before the start date.");
	const prices = names.map((name) => series(name.bars));
	const splits = names.map((name) => name.splits.filter((split) => split.ratio > 0 && Number.isFinite(split.ratio)).map((split) => ({
		date: utcDay(split.t),
		ratio: split.ratio
	})).sort((a, b) => a.date < b.date ? -1 : 1));
	const dividends = names.map((name) => name.dividends.filter((dividend) => dividend.amt > 0 && Number.isFinite(dividend.amt)).map((dividend) => ({
		date: utcDay(dividend.t),
		amt: dividend.amt
	})).sort((a, b) => a.date < b.date ? -1 : 1));
	const calendar = [...new Set(prices.flatMap((rows) => rows.map((row) => row.date).filter((date) => date >= start && date <= end)))].sort();
	if (calendar.length < 2) throw new Error("Need at least two sessions in that window.");
	const contribs = contributionDates(start, end, frequency);
	if (!contribs.length) throw new Error("No contribution dates in that window.");
	const lump = book(names.length);
	const dca = book(names.length);
	const splitAt = names.map(() => 0);
	const divAt = names.map(() => 0);
	const lumpFlows = [];
	const dcaFlows = [];
	const lumpPts = [];
	const dcaPts = [];
	const chart = [];
	let lumpDone = false;
	let contribIndex = 0;
	let placed = 0;
	const priced = (day) => prices.every((rows) => (priceOnOrBefore(rows, day) ?? 0) > 0);
	const deploy = (target, amount, day) => {
		names.forEach((_, index) => {
			const px = priceOnOrBefore(prices[index], day);
			if (!(px && px > 0)) return;
			target.shares[index] += amount * weights[index] / px;
		});
		target.invested += amount;
	};
	const mark = (target, day) => names.reduce((sum, _, index) => {
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
				if (lump.shares[index] > 0) lump.shares[index] += lump.shares[index] * amt / px;
				if (dca.shares[index] > 0) dca.shares[index] += dca.shares[index] * amt / px;
				divAt[index] += 1;
			}
		});
		if (!lumpDone && priced(day)) {
			deploy(lump, capital, day);
			lumpFlows.push({
				years: yearsBetween(start, day),
				amt: -capital
			});
			lumpDone = true;
		}
		while (contribIndex < contribs.length && contribs[contribIndex] <= day) {
			if (!priced(day)) break;
			deploy(dca, contribution, day);
			dcaFlows.push({
				years: yearsBetween(start, day),
				amt: -contribution
			});
			contribIndex += 1;
			placed += 1;
		}
		const lumpNlv = mark(lump, day);
		const dcaNlv = mark(dca, day);
		lumpPts.push({
			date: day,
			nlv: lumpNlv,
			deployed: lump.invested
		});
		dcaPts.push({
			date: day,
			nlv: dcaNlv,
			deployed: dca.invested
		});
		chart.push({
			date: day,
			lump: lumpNlv,
			dca: dcaNlv
		});
	}
	if (!lumpDone) throw new Error("No common session where every name has a price.");
	if (!(dca.invested > 0)) throw new Error("No session to place the contributions.");
	const lastDay = calendar[calendar.length - 1];
	const years = yearsBetween(start, lastDay);
	lumpFlows.push({
		years,
		amt: lumpPts[lumpPts.length - 1].nlv
	});
	dcaFlows.push({
		years,
		amt: dcaPts[dcaPts.length - 1].nlv
	});
	return {
		sessions: calendar.length,
		years,
		lastPrices: prices.map((rows) => priceOnOrBefore(rows, lastDay)),
		shares: {
			lump: lump.shares,
			dca: dca.shares
		},
		lump: stats(lumpPts, lumpFlows, years),
		dca: stats(dcaPts, dcaFlows, years),
		chart,
		missedContributions: contribs.length - placed
	};
}
function scaleWeights(raw) {
	const sum = raw.reduce((total, value) => total + value, 0);
	if (!(sum > 0)) throw new Error("Weights must sum above zero.");
	return {
		weights: raw.map((value) => value / sum),
		scaled: Math.abs(sum - 100) > .05,
		sum
	};
}
var METRICS = [
	{
		key: "invested",
		label: "Total invested",
		lump: (ready) => money(ready.run.lump.invested, ready.currency),
		dca: (ready) => money(ready.run.dca.invested, ready.currency)
	},
	{
		key: "nlv",
		label: "NLV at end",
		lump: (ready) => money(ready.run.lump.endNlv, ready.currency),
		dca: (ready) => money(ready.run.dca.endNlv, ready.currency)
	},
	{
		key: "total",
		label: "Total return",
		lump: (ready) => pct(ready.run.lump.totalReturn),
		dca: (ready) => pct(ready.run.dca.totalReturn)
	},
	{
		key: "cagr",
		label: "CAGR",
		lump: (ready) => pct(ready.run.lump.cagr),
		dca: (ready) => pct(ready.run.dca.cagr)
	},
	{
		key: "mwr",
		label: "Money-weighted return",
		lump: (ready) => pct(ready.run.lump.mwr),
		dca: (ready) => pct(ready.run.dca.mwr)
	},
	{
		key: "drop",
		label: "Max drop",
		lump: (ready) => `${pct(ready.run.lump.maxDrop)} on ${ready.run.lump.maxDropDate}`,
		dca: (ready) => `${pct(ready.run.dca.maxDrop)} on ${ready.run.dca.maxDropDate}`
	},
	{
		key: "drop-nlv",
		label: "NLV at that drop",
		lump: (ready) => money(ready.run.lump.nlvAtDrop, ready.currency),
		dca: (ready) => money(ready.run.dca.nlvAtDrop, ready.currency)
	},
	{
		key: "drop-ret",
		label: "Return from start to the drop",
		lump: (ready) => pct(ready.run.lump.returnToDrop),
		dca: (ready) => pct(ready.run.dca.returnToDrop)
	}
];
async function loadChart(ticker, start, end) {
	const response = await fetch(`/api/chart?ticker=${encodeURIComponent(ticker)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
	const body = await response.json().catch(() => ({}));
	if (!response.ok) throw new Error(body.error || `Price feed refused ${ticker}.`);
	return body;
}
function Desk() {
	const nextId = (0, import_react.useRef)(1);
	const resultRef = (0, import_react.useRef)(null);
	const [rows, setRows] = (0, import_react.useState)([{
		id: "1",
		ticker: "",
		weight: ""
	}]);
	const [start, setStart] = (0, import_react.useState)("");
	const [end, setEnd] = (0, import_react.useState)("");
	const [capital, setCapital] = (0, import_react.useState)("");
	const [contribution, setContribution] = (0, import_react.useState)("");
	const [frequency, setFrequency] = (0, import_react.useState)("");
	const [error, setError] = (0, import_react.useState)("");
	const [pending, setPending] = (0, import_react.useState)(false);
	const [ready, setReady] = (0, import_react.useState)(null);
	function addRow() {
		nextId.current += 1;
		setRows((current) => [...current, {
			id: String(nextId.current),
			ticker: "",
			weight: ""
		}]);
	}
	function updateRow(id, patch) {
		setRows((current) => current.map((row) => row.id === id ? {
			...row,
			...patch
		} : row));
	}
	function removeRow(id) {
		setRows((current) => current.length === 1 ? current : current.filter((row) => row.id !== id));
	}
	async function onSubmit(event) {
		event.preventDefault();
		setError("");
		setReady(null);
		try {
			const filled = rows.map((row) => ({
				ticker: row.ticker.trim().toUpperCase(),
				weight: row.weight.trim()
			})).filter((row) => row.ticker || row.weight);
			if (!filled.length) throw new Error("Add at least one ticker.");
			if (filled.some((row) => !row.ticker || row.weight === "")) throw new Error("Each row needs a ticker and a weight.");
			const tickers = filled.map((row) => row.ticker);
			if (new Set(tickers).size !== tickers.length) throw new Error("Duplicate ticker.");
			const rawWeights = filled.map((row) => Number(row.weight));
			if (rawWeights.some((value) => !Number.isFinite(value) || value < 0)) throw new Error("Weights must be zero or more.");
			const scaled = scaleWeights(rawWeights);
			const capitalValue = Number(capital);
			const contributionValue = Number(contribution);
			if (!(capitalValue > 0)) throw new Error("Enter a starting capital above zero.");
			if (!(contributionValue > 0)) throw new Error("Enter a contribution above zero.");
			if (frequency !== "weekly" && frequency !== "monthly") throw new Error("Choose weekly or monthly.");
			if (!start || !end) throw new Error("Enter a start date and an end date.");
			if (end < start) throw new Error("End date is before the start date.");
			setPending(true);
			const names = await Promise.all(tickers.map((ticker) => loadChart(ticker, start, end)));
			const currency = names[0]?.currency ?? "";
			if (!currency || names.some((name) => name.currency !== currency)) throw new Error(`Mixed currencies (${names.map((name) => `${name.ticker} ${name.currency || "?"}`).join(", ")}). One currency per basket. No conversion in this version.`);
			const run = runDesk({
				names,
				weights: scaled.weights,
				capital: capitalValue,
				contribution: contributionValue,
				frequency,
				start,
				end
			});
			setReady({
				run,
				names,
				weights: scaled.weights,
				scaled: scaled.scaled,
				enteredSum: scaled.sum,
				currency
			});
			const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
			requestAnimationFrame(() => {
				resultRef.current?.scrollIntoView({
					behavior: reduce ? "auto" : "smooth",
					block: "start"
				});
			});
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Could not run the comparison.");
		} finally {
			setPending(false);
		}
	}
	const note = ready ? [
		`${ready.names.map((name) => name.ticker).join(" · ")} · ${ready.currency} · ${ready.run.sessions} sessions.`,
		ready.scaled ? `Weights entered ${ready.enteredSum.toFixed(1)}%, scaled to 100%.` : "",
		"Lump sum deploys starting capital on the first common session. DCA adds the contribution as new cash on each date.",
		ready.run.missedContributions ? `${ready.run.missedContributions} contribution date${ready.run.missedContributions === 1 ? "" : "s"} had no session on or after them, so that cash is not in the DCA total.` : "",
		"Dividends reinvested. CAGR treats contributions as if they had been in for the full window; money-weighted does not. Not a recommendation."
	].filter(Boolean).join(" ") : "";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "flex max-w-3xl flex-col gap-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
						className: "text-balance text-3xl font-medium tracking-tight sm:text-4xl",
						children: "DCA vs lump sum"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-pretty text-muted",
						children: "Same window, two cash plans, one name or a weighted basket. Lump sum deploys the starting capital on the first session every name has a price, split by weight. DCA does not use that capital. On each weekly or monthly date it adds the contribution as new cash, split by weight. Dividends are reinvested in the name that paid them. Splits change the share count. Prices are raw daily closes."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-sm text-muted",
						children: "Not a recommendation. US, EU, and CA listings only. One currency."
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
				onSubmit,
				autoComplete: "off",
				className: "flex flex-col gap-5",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("fieldset", {
						className: "flex flex-col gap-3",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("legend", {
								className: "mb-1 text-sm font-medium tracking-wide text-muted uppercase",
								children: "Basket"
							}),
							rows.map((row, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "basket-row",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
										className: "flex flex-col gap-1 text-sm text-muted",
										children: [index === 0 ? "Ticker" : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "sr-only",
											children: "Ticker"
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
											value: row.ticker,
											onChange: (event) => updateRow(row.id, { ticker: event.target.value }),
											spellCheck: false,
											autoCapitalize: "characters",
											className: "h-11 rounded-control border border-line bg-card px-3 text-base text-ink"
										})]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
										className: "flex flex-col gap-1 text-sm text-muted",
										children: [index === 0 ? "Weight %" : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "sr-only",
											children: "Weight percent"
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
											value: row.weight,
											onChange: (event) => updateRow(row.id, { weight: event.target.value }),
											inputMode: "decimal",
											className: "h-11 rounded-control border border-line bg-card px-3 text-base text-ink tabular-nums"
										})]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: () => removeRow(row.id),
										disabled: rows.length === 1,
										"aria-label": "Remove name",
										className: "flex h-11 w-11 items-center justify-center rounded-control border border-line bg-card text-ink disabled:opacity-40",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Minus, {
											className: "size-4",
											"aria-hidden": "true"
										})
									})
								]
							}, row.id)),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								onClick: addRow,
								className: "inline-flex h-11 items-center gap-2 self-start rounded-control border border-line bg-card px-3 text-sm text-ink",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, {
									className: "size-4",
									"aria-hidden": "true"
								}), "Add name"]
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "grid gap-4 sm:grid-cols-2",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "flex flex-col gap-1 text-sm text-muted",
								children: ["Start date", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									type: "date",
									value: start,
									onChange: (event) => setStart(event.target.value),
									className: "h-11 rounded-control border border-line bg-card px-3 text-base text-ink"
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "flex flex-col gap-1 text-sm text-muted",
								children: ["End date", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									type: "date",
									value: end,
									onChange: (event) => setEnd(event.target.value),
									className: "h-11 rounded-control border border-line bg-card px-3 text-base text-ink"
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "flex flex-col gap-1 text-sm text-muted",
								children: [
									"Starting capital",
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-xs text-muted",
										children: "Used only by the lump-sum plan."
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										value: capital,
										onChange: (event) => setCapital(event.target.value),
										inputMode: "decimal",
										className: "h-11 rounded-control border border-line bg-card px-3 text-base text-ink tabular-nums"
									})
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "flex flex-col gap-1 text-sm text-muted",
								children: [
									"Contribution",
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-xs text-muted",
										children: "New cash on each DCA date."
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										value: contribution,
										onChange: (event) => setContribution(event.target.value),
										inputMode: "decimal",
										className: "h-11 rounded-control border border-line bg-card px-3 text-base text-ink tabular-nums"
									})
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "flex flex-col gap-1 text-sm text-muted sm:col-span-2",
								children: ["Frequency", /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
									value: frequency,
									onChange: (event) => setFrequency(event.target.value),
									className: "h-11 rounded-control border border-line bg-card px-3 text-base text-ink",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "" }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: "weekly",
											children: "Weekly"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: "monthly",
											children: "Monthly"
										})
									]
								})]
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "submit",
						disabled: pending,
						className: "inline-flex h-11 items-center justify-center self-start rounded-control bg-ink px-5 text-sm font-medium text-paper disabled:opacity-50",
						children: pending ? "Reading prices…" : "Compare plans"
					})
				]
			}),
			error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: error
			}) : null,
			ready ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				ref: resultRef,
				className: "flex flex-col gap-6",
				"aria-live": "polite",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "overflow-x-auto rounded-panel border border-line bg-card",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
							className: "w-full min-w-xl border-collapse text-sm tabular-nums",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
								className: "text-left text-xs tracking-wide text-muted uppercase",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-4 py-3 font-medium" }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "px-4 py-3 font-medium",
										children: "Lump sum"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "px-4 py-3 font-medium",
										children: "DCA"
									})
								]
							}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: METRICS.map((metric) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
								className: "border-t border-line",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "px-4 py-3 text-left font-normal text-muted",
										children: metric.label
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										className: "px-4 py-3",
										children: metric.lump(ready)
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										className: "px-4 py-3",
										children: metric.dca(ready)
									})
								]
							}, metric.key)) })]
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "overflow-x-auto rounded-panel border border-line bg-card",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
							className: "w-full min-w-xl border-collapse text-sm tabular-nums",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
								className: "text-left text-xs tracking-wide text-muted uppercase",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "px-4 py-3 font-medium",
										children: "Name"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "px-4 py-3 font-medium",
										children: "Weight"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "px-4 py-3 font-medium",
										children: "Last"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "px-4 py-3 font-medium",
										children: "Lump sum shares"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "px-4 py-3 font-medium",
										children: "DCA shares"
									})
								]
							}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: ready.names.map((name, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
								className: "border-t border-line",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "px-4 py-3 text-left font-medium",
										children: name.ticker
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										className: "px-4 py-3",
										children: weightLabel(ready.weights[index] ?? 0)
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										className: "px-4 py-3",
										children: quote(ready.run.lastPrices[index] ?? null)
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										className: "px-4 py-3",
										children: shareCount(ready.run.shares.lump[index] ?? 0)
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										className: "px-4 py-3",
										children: shareCount(ready.run.shares.dca[index] ?? 0)
									})
								]
							}, name.ticker)) })]
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("figure", {
						className: "rounded-panel border border-line bg-card p-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("figcaption", {
							className: "mb-3 flex flex-wrap gap-4 text-sm text-muted",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "inline-flex items-center gap-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", {
									className: "inline-block h-0.5 w-5 bg-ink",
									"aria-hidden": "true"
								}), "Lump sum NLV"]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "inline-flex items-center gap-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", {
									className: "inline-block h-0.5 w-5 bg-dca",
									"aria-hidden": "true"
								}), "DCA NLV"]
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "h-80 w-full",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ResponsiveContainer, {
								width: "100%",
								height: "100%",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(LineChart, {
									data: ready.run.chart,
									margin: {
										top: 8,
										right: 8,
										left: 0,
										bottom: 0
									},
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CartesianGrid, {
											stroke: "var(--color-line)",
											vertical: false
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(XAxis, {
											dataKey: "date",
											tick: {
												fill: "var(--color-muted)",
												fontSize: 12
											},
											tickLine: false,
											axisLine: false,
											minTickGap: 32
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(YAxis, {
											tick: {
												fill: "var(--color-muted)",
												fontSize: 12
											},
											tickLine: false,
											axisLine: false,
											width: 72,
											tickFormatter: (value) => money(value, ready.currency)
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Tooltip, {
											formatter: (value, name) => [money(Number(value), ready.currency), name === "lump" ? "Lump sum" : "DCA"],
											labelFormatter: (label) => String(label),
											contentStyle: {
												background: "var(--color-card)",
												border: "1px solid var(--color-line)",
												borderRadius: 8,
												fontSize: 13
											}
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Line, {
											type: "monotone",
											dataKey: "lump",
											name: "lump",
											stroke: "var(--color-ink)",
											strokeWidth: 2,
											dot: false,
											isAnimationActive: false
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Line, {
											type: "monotone",
											dataKey: "dca",
											name: "dca",
											stroke: "var(--color-dca)",
											strokeWidth: 2,
											dot: false,
											isAnimationActive: false
										})
									]
								})
							})
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-pretty text-sm text-muted",
						children: note
					})
				]
			}) : null
		]
	});
}
var SplitComponent = Desk;
//#endregion
export { SplitComponent as component };
