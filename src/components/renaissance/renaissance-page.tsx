// #267 Renaissance Man dashboard (attachments/renaissance-spec.md section 6): owner only, dark Orpheus look,
// mobile first. Everything shown is computed on the server (src/lib/renaissance/view.ts); this file only draws it.
import { useState } from "react";
import { Lyre } from "@/components/lyre";
import { dayLabel } from "@/lib/renaissance/derive";
import { PILLAR_LABEL, PILLARS, PLAN, type Pillar } from "@/lib/renaissance/model";
import type { GridCell, RenaissanceView } from "@/lib/renaissance/view";
import { LEVEL_TEXT, NOT_CONFIGURED, pct, pts, signed } from "./format";
import { CompoundChart, HealthCharts } from "./health-charts";

export type RenaissanceData = { status: "ok"; view: RenaissanceView } | { status: "not_configured" };

const short = (pillar: Pillar) => (pillar === "spiritual" ? "Spiritual" : PILLAR_LABEL[pillar]);

export function RenaissancePage({ data }: { data: RenaissanceData }) {
  return (
    <div className="pf rm" data-testid="rm-page">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-5 pt-10 pb-20 sm:px-8 lg:pt-14 lg:pb-24">
        {data.status === "ok" ? (
          <Dashboard v={data.view} />
        ) : (
          <>
            <Title />
            <p className="text-dim" data-testid="rm-not-configured">
              {NOT_CONFIGURED}
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function Title({ children }: { children?: React.ReactNode }) {
  return (
    <header data-testid="rm-header">
      <p className="flex items-center gap-2 text-sm text-dim">
        <Lyre className="shrink-0" />
        <span>Renaissance Man · 1% every day</span>
      </p>
      <h1 className="pf-title mt-3">Renaissance.</h1>
      {children}
    </header>
  );
}

function Stat({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="rm-stat">
      <dt className="text-xs text-dim">{label}</dt>
      <dd className="mt-1 text-xl text-chalk" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}

function SectionHead({ n, id, title }: { n: string; id: string; title: string }) {
  return (
    <div>
      <p className="text-sm text-dim">{n}</p>
      <h2 id={id} className="mt-2 text-2xl leading-none font-normal tracking-tight text-chalk">
        {title}
      </h2>
    </div>
  );
}

function Dashboard({ v }: { v: RenaissanceView }) {
  const zyn = v.baselines.find((b) => b.item === PLAN.zyn.item);
  const coffee = v.baselines.find((b) => b.item === PLAN.coffee.item);
  const last = v.compound.at(-1);
  return (
    <>
      <Title>
        <p className="mt-3 text-dim" data-testid="rm-date">
          Day {v.dayN} · {dayLabel(v.today)}
        </p>
        <dl className="rm-stats mt-6">
          <Stat label="Streak (all pillars)" value={`${v.streak.current} d`} testId="rm-streak" />
          <Stat label="Zyn cap today" value={`≤${v.caps.zyn}`} testId="rm-cap-zyn" />
          <Stat label="Coffee cap today" value={`≤${v.caps.coffee}, none after noon`} testId="rm-cap-coffee" />
          <Stat label="Lifts this week" value={`${v.liftsThisWeek}/${PLAN.lift.perWeek}`} testId="rm-lifts" />
          <Stat
            label="Steps, 7-day average"
            value={v.steps7.avg === null ? "—" : Math.round(v.steps7.avg).toLocaleString("en-US")}
            testId="rm-steps7"
          />
        </dl>
        {v.picksToday.length ? (
          <p className="mt-4 text-sm text-dim" data-testid="rm-picks">
            Today&apos;s picks: {v.picksToday.join(" · ")}
          </p>
        ) : null}
      </Title>

      <section aria-labelledby="rm-growth-head" className="pf-section flex flex-col gap-6" data-testid="rm-growth">
        <SectionHead n="01" id="rm-growth-head" title="Growth" />
        <dl className="rm-stats">
          <Stat label="1% line, actual" value={last ? `${last.actual.toFixed(3)}×` : "1.000×"} testId="rm-compound-actual" />
          <Stat label="1% line, ideal" value={last ? `${last.ideal.toFixed(3)}×` : "1.000×"} testId="rm-compound-ideal" />
          <Stat label="All pillars, 7 days" value={`${pct(v.overall.r7)} (${pts(v.overall.wow)} WoW)`} testId="rm-overall-7" />
          <Stat label="All pillars, 30 days" value={`${pct(v.overall.r30)} (${pts(v.overall.mom)} MoM)`} testId="rm-overall-30" />
        </dl>
        <CompoundChart points={v.compound} />
        <div className="rm-scroll" role="region" aria-label="Completion by pillar" tabIndex={0}>
          <table className="rm-table" data-testid="rm-growth-table">
            <thead>
              <tr>
                <th scope="col">Pillar</th>
                <th scope="col">7 days</th>
                <th scope="col">WoW</th>
                <th scope="col">30 days</th>
                <th scope="col">MoM</th>
              </tr>
            </thead>
            <tbody>
              {v.growth.map((g) => (
                <tr key={g.pillar} data-pillar={g.pillar} data-testid="rm-growth-row">
                  <th scope="row">{short(g.pillar)}</th>
                  <td>{pct(g.r7)}</td>
                  <td>{pts(g.wow)}</td>
                  <td>{pct(g.r30)}</td>
                  <td>{pts(g.mom)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="rm-list" data-testid="rm-baselines">
          {[zyn, coffee].map((b) =>
            b ? (
              <li key={b.item} data-item={b.item}>
                <span className="text-dim">{b.item === "zyn" ? "Zyn" : "Coffee"} vs baseline {b.baseline}: </span>
                {b.latest === null ? "no count yet" : `${b.latest} (${signed(b.change, "")}, ${signed(b.changePct, "%")})`}
                <span className="text-dim"> · cap ≤{b.cap}, goal ≤{b.floor}</span>
              </li>
            ) : null,
          )}
        </ul>
        <div>
          <h3 className="text-base font-normal text-chalk">Personal bests</h3>
          <ul className="rm-list mt-3" data-testid="rm-bests">
            {v.bests.map((b) => (
              <li key={b.label}>
                <span className="text-dim">{b.label}: </span>
                {b.value}
                {b.date ? <span className="text-dim"> · {dayLabel(b.date)}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="rm-grids-head" className="pf-section flex flex-col gap-6" data-testid="rm-grids">
        <SectionHead n="02" id="rm-grids-head" title="Daily hits" />
        <Legend />
        <div className="rm-grids">
          {v.grids.map((g) => {
            const s = v.growth.find((x) => x.pillar === g.pillar)!;
            return (
              <figure key={g.pillar} className="rm-grid-block" data-testid="rm-grid" data-pillar={g.pillar}>
                <figcaption className="text-sm text-chalk">{PILLAR_LABEL[g.pillar]}</figcaption>
                <Grid weeks={g.weeks} pillar={g.pillar} />
                <p className="mt-2 text-xs text-dim" data-testid="rm-grid-streak">
                  Streak {s.current} d · best {s.best} d
                </p>
              </figure>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="rm-health-head" className="pf-section flex flex-col gap-6" data-testid="rm-health">
        <SectionHead n="03" id="rm-health-head" title="Health" />
        <HealthCharts v={v} />
      </section>

      <section aria-labelledby="rm-strips-head" className="pf-section flex flex-col gap-6" data-testid="rm-strips">
        <SectionHead n="04" id="rm-strips-head" title="Industry and Spiritual" />
        {v.strips.map((s) => (
          <div key={s.pillar} data-testid="rm-strip" data-pillar={s.pillar}>
            <h3 className="text-base font-normal text-chalk">{PILLAR_LABEL[s.pillar]}</h3>
            <ol className="rm-strip mt-3" aria-label={`${short(s.pillar)} by day`}>
              {s.days.map((d) => (
                <li key={d.date} className={`rm-cell rm-${d.level}`} title={`${dayLabel(d.date)}: ${LEVEL_TEXT[d.level]}`}>
                  <span className="sr-only">
                    {dayLabel(d.date)}: {LEVEL_TEXT[d.level]}
                  </span>
                </li>
              ))}
            </ol>
            <ul className="rm-list mt-3" data-testid="rm-strip-weeks">
              {s.weeks.map((w) => (
                <li key={w.week}>
                  <span className="text-dim">Week of {dayLabel(w.week)}: </span>
                  {pct(w.pct)}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <Log rows={v.log} />
    </>
  );
}

function Legend() {
  return (
    <ul className="rm-legend text-xs text-dim" data-testid="rm-legend">
      {(["all", "partial", "none", "unreported"] as const).map((l) => (
        <li key={l} className="flex items-center gap-2">
          <span className={`rm-cell rm-${l}`} aria-hidden="true" />
          {LEVEL_TEXT[l]}
        </li>
      ))}
    </ul>
  );
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function cellText(c: GridCell) {
  const hits = c.hits.length ? `hit: ${c.hits.join(", ")}` : LEVEL_TEXT[c.level];
  return `${dayLabel(c.date)} · ${hits}${c.picks.length ? ` · picks: ${c.picks.join("; ")}` : ""}`;
}

/** Weeks × weekdays (GitHub style): a column per week, Monday on top. Hover (title) shows date, picks and hits. */
function Grid({ weeks, pillar }: { weeks: (GridCell | null)[][]; pillar: Pillar }) {
  return (
    <div className="rm-grid mt-3" role="list" aria-label={`${short(pillar)} by day`} style={{ gridTemplateColumns: `2rem repeat(${weeks.length}, 0.875rem)` }}>
      {WEEKDAYS.map((wd, row) => [
        <span key={`l${wd}`} className="rm-wd text-[10px] text-dim" aria-hidden="true">
          {row % 2 === 0 ? wd : ""}
        </span>,
        ...weeks.map((w, col) => {
          const c = w[row];
          if (!c) return <span key={`${col}-${row}`} className="rm-cell rm-out" aria-hidden="true" />;
          return (
            <span key={c.date} role="listitem" className={`rm-cell rm-${c.level}`} data-date={c.date} data-level={c.level} title={cellText(c)} data-testid="rm-cell">
              <span className="sr-only">{cellText(c)}</span>
            </span>
          );
        }),
      ])}
    </div>
  );
}

type Filter = Pillar | "all";
function Log({ rows }: { rows: RenaissanceView["log"] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const shown = filter === "all" ? rows : rows.filter((r) => r.pillar === filter);
  return (
    <section aria-labelledby="rm-log-head" className="pf-section flex flex-col gap-6" data-testid="rm-log">
      <SectionHead n="05" id="rm-log-head" title="Daily log" />
      <div className="rm-filters" role="group" aria-label="Filter by pillar">
        {(["all", ...PILLARS] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            className={`pf-button ${filter === f ? "pf-button-primary" : "pf-button-secondary"}`}
            aria-pressed={filter === f}
            data-testid="rm-filter"
            data-filter={f}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "All" : short(f)}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="text-dim" data-testid="rm-log-empty">
          No check-ins yet.
        </p>
      ) : (
        <div className="rm-scroll" role="region" aria-label="Daily log" tabIndex={0}>
          <table className="rm-table" data-testid="rm-log-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Pillar</th>
                <th scope="col">Item</th>
                <th scope="col">Target</th>
                <th scope="col">Actual</th>
                <th scope="col">Hit</th>
                <th scope="col">Note</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={`${r.date}-${r.item}`} data-testid="rm-log-row" data-pillar={r.pillar}>
                  <td>{dayLabel(r.date)}</td>
                  <td>{short(r.pillar)}</td>
                  <td>{r.item}</td>
                  <td>{r.target ?? "—"}</td>
                  <td>{r.actual ?? "—"}</td>
                  <td className={r.hit === false ? "text-alert" : r.hit ? "text-green" : "text-dim"}>{r.hit === null ? "—" : r.hit ? "Hit" : "Miss"}</td>
                  <td>{r.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
