# #130 ROIC method tooltip (company view): design note

Business user: **Portfolio Manager** (as the issue says). Scope: a disclosure only, with no formula change (issue #130).

## What ROIC is today (checked in code at main 18f128d)
`roic()` in `src/lib/dashboard/metric-compute.server.ts` (dashboard-spec §8, `roic_1y`):
- ROIC = NOPAT FY0 ÷ average invested capital (FY0, FY−1).
- NOPAT = operating income × (1 − t), where t is the effective tax rate (income tax ÷ pre-tax income), clamped to 0–50%, or 25% when it can't be computed.
- Invested capital (`investedCapital()`) = total equity (incl. non-controlling interests) + short-term and long-term debt − cash and cash equivalents (`CashAndCashEquivalents…`).

So cash **is excluded**: it's subtracted from invested capital. On a net-cash company such as RMS.PA, that makes invested capital small and ROIC high (70.6% against ROE 25.0%). The tooltip discloses this; the formula is unchanged.

## Design
A small info button `i` right after the `ROIC` label (`company-roic-info`). Its tooltip (`role="tooltip"`, `company-roic-tip`) is always in the DOM, so `aria-describedby` on the button always resolves. It's hidden with `visibility` and positioned absolutely under the label, so opening it never moves anything. Width `min(20rem, 100vw − 2.5rem)`, anchored to the label's left edge, so it doesn't overflow at 320 px. Colours: chalk text on night with a hair border (the site's AA pair). The button has a 44 × 44 px hit area and the 2 px chalk focus ring.

## Q-numbered product calls (PM, routed via EL): recommendations, built as recommended
- **Q-T1 Exact wording:** `ROIC = operating income × (1 − tax rate) ÷ average invested capital (equity + debt − cash) over the last two year-ends. Cash is excluded, which raises ROIC for net-cash companies.` It names the numerator and the denominator and answers the issue's question. The 0–50% clamp and the 25% fallback are left out to keep it to one line; they stay in dashboard-spec §8. Shorter option: `Operating income after tax ÷ average (equity + debt − cash). Cash excluded.`
- **Q-T2 Placement:** a dim `i` button right after the `ROIC` label in the Returns section, on the label side, not the value side. It's ROIC only, as the issue asks. The ROA, ROE and ROCE rows are unchanged; a follow-up could add the same tooltip to them.
- **Q-T3 Mobile tap:** a tap toggles it. A second tap, a tap anywhere else, or Escape closes it. Hover and keyboard focus open it, and moving off it or blurring closes it. The tooltip itself can be hovered without closing (WCAG 1.4.13).
- **Q-T4 When ROIC shows no value** (`n/m`, `Insufficient history`, `Not covered`): the tooltip still shows, because the method is the same. A fund shows no Returns section, so it gets no tooltip.
