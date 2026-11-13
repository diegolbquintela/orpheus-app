import { createFileRoute, redirect } from "@tanstack/react-router";
import { dcaRedirectHref } from "@/lib/site/site";

// /calculator now redirects to /research/dca and keeps the query string (#333).
// /?query still lands here first (homeRedirectHref), then this hop.
export const Route = createFileRoute("/calculator")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  beforeLoad: ({ location }) => {
    throw redirect({ href: dcaRedirectHref(location.searchStr) });
  },
});
