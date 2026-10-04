"use client";

import { useState } from "react";
import Link from "next/link";

const challenges = [
  { id: "10k", balance: 10000, price: 49, daily: 500, drawdown: 1000 },
  { id: "25k", balance: 25000, price: 99, daily: 1250, drawdown: 2500 },
  { id: "50k", balance: 50000, price: 199, daily: 2500, drawdown: 5000 },
  { id: "100k", balance: 100000, price: 299, daily: 5000, drawdown: 10000 },
];

export default function ChallengesPage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function buy(challengeId: string) {
    setLoading(challengeId);
    setError("");
    try {
      const response = await fetch("/api/challenges/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? "Checkout could not be started.");
      window.location.href = json.data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout could not be started.");
      setLoading(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-mono uppercase tracking-[0.25em] text-crimson">NGFunded</p>
          <h1 className="mt-2 text-3xl font-semibold">Get a funded demo account</h1>
          <p className="mt-2 max-w-2xl text-sm text-text-secondary">
            Pay once, receive a simulated funded account and trade it with the full NGFunded platform. The account is paper trading only — no real capital is placed in the market.
          </p>
        </div>
        <Link href="/dashboard" className="rounded-xl border border-border px-4 py-2 text-sm text-text-secondary hover:bg-surface">
          Back to dashboard
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {challenges.map((challenge) => (
          <div key={challenge.id} className="flex flex-col rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-widest text-text-muted">Funded Demo</span>
              <span className="rounded-full bg-cyan/10 px-2 py-1 text-xs font-mono text-cyan">{challenge.id}</span>
            </div>
            <div className="mt-5 text-3xl font-bold font-mono">${challenge.balance.toLocaleString()}</div>
            <div className="mt-1 text-sm text-text-muted">simulated account balance</div>

            <div className="mt-6 space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-text-muted">Daily loss limit</span><span className="font-mono">${challenge.daily.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">Max drawdown</span><span className="font-mono">${challenge.drawdown.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">Profit target</span><span className="font-mono">8%</span></div>
              <div className="flex justify-between"><span className="text-text-muted">Leverage</span><span className="font-mono">1:100</span></div>
            </div>

            <div className="mt-auto pt-6">
              <div className="mb-3 text-center text-2xl font-bold">${challenge.price}<span className="text-sm font-normal text-text-muted"> one-time</span></div>
              <button onClick={() => buy(challenge.id)} disabled={loading !== null} className="w-full rounded-xl bg-crimson py-3 font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60">
                {loading === challenge.id ? "Opening checkout…" : "Get funded demo"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {error && <div className="rounded-xl border border-crimson/30 bg-crimson/5 p-4 text-sm text-crimson">{error}</div>}

      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["Full platform access", "Trading, trades, journal, analytics and risk tools are not artificially paywalled."],
          ["Paper execution", "Every order is simulated. Your account balance and rule checks are tracked inside NGFunded."],
          ["One-time challenge", "Payment unlocks the funded demo account itself. There is no subscription required for the account."],
        ].map(([title, body]) => (
          <div key={title} className="rounded-2xl border border-border bg-surface/60 p-5">
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">{body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
