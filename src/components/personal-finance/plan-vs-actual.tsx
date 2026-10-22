import { formatMoney } from "@/lib/finance/money";
import { monthName, type MonthKey } from "@/lib/finance/overview";
import { type Comparison, formatCaptured, NO_ACTUALS, PLAN_TITLE, planNote, TONE_TEXT, type Variance } from "@/lib/finance/plans";

/**
 * #231 (spec 65.4, AC PFPV-12..17; CFO Q2..Q4): the month view's read-only Planned vs actual table, for a current or
 * past month that has a plan. Display only: no control, no write (Read users see the same table, Q3).
 */
const money = (v: number | null): string => (v === null ? "—" : formatMoney(v));
const signed = (v: number | null): string => (v === null ? "—" : v > 0 ? `+${formatMoney(v)}` : formatMoney(v));
const pct = (v: number | null): string => (v === null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`);
const direction = (v: Variance, none = false): string => (none ? NO_ACTUALS : v.tone ? `${v.label} · ${TONE_TEXT[v.tone]}` : "—");

function Row({ name, v, testId, none = false }: { name: string; v: Variance; testId: string; none?: boolean }) {
  return (
    <tr data-testid={testId} data-tone={v.tone ?? ""}>
      <th scope="row">{name}</th>
      <td>{money(v.planned)}</td>
      <td>{money(v.actual)}</td>
      <td>{signed(v.diff)}</td>
      <td>{pct(v.pct)}</td>
      <td>{direction(v, none)}</td>
    </tr>
  );
}

export function PlanVsActual({ month, capturedAt, comparison }: { month: MonthKey; capturedAt: string; comparison: Comparison }) {
  // #231 PV4 (spec 65.6): shown in Eastern time with an explicit zone, never the device's or UTC.
  const when = formatCaptured(capturedAt) || monthName(month);
  return (
    <section className="pf-plan mt-6" data-testid="pf-plan" aria-label={PLAN_TITLE}>
      <h2 className="pf-label">{PLAN_TITLE}</h2>
      <p className="pf-history-note mt-1" data-testid="pf-plan-note">{planNote(when)}</p>
      {comparison.noActuals ? (
        <p className="pf-history-note mt-1" data-testid="pf-plan-noactuals">{NO_ACTUALS}: nothing is saved for this month, so there is no result to compare.</p>
      ) : null}
      <table className="pf-table mt-2">
        <thead>
          <tr>
            <th scope="col">{monthName(month)}</th>
            <th scope="col">Planned</th>
            <th scope="col">Actual</th>
            <th scope="col">Difference</th>
            <th scope="col">% of plan</th>
            <th scope="col">Direction</th>
          </tr>
        </thead>
        <tbody>
          <Row name="Expenses" v={comparison.expenses} testId="pf-plan-expenses"  none={!!comparison.noActuals} />
          <Row name="Income" v={comparison.income} testId="pf-plan-income"  none={!!comparison.noActuals} />
          <Row name="Surplus" v={comparison.surplus} testId="pf-plan-surplus"  none={!!comparison.noActuals} />
          {comparison.lines.map((l) => (
            <Row key={`${l.kind}-${l.id}`} name={`${l.kind === "expenses" ? "Expense" : "Income"} · ${l.name}`} v={l} testId="pf-plan-line"  none={!!comparison.noActuals} />
          ))}
        </tbody>
      </table>
    </section>
  );
}
