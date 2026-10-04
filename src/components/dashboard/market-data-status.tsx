"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

interface MarketQuote {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  timestamp: number;
}

interface MarketDataResponse {
  provider: string;
  connected: boolean;
  lastTickAt: number | null;
  symbols: MarketQuote[];
}

export function MarketDataStatus() {
  const { data } = useQuery<MarketDataResponse>({
    queryKey: ["market-data"],
    queryFn: async () => {
      const response = await fetch("/api/market-data");
      if (!response.ok) throw new Error("Failed to load market data status");
      const json = await response.json();
      return json.data as MarketDataResponse;
    },
    refetchInterval: 2000,
  });

  const connected = data?.connected === true;
  const provider = data?.provider?.toUpperCase() ?? "MT5";
  const latest = data?.symbols?.slice(0, 4) ?? [];

  return (
    <section className="glass-panel px-4 py-3">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg border",
            connected
              ? "border-cyan/30 bg-cyan/10 text-cyan"
              : "border-amber/30 bg-amber/10 text-amber"
          )}>
            {connected ? <Radio className="h-4 w-4 animate-pulse" /> : <Activity className="h-4 w-4" />}
          </span>
          <div>
            <div className="text-xs font-mono uppercase tracking-widest text-text-muted">Market Data</div>
            <div className={cn("text-sm font-semibold", connected ? "text-cyan" : "text-amber")}>
              {connected ? `${provider} LIVE` : `${provider} OFFLINE`}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {latest.map((quote) => (
            <div key={quote.symbol} className="rounded-md border border-border bg-surface/70 px-2 py-1 font-mono text-[11px]">
              <span className="text-text-secondary">{quote.symbol}</span>
              <span className="ml-2 text-cyan">{quote.bid}</span>
              <span className="mx-1 text-text-muted">/</span>
              <span className="text-text-primary">{quote.ask}</span>
            </div>
          ))}
        </div>

        <div className="ml-auto text-[10px] font-mono text-text-muted">
          Paper trading · MT5 prices only
        </div>
      </div>
    </section>
  );
}
