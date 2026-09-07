import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Frost Sprint Study Studio" },
      {
        name: "description",
        content: "Sign in to Frost to upload lessons and keep your study sprints saved.",
      },
      { property: "og:title", content: "Sign in — Frost" },
      { property: "og:description", content: "Sign in to keep your study journey saved." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/library", replace: true });
    });
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) {
          setSent(true);
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/library", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Google sign-in didn't work. Try again.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/library", replace: true });
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-frost font-display text-lg font-bold text-primary-foreground">
            F
          </div>
          <div className="text-left">
            <div className="font-display text-lg leading-none font-bold text-frost">Frost</div>
            <div className="text-[11px] tracking-wide text-frost/50">Sprint Study Studio</div>
          </div>
        </Link>

        <div className="glass edge spec rounded-3xl p-7">
          {sent ? (
            <div className="text-center">
              <h1 className="font-display text-xl font-semibold text-frost">Check your email</h1>
              <p className="mt-2 text-sm leading-6 text-frost/60">
                We sent a confirmation link to {email}. Click it, then come back and sign in.
              </p>
              <button
                onClick={() => {
                  setSent(false);
                  setMode("signin");
                }}
                className="mt-5 text-xs font-medium text-aqualine underline-offset-4 hover:underline"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              <h1 className="font-display text-xl font-semibold text-frost">
                {mode === "signin" ? "Welcome back" : "Create your account"}
              </h1>
              <p className="mt-1 text-xs text-frost/50">
                Your lessons and progress stay saved to your account.
              </p>

              <button
                onClick={onGoogle}
                className="edge mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-white/80 px-4 py-2.5 text-sm font-medium text-frost transition hover:bg-white"
              >
                Continue with Google
              </button>

              <div className="my-5 flex items-center gap-3 text-[11px] text-frost/40">
                <div className="h-px flex-1 bg-frost/10" />
                or use email
                <div className="h-px flex-1 bg-frost/10" />
              </div>

              <form onSubmit={onSubmit} className="space-y-3">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="edge w-full rounded-lg bg-mist/80 px-3 py-2.5 text-sm text-frost outline-none placeholder:text-frost/35 focus:ring-2 focus:ring-aqualine/40"
                />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="edge w-full rounded-lg bg-mist/80 px-3 py-2.5 text-sm text-frost outline-none placeholder:text-frost/35 focus:ring-2 focus:ring-aqualine/40"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-lg bg-frost px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-frost/90 disabled:opacity-60"
                >
                  {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
                </button>
              </form>

              <button
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                className="mt-4 w-full text-center text-xs text-frost/55 hover:text-aqualine"
              >
                {mode === "signin"
                  ? "New here? Create an account"
                  : "Already have an account? Sign in"}
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
