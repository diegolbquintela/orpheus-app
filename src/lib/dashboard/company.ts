/**
 * #95 Dashboard company view (attachments/dashboard-company-view-design.md section 2). Pure: the server loads the
 * stored data (company.server.ts), this turns it into the page's sections, rows and texts; the page and the API show
 * the same output. No I/O, no feed.
 */

import { FUND_LINE, SOURCE_LINE_FUND, type InstrumentKind } from "./fund.ts";

export type CompanyYear = {
  /** Fiscal year end, YYYY-MM-DD. */
  end: string;
  values: Partial<Record<string, number>>;
  units: Partial<Record<string, string>>;
  /** #123 (E1 / E5): concepts whose value came from a fallback, not a reported tag: concept → method. */
  derived?: Partial<Record<string, DerivedMethod>>;
};

/** #123 (ES-13): how a derived figure was obtained (only set when the fallback actually ran). */
export type DerivedMethod = "shares_from_eps" | "capex_broad_ifrs";
export const DERIVED_TITLE: Record<DerivedMethod, string> = {
  shares_from_eps: "Derived: diluted shares = net income ÷ diluted EPS (the filing reports no diluted share count).",
  capex_broad_ifrs:
    "Derived: capex from the broad IFRS line (purchases of property, plant and equipment, intangible assets and other non-current assets); the filing reports no PPE-only capex.",
};
/** #123: the marker text shown next to a derived row's label. */
export const DERIVED_MARKER = "derived";
/** #130 (CV-16, Q-T1): the ROIC method, disclosed in the tooltip by the ROIC label (the formula is `roic()`, unchanged). */
export const ROIC_METHOD =
  "Operating income after tax ÷ average (equity + debt − cash). Cash excluded.";
export const ROIC_INFO_LABEL = "How ROIC is calculated";

export type StoredMetric = { value: number | null; status: string };

export type CompanyInput = {
  symbol: string;
  name: string | null;
  exchange: string | null;
  /** Listing currency (the closes' currency). */
  currency: string;
  /** SEC companyfacts coverage (`instruments.fundamentals_source = 'sec'`). */
  covered: boolean;
  /** #123: which filings cover it (`'esef'` = ESEF annual reports via filings.xbrl.org); default SEC. */
  fundamentalsSource?: "sec" | "esef";
  /** Fundamentals checked yet (`fundamentals_checked_at` not null). */
  checked: boolean;
  /** Daily closes, oldest first. */
  closes: { date: string; close: number }[];
  /** Fiscal years, newest first. */
  years: CompanyYear[];
  metrics: Partial<Record<string, StoredMetric>>;
  dividends: { exDate: string; cash: number }[];
  /** Today (YYYY-MM-DD), for the trailing twelve months. */
  today: string;
  /** #124: OpenFIGI classification (`instruments.provider_ids.openfigi.kind`); missing = not classified yet. */
  kind?: InstrumentKind | null;
  /** #124: OpenFIGI `securityType` (e.g. `ETP`), when classified. */
  securityType?: string | null;
};

export type RowStatus = "ok" | "n/m" | "not_covered" | "pending" | "not_reported" | "mismatch" | "none";
export type CompanyRow = {
  key: string;
  label: string;
  text: string;
  status: RowStatus;
  value: number | null;
  /** #123 (ES-13): set only on a shown figure computed from a derived input; the accessible explanation. */
  derived?: string;
};
export type CompanySection = { key: string; title: string; note: string | null; rows: CompanyRow[] };
export type ChartPoint = [date: string, close: number];

export type CompanyView = {
  symbol: string;
  name: string;
  exchange: string | null;
  currency: string;
  last: { close: number; date: string; text: string } | null;
  fiscalYear: string | null;
  reportingCurrency: string | null;
  chart: ChartPoint[];
  sections: CompanySection[];
  /** #121 (NC-01): `Not covered: no SEC filings` for a checked listing without SEC filings, else null. */
  coverage: string | null;
  source: string;
  /** #124 (FD-07): `fund` when OpenFIGI types it as a fund; `unknown` when not classified or not found. */
  kind: InstrumentKind;
  /** #124 (FD-07): `Fund: company figures do not apply` for a fund, else null. */
  fund: string | null;
  securityType: string | null;
};

export const RANGES = [
  { key: "1y", label: "1Y", days: 365 },
  { key: "5y", label: "5Y", days: 5 * 365 },
  { key: "max", label: "Max", days: Infinity },
] as const;
export type RangeKey = (typeof RANGES)[number]["key"];

