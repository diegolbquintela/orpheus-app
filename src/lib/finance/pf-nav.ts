/**
 * #275 (PFNL, attachments/pf-subnav-labels-spec.md): the Personal Finance sub-nav labels Diego confirmed on
 * 2026-11-01. Visible text only: the routes (`/personal-finance/charts`, `/history`, `/scenario`), query params,
 * test ids, data and storage keys keep their old names.
 */
export const PF_NAV_LABELS = {
  charts: "Report Builder",
  history: "Yearly Ledger",
  scenario: "Scenario Analysis",
} as const;

/** Each page's title (h1) and its document-title stem, matching its sub-nav label. */
export const PF_PAGE_TITLES = {
  charts: `${PF_NAV_LABELS.charts}.`,
  history: `${PF_NAV_LABELS.history}.`,
  scenario: `${PF_NAV_LABELS.scenario}.`,
} as const;

export const pfDocTitle = (page: keyof typeof PF_NAV_LABELS) => `${PF_NAV_LABELS[page]} · Personal Finance · Orpheus Wisdom`;
/** The report pages under Report Builder (`/personal-finance/charts/...`). */
export const reportDocTitle = (what: "Report" | "New report" | "Edit report") => `${what} · ${PF_NAV_LABELS.charts} · Orpheus Wisdom`;
