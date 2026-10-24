// #214 / #263 (personal-finance-spec 53, 77; AC PFHT, PFHE): the History table. One GET of the record on mount;
// the person picks a year, then the transposed grid shows figures as rows and that year's stored months as columns.
// Stored line-item cells (and legacy Overview-only month income/expense cells) are editable for writers and save via PUT.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ReadOnlyLine } from "@/components/access/denied";
import { AMOUNT_ERROR, parseAmount } from "@/lib/finance/expenses";
import {
  applyHistoryEdit,
  CHOOSE_YEAR,
  DISCARD_BUTTON,
  FIGURE_COLUMN,
  HISTORY_PATH,
  HISTORY_TITLE,
  isEditableCell,
  LOAD_ERROR,
  LOADING,
  NO_MONTHS,
  NOT_SAVED_STATUS,
  PICK_YEAR_NOTE,
  READ_ONLY_NOTE,
  SAVE_BUTTON,
  SAVED_STATUS,
  SAVING_STATUS,
  SHARED_VALUES_NOTE,
  storedYears,
  UNSAVED_STATUS,
  YEAR_LABEL,
  yearTable,
} from "@/lib/finance/history";
import { loadRecord, saveHistory, type LoadResult, type SaveHistoryResult, type Version } from "@/lib/finance/history-client";
import { lastTwelve, type MonthKey } from "@/lib/finance/overview";
import { STALE_MESSAGE, type PfRecord } from "@/lib/finance/record";

export type { LoadResult, SaveHistoryResult };

type State =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; record: PfRecord | null; version?: Version; write?: boolean };

