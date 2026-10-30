// #267 Renaissance Man charts (spec section 6.4): recharts, like the rest of the site. Each chart sits in a box of
// fixed height so nothing moves when it draws (CLS 0). Colours: chalk / dim / green / alert only.
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { dayLabel } from "@/lib/renaissance/derive";
import { PLAN } from "@/lib/renaissance/model";
import type { RenaissanceView } from "@/lib/renaissance/view";
import type { CompoundPoint } from "@/lib/renaissance/derive";

const C = { chalk: "#f2f0eb", dim: "#a8aeb4", hair: "#3a3f44", green: "#5cc08a", alert: "#ff8f87", rule: "#8b9298" };
const axis = { stroke: C.hair, tick: { fill: C.dim, fontSize: 11 } };
const tip = { contentStyle: { background: "#1e2124", border: `1px solid ${C.hair}`, color: C.chalk }, labelStyle: { color: C.chalk } };
const short = (d: string) => dayLabel(d).slice(4);

function Box({ title, testId, summary, children }: { title: string; testId: string; summary: string; children: React.ReactElement }) {
  return (
    <figure className="rm-chart" data-testid={testId}>
      <figcaption className="text-sm text-chalk">{title}</figcaption>
      <p className="mt-1 text-xs text-dim" data-testid={`${testId}-summary`}>
        {summary}
      </p>
      <div className="rm-chart-box mt-3" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export function CompoundChart({ points }: { points: CompoundPoint[] }) {
  const last = points.at(-1);
  return (
    <Box
      title="1% better, compounded"
      testId="rm-compound"
      summary={last ? `Actual ${last.actual.toFixed(3)}× vs ideal ${last.ideal.toFixed(3)}× after ${points.length} d` : "No days yet."}
    >
      <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid stroke={C.hair} vertical={false} />
        <XAxis dataKey="date" tickFormatter={short} {...axis} minTickGap={24} />
        <YAxis domain={["dataMin", "dataMax"]} tickFormatter={(v: number) => v.toFixed(2)} {...axis} width={44} />
        <Tooltip {...tip} labelFormatter={(d) => dayLabel(String(d))} formatter={(v) => `${Number(v).toFixed(3)}×`} />
        <Line type="monotone" dataKey="ideal" name="Ideal" stroke={C.dim} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="actual" name="Actual" stroke={C.green} dot={false} strokeWidth={2} isAnimationActive={false} />
      </LineChart>
    </Box>
  );
}

function CapChart({ title, testId, rows, unit }: { title: string; testId: string; rows: { date: string; cap: number; actual: number | null; afterNoon?: boolean }[]; unit: string }) {
  const last = rows.at(-1);
  const noon = rows.filter((r) => r.afterNoon).map((r) => short(r.date));
  return (
    <Box
      title={title}
      testId={testId}
      summary={`${last ? `Cap ≤${last.cap} ${unit} today; goal ≤3.` : ""}${noon.length ? ` After noon: ${noon.join(", ")}.` : ""}`}
    >
      <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid stroke={C.hair} vertical={false} />
        <XAxis dataKey="date" tickFormatter={short} {...axis} minTickGap={24} />
        <YAxis allowDecimals={false} domain={[0, "dataMax"]} {...axis} width={36} />
        <Tooltip {...tip} labelFormatter={(d) => dayLabel(String(d))} />
        <ReferenceLine y={3} stroke={C.rule} strokeDasharray="4 4" />
        <Line type="stepAfter" dataKey="cap" name="Cap" stroke={C.dim} dot={false} isAnimationActive={false} />
        <Line
          type="linear"
          dataKey="actual"
          name="Actual"
          stroke={C.chalk}
          connectNulls
          isAnimationActive={false}
          dot={(p: { cx?: number; cy?: number; payload?: { afterNoon?: boolean }; index?: number }) => (
            <circle key={p.index} cx={p.cx} cy={p.cy} r={3} fill={p.payload?.afterNoon ? C.alert : C.chalk} />
          )}
        />
      </LineChart>
    </Box>
  );
}

export function HealthCharts({ v }: { v: RenaissanceView }) {
  return (
    <div className="rm-charts">
      <CapChart title="Zyn: cap vs actual" testId="rm-chart-zyn" rows={v.zyn} unit="pouches" />
      <CapChart title="Coffee: cap vs actual" testId="rm-chart-coffee" rows={v.coffee} unit="cups" />
      <Box
        title="Steps"
        testId="rm-chart-steps"
        summary={`7-day average ${v.steps7.avg === null ? "—" : Math.round(v.steps7.avg).toLocaleString("en-US")}; minimum ${PLAN.steps.min.toLocaleString("en-US")}, goal ${PLAN.steps.goal.toLocaleString("en-US")}.`}
      >
        <BarChart data={v.steps} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={C.hair} vertical={false} />
          <XAxis dataKey="date" tickFormatter={short} {...axis} minTickGap={24} />
          <YAxis {...axis} width={44} tickFormatter={(n: number) => `${Math.round(n / 1000)}k`} />
          <Tooltip {...tip} labelFormatter={(d) => dayLabel(String(d))} />
          <ReferenceLine y={PLAN.steps.min} stroke={C.rule} strokeDasharray="4 4" />
          <ReferenceLine y={PLAN.steps.goal} stroke={C.green} strokeDasharray="4 4" />
          <Bar dataKey="steps" name="Steps" fill={C.chalk} isAnimationActive={false} />
        </BarChart>
      </Box>
      <Box title="Lifts per week" testId="rm-chart-lifts" summary={`This week ${v.liftsThisWeek}/${PLAN.lift.perWeek}.`}>
        <BarChart data={v.lifts} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={C.hair} vertical={false} />
          <XAxis dataKey="week" tickFormatter={short} {...axis} />
          <YAxis allowDecimals={false} domain={[0, Math.max(PLAN.lift.perWeek, ...v.lifts.map((l) => l.lifts))]} {...axis} width={36} />
          <Tooltip {...tip} labelFormatter={(d) => `Week of ${dayLabel(String(d))}`} />
          <ReferenceLine y={PLAN.lift.perWeek} stroke={C.green} strokeDasharray="4 4" />
          <Bar dataKey="lifts" name="Lifts" fill={C.chalk} isAnimationActive={false} />
        </BarChart>
      </Box>
    </div>
  );
}
