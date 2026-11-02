// #280 (personal-finance-spec §85, AC PFCH): visible titles and subtitles for the three Personal Finance line charts on
// the scenario screen (and the Overview chart on the main page), so each says what it plots. Text only: no figure,
// series or projection changes.
import { monthName, yearsLabel, type MonthKey, type Years } from "./overview.ts";

/** Overview (`04`): the recorded months, optionally followed by the Future years. */
export const OVERVIEW_CHART_TITLE = "Last 12 months";
export function overviewChartSub(current: MonthKey, future: boolean, years: Years, scenario: boolean): string {
  const base = `Income, expenses and net assets for each month up to ${monthName(current)}`;
  if (!future) return `${base}.`;
  return scenario
    ? `${base}, then ${yearsLabel(years)} ahead: net assets as in Projected path, income and expenses at 12-month averages.`
    : `${base}, then ${yearsLabel(years)} ahead at your 12-month averages.`;
}

/** Projected path (`06`): this screen's current month held flat over the chosen horizon. */
export const projectedChartTitle = (horizon: string): string => `Next ${horizon} from now`;
export const projectedChartSub = (current: MonthKey): string =>
  `This screen's ${monthName(current)} income and expenses held flat, starting from Net assets now.`;

/** Compare (`09`): net assets only, one line per column. */
export const COMPARE_CHART_TITLE = "Net assets by scenario";
export const compareChartSub = (horizon: string): string =>
  `This screen and the saved scenario, each projected over ${horizon} from its own net assets now.`;

/** The figure's aria wiring for a `ChartHeading` with the same id. */
export const chartAria = (id: string) => ({ "aria-labelledby": `${id}-title`, "aria-describedby": `${id}-sub` });
