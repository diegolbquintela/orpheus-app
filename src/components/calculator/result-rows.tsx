import { HEADLINE_KEY, METRIC_ROWS, PLAN_ORDER, planName } from "@/lib/dca/results";
import type { DeskRun } from "@/lib/dca/types";

/**
 * Results as label-value rows (#70, spec §7 / §7a; ST4-06, ST4-10, EL A1 / A9). For each metric the existing
 * `METRIC_ROWS` label, word for word, is a full-width caption; under it two label-value rows, `Lump sum` then
 * `DCA`, side by side while each column is at least 150 px wide and stacked (Lump sum above DCA) otherwise
 * (`repeat(auto-fit, minmax(150px, 1fr))`). Values never wrap. No table, no boxes, no borders.
 */
export function ResultRows({ run, currency }: { run: DeskRun; currency: string }) {
  return (
    <div className="flex flex-col gap-5" data-testid="results">
      {METRIC_ROWS.map((metric) => (
        <div key={metric.key} data-testid="result-metric" data-key={metric.key}>
          <p className="calc-caption">{metric.label}</p>
          <dl className="calc-pairs mt-1">
            {PLAN_ORDER.map((plan) => (
              <div
                key={plan}
                data-plan={plan}
                className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3"
              >
                <dt className="text-sm text-dim">{planName(plan)}</dt>
                <dd
                  className={`text-[0.8125rem] whitespace-nowrap text-chalk tabular-nums lg:text-sm ${
                    metric.key === HEADLINE_KEY && plan === "dca" ? "font-medium" : ""
                  }`}
                >
                  {metric.value(run[plan], currency)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}