export function HistoryPage({
  load = loadRecord,
  save = saveHistory,
  now = () => new Date(),
  readOnly = false,
  onSignedOut = () => window.location.assign(`/dashboard/sign-in?next=${encodeURIComponent(HISTORY_PATH)}`),
}: {
  load?: () => Promise<LoadResult>;
  save?: (record: PfRecord, baseVersion?: Version) => Promise<SaveHistoryResult>;
  now?: () => Date;
  readOnly?: boolean;
  onSignedOut?: () => void;
} = {}) {
  const uid = useId();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [year, setYear] = useState<number | null>(null);
  const [draftInputs, setDraftInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [staleMessage, setStaleMessage] = useState<string | null>(null);
  const gridRef = useRef<HTMLTableElement | null>(null);

  useEffect(() => {
    let live = true;
    void load().then((r) => {
      if (!live) return;
      if (r.ok) setState({ kind: "ready", record: r.record, version: r.version, write: r.write });
      else if (r.status === 401) onSignedOut();
      else setState({ kind: "error" });
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isReadOnly = readOnly || (state.kind === "ready" && state.write === false);
  const savedRecord = state.kind === "ready" ? state.record : null;

  const draftRecord = useMemo(() => {
    if (!savedRecord) return null;
    let rec: PfRecord | null = savedRecord;
    const entries = Object.entries(draftInputs).sort(([a], [b]) => {
      const aWages = a.endsWith("-wages") ? 0 : 1;
      const bWages = b.endsWith("-wages") ? 0 : 1;
      return aWages - bWages;
    });
    const today = now();
    for (const [key, text] of entries) {
      if (parseAmount(text) === null) continue;
      const sep = key.indexOf("\0");
      if (sep < 0) continue;
      const month = key.slice(0, sep);
      const figId = key.slice(sep + 1);
      const next = applyHistoryEdit(rec, month, figId, text, today);
      if (next) rec = next;
    }
    return rec;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedRecord, draftInputs]);

  const years = useMemo(
    () => (state.kind === "ready" ? storedYears(draftRecord ?? savedRecord, lastTwelve(now())[11]) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.kind, draftRecord, savedRecord],
  );
  const table = useMemo(
    () => (state.kind === "ready" && year !== null ? yearTable(draftRecord, year, now()) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.kind, draftRecord, year],
  );
  const baseTable = useMemo(
    () => (state.kind === "ready" && year !== null ? yearTable(savedRecord, year, now()) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.kind, savedRecord, year],
  );

  const dirty = !isReadOnly && Object.keys(draftInputs).length > 0;
  const hasInvalid = Object.values(draftInputs).some((v) => parseAmount(v) === null);

  const handleCellChange = (month: MonthKey, figId: string, value: string) => {
    setSavedOnce(false);
    setSaveFailed(false);
    setStaleMessage(null);
    const figIdx = baseTable?.columns.findIndex((c) => c.id === figId) ?? -1;
    const baseRow = baseTable?.rows.find((r) => r.month === month);
    const baseVal = figIdx >= 0 && baseRow ? baseRow.cells[figIdx] : undefined;
    setDraftInputs((prev) => {
      const key = `${month}\0${figId}`;
      if (baseVal !== undefined && value === baseVal) {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: value };
    });
  };

  const handleDiscard = () => {
    setDraftInputs({});
    setSaveFailed(false);
    setStaleMessage(null);
    setSavedOnce(false);
  };

  const handleSave = async () => {
    if (isReadOnly || !dirty || saving || state.kind !== "ready" || !draftRecord) return;
    if (hasInvalid) {
      setSaveFailed(true);
      setSavedOnce(false);
      setStaleMessage(null);
      gridRef.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    setSaving(true);
    setSaveFailed(false);
    setStaleMessage(null);
    const res = await save(draftRecord, state.version);
    setSaving(false);
    if (res.ok) {
      setState({
        kind: "ready",
        record: res.record ?? draftRecord,
        version: res.version !== undefined ? res.version : state.version,
        write: state.write,
      });
      setDraftInputs({});
      setSavedOnce(true);
      setSaveFailed(false);
      setStaleMessage(null);
      return;
    }
    setSaveFailed(true);
    setSavedOnce(false);
    setStaleMessage(res.stale ? res.message || STALE_MESSAGE : null);
  };

  const statusText = staleMessage
    ? staleMessage
    : saveFailed
      ? NOT_SAVED_STATUS
      : saving
        ? SAVING_STATUS
        : dirty
          ? UNSAVED_STATUS
          : savedOnce
            ? SAVED_STATUS
            : "";
  const statusError = Boolean(staleMessage || saveFailed);

  return (
    <div className="pf">
      <main
        className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-5 pt-10 pb-20 sm:px-8 lg:pt-14 lg:pb-24"
        data-testid="pf-history-page"
      >
        <header className="relative">
          <p className="pf-label">01</p>
          <h1 className="pf-title mt-2">{HISTORY_TITLE}</h1>
          <p className="pf-charts-back mt-3">
            <a href="/personal-finance" data-testid="pf-history-back">
              Personal Finance
            </a>
          </p>
          {isReadOnly ? (
            <>
              <ReadOnlyLine className="mt-3" />
              <p className="pf-history-note mt-3" data-testid="pf-read-only">
                <span data-testid="pf-history-readonly">{READ_ONLY_NOTE}</span>
              </p>
            </>
          ) : null}
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
                <div className="pf-history-bar">
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
                  {!isReadOnly ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleSave()}
                        disabled={!dirty || saving}
                        className="pf-button pf-button-primary"
                        data-testid="pf-history-save"
                      >
                        {SAVE_BUTTON}
                      </button>
                      {dirty ? (
                        <button
                          type="button"
                          onClick={handleDiscard}
                          disabled={saving}
                          className="pf-button pf-button-ghost"
                          data-testid="pf-history-discard"
                        >
                          {DISCARD_BUTTON}
                        </button>
                      ) : null}
                      <span
                        role="status"
                        aria-live="polite"
                        className="pf-history-status"
                        data-error={statusError ? "true" : undefined}
                        data-testid="pf-history-status"
                      >
                        {staleMessage ? <span data-testid="pf-stale-error">{statusText}</span> : statusText}
                      </span>
                    </>
                  ) : null}
                </div>
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
                      <table ref={gridRef} className="pf-history-grid" data-testid="pf-history-grid">
                        <caption id={`${uid}-caption`} className="sr-only">
                          {`Stored months in ${table.year}, monthly figures in ${table.currency}`}
                        </caption>
                        <thead>
                          <tr>
                            <th scope="col" className="pf-history-month">
                              {FIGURE_COLUMN}
                            </th>
                            {table.rows.map((m) => (
                              <th key={m.month} scope="col" data-month={m.month} data-testid="pf-history-col">
                                {m.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {table.columns.map((fig, figIdx) => (
                            <tr
                              key={fig.id}
                              data-figure={fig.id}
                              data-kind={fig.kind}
                              data-testid="pf-history-row"
                            >
                              <th scope="row" className="pf-history-month" data-testid="pf-history-figure">
                                {fig.label}
                              </th>
                              {table.rows.map((m) => {
                                const cellKey = `${m.month}\0${fig.id}`;
                                const editable = !isReadOnly && isEditableCell(savedRecord, m.month, fig.id);
                                const displayVal = m.cells[figIdx];
                                const rawVal = cellKey in draftInputs ? draftInputs[cellKey] : displayVal;
                                const invalid = editable && cellKey in draftInputs && parseAmount(rawVal) === null;
                                return (
                                  <td
                                    key={m.month}
                                    data-month={m.month}
                                    data-figure={fig.id}
                                    data-kind={fig.kind}
                                  >
                                    {editable ? (
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        className="pf-input pf-history-input"
                                        data-testid="pf-history-input"
                                        data-month={m.month}
                                        data-figure={fig.id}
                                        aria-label={`${fig.label} for ${m.label}`}
                                        aria-invalid={invalid ? "true" : undefined}
                                        title={invalid ? AMOUNT_ERROR : undefined}
                                        value={rawVal}
                                        onChange={(e) => handleCellChange(m.month, fig.id, e.target.value)}
                                      />
                                    ) : (
                                      <span>{displayVal}</span>
                                    )}
                                  </td>
                                );
                              })}
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
