"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccountStore } from "@/store/account-store";
import { TradeSide, TradeStatus } from "@prisma/client";

export function OrderTicket() {
  const { selectedAccount } = useAccountStore();
  const queryClient = useQueryClient();
  const accountId = selectedAccount?.accountId;
  const [symbol, setSymbol] = useState("EURUSD");
  const [side, setSide] = useState<TradeSide>(TradeSide.BUY);
  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const { data } = useQuery({
    queryKey: ["open-trades", accountId],
    queryFn: async () => {
      if (!accountId) return null;
      const res = await fetch(`/api/trades?accountId=${accountId}&status=${TradeStatus.OPEN}&pageSize=100`);
      if (!res.ok) throw new Error("Failed to load open trades");
      return res.json() as Promise<{ data: Array<{ id: string; symbol: string; side: TradeSide; quantity: number; entryPrice: number }> }>;
    },
    enabled: !!accountId,
    refetchInterval: 2000,
  });

  async function openTrade() {
    if (!accountId) return;
    setBusy(true); setMessage("");
    try {
      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          symbol,
          side,
          quantity: Number(quantity),
          entryPrice: Number(price),
          ...(stopLoss ? { stopLoss: Number(stopLoss) } : {}),
          ...(takeProfit ? { takeProfit: Number(takeProfit) } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Order rejected");
      setMessage(`Opened ${side === TradeSide.BUY ? "LONG" : "SHORT"} ${symbol}`);
      queryClient.invalidateQueries({ queryKey: ["trades", accountId] });
      queryClient.invalidateQueries({ queryKey: ["open-trades", accountId] });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Order failed");
    } finally { setBusy(false); }
  }

  async function closeTrade(tradeId: string) {
    if (!price) { setMessage("Enter the current exit price first."); return; }
    setBusy(true); setMessage("");
    try {
      const res = await fetch("/api/trades", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradeId, exitPrice: Number(price) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Close rejected");
      setMessage(json?.data?.risk?.breached ? "Trade closed — account breached." : "Trade closed.");
      queryClient.invalidateQueries({ queryKey: ["trades", accountId] });
      queryClient.invalidateQueries({ queryKey: ["open-trades", accountId] });
      queryClient.invalidateQueries({ queryKey: ["metrics", accountId] });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Close failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="glass-panel p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-mono uppercase tracking-widest text-text-muted">Paper Trading</h2>
          <p className="text-xs text-text-muted mt-1">Test orders against the same prop-firm risk engine.</p>
        </div>
        <span className="px-2 py-1 rounded border border-cyan/20 bg-cyan/10 text-cyan text-[10px] font-mono">SIMULATED</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} className="px-3 py-2 text-xs bg-surface border border-border rounded-lg text-text-primary" placeholder="Symbol" />
        <select value={side} onChange={e => setSide(e.target.value as TradeSide)} className="px-3 py-2 text-xs bg-surface border border-border rounded-lg text-text-primary">
          <option value={TradeSide.BUY}>LONG / BUY</option>
          <option value={TradeSide.SELL}>SHORT / SELL</option>
        </select>
        <input value={quantity} onChange={e => setQuantity(e.target.value)} type="number" min="0" step="any" className="px-3 py-2 text-xs bg-surface border border-border rounded-lg text-text-primary" placeholder="Quantity" />
        <input value={price} onChange={e => setPrice(e.target.value)} type="number" min="0" step="any" className="px-3 py-2 text-xs bg-surface border border-border rounded-lg text-text-primary" placeholder="Market price" />
        <input value={stopLoss} onChange={e => setStopLoss(e.target.value)} type="number" min="0" step="any" className="px-3 py-2 text-xs bg-surface border border-border rounded-lg text-text-primary" placeholder="Stop loss" />
        <input value={takeProfit} onChange={e => setTakeProfit(e.target.value)} type="number" min="0" step="any" className="px-3 py-2 text-xs bg-surface border border-border rounded-lg text-text-primary" placeholder="Take profit" />
      </div>

      <button disabled={busy || !accountId || !price} onClick={openTrade} className="mt-3 px-4 py-2 rounded-lg bg-cyan text-black text-xs font-bold disabled:opacity-40">
        {busy ? "Processing…" : `Place ${side === TradeSide.BUY ? "Long" : "Short"}`}
      </button>

      {data?.data?.length ? (
        <div className="mt-5 pt-4 border-t border-border space-y-2">
          <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted">Open Positions</div>
          {data.data.map(trade => (
            <div key={trade.id} className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-xs">
              <span className="font-mono">{trade.symbol} · {trade.side === TradeSide.BUY ? "LONG" : "SHORT"} · {trade.quantity} @ {trade.entryPrice}</span>
              <button disabled={busy} onClick={() => closeTrade(trade.id)} className="px-2 py-1 rounded border border-crimson/30 text-crimson hover:bg-crimson/10 disabled:opacity-40">Close @ {price || "…"}</button>
            </div>
          ))}
        </div>
      ) : null}

      {message && <div className="mt-3 text-xs font-mono text-text-secondary">{message}</div>}
    </div>
  );
}
