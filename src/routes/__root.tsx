import { Analytics } from "@vercel/analytics/react";
import { createRootRoute, HeadContent, Outlet, Scripts, useRouterState } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { SiteFooter } from "@/components/site-footer";
import { SiteMenu } from "@/components/site-menu";
import { analyticsBeforeSend } from "@/lib/site/analytics";
import appCss from "../styles.css?url";

const APP_NAME = "Orpheus Wisdom";

// The site menu and footer (#46) wrap every page, including /dashboard, sign-in and the 404.
function CurrentSiteMenu() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return <SiteMenu pathname={pathname} />;
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
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:ital,wght@0,400;0,500;1,400&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
    ],
  }),
  component: () => (
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
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
  ),
});
