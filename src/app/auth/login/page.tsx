"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Invalid email or password");
      setLoading(false);
      return;
    }

    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      {/* Background grid */}
      <div
        className="absolute inset-0 opacity-5 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(230,57,70,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(230,57,70,0.4) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold">
            <span className="text-text-primary">NG</span>
            <span className="text-crimson text-glow-crimson">Funded</span>
          </h1>
          <p className="text-text-muted text-sm mt-2">Sign in to your trading account</p>
        </div>

        {/* Card */}
        <form
          onSubmit={handleSubmit}
          className="glass-panel p-6 space-y-4"
        >
          {error && (
            <div className="px-3 py-2 rounded-lg bg-crimson/10 border border-crimson/30 text-crimson text-sm">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-mono uppercase tracking-wider text-text-muted">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="trader@ngfunded.io"
              className="w-full px-3 py-2.5 bg-surface border border-border rounded-lg text-text-primary placeholder-text-muted text-sm focus:outline-none focus:border-crimson/50 transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono uppercase tracking-wider text-text-muted">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2.5 pr-10 bg-surface border border-border rounded-lg text-text-primary placeholder-text-muted text-sm focus:outline-none focus:border-crimson/50 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={cn(
              "w-full py-2.5 rounded-lg font-semibold text-sm transition-all duration-200",
              "bg-crimson text-white hover:bg-crimson/90 shadow-glow-crimson hover:shadow-glow-crimson",
              "disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            )}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <p className="text-center text-xs text-text-muted mt-4">
          By signing in, you agree to our{" "}
          <span className="text-crimson/70">Terms of Service</span> and{" "}
          <span className="text-crimson/70">Risk Disclosure</span>.
        </p>
      </div>
    </div>
  );
}
