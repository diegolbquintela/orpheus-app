import { Analytics } from "@vercel/analytics/react";
import { createRootRoute, HeadContent, Outlet, Scripts, useRouterState } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { SiteFooter } from "@/components/site-footer";
import { NotFound } from "@/components/not-found";
import { SiteMenu } from "@/components/site-menu";
import { analyticsBeforeSend } from "@/lib/site/analytics";
import { FONT_PRELOAD } from "@/lib/site/fonts";
import { getOwnerNavLink } from "@/lib/renaissance/gate";
import type { OwnerNavLink } from "@/lib/site/owner-nav";
import { shellBodyClass, shellHtmlClass } from "@/lib/site/site";
import appCss from "../styles.css?url";

const APP_NAME = "Orpheus Wisdom";

// The site menu and footer (#46) wrap every page, including /dashboard, sign-in and the 404.
function CurrentSiteMenu() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  // #271: null for everyone but the owner (the root loader below).
  const ownerLink = useRouterState({
    select: (state) => (state.matches[0]?.loaderData as OwnerNavLink | undefined) ?? null,
  });
  return <SiteMenu pathname={pathname} ownerLink={ownerLink} />;
}

// Dark shell (epic #66, #68): a charcoal page with off-white base type on every page except /dashboard, where
// only the bar and footer change and the page around the content stays as on main (spec Q13).
function RootDocument() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  // #90 (ROLE-14): a page whose loader says `denied` (the Dashboard's 403 page) gets the dark shell.
  const denied = useRouterState({
    select: (state) => state.matches.some((m) => (m.loaderData as { denied?: boolean } | undefined)?.denied === true),
  });
  return (
    <html lang="en" className={shellHtmlClass(pathname, denied)} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className={shellBodyClass(pathname, denied)}>
        <AuthProvider>
          <div className="flex min-h-screen flex-col">
            <CurrentSiteMenu />
            <div className="flex-1">
              <Outlet />
            </div>
            <SiteFooter />
          </div>
        </AuthProvider>
        {/* Vercel Web Analytics (#48): anonymous page views, no cookies, query strings stripped. Mounted only here. */}
        <Analytics beforeSend={analyticsBeforeSend} />
        <Scripts />
      </body>
    </html>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      { name: "description", content: "Orpheus Wisdom. Compare a lump-sum cash plan with weekly or monthly contributions." },
      { name: "theme-color", content: "#1e2124" },
      // Keep the app out of search engines (pairs with the X-Robots-Tag route rule in vite.config.ts).
      { name: "robots", content: "noindex, nofollow" },
      // Home Screen / installed-app chrome (#50: was injected by the removed Grok template middleware).
      { name: "apple-mobile-web-app-title", content: "Orpheus Wisdom" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black" },
      { property: "og:title", content: "Orpheus Wisdom" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      // Self-hosted Schibsted Grotesk (#72, Q16, ST6-06): the upright latin file is the one every page uses
      // first; preloaded so it is ready inside font-display: optional's window (see src/styles.css).
      {
        rel: "preload",
        href: FONT_PRELOAD,
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
      { rel: "stylesheet", href: appCss },
      // #50: a static Orpheus manifest (public/manifest.webmanifest) and icons made from favicon.svg.
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
    ],
  }),
  // #271: the owner-only site-bar link, decided on the server once per full page load (the site's links are plain
  // links, so signing in or out is a full load). Fail closed: any error is no link.
  // Non-owners get undefined: nothing about the link (not even a key) is in their HTML or loader data.
  loader: async (): Promise<OwnerNavLink | undefined> => {
    try {
      return (await getOwnerNavLink()) ?? undefined;
    } catch {
      return undefined;
    }
  },
  shouldReload: false,
  component: RootDocument,
  // The dark 404 (#72, ST6-09): unknown paths and the dashboard-off paths.
  notFoundComponent: NotFound,
});
