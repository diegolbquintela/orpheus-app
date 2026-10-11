/**
 * The lyre mark (#84, spec site-style §6 / ST1-05; personal-finance spec §8): two curved arms, a crossbar, a base
 * and three strings, stroked in currentColor. Decorative wherever the word "Orpheus" sits beside it.
 */
export const LYRE_PATHS = [
  "M6.5 8h11", // crossbar (yoke)
  "M9.5 20C5 17.5 4.5 11.5 7 8C8 6.6 7.6 5 6 3.5", // left arm, its tip flared out
  "M14.5 20C19 17.5 19.5 11.5 17 8C16 6.6 16.4 5 18 3.5", // right arm, its tip flared out
  "M8.5 20h7", // base
  "M10 8v12M12 8v12M14 8v12", // strings
] as const;

export function Lyre({ className }: { className?: string }) {
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
      data-testid="lyre"
    >
      {LYRE_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