export const SECTION_TITLES = ["Profile", "Margins", "Returns", "Valuation", "Growth", "Dividends"] as const;
export const SOURCE_LINE = "SEC filings (companyfacts) · daily closes as stored by the Dashboard";
/** #123 (ES-08): an ESEF-covered listing's source line (figures in the filing currency). */
export const SOURCE_LINE_ESEF = "ESEF annual reports via filings.xbrl.org · daily closes as stored by the Dashboard";
/** #121 (NC-01, NC-03): an uncovered listing's top line and source line. */
export const NOT_COVERED_LINE = "Not covered: no SEC filings";
export const SOURCE_LINE_UNCOVERED = "Daily closes and dividends as stored by the Dashboard · no SEC filings for this listing";

// ---------------------------------------------------------------- formatting

/**
 * Money with every digit (the Dashboard leave-out rule DR6: no K / M / B; Q-C7): whole units from one million up,
 * cents below.
 */
export function money(v: number, currency: string): string {
  const big = Math.abs(v) >= 1e6;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: big ? 0 : 2,
      minimumFractionDigits: big ? 0 : 2,
    }).format(v);
  } catch {
    return `${count(v)} ${currency}`;
  }
}
export function count(v: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: Math.abs(v) >= 1e6 ? 0 : 1 }).format(v);
}
export const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
export const multiple = (v: number) => `${v.toFixed(1)}×`;

const STATUS_TEXT: Record<Exclude<RowStatus, "ok">, string> = {
  "n/m": "n/m",
  not_covered: "Not covered",
  pending: "Pending",
  not_reported: "Not reported",
  mismatch: "— (currency mismatch)",
  none: "No dividends",
};

const ok = (key: string, label: string, value: number, text: string): CompanyRow => ({ key, label, text, status: "ok", value });
const off = (key: string, label: string, status: Exclude<RowStatus, "ok">): CompanyRow => ({
  key,
  label,
  text: STATUS_TEXT[status],
  status,
  value: null,
});

// ---------------------------------------------------------------- math

const ratio = (a: number | undefined, b: number | undefined): number | "n/m" | undefined =>
  a === undefined || b === undefined ? undefined : b <= 0 ? "n/m" : a / b;

/** Average of the latest and prior year-end values (the latest alone when there is no prior one). */
function avg(years: CompanyYear[], f: (y: CompanyYear) => number | undefined): number | undefined {
  const a = years[0] ? f(years[0]) : undefined;
  if (a === undefined) return undefined;
  const b = years[1] ? f(years[1]) : undefined;
  return b === undefined ? a : (a + b) / 2;
}

/** Total debt by the ROIC rules (dashboard-spec §8): short-term + long-term (current + noncurrent, or total). */
export function totalDebt(v: CompanyYear["values"]): number {
  const short = (v.short_term_borrowings ?? 0) + (v.commercial_paper ?? 0) + (v.other_short_term_borrowings ?? 0);
  const longSplit =
    v.long_term_debt_current !== undefined || v.long_term_debt_noncurrent !== undefined
      ? (v.long_term_debt_current ?? 0) + (v.long_term_debt_noncurrent ?? 0)
      : undefined;
  const long = longSplit ?? v.long_term_debt ?? 0;
  const ifrsCurrent = v.current_borrowings_total;
  return ifrsCurrent !== undefined && v.long_term_debt_current === undefined && short === 0
    ? ifrsCurrent + (v.long_term_debt_noncurrent ?? 0)
    : short + long;
}

/** Closes for the chart: the last year daily, older ones every 5th session (keeps the payload small). */
export function chartPoints(closes: CompanyInput["closes"], today: string): ChartPoint[] {
  const cut = shiftDays(today, -366);
  return closes
    .filter((c, i) => c.date >= cut || i % 5 === 0 || i === closes.length - 1)
    .map((c) => [c.date, c.close] as ChartPoint);
}

export function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The points of one range and the change over it (first → last). */
export function rangeOf(points: ChartPoint[], range: RangeKey): { points: ChartPoint[]; change: number | null } {
  const days = RANGES.find((r) => r.key === range)?.days ?? 365;
  const last = points.at(-1);
  if (!last) return { points: [], change: null };
  const from = Number.isFinite(days) ? shiftDays(last[0], -days) : "";
  const pts = points.filter((p) => p[0] >= from);
  const first = pts[0];
  return { points: pts, change: first && first[1] > 0 ? last[1] / first[1] - 1 : null };
}

