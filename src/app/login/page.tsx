"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "~/server/better-auth/client";
import { findEmailByUsername } from "~/server/actions/users";
import { Logo } from "~/components/Logo";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      let email = identifier.trim();

      if (!email.includes("@")) {
        const found = await findEmailByUsername(email);
        if (!found) {
          setError("No account found with that username.");
          return;
        }
        email = found;
      }

      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(result.error.message ?? "Sign in failed");
        return;
      }
      router.push("/board");
    } catch {
      setError("Sign in failed. Check your credentials and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-page)] flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-8">
          <Logo size={48} />
          <span className="text-lg font-semibold text-[var(--color-text-primary)]">Gridspatch</span>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-[var(--color-bg-surface)] rounded-xl border border-[var(--color-border-muted)] p-6 flex flex-col gap-4"
        >
          <h2 className="text-[var(--color-text-primary)] font-medium text-sm">Sign in</h2>

          {error && (
            <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-[var(--color-text-secondary)]" htmlFor="identifier">
              Username or email
            </label>
            <input
              id="identifier"
              type="text"
              autoComplete="username"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="rounded-lg bg-[var(--color-bg-page)] border border-[var(--color-border-muted)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none focus:border-[var(--color-border-strong)] transition-colors"
              placeholder="John or you@example.com"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-[var(--color-text-secondary)]" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg bg-[var(--color-bg-page)] border border-[var(--color-border-muted)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none focus:border-[var(--color-border-strong)] transition-colors"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-1 rounded-lg bg-[var(--color-bg-active)] px-4 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-border-strong)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
