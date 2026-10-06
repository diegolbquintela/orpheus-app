import { HEADLINE_KEY, METRIC_ROWS, PLAN_ORDER, planName } from "@/lib/dca/results";
import type { DeskRun } from "@/lib/dca/types";

/**
 * Results as label-value rows (#70, spec §7 / §7a; ST4-06, ST4-10, EL A1 / A9). For each metric the existing
 * `METRIC_ROWS` label, word for word, is a full-width caption; under it two label-value rows, `Lump sum` then
 * `DCA`, side by side while each column is at least 150 px wide and stacked (Lump sum above DCA) otherwise
 * (`repeat(auto-fit, minmax(150px, 1fr))`). Values never wrap. No table, no boxes, no borders.
 *
 * A value with a date ("Max drop": `−79.9% · 2022-12-28`) shows the figure on the label's line and the date on
 * its own muted 12 px line under it, inside the value cell (QA round 1, D3): at 360 / 400 the whole string does
 * not fit beside `Lump sum` in a 150 px column. The date is placed out of flow (it adds no width to the value,
 * so the figure always fits beside the label), right-aligned under the figure; the separator stays in the text
 * for screen readers and copy, so the value's wording is unchanged.
 */
const DATE_SEPARATOR = " · ";

function Value({ text }: { text: string }) {
  const at = text.indexOf(DATE_SEPARATOR);
  if (at < 0) return <span className="block whitespace-nowrap" data-part="main">{text}</span>;
  return (
    <>
      <span className="block whitespace-nowrap" data-part="main">{text.slice(0, at)}</span>
      <span className="sr-only">{DATE_SEPARATOR}</span>
      <span className="absolute right-0 bottom-0 text-xs leading-4 whitespace-nowrap text-dim" data-part="date">
        {text.slice(at + DATE_SEPARATOR.length)}
      </span>
    </>
  );
}
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
                  className={`text-right text-[0.8125rem] text-chalk tabular-nums lg:text-sm ${
                    metric.key === HEADLINE_KEY && plan === "dca" ? "font-medium" : ""
                  } ${metric.value(run[plan], currency).includes(DATE_SEPARATOR) ? "relative pb-4" : ""}`}
                >
                  <Value text={metric.value(run[plan], currency)} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}
