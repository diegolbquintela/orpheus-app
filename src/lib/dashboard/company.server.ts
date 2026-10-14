/**
 * #95: loads one held symbol's stored data for the company view (attachments/dashboard-company-view-design.md
 * section 3). Server-only, database only: never calls a price or fundamentals feed.
 */
import { companyView, type CompanyInput, type CompanyView, type CompanyYear, type DerivedMethod, type StoredMetric } from "./company.ts";
import { DERIVED_SHARES_TAG, ESEF_EXTRA_TAGS } from "./esef.server.ts";
import type { Queryable } from "./store.server.ts";

export type CompanyResult = { status: "ok"; view: CompanyView } | { status: "not_held" };

/** `PLTR`, `SHOP.TO`, `ASML.AS`, `BRK-B`: upper-case letters, digits, `.` and `-`, 1–15 characters. */
export const normalizeSymbol = (raw: string): string | null => {
  const s = decodeURIComponent(raw).trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(s) ? s : null;
};

export async function loadCompany(db: Queryable, dataUserId: string, symbol: string, today: string): Promise<CompanyResult> {
  const held = await db.query<{ symbol: string }>("SELECT symbol FROM holdings WHERE user_id = $1 AND symbol = $2", [dataUserId, symbol]);
  if (!held.length) return { status: "not_held" };
  const inst = (
    await db.query<{ name: string | null; exchange: string | null; currency: string | null; source: string | null; checked: string | null; figi: { kind?: string; securityType?: string | null } | null }>(
      `SELECT name, exchange, currency, fundamentals_source AS source, fundamentals_checked_at::text AS checked,
              provider_ids -> 'openfigi' AS figi
         FROM instruments WHERE symbol = $1`,
      [symbol],
    )
  )[0];
  const closes = await db.query<{ date: string; close: string | number; currency: string }>(
    "SELECT session_date::text AS date, close, currency FROM daily_closes WHERE symbol = $1 ORDER BY session_date",
    [symbol],
  );
  const facts = await db.query<{ end: string; concept: string; value: string | number; unit: string; tag: string }>(
    `SELECT fiscal_year_end::text AS end, concept, value, unit, source_tag AS tag FROM fundamentals_annual
      WHERE symbol = $1 ORDER BY fiscal_year_end DESC`,
    [symbol],
  );
  const metrics = await db.query<{ key: string; value: string | number | null; status: string }>(
    "SELECT metric_key AS key, value, status FROM metric_values WHERE symbol = $1",
    [symbol],
  );
  const divs = await db.query<{ ex: string; cash: string | number }>(
    "SELECT ex_date::text AS ex, cash_unadj AS cash FROM corporate_actions WHERE symbol = $1 AND kind = 'dividend' ORDER BY ex_date",
    [symbol],
  );
  const byEnd = new Map<string, CompanyYear>();
  for (const f of facts) {
    const y = byEnd.get(f.end) ?? { end: f.end, values: {}, units: {} };
    y.values[f.concept] = Number(f.value);
    y.units[f.concept] = f.unit;
    // #123 (E1 / E5): the stored source tag says whether a fallback produced the value.
    const method = derivedMethod(f.concept, f.tag);
    if (method) (y.derived ??= {})[f.concept] = method;
    byEnd.set(f.end, y);
  }
  const input: CompanyInput = {
    symbol,
    name: inst?.name ?? null,
    exchange: inst?.exchange ?? null,
    currency: inst?.currency ?? closes.at(-1)?.currency ?? "USD",
    covered: inst?.source === "sec" || inst?.source === "esef",
    fundamentalsSource: inst?.source === "esef" ? "esef" : "sec",
    checked: Boolean(inst?.checked),
    closes: closes.map((c) => ({ date: c.date, close: Number(c.close) })),
    // Fiscal years with revenue or net income only (balance-sheet-only dates are kept for averages).
    years: [...byEnd.values()].sort((a, b) => (a.end < b.end ? 1 : -1)),
    metrics: Object.fromEntries(
      metrics.map((m) => [m.key, { value: m.value === null ? null : Number(m.value), status: m.status } satisfies StoredMetric]),
    ),
    dividends: divs.map((d) => ({ exDate: d.ex, cash: Number(d.cash) })),
    today,
    // #124: the stored OpenFIGI classification (the daily job writes it; never fetched here).
    kind: inst?.figi?.kind === "fund" || inst?.figi?.kind === "company" ? inst.figi.kind : "unknown",
    securityType: inst?.figi?.securityType ?? null,
  };
  return { status: "ok", view: companyView(input) };
}

/** #123 (ES-13): the fallback behind a stored fact, from its source tag, or null for a reported figure. */
export function derivedMethod(concept: string, tag: string | null | undefined): DerivedMethod | null {
  if (concept === "diluted_shares" && tag === DERIVED_SHARES_TAG) return "shares_from_eps";
  if (concept === "capex" && tag && (ESEF_EXTRA_TAGS.capex ?? []).includes(tag)) return "capex_broad_ifrs";
  return null;
}
