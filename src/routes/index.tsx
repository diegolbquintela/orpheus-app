import { createFileRoute, redirect } from "@tanstack/react-router";
import { Home } from "@/components/home";
import { homeRedirectHref } from "@/lib/site/site";

// Home (#46): one line plus two cards; it does no calculating. The calculator moved to
// /calculator, so `/?<query>` redirects there with the same query (old links keep working).
export const Route = createFileRoute("/")({
  beforeLoad: ({ location }) => {
    const href = homeRedirectHref(location.searchStr);
    if (href) throw redirect({ href });
  },
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: Home,
});
