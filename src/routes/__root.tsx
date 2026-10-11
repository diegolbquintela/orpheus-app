import { Analytics } from "@vercel/analytics/react";
import { createRootRoute, HeadContent, Outlet, Scripts, useRouterState } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { SiteFooter } from "@/components/site-footer";
import { NotFound } from "@/components/not-found";
import { SiteMenu } from "@/components/site-menu";
import { analyticsBeforeSend } from "@/lib/site/analytics";
import { shellBodyClass, shellHtmlClass } from "@/lib/site/site";
import appCss from "../styles.css?url";

const APP_NAME = "Orpheus Wisdom";

// The site menu and footer (#46) wrap every page, including /dashboard, sign-in and the 404.
function CurrentSiteMenu() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return <SiteMenu pathname={pathname} />;
}

// Dark shell (epic #66, #68): a charcoal page with off-white base type on every page except /dashboard, where
// only the bar and footer change and the page around the content stays as on main (spec Q13).
function RootDocument() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <html lang="en" className={shellHtmlClass(pathname)} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className={shellBodyClass(pathname)}>
        <PreviewHostBridge />
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
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      // Self-hosted Schibsted Grotesk (#72, Q16, ST6-06): the upright latin file is the one every page uses
      // first; preloaded so it is ready inside font-display: optional's window (see src/styles.css).
      {
        rel: "preload",
        href: "/fonts/schibsted-grotesk/schibsted-grotesk-latin.woff2",
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
    ],
  }),
  component: RootDocument,
  // The dark 404 (#72, ST6-09): unknown paths and the dashboard-off paths.
  notFoundComponent: NotFound,
});
