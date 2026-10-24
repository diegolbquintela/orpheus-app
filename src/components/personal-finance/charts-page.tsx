// #160 (spec 45): Personal Finance Charts, the saved reports list. One GET (R3) on mount; writes nothing.
import { useCallback, useEffect, useState } from "react";
import { ReadOnlyLine } from "@/components/access/denied";
import { listReports, type ReportList, type Result } from "@/lib/finance/charts-api";
import { NEW_PATH, viewPath } from "@/lib/finance/builder";
import {
  CHARTS_PATH,
  LOADING_REPORTS,
  NO_DATE,
  NO_REPORTS,
  atLimit,
  limitText,
  seriesSummary,
  torontoDate,
} from "@/lib/finance/reports-list";

type State = { kind: "loading" } | { kind: "error"; error: string } | { kind: "ready"; list: ReportList };

export function ChartsPage({
  readOnly = false,
  load = () => listReports(),
  onSignedOut = () => window.location.assign(`/dashboard/sign-in?next=${encodeURIComponent(CHARTS_PATH)}`),
}: {
  readOnly?: boolean;
  load?: () => Promise<Result<ReportList>>;
  onSignedOut?: () => void;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const fetchList = useCallback(async () => {
    setState({ kind: "loading" });
    const r = await load();
    if (r.ok) setState({ kind: "ready", list: r.data });
    else if (r.status === 401) onSignedOut();
    else setState({ kind: "error", error: r.error });
  }, [load, onSignedOut]);
  useEffect(() => {
    void fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const list = state.kind === "ready" ? state.list : null;
  const full = list ? atLimit(list) : false;
  // #161 (Q-AK15, PFCB-02..03): below the limit New report opens the builder; at the limit (named reports only, the
  // default not counted, Q-AJ7) it is disabled with the page-owned note (spec 45.10). The #160 builder placeholder note is gone.
  const newButton = readOnly ? null : (
    <div className="pf-charts-new">
      {full ? (
        <button type="button" className="pf-button pf-button-primary" disabled aria-describedby="pf-charts-new-note" data-testid="pf-charts-new">
          New report
        </button>
      ) : (
        <a className="pf-button pf-button-primary" href={NEW_PATH} data-testid="pf-charts-new">
          New report
        </a>
      )}
      <p id="pf-charts-new-note" className="pf-charts-note" data-testid="pf-charts-new-note">
        {full && list ? limitText(list.limit) : ""}
      </p>
    </div>
  );

  return (
    <div className="pf">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-5 pt-10 pb-20 sm:px-8 lg:pt-14 lg:pb-24">
        <header className="relative">
          <p className="pf-label">01</p>
          <h1 className="pf-title mt-2">Charts.</h1>
          <p className="pf-charts-back mt-3">
            <a href="/personal-finance" data-testid="pf-charts-back">
              Personal Finance
            </a>
          </p>
          {readOnly ? <ReadOnlyLine className="mt-3" /> : null}
        </header>
        <section aria-labelledby="pf-charts-list-head" className="pf-charts pf-section" data-testid="pf-charts">
          <div className="pf-charts-top">
            <div>
              <p className="pf-label">02</p>
              <h2 id="pf-charts-list-head" className="mt-2 text-2xl leading-none font-normal tracking-tight text-chalk">
                Saved reports
              </h2>
            </div>
            {list && list.reports.length > 0 ? newButton : null}
          </div>
          <div className="pf-charts-body" aria-busy={state.kind === "loading"}>
            {state.kind === "loading" ? (
              <p className="pf-charts-note" role="status" data-testid="pf-charts-loading">
                {LOADING_REPORTS}
              </p>
            ) : state.kind === "error" ? (
              <div className="pf-charts-error" data-testid="pf-charts-error">
                <p className="pf-error" role="alert">
                  {state.error}
                </p>
                <button type="button" className="pf-button pf-button-secondary" onClick={() => void fetchList()} data-testid="pf-charts-retry">
                  Try again
                </button>
              </div>
            ) : list!.reports.length === 0 ? (
              <div className="pf-charts-empty" data-testid="pf-charts-empty">
                <p className="pf-charts-note">{NO_REPORTS}</p>
                {newButton}
              </div>
            ) : (
              <ul className="pf-charts-list" data-testid="pf-charts-list">
                {list!.reports.map((r) => {
                  const day = torontoDate(r.updated_at);
                  return (
                    <li key={r.id} className="pf-charts-row" data-testid="pf-charts-row" data-id={r.id}>
                      {/* #162 Q-AL2: the name opens the saved report viewer. */}
                      <a className="pf-charts-name" href={viewPath(r.id)} data-testid="pf-charts-name">
                        {r.name}
                      </a>
                      <span className="pf-charts-date" data-testid="pf-charts-date">
                        {day ?? (
                          // QA N1: aria-label on a plain span is ignored; the dash is hidden, the text is read.
                          <>
                            <span aria-hidden="true">—</span>
                            <span className="sr-only">{NO_DATE}</span>
                          </>
                        )}
                      </span>
                      <span className="pf-charts-summary" data-testid="pf-charts-summary">
                        {seriesSummary(r)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
