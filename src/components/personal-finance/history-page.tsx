// #214 (personal-finance-spec 53, AC PFHT): the read-only History table. One GET of the record on mount (never a
// write); the person picks a year, then the grid shows that year's stored months only.
import { useEffect, useId, useMemo, useState } from "react";
import { loadRecord, type LoadResult } from "@/lib/finance/history-client";
import {
  CHOOSE_YEAR,
  HISTORY_PATH,
  HISTORY_TITLE,
  LOAD_ERROR,
  LOADING,
  MONTH_COLUMN,
  NO_MONTHS,
  PICK_YEAR_NOTE,
  READ_ONLY_NOTE,
  SHARED_VALUES_NOTE,
  storedYears,
  YEAR_LABEL,
  yearTable,
} from "@/lib/finance/history";
import { lastTwelve } from "@/lib/finance/overview";
import type { PfRecord } from "@/lib/finance/record";

export type { LoadResult };

type State = { kind: "loading" } | { kind: "error" } | { kind: "ready"; record: PfRecord | null };

export function HistoryPage({
  load = loadRecord,
  now = () => new Date(),
  onSignedOut = () => window.location.assign(`/dashboard/sign-in?next=${encodeURIComponent(HISTORY_PATH)}`),
}: {
  load?: () => Promise<LoadResult>;
  now?: () => Date;
  onSignedOut?: () => void;
}) {
  const uid = useId();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [year, setYear] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    void load().then((r) => {
      if (!live) return;
      if (r.ok) setState({ kind: "ready", record: r.record });
      else if (r.status === 401) onSignedOut();
      else setState({ kind: "error" });
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const record = state.kind === "ready" ? state.record : null;
  const years = useMemo(
    () => (state.kind === "ready" ? storedYears(record, lastTwelve(now())[11]) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.kind, record],
  );
  const table = useMemo(
    () => (state.kind === "ready" && year !== null ? yearTable(record, year, now()) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.kind, record, year],
  );

  return (
    <div className="pf">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-5 pt-10 pb-20 sm:px-8 lg:pt-14 lg:pb-24">
        <header className="relative">
          <p className="pf-label">01</p>
          <h1 className="pf-title mt-2">{HISTORY_TITLE}</h1>
          <p className="pf-charts-back mt-3">
            <a href="/personal-finance" data-testid="pf-history-back">
              Personal Finance
            </a>
          </p>
          <p className="pf-history-note mt-3" data-testid="pf-history-readonly">
            {READ_ONLY_NOTE}
          </p>
        </header>
        <section aria-labelledby={`${uid}-head`} className="pf-history pf-section" data-testid="pf-history">
          <p className="pf-label">02</p>
          <h2 id={`${uid}-head`} className="mt-2 text-2xl leading-none font-normal tracking-tight text-chalk">
            Stored months
          </h2>
          <div className="pf-history-body" aria-busy={state.kind === "loading"}>
            {state.kind === "loading" ? (
              <p className="pf-history-note" role="status" data-testid="pf-history-loading">
                {LOADING}
              </p>
            ) : state.kind === "error" ? (
              <p className="pf-error" role="alert" data-testid="pf-history-error">
                {LOAD_ERROR}
              </p>
            ) : years.length === 0 ? (
              <p className="pf-history-note" data-testid="pf-history-empty">
                {NO_MONTHS}
              </p>
            ) : (
              <>
                <span className="pf-month-field">
                  <label htmlFor={`${uid}-year`} className="pf-label">
                    {YEAR_LABEL}
                  </label>
                  <select
                    id={`${uid}-year`}
                    value={year ?? ""}
                    onChange={(e) => setYear(e.target.value ? Number(e.target.value) : null)}
                    className="pf-field pf-history-year"
                    data-testid="pf-history-year"
                  >
                    <option value="">{CHOOSE_YEAR}</option>
                    {years.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </span>
                {table === null ? (
                  <p className="pf-history-note mt-4" data-testid="pf-history-pick">
                    {PICK_YEAR_NOTE}
                  </p>
                ) : (
                  <>
                    <p className="pf-history-note mt-4" data-testid="pf-history-caption">
                      {`${table.year}: ${table.rows.length} stored ${table.rows.length === 1 ? "month" : "months"}, monthly figures in ${table.currency}.`}
                    </p>
                    <p className="pf-history-note mt-2" data-testid="pf-history-shared-note">
                      {SHARED_VALUES_NOTE}
                    </p>
                    <div
                      className="pf-history-scroll mt-3"
                      role="region"
                      aria-labelledby={`${uid}-caption`}
                      tabIndex={0}
                      data-testid="pf-history-scroll"
                    >
                      <table className="pf-history-grid" data-testid="pf-history-grid">
                        <caption id={`${uid}-caption`} className="sr-only">
                          {`Stored months in ${table.year}, monthly figures in ${table.currency}`}
                        </caption>
                        <thead>
                          <tr>
                            <th scope="col" className="pf-history-month">
                              {MONTH_COLUMN}
                            </th>
                            {table.columns.map((c) => (
                              <th key={c.id} scope="col" data-kind={c.kind} data-testid="pf-history-col">
                                {c.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {table.rows.map((r) => (
                            <tr key={r.month} data-month={r.month} data-testid="pf-history-row">
                              <th scope="row" className="pf-history-month">
                                {r.label}
                              </th>
                              {r.cells.map((v, i) => (
                                <td key={table.columns[i].id} data-kind={table.columns[i].kind}>
                                  {v}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
