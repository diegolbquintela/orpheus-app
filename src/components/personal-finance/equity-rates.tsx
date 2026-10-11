import { useId } from "react";
import {
  formatRate,
  RATE_USED_LABEL,
  type Rates,
  rateUsed,
  ROIC_LABEL,
  WITHDRAWAL_LABEL,
} from "@/lib/finance/equity";
import { parsePercent, PERCENT_ERROR } from "@/lib/finance/income";

/**
 * The equity-cover rates (#86 v1.3; spec section 13, PF-17..20): `Withdrawal rate (%)` and `Portfolio ROIC (%)`,
 * typed, and the computed `Rate used` (the withdrawal rate as typed, else ROIC ÷ 2; `—` with none). Labels visible
 * at every width; a bad or out-of-range rate shows the percent check under its field.
 */
export function EquityRates({
  rates,
  update,
}: {
  rates: Rates;
  update: (patch: Partial<Rates>) => void;
}) {
  const uid = useId();
  const field = (key: keyof Rates, label: string, testId: string) => {
    const bad = parsePercent(rates[key]) === null;
    return (
      <div className="pf-cell pf-rate">
        <label htmlFor={`${uid}-${key}`} className="pf-label">
          {label}
        </label>
        <input
          id={`${uid}-${key}`}
          value={rates[key]}
          onChange={(event) => update({ [key]: event.target.value })}
          inputMode="decimal"
          autoComplete="off"
          className="pf-field"
          data-testid={testId}
          {...(bad
            ? { "aria-invalid": true as const, "aria-describedby": `${uid}-${key}-error` }
            : {})}
        />
        {bad ? (
          <span
            id={`${uid}-${key}-error`}
            className="pf-error"
            data-testid="pf-error"
            data-field={key}
          >
            {PERCENT_ERROR}
          </span>
        ) : null}
      </div>
    );
  };
  return (
    <div className="pf-rates" data-testid="pf-rates">
      {field("withdrawal", WITHDRAWAL_LABEL, "pf-withdrawal")}
      {field("roic", ROIC_LABEL, "pf-roic")}
      <div className="pf-cell pf-rate">
        <span className="pf-label">{RATE_USED_LABEL}</span>
        <span className="pf-value" data-testid="pf-rate-used">
          {formatRate(rateUsed(rates))}
        </span>
      </div>
    </div>
  );
}
