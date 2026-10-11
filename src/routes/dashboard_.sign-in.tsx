import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { ensureDashboardEnabled, getDashboardViewer } from "@/lib/dashboard/gate";

// /dashboard/sign-in (T03 #11): email/password sign-in and sign-up. Same gate as
// /dashboard: 404 unless DASHBOARD_ENABLED is exactly "true". Already signed in:
// back to /dashboard. Sign-up only works for addresses on the allow-list (D12);
// the server enforces it.
export const Route = createFileRoute("/dashboard_/sign-in")({
  beforeLoad: async () => {
    await ensureDashboardEnabled();
    const viewer = await getDashboardViewer();
    if (viewer.user) throw redirect({ to: "/dashboard" });
    return { authReady: viewer.authReady };
  },
  loader: ({ context }) => ({ enabled: true as const, authReady: context.authReady }),
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

type Mode = "sign-in" | "sign-up";

function SignInPage() {
  const { authReady } = Route.useLoaderData();
  const [mode, setMode] = useState<Mode>("sign-in");
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
      const result =
        mode === "sign-in"
          ? await authClient.signIn.email({ email: trimmed, password })
          : await authClient.signUp.email({
              email: trimmed,
              password,
              name: trimmed.split("@")[0] || trimmed,
            });
      if (result.error) {
        setError(result.error.message ?? "Something went wrong. Try again.");
        setBusy(false);
        return;
      }
      // Full load so the server renders /dashboard with the new session cookie.
      window.location.href = "/dashboard";
    } catch {
      setError("Something went wrong. Try again.");
      setBusy(false);
    }
  }

  // Dark in the shared shell (#73, spec §9, ST5b): no white panel, sign-in-only classes (Q10; never the
  // dashboard's shared .field / .kicker). The auth calls, the mode switch and the redirect above are unchanged.
  return (
    <main className="signin mx-auto w-full max-w-md px-5 py-16 sm:px-8">
      <h1 className="signin-title">{mode === "sign-in" ? "Sign in" : "Create account"}</h1>
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
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
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
            {busy ? "Please wait…" : mode === "sign-in" ? "Sign in" : "Create account"}
          </button>
          <button
            type="button"
            className="signin-switch self-start"
            data-testid="sign-in-switch"
            onClick={() => {
              setMode(mode === "sign-in" ? "sign-up" : "sign-in");
              setError(null);
            }}
          >
            {mode === "sign-in" ? "Create an account" : "Sign in"}
          </button>
        </form>
      )}
    </main>
  );
}
