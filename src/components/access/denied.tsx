import { COPY, deniedLine, SURFACE_LABEL, type Surface } from "@/lib/access/access";

/**
 * #90 (ROLE-14, Q-D10): a signed-in person without a read grant on this page. The page answers 403 in the dark shell
 * (bar and footer as everywhere): the page name, one line, `Account` and `Home`. No figures, no data, no page copy.
 */
export function DeniedPage({ surface }: { surface: Surface }) {
  return (
    <main
      className="signin mx-auto w-full max-w-6xl px-5 pt-10 pb-20 sm:px-8 lg:pt-14"
      data-testid="access-denied"
    >
      <h1 className="signin-title">{SURFACE_LABEL[surface]}</h1>
      <p className="signin-note mt-4" data-testid="access-denied-line">
        {deniedLine(surface)}
      </p>
      <p className="mt-6 flex gap-6">
        <a href="/account" className="signin-switch">
          {COPY.account}
        </a>
        <a href="/" className="signin-switch">
          {COPY.home}
        </a>
      </p>
    </main>
  );
}

/** ROLE-10 / ROLE-12: the quiet line under a read-only page's title. */
export function ReadOnlyLine({ className = "" }: { className?: string }) {
  return (
    <p className={`pf-label ${className}`} data-testid="read-only">
      {COPY.readOnly}
    </p>
  );
}
