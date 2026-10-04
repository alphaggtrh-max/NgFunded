"use client";

import { Activity, ChevronDown } from "lucide-react";
import { useState } from "react";

export function TopBar() {
  const [account, setAccount] = useState("NGF-100042");

  return (
    <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-border bg-surface/90 px-5 py-3 backdrop-blur-xl">
      <div className="flex items-center gap-2 mr-2">
        <span className="text-lg font-black tracking-tight text-crimson text-glow-crimson">NG</span>
        <span className="text-lg font-semibold tracking-tight text-text-primary">Funded</span>
      </div>

      <div className="relative">
        <select
          value={account}
          onChange={(event) => setAccount(event.target.value)}
          aria-label="Trading account"
          className="appearance-none rounded-lg border border-border bg-background px-3 py-1.5 pr-8 text-xs font-mono text-text-secondary outline-none transition hover:border-border-bright focus:border-crimson"
        >
          <option>NGF-100042</option>
          <option>NGF-100031</option>
          <option>NGF-100018</option>
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-2 h-3.5 w-3.5 text-text-muted" />
      </div>

      <span className="hidden rounded border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-text-muted sm:inline-flex">Phase 1 Evaluation</span>
      <div className="flex-1" />

      <div className="hidden items-center gap-2 rounded-lg border border-cyan/10 bg-cyan/5 px-3 py-1.5 sm:flex">
        <Activity className="h-3.5 w-3.5 animate-pulse text-cyan" />
        <span className="text-xs font-mono text-cyan">$7,380.00</span>
        <span className="text-[10px] text-text-muted">P&L</span>
      </div>

      <div className="hidden w-32 md:block">
        <div className="mb-1 flex justify-between text-[9px] font-mono uppercase tracking-wider"><span className="text-text-muted">Target</span><span className="text-amber">92.3%</span></div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-elevated"><div className="h-full w-[92.3%] rounded-full bg-amber" /></div>
      </div>

      <span className="badge-active">ACTIVE</span>
      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-crimson/30 bg-crimson/10 text-xs font-bold text-crimson">D</div>
    </header>
  );
}
