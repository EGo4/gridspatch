"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "~/server/better-auth/client";
import { findEmailByUsername } from "~/server/actions/users";

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
    <div className="min-h-screen bg-[#1f1e24] flex items-center justify-center">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-xl font-semibold text-[#ececef] mb-8">
          Gridspatch
        </h1>

        <form
          onSubmit={handleSubmit}
          className="bg-[#28272d] rounded-xl border border-[#3a3940] p-6 flex flex-col gap-4"
        >
          <h2 className="text-[#ececef] font-medium text-sm">Sign in</h2>

          {error && (
            <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-[#a09fa6]" htmlFor="identifier">
              Username or email
            </label>
            <input
              id="identifier"
              type="text"
              autoComplete="username"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="rounded-lg bg-[#1f1e24] border border-[#3a3940] px-3 py-2 text-sm text-[#ececef] placeholder:text-[#6b6875] outline-none focus:border-[#6b6875] transition-colors"
              placeholder="John or you@example.com"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-[#a09fa6]" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg bg-[#1f1e24] border border-[#3a3940] px-3 py-2 text-sm text-[#ececef] placeholder:text-[#6b6875] outline-none focus:border-[#6b6875] transition-colors"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-1 rounded-lg bg-[#3a3940] px-4 py-2 text-sm font-medium text-[#ececef] hover:bg-[#4a4950] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
