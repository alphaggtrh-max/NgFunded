"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createChart, ColorType, type CandlestickData, type IChartApi, type ISeriesApi } from "lightweight-charts";

type Interval = "1m" | "5m" | "15m" | "1h";
type Quote = { bid: number; ask: number; timestamp: number };
type Trade = {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  entryPrice: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  status: "OPEN" | "CLOSED";
};
type Account = { accountId: string; initialBalance: number; equity: number; currentBalance: number; status?: string };

type MarketMessage =
  | { type: "connected"; symbol: string }
  | { type: "quote"; symbol: string; bid: number; ask: number; timestamp: number }
  | { type: "bar"; symbol: string; bar: CandlestickData }
  | { type: "reconnecting"; symbol: string }
  | { type: "error"; message: string };

const SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD"];
const INTERVALS: Array<{ value: Interval; label: string; seconds: number }> = [
  { value: "1m", label: "1m", seconds: 60 },
  { value: "5m", label: "5m", seconds: 300 },
  { value: "15m", label: "15m", seconds: 900 },
  { value: "1h", label: "1H", seconds: 3600 },
];

function decimals(symbol: string) {
  return symbol.endsWith("JPY") ? 3 : 5;
}

function priceText(symbol: string, value: number | null) {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(decimals(symbol));
}

function aggregateBars(bars: CandlestickData[], seconds: number) {
  if (seconds === 60) return bars;
  const result: CandlestickData[] = [];
  for (const bar of bars) {
    const bucket = Math.floor(Number(bar.time) / seconds) * seconds;
    const previous = result[result.length - 1];
    if (!previous || Number(previous.time) !== bucket) {
      result.push({ time: bucket as CandlestickData["time"], open: bar.open, high: bar.high, low: bar.low, close: bar.close });
    } else {
      previous.high = Math.max(previous.high, bar.high);
      previous.low = Math.min(previous.low, bar.low);
      previous.close = bar.close;
    }
  }
  return result;
}

