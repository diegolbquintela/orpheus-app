/**
 * #221 (spec 57.13): on the scenario screen only, a flow amount input gets a Monthly / Yearly select (default Monthly).
 * Off the scenario screen (no provider) it renders the plain input, so the main page is unchanged.
 */
import { useContext, useState, type InputHTMLAttributes } from "react";
import { PeriodChoice } from "./period-choice";
import { PER_LABEL, type Per, shownText, storedText } from "@/lib/finance/period";

export function PeriodInput({
  value,
  onValue,
  base,
  name,
  testId,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: string;
  onValue: (stored: string) => void;
  /** The period the stored value is in (wages: year). */
  base: Per;
  /** The field's name for the select's label. */
  name: string;
  testId: string;
}) {
  const on = useContext(PeriodChoice);
  const [per, setPer] = useState<Per>("month");
  // The text as typed in the shown period; null after a switch or before any typing (derived from the stored value).
  const [typed, setTyped] = useState<string | null>(null);
  if (!on) return <input {...rest} value={value} onChange={(e) => onValue(e.target.value)} data-testid={testId} />;
  const text = typed !== null && storedText(typed, base, per) === value ? typed : shownText(value, base, per);
  return (
    <span className="pf-period" data-testid={`${testId}-period`}>
      <input
        {...rest}
        value={text}
        onChange={(e) => {
          setTyped(e.target.value);
          onValue(storedText(e.target.value, base, per));
        }}
        data-testid={testId}
        data-per={per}
      />
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
    </span>
  );
}
