/**
 * #221 (spec 57.13 / 57.15): on the scenario screen only, an amount input gets the scenario's own comma check (AO3:
 * `10,5` and `1.234,56` are refused with a field error and count as 0), and a flow amount also gets a Monthly / Yearly
 * select (default Monthly). Off the scenario screen (no provider) it renders the plain input: the main page is unchanged.
 */
import { useContext, useId, useRef, useState, type InputHTMLAttributes } from "react";
import { PeriodChoice } from "./period-choice";
import { PER_LABEL, type Per, shownText, storedText } from "@/lib/finance/period";
import { badComma, DECIMAL_COMMA_ERROR } from "@/lib/finance/scenario-input";

export function PeriodInput({
  value,
  onValue,
  base,
  name,
  testId,
  period = true,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: string;
  onValue: (stored: string) => void;
  /** The period the stored value is in (wages: year). */
  base: Per;
  /** The field's name for the select's label. */
  name: string;
  testId: string;
  /** False for a balance or a field with its own period: the comma check only, no select. */
  period?: boolean;
}) {
  const on = useContext(PeriodChoice);
  const uid = useId();
  const [per, setPer] = useState<Per>(period ? "month" : base);
  // The text as typed in the shown period; null after a switch or before any typing (derived from the stored value).
  const [typed, setTyped] = useState<string | null>(null);
  // The stored text this field last sent: while it is still the value, the typed text is shown as typed.
  const sent = useRef<string | null>(null);
  if (!on) return <input {...rest} value={value} onChange={(e) => onValue(e.target.value)} data-testid={testId} />;
  const mine = typed !== null && sent.current === value;
  const text = mine ? typed : shownText(value, base, per);
  const comma = mine && badComma(typed);
  const send = (t: string) => {
    setTyped(t);
    // AO3: a decimal comma is refused here; it counts as 0 (blank) until fixed, with this field's error.
    const stored = badComma(t) ? "" : storedText(t, base, per);
    sent.current = stored;
    onValue(stored);
  };
  const input = (
    <input
      {...rest}
      value={period ? text : mine ? typed : value}
      onChange={(e) => send(e.target.value)}
      data-testid={testId}
      {...(period ? { "data-per": per } : {})}
      {...(comma ? { "aria-invalid": true as const, "aria-describedby": `${uid}-comma` } : {})}
    />
  );
  const error = comma ? (
    <span id={`${uid}-comma`} className="pf-error" data-testid="pf-error" data-field={`${testId}-comma`}>
      {DECIMAL_COMMA_ERROR}
    </span>
  ) : null;
  if (!period)
    return (
      <>
        {input}
        {error}
      </>
    );
  return (
    <span className="pf-period" data-testid={`${testId}-period`}>
      {input}
      <select
        value={per}
        onChange={(e) => {
          setPer(e.target.value as Per);
          setTyped(null);
        }}
        aria-label={`${name}: Monthly or Yearly`}
        className="pf-field pf-period-select"
        data-testid={`${testId}-per`}
      >
        {(["month", "year"] as const).map((p) => (
          <option key={p} value={p}>
            {PER_LABEL[p]}
          </option>
        ))}
      </select>
      {error}
    </span>
  );
}