export default function TradingPage() {
  const chartEl = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barsRef = useRef<CandlestickData[]>([]);
  const tradesRef = useRef<Trade[]>([]);
  const closingRef = useRef(new Set<string>());

  const [symbol, setSymbol] = useState("EURUSD");
  const [interval, setIntervalValue] = useState<Interval>("5m");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [quantity, setQuantity] = useState("1");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [loading, setLoading] = useState(true);
  const [streamState, setStreamState] = useState("connecting");
  const [message, setMessage] = useState("");

  const activeInterval = INTERVALS.find((item) => item.value === interval) ?? INTERVALS[1];
  const bid = quote?.bid ?? null;
  const ask = quote?.ask ?? null;
  const mid = bid != null && ask != null ? (bid + ask) / 2 : null;

  const loadAccount = useCallback(async () => {
    try {
      const response = await fetch("/api/accounts?pageSize=1", { cache: "no-store" });
      const json = await response.json();
      setAccount(json.data?.[0] ?? null);
    } catch {
      setAccount(null);
    }
  }, []);

  const loadOpenTrades = useCallback(async () => {
    if (!account?.accountId) return;
    try {
      const response = await fetch(`/api/trades?accountId=${account.accountId}&status=OPEN&pageSize=100`, { cache: "no-store" });
      const json = await response.json();
      const next = Array.isArray(json.data) ? json.data.map((trade: Trade) => ({
        ...trade,
        quantity: Number(trade.quantity),
        entryPrice: Number(trade.entryPrice),
        stopLoss: trade.stopLoss == null ? null : Number(trade.stopLoss),
        takeProfit: trade.takeProfit == null ? null : Number(trade.takeProfit),
      })) : [];
      tradesRef.current = next;
      setTrades(next);
    } catch {
      // Keep the current position list if the refresh fails transiently.
    }
  }, [account?.accountId]);

  const closeTrade = useCallback(async (trade: Trade, exitPrice: number, reason?: string) => {
    if (closingRef.current.has(trade.id)) return;
    closingRef.current.add(trade.id);
    try {
      const response = await fetch("/api/trades", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradeId: trade.id, exitPrice, closedAt: new Date().toISOString() }),
      });
      if (!response.ok) return;
      const next = tradesRef.current.filter((item) => item.id !== trade.id);
      tradesRef.current = next;
      setTrades(next);
      setMessage(`${trade.symbol} ${trade.side} closed at ${priceText(trade.symbol, exitPrice)}${reason ? ` · ${reason}` : ""}`);
      await loadAccount();
    } finally {
      closingRef.current.delete(trade.id);
    }
  }, [loadAccount]);

  const handleQuote = useCallback((nextQuote: Quote) => {
    setQuote(nextQuote);
    for (const trade of tradesRef.current) {
      const executable = trade.side === "BUY" ? nextQuote.bid : nextQuote.ask;
      const hitStop = trade.stopLoss != null && (trade.side === "BUY" ? executable <= trade.stopLoss : executable >= trade.stopLoss);
      const hitTarget = trade.takeProfit != null && (trade.side === "BUY" ? executable >= trade.takeProfit : executable <= trade.takeProfit);
      if (hitStop) void closeTrade(trade, executable, "Stop loss");
      else if (hitTarget) void closeTrade(trade, executable, "Take profit");
    }
  }, [closeTrade]);

  useEffect(() => { void loadAccount(); }, [loadAccount]);
  useEffect(() => { void loadOpenTrades(); }, [loadOpenTrades]);

  useEffect(() => {
    let cancelled = false;
    async function loadHistory() {
      setLoading(true);
      try {
        const response = await fetch(`/api/market/forex?symbol=${symbol}&interval=1m`, { cache: "no-store" });
        const json = await response.json();
        if (!response.ok || !json.data) throw new Error(json.error?.message ?? "Market data unavailable");
        if (cancelled) return;
        const source = (json.data.bars ?? []) as CandlestickData[];
        const nextBars = aggregateBars(source, activeInterval.seconds);
        barsRef.current = nextBars;
        seriesRef.current?.setData(nextBars);
        chartRef.current?.timeScale().fitContent();
        const q = json.data.quote;
        if (q?.bid != null && q?.ask != null) handleQuote({ bid: Number(q.bid), ask: Number(q.ask), timestamp: Number(q.timestamp ?? Date.now()) });
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Market data unavailable");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadHistory();
    return () => { cancelled = true; };
  }, [symbol, activeInterval.seconds, handleQuote]);

  useEffect(() => {
    if (!chartEl.current) return;
    const chart = createChart(chartEl.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#0b080c" }, textColor: "#9b8fa8" },
      grid: { vertLines: { color: "#211c24" }, horzLines: { color: "#211c24" } },
      rightPriceScale: { borderColor: "#2a2430" },
      timeScale: { borderColor: "#2a2430", timeVisible: true, secondsVisible: false },
      crosshair: { vertLine: { color: "#e63946", width: 1 }, horzLine: { color: "#e63946", width: 1 } },
    });
    const series = chart.addCandlestickSeries({ upColor: "#00d7bd", downColor: "#e63946", borderVisible: false, wickUpColor: "#00d7bd", wickDownColor: "#e63946" });
    chartRef.current = chart;
    seriesRef.current = series;
    return () => { chart.remove(); chartRef.current = null; seriesRef.current = null; };
  }, []);

  useEffect(() => {
    let stopped = false;
    let reconnectDelay = 1000;

    const connect = () => {
      if (stopped) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/api/market/ws?symbol=${symbol}`);
      socketRef.current = ws;
      setStreamState("connecting");

      ws.onopen = () => {
        reconnectDelay = 1000;
        setStreamState("live");
        ws.send(JSON.stringify({ type: "subscribe", symbol }));
      };
      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as MarketMessage;
          if (message.type === "quote") handleQuote({ bid: Number(message.bid), ask: Number(message.ask), timestamp: Number(message.timestamp) });
          if (message.type === "bar") {
            const raw = message.bar;
            const bucket = Math.floor(Number(raw.time) / activeInterval.seconds) * activeInterval.seconds;
            const current = barsRef.current[barsRef.current.length - 1];
            const next = { ...raw, time: bucket as CandlestickData["time"] };
            if (!current || Number(current.time) !== bucket) barsRef.current = [...barsRef.current, next].slice(-500);
            else {
              const merged = { ...current, high: Math.max(current.high, raw.high), low: Math.min(current.low, raw.low), close: raw.close };
              barsRef.current = [...barsRef.current.slice(0, -1), merged];
            }
            seriesRef.current?.update(barsRef.current[barsRef.current.length - 1]);
          }
          if (message.type === "reconnecting") setStreamState("reconnecting");
          if (message.type === "error") setMessage(message.message);
        } catch {
          setMessage("Live market stream returned an invalid message");
        }
      };
      ws.onerror = () => setStreamState("reconnecting");
      ws.onclose = () => {
        if (stopped) return;
        setStreamState("reconnecting");
        reconnectRef.current = setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 15000);
      };
    };

    connect();
    return () => {
      stopped = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      socketRef.current?.close();
    };
  }, [symbol, activeInterval.seconds, handleQuote]);

  async function placeTrade() {
    setMessage("");
    if (!account) return setMessage("Choose a funded account before placing a trade.");
    if (!quote) return setMessage("Waiting for the live price feed…");
    const entryPrice = side === "BUY" ? quote.ask : quote.bid;
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) return setMessage("Quantity must be greater than zero.");
    const body = {
      accountId: account.accountId,
      symbol,
      side,
      quantity: qty,
      entryPrice,
      stopLoss: stopLoss ? Number(stopLoss) : undefined,
      takeProfit: takeProfit ? Number(takeProfit) : undefined,
    };
    try {
      const response = await fetch("/api/trades", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await response.json();
      if (!response.ok) return setMessage(json.error?.message ?? "Trade could not be placed");
      setMessage(`${side} ${qty} ${symbol} opened at ${priceText(symbol, entryPrice)}`);
      setStopLoss("");
      setTakeProfit("");
      await loadOpenTrades();
    } catch {
      setMessage("Trade request failed. Please try again.");
    }
  }

  const spread = bid != null && ask != null ? ask - bid : null;
  const risk = useMemo(() => {
    const sl = Number(stopLoss);
    const qty = Number(quantity);
    return stopLoss && Number.isFinite(sl) && Number.isFinite(qty) ? Math.abs((mid ?? 0) - sl) * qty : 0;
  }, [mid, stopLoss, quantity]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Trading</h1>
          <p className="mt-1 text-sm text-text-secondary">Live market execution workspace</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-cyan/20 bg-cyan/5 px-3 py-2 text-xs font-mono text-cyan">
          <span className={`h-2 w-2 rounded-full ${streamState === "live" ? "bg-cyan animate-pulse" : "bg-amber"}`} />
          {streamState === "live" ? "LIVE" : streamState.toUpperCase()}
        </div>
      </div>

      {!account && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber/20 bg-amber/5 p-5">
          <div><div className="font-semibold text-amber">No funded account</div><p className="mt-1 text-sm text-text-secondary">Purchase a funded account to unlock trading.</p></div>
          <Link href="/dashboard/challenges" className="rounded-xl bg-crimson px-5 py-3 text-sm font-semibold text-white">Choose account</Link>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="overflow-hidden rounded-2xl border border-border bg-[#0b080c]">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <select value={symbol} onChange={(event) => setSymbol(event.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold">
              {SYMBOLS.map((item) => <option key={item}>{item}</option>)}
            </select>
            {INTERVALS.map((item) => <button key={item.value} onClick={() => setIntervalValue(item.value)} className={`rounded-lg px-3 py-2 text-xs font-mono ${interval === item.value ? "bg-crimson text-white" : "text-text-muted hover:bg-surface"}`}>{item.label}</button>)}
            <div className="ml-auto flex items-center gap-3 font-mono text-xs">
              <span className="text-text-muted">Bid <b className="text-crimson">{priceText(symbol, bid)}</b></span>
              <span className="text-text-muted">Ask <b className="text-cyan">{priceText(symbol, ask)}</b></span>
              <span className="hidden text-text-muted sm:inline">Spread {priceText(symbol, spread)}</span>
            </div>
          </div>
          <div className="relative h-[620px]">
            {loading && <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0b080c]/60 text-xs font-mono text-text-muted">Loading market history…</div>}
            <div ref={chartEl} className="h-full w-full" />
          </div>
          <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[10px] text-text-muted">
            <span>Streaming quotes · {activeInterval.label} candles</span>
            <span>{account?.accountId ? `Account ${account.accountId}` : "No funded account"}</span>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-border bg-surface/80 p-5">
            <div className="flex gap-2">
              <button onClick={() => setSide("BUY")} className={`flex-1 rounded-xl py-3 font-semibold ${side === "BUY" ? "bg-cyan/15 text-cyan ring-1 ring-cyan/30" : "bg-background text-text-muted"}`}>BUY<br/><span className="font-mono text-xs">{priceText(symbol, ask)}</span></button>
              <button onClick={() => setSide("SELL")} className={`flex-1 rounded-xl py-3 font-semibold ${side === "SELL" ? "bg-crimson/15 text-crimson ring-1 ring-crimson/30" : "bg-background text-text-muted"}`}>SELL<br/><span className="font-mono text-xs">{priceText(symbol, bid)}</span></button>
            </div>
            <label className="mt-4 block text-xs text-text-muted">Quantity<input value={quantity} onChange={(event) => setQuantity(event.target.value)} type="number" min="0.01" step="0.01" className="mt-1 w-full rounded-xl border border-border bg-background p-3" /></label>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-xs text-text-muted">Stop loss<input value={stopLoss} onChange={(event) => setStopLoss(event.target.value)} placeholder="Optional" className="mt-1 w-full rounded-xl border border-border bg-background p-3 font-mono" /></label>
              <label className="text-xs text-text-muted">Take profit<input value={takeProfit} onChange={(event) => setTakeProfit(event.target.value)} placeholder="Optional" className="mt-1 w-full rounded-xl border border-border bg-background p-3 font-mono" /></label>
            </div>
            <button onClick={placeTrade} disabled={!account || streamState !== "live"} className="mt-4 w-full rounded-xl bg-crimson py-3 font-semibold text-white shadow-glow-crimson disabled:cursor-not-allowed disabled:opacity-40">{account ? "Place trade" : "Funded account required"}</button>
            {risk > 0 && <div className="mt-3 text-xs text-text-muted">Estimated stop exposure: <span className="font-mono text-text-primary">${risk.toFixed(2)}</span></div>}
            {message && <div className="mt-3 rounded-xl border border-border p-3 text-xs text-text-secondary">{message}</div>}
          </section>

          <section className="rounded-2xl border border-border bg-surface/80 p-5">
            <div className="flex items-center justify-between"><h2 className="font-medium">Open positions</h2><Link href="/dashboard/trades" className="text-xs text-cyan">Manage all</Link></div>
            {trades.length === 0 ? <p className="mt-5 text-sm text-text-muted">No open positions.</p> : <div className="mt-4 space-y-2">
              {trades.map((trade) => {
                const executable = quote ? (trade.side === "BUY" ? quote.bid : quote.ask) : null;
                const floating = executable == null ? 0 : (trade.side === "BUY" ? executable - trade.entryPrice : trade.entryPrice - executable) * trade.quantity;
                return <div key={trade.id} className="rounded-xl border border-border bg-background/50 p-3">
                  <div className="flex items-center justify-between"><b>{trade.symbol}</b><span className={trade.side === "BUY" ? "text-cyan" : "text-crimson"}>{trade.side}</span></div>
                  <div className="mt-1 flex justify-between text-xs text-text-muted"><span>{trade.quantity} @ {priceText(trade.symbol, trade.entryPrice)}</span><span className={floating >= 0 ? "text-cyan" : "text-crimson"}>{floating >= 0 ? "+" : ""}{floating.toFixed(2)}</span></div>
                  <button onClick={() => executable != null && void closeTrade(trade, executable, "Manual close")} disabled={executable == null} className="mt-2 w-full rounded-lg border border-border px-2 py-1.5 text-xs text-text-secondary hover:bg-surface disabled:opacity-40">Close position</button>
                </div>;
              })}
            </div>}
          </section>
        </aside>
      </div>
    </div>
  );
}
