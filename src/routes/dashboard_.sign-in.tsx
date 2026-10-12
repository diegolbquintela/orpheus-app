import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { ensureDashboardEnabled, getDashboardViewer } from "@/lib/dashboard/gate";
import { DEFAULT_NEXT, safeNext, type SafeNext } from "@/lib/auth/next";

// /dashboard/sign-in (T03 #11): email/password sign-in. Same gate as
// /dashboard: 404 unless DASHBOARD_ENABLED is exactly "true". Already signed in:
// back to /dashboard. #90 (Q-D6, ROLE-09): no public `Create account`: the owner creates accounts on /account; the
// server's sign-up stays limited to the allow-list (D12) for the owner's own account only. #102: `?next=/personal-finance` (the only other target allowed) sends the visitor back
// there after signing in (and straight there when already signed in). QA D1: the raw `?next` is never trusted.
// TanStack keeps unvalidated search params from the root, so `safeNext` is applied on load (validateSearch,
// beforeLoad, loader) and again right before the post-auth navigation; anything but the exact relative path
// `/personal-finance` (an external URL, `//host`, another path, missing) is `/dashboard`.

export const Route = createFileRoute("/dashboard_/sign-in")({
  validateSearch: (search: Record<string, unknown>): { next?: SafeNext } => {
    const next = safeNext(search.next);
    return { next: next === DEFAULT_NEXT ? undefined : next };
  },
  beforeLoad: async ({ search }) => {
    await ensureDashboardEnabled();
    const viewer = await getDashboardViewer();
    const next = safeNext((search as { next?: unknown }).next);
    if (viewer.user) throw redirect({ to: next });
    return { authReady: viewer.authReady, next };
  },
  loader: ({ context }) => ({
    enabled: true as const,
    authReady: context.authReady,
    next: safeNext(context.next),
  }),
  head: ({ loaderData }) =>
    loaderData?.enabled
      ? {
          meta: [
            { title: "Sign in · Orpheus Wisdom" },
            { name: "robots", content: "noindex, nofollow" },
          ],
        }
      : {},
  component: SignInPage,
});

function SignInPage() {
  const { authReady, next } = Route.useLoaderData();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { authClient } = await import("@/lib/auth/client");
      const trimmed = email.trim();
      const result = await authClient.signIn.email({ email: trimmed, password });
      if (result.error) {
        setError(result.error.message ?? "Something went wrong. Try again.");
        setBusy(false);
        return;
      }
      // Full load so the server renders the page (/dashboard, or #102's ?next) with the new session cookie.
      window.location.assign(safeNext(next));
    } catch {
      setError("Something went wrong. Try again.");
      setBusy(false);
    }
  }

  // Dark in the shared shell (#73, spec §9, ST5b): no white panel, sign-in-only classes (Q10; never the
  // dashboard's shared .field / .kicker). The auth calls, the mode switch and the redirect above are unchanged.
  return (
    <main className="signin mx-auto w-full max-w-md px-5 py-16 sm:px-8">
      <h1 className="signin-title">Sign in</h1>
      {!authReady ? (
        <p className="signin-note mt-6" data-testid="sign-in-unavailable">
          Sign-in is not configured on this deployment.
        </p>
      ) : (
        <form className="mt-8 flex flex-col gap-6" onSubmit={submit} data-testid="sign-in-form">
          <label className="flex flex-col gap-2">
            <span className="signin-label">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="signin-field"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="signin-label">Password</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="signin-field"
            />
          </label>
          {error ? (
            <p className="signin-error" role="alert" data-testid="sign-in-error">
              {error}
            </p>
          ) : null}
          <button type="submit" disabled={busy} className="signin-button self-start">
            {busy ? "Please wait…" : "Sign in"}
          </button>
        </form>
      )}
    </main>
  );
}
