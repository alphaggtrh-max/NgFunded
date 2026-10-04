"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createChart, ColorType, type IChartApi, type ISeriesApi, type CandlestickData } from "lightweight-charts";

const START = 1.1742;
const tfSeconds: Record<string, number> = { "1m": 60, "5m": 300, "15m": 900, "1h": 3600 };

type Account = { accountId: string; initialBalance: number; equity: number; currentBalance: number };
type Trade = { id: string; symbol: string; side: "BUY" | "SELL"; quantity: number; entryPrice: number; status: string };

function makeCandles(step: number) {
  let price = START;
  const now = Math.floor(Date.now() / 1000);
  const candles: CandlestickData[] = [];
  for (let i = 180; i >= 0; i--) {
    const time = now - i * step;
    const drift = Math.sin(i * 0.19) * 0.00018 + (Math.random() - 0.48) * 0.00045;
    const open = price;
    const close = Math.max(0.2, open + drift);
    const high = Math.max(open, close) + Math.random() * 0.00022;
    const low = Math.min(open, close) - Math.random() * 0.00022;
    candles.push({ time: time as CandlestickData["time"], open, high, low, close });
    price = close;
  }
  return candles;
}

export default function TradingPage() {
  const chartEl = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [timeframe, setTimeframe] = useState("5m");
  const [symbol, setSymbol] = useState("EURUSD");
  const [price, setPrice] = useState(START);
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [quantity, setQuantity] = useState("1");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [account, setAccount] = useState<Account | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [message, setMessage] = useState("");

  const spread = 0.00012;
  const bid = price - spread / 2;
  const ask = price + spread / 2;

  useEffect(() => {
    fetch("/api/accounts?pageSize=1", { cache: "no-store" })
      .then(r => r.json())
      .then(j => setAccount(j.data?.[0] ?? null))
      .catch(() => setAccount(null));
  }, []);

  useEffect(() => {
    if (!chartEl.current) return;
    const c = createChart(chartEl.current, {
      width: chartEl.current.clientWidth,
      height: 520,
      layout: { background: { type: ColorType.Solid, color: "#0b080c" }, textColor: "#9b8fa8" },
      grid: { vertLines: { color: "#211c24" }, horzLines: { color: "#211c24" } },
      rightPriceScale: { borderColor: "#2a2430" },
      timeScale: { borderColor: "#2a2430", timeVisible: true, secondsVisible: false },
      crosshair: { vertLine: { color: "#e63946", width: 1 }, horzLine: { color: "#e63946", width: 1 } },
    });
    const s = c.addCandlestickSeries({
      upColor: "#00d7bd", downColor: "#e63946", borderUpColor: "#00d7bd", borderDownColor: "#e63946", wickUpColor: "#00d7bd", wickDownColor: "#e63946",
    });
    chart.current = c;
    series.current = s;
    const resize = new ResizeObserver(entries => c.applyOptions({ width: entries[0].contentRect.width }));
    resize.observe(chartEl.current);
    return () => { resize.disconnect(); c.remove(); chart.current = null; series.current = null; };
  }, []);

  useEffect(() => {
    const candles = makeCandles(tfSeconds[timeframe]);
    series.current?.setData(candles);
    chart.current?.timeScale().fitContent();
    setPrice(Number(candles[candles.length - 1].close));
  }, [timeframe, symbol]);

  useEffect(() => {
    const timer = window.setInterval(() => setPrice(p => Math.max(0.2, p + (Math.random() - 0.49) * 0.00018)), 1500);
    return () => window.clearInterval(timer);
  }, []);

  const risk = useMemo(() => {
    const sl = Number(stopLoss);
    return stopLoss && Number.isFinite(sl) ? Math.abs(price - sl) * Number(quantity || 0) : 0;
  }, [price, stopLoss, quantity]);

  async function placeTrade() {
    setMessage("");
    if (!account) return setMessage("Create or select a trading account before placing a paper trade.");
    const entry = side === "BUY" ? ask : bid;
    const body = { accountId: account.accountId, symbol, side, quantity: Number(quantity), entryPrice: entry, stopLoss: stopLoss ? Number(stopLoss) : undefined, takeProfit: takeProfit ? Number(takeProfit) : undefined };
    const r = await fetch("/api/trades", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) return setMessage(j.error?.message ?? "Trade could not be placed");
    setTrades(t => [j.data, ...t]);
    setMessage(`${side} ${quantity} ${symbol} paper trade opened at ${entry.toFixed(5)}`);
  }

  return <div className="mx-auto max-w-[1500px] space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-3xl font-semibold">Paper Trading</h1><p className="mt-1 text-sm text-text-secondary">MT5-style execution workspace. Orders are simulated and never sent to a broker.</p></div>
      <div className="flex items-center gap-2 rounded-xl border border-cyan/20 bg-cyan/5 px-3 py-2 text-xs font-mono text-cyan"><span className="h-2 w-2 rounded-full bg-cyan animate-pulse"/>PAPER FEED</div>
    </div>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
      <section className="overflow-hidden rounded-2xl border border-border bg-[#0b080c]">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <select value={symbol} onChange={e => setSymbol(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold"><option>EURUSD</option><option>GBPUSD</option><option>USDJPY</option><option>XAUUSD</option><option>NAS100</option><option>US500</option></select>
          {Object.keys(tfSeconds).map(tf => <button key={tf} onClick={() => setTimeframe(tf)} className={`rounded-lg px-3 py-2 text-xs font-mono ${timeframe === tf ? "bg-crimson text-white" : "text-text-muted hover:bg-surface"}`}>{tf}</button>)}
          <span className="ml-auto font-mono text-xs text-text-muted">Bid <b className="text-crimson">{bid.toFixed(5)}</b> · Ask <b className="text-cyan">{ask.toFixed(5)}</b></span>
        </div>
        <div ref={chartEl} className="w-full" />
      </section>
      <aside className="space-y-4">
        <section className="rounded-2xl border border-border bg-surface/80 p-5">
          <div className="flex gap-2"><button onClick={() => setSide("BUY")} className={`flex-1 rounded-xl py-3 font-semibold ${side === "BUY" ? "bg-cyan/15 text-cyan ring-1 ring-cyan/30" : "bg-background text-text-muted"}`}>BUY<br/><span className="font-mono text-xs">{ask.toFixed(5)}</span></button><button onClick={() => setSide("SELL")} className={`flex-1 rounded-xl py-3 font-semibold ${side === "SELL" ? "bg-crimson/15 text-crimson ring-1 ring-crimson/30" : "bg-background text-text-muted"}`}>SELL<br/><span className="font-mono text-xs">{bid.toFixed(5)}</span></button></div>
          <label className="mt-4 block text-xs text-text-muted">Quantity<input value={quantity} onChange={e => setQuantity(e.target.value)} type="number" min="0.01" step="0.01" className="mt-1 w-full rounded-xl border border-border bg-background p-3"/></label>
          <div className="mt-3 grid grid-cols-2 gap-2"><label className="text-xs text-text-muted">Stop loss<input value={stopLoss} onChange={e => setStopLoss(e.target.value)} placeholder="Optional" className="mt-1 w-full rounded-xl border border-border bg-background p-3 font-mono"/></label><label className="text-xs text-text-muted">Take profit<input value={takeProfit} onChange={e => setTakeProfit(e.target.value)} placeholder="Optional" className="mt-1 w-full rounded-xl border border-border bg-background p-3 font-mono"/></label></div>
          <button onClick={placeTrade} className="mt-4 w-full rounded-xl bg-crimson py-3 font-semibold text-white shadow-glow-crimson">Place paper trade</button>
          {risk > 0 && <div className="mt-3 text-xs text-text-muted">Estimated SL exposure: <span className="font-mono text-text-primary">${risk.toFixed(2)}</span></div>}
          {message && <div className="mt-3 rounded-xl border border-border p-3 text-xs text-text-secondary">{message}</div>}
        </section>
        <section className="rounded-2xl border border-border bg-surface/80 p-5"><div className="flex justify-between"><h2 className="font-medium">Open positions</h2><a href="/dashboard/trades" className="text-xs text-cyan">Manage all</a></div>{trades.length === 0 ? <p className="mt-5 text-sm text-text-muted">No positions opened from this session.</p> : <div className="mt-4 space-y-2">{trades.map(t => <div key={t.id} className="rounded-xl border border-border bg-background/50 p-3"><div className="flex justify-between"><b>{t.symbol}</b><span className={t.side === "BUY" ? "text-cyan" : "text-crimson"}>{t.side}</span></div><div className="mt-1 text-xs text-text-muted">{t.quantity} @ {Number(t.entryPrice).toFixed(5)}</div></div>)}</div>}</section>
        <section className="rounded-2xl border border-amber/20 bg-amber/5 p-4"><div className="text-xs font-semibold text-amber">PRO READY</div><p className="mt-1 text-xs leading-5 text-text-secondary">Advanced replay, unlimited trade history, multi-account analytics and custom risk templates can be part of the paid plan. Core paper trading stays usable in the free tier.</p></section>
      </aside>
    </div>
  </div>;
}
