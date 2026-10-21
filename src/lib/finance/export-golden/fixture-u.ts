// #176 (spec 50.4, QA Y2): fixture U, the exact stored record, report and clock used by the PFU tests and goldens.
import { STORAGE_KEY, type Line } from "../expenses.ts";
import { MONTHS_KEY } from "../months.ts";

export const U1 = "Épargne café crème — Zürich, Ñandú, Øresund, Straße";
/** 40 characters (CATEGORY_MAX). */
export const U2 = "Łódź, Kraków, Škoda, Čapek, Œuvre, Ğİş Ő";
export const U3 = "€ £ ¥ R$ ₩";
export const U4 = "pgqyj";
export const U5 = "Сбережения";
export const U6 = "貯金";
export const U7 = "🏠";
/** The report name is U1 itself (51 characters, report NAME_MAX 60; QA Y1). */
export const U_NAME = U1;
/** The account: currencies and descenders (22 characters, ACCOUNT_MAX 40). */
export const U_ACCOUNT = `Konto ${U3} ${U4}`;
export const U_NOW = new Date("2026-10-21T12:00:00Z");

const L = (id: string, amount: string, category: string, account: string): Line => ({ id, name: id, amount, per: "month", equity: "", account, currency: "", rate: "", category });
const lines = { fixed: [L("rent", "1234.56", U2, "Chequing")], variable: [L("t", "789", "Home", U_ACCOUNT), L("s", "10", U5, "Chequing")], people: [] };
/** Stored record (`personal_finance.data`): CAD household, three closed months 2026-07..09, no people, no overview. */
export const U_RECORD = {
  [STORAGE_KEY]: JSON.stringify({ fixed: lines.fixed, variable: lines.variable, accounts: ["Chequing", U_ACCOUNT], categories: [U2, "Home", U5] }),
  [MONTHS_KEY]: JSON.stringify({ "2026-07": lines, "2026-08": lines, "2026-09": lines }),
};
/** The saved report (`POST /reports { name: U_NAME, report: U_REPORT }`). */
export const U_REPORT = {
  series: [{ kind: "category" as const, id: U2 }, { kind: "account" as const, id: U_ACCOUNT }],
  range: { from: "2026-07", to: "2026-09" },
  chart: "line" as const,
};
/** PFU-08: a second report whose only series is the Cyrillic category; its name carries U6 and U7. */
export const U_FALLBACK_NAME = `${U6} ${U7}`;
export const U_FALLBACK_REPORT = { series: [{ kind: "category" as const, id: U5 }], range: { from: "2026-07", to: "2026-09" }, chart: "line" as const };
