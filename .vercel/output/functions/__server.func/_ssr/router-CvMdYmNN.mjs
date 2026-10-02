import { i as __toESM, n as __exportAll } from "../_runtime.mjs";
import { K as require_react, _ as createFileRoute, b as require_jsx_runtime, d as Scripts, f as HeadContent, g as lazyRouteComponent, h as Outlet, m as createRouter, v as createRootRoute, y as useRouter } from "../_libs/@tanstack/react-router+[...].mjs";
import { t as TriangleAlert } from "../_libs/lucide-react.mjs";
import { a as union, i as string, n as number, r as object, t as literal } from "../_libs/zod.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/router-CvMdYmNN.js
var router_CvMdYmNN_exports = /* @__PURE__ */ __exportAll({ getRouter: () => getRouter });
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var FALLBACK_MESSAGE = "An unexpected error occurred. Try reloading the page.";
function errorMessage(error) {
	if (error instanceof Error && error.message) return error.message;
	if (typeof error === "string" && error) return error;
	return FALLBACK_MESSAGE;
}
function AppErrorComponent({ error }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "text-red-500",
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TriangleAlert, {
					className: "size-10",
					strokeWidth: 2
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
				className: "text-lg font-semibold",
				children: "Something went wrong"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "max-w-md text-sm break-words text-zinc-500 dark:text-zinc-400",
				children: errorMessage(error)
			})
		]
	});
}
/**
* App-wide client provider mounted once near the root (in `src/routes/__root.tsx`):
*
*   <AuthProvider><Outlet /></AuthProvider>
*
* Better Auth's React client (`@/lib/auth/client`) needs NO context provider —
* its `useSession()` works standalone — so this is a passthrough today. It's
* kept as the single, stable mount point for any future client-side providers
* (e.g. a toast or theme provider) without churning the root shell.
*/
function AuthProvider({ children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children });
}
var CONNECTOR_TOKEN_READY_EVENT = "grok:connector-token-ready";
function isGrokEmbedderOrigin(origin) {
	try {
		const url = new URL(origin);
		if (url.protocol !== "https:" && url.protocol !== "http:") return false;
		const host = url.hostname.toLowerCase();
		if (host === "grok.com" || host.endsWith(".grok.com")) return true;
		if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return true;
		return false;
	} catch {
		return false;
	}
}
function isSandboxPreviewGuestHost(hostname) {
	const host = hostname.toLowerCase();
	return host === "grok-sandbox.com" || host.endsWith(".grok-sandbox.com");
}
function isRemintPreviewPair(guestHost, parentHost) {
	const guest = guestHost.toLowerCase();
	const parent = parentHost.toLowerCase();
	const i = guest.indexOf(".preview.");
	if (i <= 0) return false;
	const label = guest.slice(0, i);
	const rest = guest.slice(i + 9);
	if (label.includes(".") || !rest.includes(".")) return false;
	return parent === rest || parent === `grok.${rest}`;
}
function resolveParentEmbedderOrigin(parentIsSelf, referrer, ancestorOrigin, guestHostname = "") {
	if (parentIsSelf) return null;
	for (const candidate of [referrer, ancestorOrigin ?? ""].filter(Boolean)) try {
		const url = new URL(candidate.includes("://") ? candidate : `https://${candidate}`);
		if (url.protocol !== "https:" && url.protocol !== "http:") continue;
		if (isGrokEmbedderOrigin(url.origin)) return url.origin;
		if (isSandboxPreviewGuestHost(guestHostname) || isRemintPreviewPair(guestHostname, url.hostname)) return url.origin;
	} catch {}
	return null;
}
/**
* Guest side of the grok-web ↔ sandbox preview postMessage bridge.
*
* Activates only when this page is framed by an allowlisted Grok embedder.
* Top-level runs (download/export, local `npm run dev`, deployed sites) noop.
*/
var PREVIEW_BRIDGE_CHANNEL = "grok-preview-bridge";
var EnvelopeSchema = object({
	channel: literal(PREVIEW_BRIDGE_CHANNEL),
	version: number().int().positive(),
	type: string().min(1)
});
var HelloSchema = EnvelopeSchema.extend({ type: literal("hello") });
var NavigateSchema = EnvelopeSchema.extend({
	type: literal("navigate"),
	path: string().min(1)
});
var HistorySchema = EnvelopeSchema.extend({
	type: literal("history"),
	delta: union([literal(-1), literal(1)])
});
var ConnectorTokenReadySchema = EnvelopeSchema.extend({ type: literal("connector-token-ready") });
function isSafeBridgePath(path) {
	if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return false;
	try {
		return new URL(path, "https://preview.invalid").origin === "https://preview.invalid";
	} catch {
		return false;
	}
}
/**
* Origin of the Grok embedder framing this page, or null when the page runs
* top-level (download/export, local `npm run dev`, deployed sites) or under a
* non-Grok parent. Client-only; null during SSR.
*/
function resolveCurrentEmbedderOrigin() {
	if (typeof window === "undefined") return null;
	const ancestorOrigin = typeof location.ancestorOrigins !== "undefined" && location.ancestorOrigins.length > 0 ? location.ancestorOrigins[0] : null;
	return resolveParentEmbedderOrigin(window.parent === window, document.referrer, ancestorOrigin, window.location.hostname);
}
/**
* Install host↔guest messaging. Returns a dispose function.
* Noops (returns a no-op dispose) when not embedded under a Grok parent.
*/
function installPreviewHostBridge(options = {}) {
	const parentOrigin = resolveCurrentEmbedderOrigin();
	if (parentOrigin === null) return () => {};
	const ROOT_STATE_KEY = "__grokPreviewBridgeRoot";
	const originalPushState = window.history.pushState.bind(window.history);
	const originalReplaceState = window.history.replaceState.bind(window.history);
	const isAtHistoryRoot = () => {
		const state = window.history.state;
		return Boolean(state && typeof state === "object" && state[ROOT_STATE_KEY] === true);
	};
	try {
		const current = window.history.state;
		if (!(current !== null && typeof current === "object" && Object.prototype.hasOwnProperty.call(current, ROOT_STATE_KEY))) {
			const isRoot = window.history.length <= 1;
			originalReplaceState(current && typeof current === "object" ? {
				...current,
				[ROOT_STATE_KEY]: isRoot
			} : { [ROOT_STATE_KEY]: isRoot }, "", window.location.href);
		}
	} catch {}
	const post = (message) => {
		window.parent.postMessage(message, parentOrigin);
	};
	const reportLocation = () => {
		post({
			channel: PREVIEW_BRIDGE_CHANNEL,
			version: 1,
			type: "location",
			path: window.location.pathname || "/",
			search: window.location.search,
			hash: window.location.hash
		});
	};
	const reportRoutes = () => {
		const paths = options.getRoutePaths?.() ?? [];
		post({
			channel: PREVIEW_BRIDGE_CHANNEL,
			version: 1,
			type: "routes",
			paths
		});
	};
	const defaultNavigate = (path) => {
		if (!isSafeBridgePath(path)) return;
		try {
			const url = new URL(path, window.location.origin);
			if (url.origin !== window.location.origin) return;
			const next = `${url.pathname}${url.search}${url.hash}`;
			window.history.pushState(window.history.state, "", next);
			window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
		} catch {}
	};
	const navigate = (path) => {
		if (!isSafeBridgePath(path)) return;
		if (options.navigate) {
			options.navigate(path);
			return;
		}
		defaultNavigate(path);
	};
	const announce = () => {
		reportLocation();
		reportRoutes();
		post({
			channel: PREVIEW_BRIDGE_CHANNEL,
			version: 1,
			type: "ready"
		});
	};
	const onHello = (data) => {
		if (!HelloSchema.safeParse(data).success) return;
		announce();
	};
	const onNavigate = (data) => {
		const parsed = NavigateSchema.safeParse(data);
		if (!parsed.success) return;
		navigate(parsed.data.path);
		queueMicrotask(reportLocation);
	};
	const onHistory = (data) => {
		const parsed = HistorySchema.safeParse(data);
		if (!parsed.success) return;
		if (parsed.data.delta === -1 && isAtHistoryRoot()) return;
		window.history.go(parsed.data.delta);
	};
	const onConnectorTokenReady = (data) => {
		if (!ConnectorTokenReadySchema.safeParse(data).success) return;
		window.dispatchEvent(new Event(CONNECTOR_TOKEN_READY_EVENT));
	};
	const hostMessageHandlers = /* @__PURE__ */ new Map([
		["hello", onHello],
		["navigate", onNavigate],
		["history", onHistory],
		["connector-token-ready", onConnectorTokenReady]
	]);
	const onMessage = (event) => {
		if (event.source !== window.parent) return;
		if (event.origin !== parentOrigin) return;
		const envelope = EnvelopeSchema.safeParse(event.data);
		if (!envelope.success || envelope.data.version !== 1) return;
		hostMessageHandlers.get(envelope.data.type)?.(event.data);
	};
	const onPopState = () => {
		reportLocation();
	};
	const onHashChange = () => {
		reportLocation();
	};
	window.history.pushState = (data, unused, url) => {
		const next = data && typeof data === "object" ? {
			...data,
			[ROOT_STATE_KEY]: false
		} : data;
		originalPushState(next, unused, url);
		reportLocation();
	};
	window.history.replaceState = (data, unused, url) => {
		const next = isAtHistoryRoot() ? {
			...data && typeof data === "object" ? data : {},
			[ROOT_STATE_KEY]: true
		} : data;
		originalReplaceState(next, unused, url);
		reportLocation();
	};
	window.addEventListener("message", onMessage);
	window.addEventListener("popstate", onPopState);
	window.addEventListener("hashchange", onHashChange);
	announce();
	return () => {
		window.removeEventListener("message", onMessage);
		window.removeEventListener("popstate", onPopState);
		window.removeEventListener("hashchange", onHashChange);
		window.history.pushState = originalPushState;
		window.history.replaceState = originalReplaceState;
	};
}
/** Collect static path patterns from a TanStack route tree (best-effort). */
function collectRoutePathsFromTree(routeTree) {
	const paths = /* @__PURE__ */ new Set();
	const walk = (node) => {
		if (!node || typeof node !== "object") return;
		const record = node;
		const full = typeof record.fullPath === "string" ? record.fullPath : typeof record.path === "string" ? record.path : null;
		if (full !== null && full !== "") paths.add(full.startsWith("/") ? full : `/${full}`);
		else if (full === "") paths.add("/");
		const children = record.children;
		if (Array.isArray(children)) for (const child of children) walk(child);
		else if (children && typeof children === "object") for (const child of Object.values(children)) walk(child);
	};
	walk(routeTree);
	return [...paths];
}
/**
* Mount once in `__root.tsx` so the Grok preview chrome can drive navigation
* (and later receive registered routes). Noops when the app is not embedded.
*/
function PreviewHostBridge() {
	const router = useRouter();
	(0, import_react.useEffect)(() => {
		return installPreviewHostBridge({
			navigate: (path) => {
				router.history.push(path);
			},
			getRoutePaths: () => collectRoutePathsFromTree(router.routeTree)
		});
	}, [router]);
	return null;
}
var styles_default = "/assets/styles-CMoXdEGy.css";
var APP_NAME = "DCA vs lump sum";
var Route$2 = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1"
			},
			{ title: APP_NAME },
			{
				name: "description",
				content: "Compare a lump-sum cash plan with weekly or monthly contributions. Not a recommendation."
			},
			{
				name: "theme-color",
				content: "#f6f4ef"
			}
		],
		links: [
			{
				rel: "icon",
				type: "image/svg+xml",
				href: "/favicon.svg"
			},
			{
				rel: "stylesheet",
				href: styles_default
			},
			{
				rel: "manifest",
				href: "/__grok/manifest.webmanifest"
			},
			{
				rel: "apple-touch-icon",
				href: "/__grok/icon-180.png"
			}
		]
	}),
	component: () => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("html", {
		lang: "en",
		className: "antialiased",
		suppressHydrationWarning: true,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("head", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HeadContent, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("body", { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PreviewHostBridge, {}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AuthProvider, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Outlet, {}) }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Scripts, {})
		] })]
	})
});
var $$splitComponentImporter = () => import("./routes-Qg3YMm3Z.mjs");
var Route$1 = createFileRoute("/")({ component: lazyRouteComponent($$splitComponentImporter, "component") });
function laterFactor(stamp, splits) {
	let factor = 1;
	for (const split of splits) if (split.t > stamp && split.ratio > 0) factor *= split.ratio;
	return factor;
}
/**
* Yahoo's chart `close` is split-adjusted back to the latest share count.
* Raw close is that price times every split that happened after the bar.
* The split day's own close is already the post-split print, so it is left alone.
*/
function rawBars(bars, splits) {
	return bars.map((bar) => ({
		t: bar.t,
		px: bar.px * laterFactor(bar.t, splits)
	}));
}
/** Historical dividend amounts from Yahoo are scaled by later splits. Undo that. */
function rawDividends(dividends, splits) {
	return dividends.map((dividend) => ({
		t: dividend.t,
		amt: dividend.amt * laterFactor(dividend.t, splits)
	}));
}
var US = /* @__PURE__ */ new Set([
	"NMS",
	"NGM",
	"NCM",
	"NYQ",
	"ASE",
	"PCX",
	"BTS",
	"NasdaqGS",
	"NasdaqGM",
	"NasdaqCM",
	"NYSE",
	"NYSEArca",
	"NYSEAmerican",
	"AMEX",
	"BATS"
]);
var CA = /* @__PURE__ */ new Set([
	"TOR",
	"VAN",
	"NEO",
	"CNQ",
	"Toronto",
	"TSXV",
	"TSX",
	"TSX Venture",
	"Cboe CA",
	"CSE",
	"NEO Exchange"
]);
var EU = /* @__PURE__ */ new Set([
	"PAR",
	"AMS",
	"GER",
	"FRA",
	"MIL",
	"BIT",
	"MCE",
	"BRU",
	"STO",
	"HEL",
	"CPH",
	"VIE",
	"LIS",
	"WSE",
	"BUD",
	"DUB",
	"PRA",
	"ATH",
	"TAL",
	"EPA",
	"ETR",
	"MAD",
	"BME",
	"HAM",
	"MUN",
	"STU",
	"BER",
	"DUS",
	"Paris",
	"Amsterdam",
	"XETRA",
	"Frankfurt",
	"Milan",
	"Brussels",
	"Helsinki",
	"Copenhagen",
	"Vienna",
	"Lisbon",
	"Warsaw",
	"Budapest",
	"Dublin",
	"Madrid",
	"Stockholm",
	"Athens",
	"Prague",
	"Tallinn"
]);
function allowed(code) {
	return US.has(code) || CA.has(code) || EU.has(code);
}
/** Null when the listing is US, EU, or CA. Otherwise an error that names the exchange. */
function listingError(ticker, exchangeName, fullExchangeName) {
	const ex = (exchangeName ?? "").trim();
	const full = (fullExchangeName ?? "").trim();
	if (allowed(ex) || allowed(full)) return null;
	const label = full || ex || "an unknown exchange";
	if (/bse|bombay/i.test(ex) || /bse|bombay/i.test(full)) return `${ticker} lists on ${label}. BSE and other non US/EU/CA venues stay out unless you name an exception.`;
	return `${ticker} lists on ${label}. US, EU, and CA listings only, unless you name an exception.`;
}
var ChartError = class extends Error {
	status;
	constructor(status, message) {
		super(message);
		this.name = "ChartError";
		this.status = status;
	}
};
var DATE = /^\d{4}-\d{2}-\d{2}$/;
var TICKER = /^[A-Z0-9][A-Z0-9.-]{0,14}$/;
function daySeconds(iso) {
	const [y, m, d] = iso.split("-").map(Number);
	return Math.floor(Date.UTC(y, m - 1, d) / 1e3);
}
async function pull(ticker, query) {
	const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?${query}`;
	let response;
	try {
		response = await fetch(url, {
			headers: {
				"User-Agent": "Mozilla/5.0",
				Accept: "application/json"
			},
			signal: AbortSignal.timeout(2e4)
		});
	} catch {
		throw new ChartError(502, `Price feed refused ${ticker}.`);
	}
	const payload = await response.json().catch(() => null);
	if (!payload || typeof payload !== "object") throw new ChartError(502, `Price feed refused ${ticker}.`);
	return payload;
}
function toChart(ticker, payload) {
	const result = payload.chart?.result?.[0];
	if (!result?.timestamp?.length) return null;
	const meta = result.meta ?? {};
	const closes = result.indicators?.quote?.[0]?.close ?? [];
	const bars = result.timestamp.map((stamp, index) => ({
		t: stamp * 1e3,
		px: closes[index]
	})).filter((bar) => typeof bar.px === "number" && bar.px > 0);
	if (!bars.length) return null;
	const events = result.events ?? {};
	const dividends = Object.values(events.dividends ?? {}).filter((item) => typeof item.date === "number" && typeof item.amount === "number" && item.amount > 0).map((item) => ({
		t: item.date * 1e3,
		amt: item.amount
	})).sort((a, b) => a.t - b.t);
	const splits = Object.values(events.splits ?? {}).filter((item) => typeof item.date === "number" && typeof item.numerator === "number" && typeof item.denominator === "number" && item.denominator > 0).map((item) => ({
		t: item.date * 1e3,
		ratio: item.numerator / item.denominator
	})).sort((a, b) => a.t - b.t);
	return {
		ticker,
		exchange: (meta.fullExchangeName || meta.exchangeName || "").trim(),
		currency: (meta.currency || "").trim(),
		bars: rawBars(bars, splits),
		dividends: rawDividends(dividends, splits),
		splits
	};
}
async function loadChart(input) {
	const ticker = input.ticker.trim().toUpperCase();
	const start = input.start.trim();
	const end = input.end.trim();
	if (!ticker || !start || !end) throw new ChartError(400, "Ticker, start, and end are required.");
	if (!TICKER.test(ticker)) throw new ChartError(400, "Ticker looks wrong.");
	if (!DATE.test(start) || !DATE.test(end)) throw new ChartError(400, "Dates must be YYYY-MM-DD.");
	if (end < start) throw new ChartError(400, "End date is before the start date.");
	const dated = await pull(ticker, `period1=${daySeconds(start) - 1209600}&period2=${daySeconds(end) + 345600}&interval=1d&events=div%2Csplit`);
	const chart = toChart(ticker, dated);
	const meta = dated.chart?.result?.[0]?.meta;
	if (!chart) {
		const probe = await pull(ticker, "interval=1d&range=5d&events=div%2Csplit");
		const probed = probe.chart?.result?.[0]?.meta;
		if (probed) {
			const blocked = listingError(ticker, probed.exchangeName, probed.fullExchangeName);
			if (blocked) throw new ChartError(400, blocked);
		}
		throw new ChartError(404, `${ticker}: ${dated.chart?.error?.description || probe.chart?.error?.description || "no prices"}`);
	}
	const blocked = listingError(ticker, meta?.exchangeName, meta?.fullExchangeName);
	if (blocked) throw new ChartError(400, blocked);
	if (!chart.currency) throw new ChartError(404, `${ticker} has no currency on the price feed.`);
	return chart;
}
var Route = createFileRoute("/api/chart")({ server: { handlers: { GET: async ({ request }) => {
	const url = new URL(request.url);
	try {
		const body = await loadChart({
			ticker: url.searchParams.get("ticker") ?? "",
			start: url.searchParams.get("start") ?? "",
			end: url.searchParams.get("end") ?? ""
		});
		return Response.json(body, { headers: { "Cache-Control": "no-store" } });
	} catch (error) {
		const status = error instanceof ChartError ? error.status : 502;
		const message = error instanceof Error ? error.message : "Price feed failed.";
		return Response.json({ error: message }, {
			status,
			headers: { "Cache-Control": "no-store" }
		});
	}
} } } });
var rootRouteChildren = {
	IndexRoute: Route$1.update({
		id: "/",
		path: "/",
		getParentRoute: () => Route$2
	}),
	ApiChartRoute: Route.update({
		id: "/api/chart",
		path: "/api/chart",
		getParentRoute: () => Route$2
	})
};
var routeTree = Route$2._addFileChildren(rootRouteChildren)._addFileTypes();
function getRouter() {
	return createRouter({
		routeTree,
		defaultErrorComponent: AppErrorComponent
	});
}
//#endregion
export { getRouter, router_CvMdYmNN_exports as t };
