import { useId } from "react";
import { AMOUNT_ERROR } from "@/lib/finance/expenses";
import {
  formatRate,
  parseRoic,
  parseWithdrawal,
  RATE_USED_LABEL,
  type Rates,
  rateUsed,
  ROIC_LABEL,
  WITHDRAWAL_DESC_LINES,
  WITHDRAWAL_LABEL,
} from "@/lib/finance/equity";
import { PERCENT_ERROR } from "@/lib/finance/income";

/**
 * The equity-cover rates (#86 v1.3; spec section 13, PF-17..20): `Withdrawal rate (%)` and `Portfolio ROIC (%)`,
 * typed, and the computed `Rate used` (the withdrawal rate as typed, else ROIC ÷ 2; `—` with none). Labels visible
 * at every width; a bad rate shows its check under the field (withdrawal: the percent check; ROIC, no upper cap:
 * the amount check).
 * #131 (spec section 24, PF-108..PF-111): a two-line description (`pf-withdrawal-desc`, note style, not a title)
 * right before the rates row, directly above `Withdrawal rate (%)`; the withdrawal input is described by it.
 */
export function EquityRates({
  rates,
  update,
}: {
  rates: Rates;
  update: (patch: Partial<Rates>) => void;
}) {
  const uid = useId();
  // #131 (PF-111): the withdrawal input is described by the description, plus its error when bad.
  const describedBy = (key: keyof Rates, bad: boolean) =>
    [key === "withdrawal" ? `${uid}-withdrawal-desc` : null, bad ? `${uid}-${key}-error` : null]
      .filter(Boolean)
      .join(" ");
  const field = (key: keyof Rates, label: string, testId: string) => {
    // Withdrawal rate 0–100; ROIC 0 or more with no upper cap (Q11).
    const bad = (key === "withdrawal" ? parseWithdrawal : parseRoic)(rates[key]) === null;
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
          {...(bad ? { "aria-invalid": true as const } : {})}
          {...(describedBy(key, bad) ? { "aria-describedby": describedBy(key, bad) } : {})}
        />
        {bad ? (
          <span
            id={`${uid}-${key}-error`}
            className="pf-error"
            data-testid="pf-error"
            data-field={key}
          >
            {key === "withdrawal" ? PERCENT_ERROR : AMOUNT_ERROR}
          </span>
        ) : null}
      </div>
    );
  };
  return (
    <div data-testid="pf-rates-block">
      <div id={`${uid}-withdrawal-desc`} className="pf-desc" data-testid="pf-withdrawal-desc">
        {WITHDRAWAL_DESC_LINES.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
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
    </div>
  );
}
