import { PLAN_ORDER, planName } from "@/lib/dca/results";
import type { DeskRun } from "@/lib/dca/types";
import { RESULT_LINES } from "@/lib/site/result-lines";

/**
 * Results (#78, spec §7 / §7a; ST4-06, ST4-10): two plan columns, `Lump sum` then `DCA`, each with exactly four
 * lines (`Final value`, `Total invested`, `Return (%)`, `CAGR (%)`; display only, see result-lines.ts). The
 * columns sit side by side while each is at least 150 px wide and stack (Lump sum above DCA) otherwise
 * (`.calc-plans`: `repeat(auto-fit, minmax(150px, 1fr))`). On a phone each label sits above its value (a 152 px
 * column at 360 can't hold `Total invested` beside `$313,000`); from 1024 px label and value share a row. Values
 * never wrap. No table, no boxes, no borders around them.
 */
export function ResultRows({ run, currency }: { run: DeskRun; currency: string }) {
  return (
    <div className="calc-plans" data-testid="results">
      {PLAN_ORDER.map((plan) => (
        <section
          key={plan}
          className="min-w-0"
          data-testid="result-plan"
          data-plan={plan}
          aria-label={planName(plan)}
        >
          <h3 className="calc-plan">{planName(plan)}</h3>
          <dl className="mt-3 flex flex-col gap-3">
            {RESULT_LINES.map((line) => (
              <div
                key={line.key}
                className="calc-line"
                data-testid="result-line"
                data-key={line.key}
              >
                <dt className="calc-caption">{line.label}</dt>
                <dd className="calc-value">{line.value(run[plan], currency)}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
