import { FOOTER_LINE } from "@/lib/site/site";

/** Site footer (#46; dark shell, epic #66 #68): charcoal on every page, exactly "Orpheus Wisdom", nothing else. */
export function SiteFooter() {
  return (
    <footer className="border-t border-hair bg-night" data-testid="site-footer-band">
      <p
        className="mx-auto w-full max-w-6xl px-5 py-6 text-xs text-dim sm:px-8"
        data-testid="site-footer"
      >
        {FOOTER_LINE}
      </p>
    </footer>
  );
}
