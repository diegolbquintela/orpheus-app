/**
 * #90 (ROLE-01, Q-D8): the bar's `Account` item below 640 px: a chalk-outline person (head and shoulders), stroked in
 * currentColor like the lyre. Decorative: the link's accessible name is the visually hidden word `Account`.
 */
export function PersonGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      data-testid="person-glyph"
    >
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
    </svg>
  );
}
