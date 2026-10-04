"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

export default function ChallengeSuccessPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [accountId, setAccountId] = useState("");
  const [message, setMessage] = useState("Activating your funded demo account…");

  useEffect(() => {
    const sessionId = params.get("session_id");
    if (!sessionId) {
      setState("error");
      setMessage("No checkout session was provided.");
      return;
    }

    fetch(`/api/challenges/fulfill?session_id=${encodeURIComponent(sessionId)}`, { cache: "no-store" })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.error?.message ?? "The account could not be activated.");
        setAccountId(json.data.accountId);
        setState("success");
        setMessage("Payment confirmed. Your funded demo account is ready.");
        setTimeout(() => router.push("/dashboard/trading"), 1200);
      })
      .catch((error) => {
        setState("error");
        setMessage(error instanceof Error ? error.message : "The account could not be activated.");
      });
  }, [params, router]);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl items-center justify-center">
      <div className="w-full rounded-3xl border border-border bg-surface p-8 text-center">
        <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${state === "error" ? "bg-crimson/10 text-crimson" : "bg-cyan/10 text-cyan"}`}>
          {state === "loading" ? "…" : state === "success" ? "✓" : "!"}
        </div>
        <h1 className="mt-5 text-2xl font-semibold">{state === "success" ? "Account activated" : state === "error" ? "Activation failed" : "Payment received"}</h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">{message}</p>
        {accountId && <div className="mt-5 rounded-xl border border-border bg-background p-4 font-mono text-sm">{accountId}</div>}
        <div className="mt-6 flex justify-center gap-3">
          {state === "success" ? <Link href="/dashboard/trading" className="rounded-xl bg-crimson px-5 py-3 font-semibold text-white">Start trading</Link> : <Link href="/dashboard/challenges" className="rounded-xl border border-border px-5 py-3 text-sm">Back to challenges</Link>}
        </div>
      </div>
    </div>
  );
}