// ---------------------------------------------------------------- the view

export function companyView(input: CompanyInput): CompanyView {
  const lastClose = input.closes.at(-1);
  const latest = input.years[0];
  const v = latest?.values ?? {};
  const reporting = latest?.units.revenue ?? latest?.units.net_income ?? null;
  const sameCurrency = reporting === null || reporting === input.currency;
  // No SEC coverage, or not checked yet: one status for every fundamentals row.
  const gap: Exclude<RowStatus, "ok"> | null = !input.checked
    ? "pending"
    : !input.covered
      ? "not_covered"
      : !latest
        ? "pending"
        : null;
  const fmtMoney = (n: number) => money(n, reporting ?? input.currency);
  const row = (
    key: string,
    label: string,
    value: number | "n/m" | undefined,
    fmt: (n: number) => string,
    opts: { needsPrice?: boolean; needsSameCurrency?: boolean; uses?: string[] } = {},
  ): CompanyRow => {
    if (gap) return off(key, label, gap);
    if (opts.needsPrice && !lastClose) return off(key, label, "pending");
    if (opts.needsSameCurrency && !sameCurrency) return off(key, label, "mismatch");
    if (value === "n/m") return off(key, label, "n/m");
    if (value === undefined || !Number.isFinite(value)) return off(key, label, "n/m");
    const methods = [...new Set((opts.uses ?? []).map((c) => latest?.derived?.[c]).filter((m): m is DerivedMethod => !!m))];
    const r = ok(key, label, value, fmt(value));
    return methods.length ? { ...r, derived: methods.map((m) => DERIVED_TITLE[m]).join(" ") } : r;
  };
  // #123 (ES-13): which latest-year inputs each derived-capable figure uses (FCF needs capex only when capex exists).
  const FCF = v.capex !== undefined ? ["capex"] : [];

  const price = lastClose?.close;
  const shares = v.diluted_shares;
  const marketCap = price !== undefined && shares !== undefined && sameCurrency ? price * shares : undefined;
  const cash = v.cash ?? 0;
  const ev = marketCap === undefined ? undefined : marketCap + totalDebt(v) - cash;
  const revenue = v.revenue;
  const ebit = v.operating_income;
  const gross = v.gross_profit ?? (revenue !== undefined && v.cost_of_revenue !== undefined ? revenue - v.cost_of_revenue : undefined);
  const fcf = v.operating_cash_flow !== undefined ? v.operating_cash_flow - Math.abs(v.capex ?? 0) : undefined;
  const ni = v.net_income;
  const capitalEmployed = (y: CompanyYear) =>
    y.values.total_assets !== undefined && y.values.current_liabilities !== undefined
      ? y.values.total_assets - y.values.current_liabilities
      : undefined;
  const metric = (k: string): number | "n/m" | undefined => {
    const m = input.metrics[k];
    if (!m) return undefined;
    return m.status === "ok" && m.value !== null ? m.value : "n/m";
  };
  const epsNow = v.eps_diluted;
  const epsPrev = input.years[1]?.values.eps_diluted;
  const epsG = epsNow !== undefined && epsPrev !== undefined ? (epsPrev <= 0 ? "n/m" : epsNow / epsPrev - 1) : undefined;

  const profile: CompanyRow[] = [
    row("market_cap", "Market cap", marketCap, fmtMoney, { needsPrice: true, needsSameCurrency: true, uses: ["diluted_shares"] }),
    row("ev", "Enterprise value", ev, fmtMoney, { needsPrice: true, needsSameCurrency: true, uses: ["diluted_shares"] }),
    row("shares", "Shares (diluted)", shares, count, { uses: ["diluted_shares"] }),
    row("revenue", "Revenue", revenue, fmtMoney),
    gap ? off("employees", "Employees", gap) : off("employees", "Employees", "not_reported"),
  ];
  const margins = [
    row("gross_margin", "Gross margin", ratio(gross, revenue), pct),
    row("operating_margin", "Operating margin (EBIT)", ratio(ebit, revenue), pct),
    row("net_margin", "Net margin", ratio(ni, revenue), pct),
    row("fcf_margin", "Free cash flow margin", ratio(fcf, revenue), pct, { uses: FCF }),
  ];
  const returns = [
    row("roa", "ROA", ratio(ni, avg(input.years, (y) => y.values.total_assets)), pct),
    row("roe", "ROE", ratio(ni, avg(input.years, (y) => y.values.equity_parent)), pct),
    row("roce", "ROCE", ratio(ebit, avg(input.years, capitalEmployed)), pct),
    row("roic", "ROIC", metric("roic_1y"), pct),
  ];
  const valuation = [
    row("pe", "P/E", price === undefined ? undefined : ratio(price, epsNow), multiple, { needsPrice: true, needsSameCurrency: true }),
    row("ev_ebit", "EV/EBIT", ratio(ev, ebit), multiple, { needsPrice: true, needsSameCurrency: true, uses: ["diluted_shares"] }),
    row("p_fcf", "P/FCF", ratio(marketCap, fcf), multiple, { needsPrice: true, needsSameCurrency: true, uses: ["diluted_shares", ...FCF] }),
  ];
  const growth = [
    row("rev_g_1y", "Revenue growth 1y", metric("rev_g_1y"), pct),
    row("rev_cagr_3y", "Revenue CAGR 3y", metric("rev_cagr_3y"), pct),
    row("rev_cagr_5y", "Revenue CAGR 5y", metric("rev_cagr_5y"), pct),
    row("rev_cagr_10y", "Revenue CAGR 10y", metric("rev_cagr_10y"), pct),
    row("eps_g_1y", "EPS growth 1y", epsG, pct),
  ];
  // Dividends come from the stored corporate actions (any listing).
  const since = shiftDays(input.today, -365);
  const ttm = input.dividends.filter((d) => d.exDate > since && d.exDate <= input.today);
  const lastDiv = [...input.dividends].sort((a, b) => (a.exDate < b.exDate ? 1 : -1))[0];
  const dps = ttm.reduce((n, d) => n + d.cash, 0);
  const dividends: CompanyRow[] = ttm.length
    ? [
        ok("dps_ttm", "Dividends per share (TTM)", dps, money(dps, input.currency)),
        price ? ok("yield_ttm", "Yield (TTM)", dps / price, pct(dps / price)) : off("yield_ttm", "Yield (TTM)", "pending"),
        { key: "last_ex", label: "Last ex-date", text: lastDiv.exDate, status: "ok", value: null },
      ]
    : [
        off("dps_ttm", "Dividends per share (TTM)", "none"),
        off("yield_ttm", "Yield (TTM)", "none"),
        lastDiv
          ? { key: "last_ex", label: "Last ex-date", text: lastDiv.exDate, status: "ok", value: null }
          : off("last_ex", "Last ex-date", "none"),
      ];
  const fy = latest ? `FY${latest.end.slice(0, 4)}` : null;
  const note = gap === "not_covered" ? "No SEC filings for this listing." : fy;
  const kind: InstrumentKind = input.kind ?? "unknown";
  const isFund = kind === "fund";
  const dividendsSection: CompanySection = { key: "dividends", title: "Dividends", note: "Trailing twelve months", rows: dividends };
  return {
    symbol: input.symbol,
    name: input.name || input.symbol,
    exchange: input.exchange,
    currency: input.currency,
    last: lastClose ? { close: lastClose.close, date: lastClose.date, text: money(lastClose.close, input.currency) } : null,
    fiscalYear: fy,
    reportingCurrency: reporting,
    chart: chartPoints(input.closes, input.today),
    // #124 (FD-07): a fund shows the fund line in place of the five company sections; Dividends stay.
    sections: isFund
      ? [dividendsSection]
      : [
          { key: "profile", title: "Profile", note, rows: profile },
          { key: "margins", title: "Margins", note, rows: margins },
          { key: "returns", title: "Returns", note, rows: returns },
          { key: "valuation", title: "Valuation", note: lastClose ? `Price as of ${lastClose.date}` : null, rows: valuation },
          { key: "growth", title: "Growth", note, rows: growth },
          dividendsSection,
        ],
    // #124 (Q-F5): the #121 coverage line and the SEC / ESEF source line are not shown for a fund.
    coverage: !isFund && gap === "not_covered" ? NOT_COVERED_LINE : null,
    source: isFund
      ? SOURCE_LINE_FUND
      : gap === "not_covered"
        ? SOURCE_LINE_UNCOVERED
        : input.fundamentalsSource === "esef"
          ? SOURCE_LINE_ESEF
          : SOURCE_LINE,
    kind,
    fund: isFund ? FUND_LINE : null,
    securityType: input.securityType ?? null,
  };
}
