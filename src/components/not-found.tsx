import { NOT_FOUND_TITLE } from "@/lib/site/site";

/**
 * The 404 (#72, spec §6, ST6-09): dark like every page (the shell's charcoal page, bar with no current item and
 * footer); the only content is the title, in the content column. Unknown paths and the dashboard-off paths
 * (rewritten to an unmatched path on the server) render this with status 404.
 */
export function NotFound() {
  return (
    <main className="mx-auto w-full max-w-6xl px-5 pt-10 pb-20 sm:px-8 lg:pt-14" data-testid="not-found">
      <h1 className="text-xl font-normal text-chalk">{NOT_FOUND_TITLE}</h1>
    </main>
  );
}
