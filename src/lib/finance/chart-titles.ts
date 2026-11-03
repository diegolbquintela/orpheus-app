// #280 (personal-finance-spec §85, AC PFCH): visible titles and subtitles for the three Personal Finance line charts on
// the scenario screen (and the Overview chart on the main page), so each says what it plots. Text only: no figure,
// series or projection changes.
import { monthName, type MonthKey } from "./overview.ts";

/** Overview (`04`): the recorded months to this month. */
export const OVERVIEW_CHART_TITLE = "Last 12 months";
// #280 Q-CH2 (2026-11-02): recorded history ending this month on every screen, Future on or off.
export const overviewChartSub = (current: MonthKey): string =>
  `Income, expenses and net assets for each month up to ${monthName(current)} (recorded history).`;

/** Projected path (`06`): this screen's current month held flat over the chosen horizon. */
export const projectedChartTitle = (horizon: string): string => `Next ${horizon} from now`;
export const projectedChartSub = (current: MonthKey): string =>
  `Flat forward projection: this screen's ${monthName(current)} income and expenses held flat, starting from Net assets now.`;

/** Compare (`09`): net assets only, one line per column. */
export const COMPARE_CHART_TITLE = "Net assets by scenario";
// #299 Q5 (spec §88, AC PF2C-19): "the saved scenarios" with 2 picks, "the saved scenario" with 1.
export const compareChartSub = (horizon: string, saved = 1): string =>
  `This screen and the saved scenario${saved > 1 ? "s" : ""}, each projected over ${horizon} from its own net assets now.`;

/** The figure's aria wiring for a `ChartHeading` with the same id. */
export const chartAria = (id: string) => ({ "aria-labelledby": `${id}-title`, "aria-describedby": `${id}-sub` });
