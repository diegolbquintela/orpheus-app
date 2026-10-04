import { FOOTER_LINE } from "@/lib/site/site";

/** Site footer (#46): exactly "Orpheus Wisdom", nothing else. */
export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <p
        className="mx-auto w-full max-w-6xl px-5 py-6 text-xs text-muted sm:px-8"
        data-testid="site-footer"
      >
        {FOOTER_LINE}
      </p>
    </footer>
  );
}
