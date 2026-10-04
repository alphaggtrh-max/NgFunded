"use client";

import Link from "next/link";
import { LockKeyhole, Sparkles } from "lucide-react";

export function ProGate({ title = "Unlock NGFunded Pro", description = "Get advanced analytics, unlimited history and professional trading tools." }: { title?: string; description?: string }) {
  return <div className="relative overflow-hidden rounded-2xl border border-amber/20 bg-surface/80 p-6">
    <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-amber/10 blur-3xl" />
    <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-4"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber/20 bg-amber/10 text-amber"><LockKeyhole className="h-5 w-5"/></div><div><div className="flex items-center gap-2 text-sm font-semibold"><span>{title}</span><span className="rounded-full bg-amber/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-amber"><Sparkles className="mr-1 inline h-3 w-3"/>Pro</span></div><p className="mt-1 max-w-xl text-sm text-text-secondary">{description}</p></div></div>
      <Link href="/dashboard/settings" className="shrink-0 rounded-xl bg-amber px-4 py-2.5 text-sm font-semibold text-black hover:opacity-90">View plans</Link>
    </div>
  </div>;
}
