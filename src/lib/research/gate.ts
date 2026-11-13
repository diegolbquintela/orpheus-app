import { createServerFn } from "@tanstack/react-start";
import type { YearReturn } from "./returns.ts";

/** /research loader (#333). The server reads the table or falls back to the seed. */
export const getResearchHeatmap = createServerFn({ method: "GET" }).handler(async (): Promise<YearReturn[]> => {
  const { loadYearlyReturns } = await import("./load.server.ts");
  return loadYearlyReturns();
});
