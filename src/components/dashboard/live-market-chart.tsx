"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickData,
  ColorType,
  createChart,
  IChartApi,
  ISeriesApi,
} from "lightweight-charts";

const SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD"];
const INTERVALS = ["1m", "5m", "15m", "1h"] as const;
type Interval = typeof INTERVALS[number];

type MarketResponse = {
  data?: {
    provider: string;
    symbol: string;
    interval: Interval;
    marketStatus: string;
    quote: { bid: number | null; ask: number | null; timestamp: number | null };
    bars: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>;
    serverTime: number;
  };
  error?: { message?: string };
};

type StreamMessage =
  | { type: "connected"; symbol: string }
  | { type: "quote"; symbol: string; bid: number; ask: number; timestamp: number }
  | { type: "bar"; symbol: string; bar: { time: number; open: number; high: number; low: number; close: number; volume: number } }
  | { type: "reconnecting"; symbol: string }
  | { type: "error"; symbol?: string; message: string };

function formatPrice(symbol: string, value: number | null) {
  if (value == null) return "—";
  return value.toFixed(symbol.endsWith("JPY") ? 3 : 5);
}

function intervalSeconds(interval: Interval) {
  if (interval === "5m") return 5 * 60;
  if (interval === "15m") return 15 * 60;
  if (interval === "1h") return 60 * 60;
  return 60;
}

function mergeStreamBar(
  bar: { time: number; open: number; high: number; low: number; close: number },
  interval: Interval,
): CandlestickData {
  const seconds = intervalSeconds(interval);
  const bucket = Math.floor(bar.time / seconds) * seconds;
  return { time: bucket as CandlestickData["time"], open: bar.open, high: bar.high, low: bar.low, close: bar.close };
}

export function LiveMarketChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectDelayRef = useRef(1000);
  const [symbol, setSymbol] = useState("EURUSD");
  const [interval, setIntervalValue] = useState<Interval>("1m");
  const [market, setMarket] = useState<MarketResponse["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [streamConnected, setStreamConnected] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#9B8FA8" },
      grid: { vertLines: { color: "#2A2430" }, horzLines: { color: "#2A2430" } },
      rightPriceScale: { borderColor: "#2A2430" },
      timeScale: { borderColor: "#2A2430", timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
      height: 460,
    });
    const series = chart.addCandlestickSeries({
      upColor: "#00F5D4",
      downColor: "#E63946",
      borderVisible: false,
      wickUpColor: "#00F5D4",
      wickDownColor: "#E63946",
    });
    chartRef.current = chart;
    seriesRef.current = series;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/market/forex?symbol=${symbol}&interval=${interval}`, { cache: "no-store" });
        const json = await response.json() as MarketResponse;
        if (!response.ok || !json.data) throw new Error(json.error?.message ?? "Live market data unavailable");
        if (cancelled) return;
        setMarket(json.data);
        const bars: CandlestickData[] = json.data.bars.map((bar) => ({
          time: bar.time as CandlestickData["time"],
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
        }));
        seriesRef.current?.setData(bars);
        chartRef.current?.timeScale().fitContent();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Live market data unavailable");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [symbol, interval]);

  useEffect(() => {
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${protocol}//${window.location.host}/api/market/ws?symbol=${symbol}`);
      socketRef.current = socket;
      setStreamConnected(false);

      socket.onopen = () => {
        reconnectDelayRef.current = 1000;
        setStreamConnected(true);
        setError("");
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as StreamMessage;
          if (message.type === "connected") {
            setStreamConnected(true);
            return;
          }
          if (message.type === "reconnecting") {
            setStreamConnected(false);
            return;
          }
          if (message.type === "error") {
            setStreamConnected(false);
            setError(message.message);
            return;
          }
          if (message.type === "quote") {
            setMarket((current) => current ? {
              ...current,
              quote: { bid: message.bid, ask: message.ask, timestamp: message.timestamp },
              serverTime: Date.now(),
            } : current);
            return;
          }
          if (message.type === "bar") {
            const incoming = mergeStreamBar(message.bar, interval);
            seriesRef.current?.update(incoming);
          }
        } catch {
          setError("Received an invalid market stream message");
        }
      };

      socket.onerror = () => {
        setStreamConnected(false);
      };

      socket.onclose = () => {
        socketRef.current = null;
        setStreamConnected(false);
        if (cancelled) return;
        const delay = reconnectDelayRef.current;
        reconnectDelayRef.current = Math.min(delay * 2, 30000);
        reconnectTimerRef.current = window.setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimerRef.current != null) window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [symbol, interval]);

  return (
    <section className="rounded-2xl border border-border bg-surface/80 p-5 shadow-glass">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${streamConnected ? "bg-cyan animate-pulse" : "bg-crimson"}`} />
            <h2 className="font-medium">Live market</h2>
            <span className="rounded-full border border-cyan/20 bg-cyan/5 px-2 py-0.5 text-[10px] font-mono text-cyan">{market?.provider ?? "Massive"}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-mono ${streamConnected ? "bg-cyan/10 text-cyan" : "bg-crimson/10 text-crimson"}`}>
              {streamConnected ? "STREAMING" : "RECONNECTING"}
            </span>
          </div>
          <p className="mt-1 text-xs text-text-muted">Continuous live quotes and server-side OHLC stream</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono text-text-primary outline-none focus:border-crimson">
            {SYMBOLS.map((item) => <option key={item}>{item}</option>)}
          </select>
          <div className="flex rounded-lg border border-border bg-background p-1">
            {INTERVALS.map((item) => <button key={item} onClick={() => setIntervalValue(item)} className={`rounded px-2.5 py-1 text-[10px] font-mono ${interval === item ? "bg-cyan/10 text-cyan" : "text-text-muted hover:text-text-primary"}`}>{item}</button>)}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-background/50 p-3"><span className="text-[10px] uppercase tracking-widest text-text-muted">Bid</span><div className="mt-1 font-mono text-sm text-crimson">{formatPrice(symbol, market?.quote.bid ?? null)}</div></div>
        <div className="rounded-xl border border-border bg-background/50 p-3"><span className="text-[10px] uppercase tracking-widest text-text-muted">Ask</span><div className="mt-1 font-mono text-sm text-cyan">{formatPrice(symbol, market?.quote.ask ?? null)}</div></div>
        <div className="rounded-xl border border-border bg-background/50 p-3"><span className="text-[10px] uppercase tracking-widest text-text-muted">Spread</span><div className="mt-1 font-mono text-sm text-text-primary">{market?.quote.bid != null && market.quote.ask != null ? (market.quote.ask - market.quote.bid).toFixed(symbol.endsWith("JPY") ? 3 : 5) : "—"}</div></div>
        <div className="rounded-xl border border-border bg-background/50 p-3"><span className="text-[10px] uppercase tracking-widest text-text-muted">Status</span><div className="mt-1 font-mono text-sm text-text-primary">{streamConnected ? "live" : "reconnecting"}</div></div>
      </div>

      <div className="relative mt-4 overflow-hidden rounded-xl border border-border/60 bg-background/50">
        {loading && <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/40 text-xs font-mono text-text-muted">Loading market history…</div>}
        {error && <div className="absolute left-3 right-3 top-3 z-10 rounded-lg border border-crimson/30 bg-crimson/10 p-3 text-xs text-crimson">{error}</div>}
        <div ref={containerRef} className="h-[460px] w-full" />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-text-muted">
        <span>Historical bars load once; live quotes and minute bars arrive continuously over WebSocket.</span>
        <span>{streamConnected ? "Live stream connected" : "Attempting to reconnect"}</span>
      </div>
    </section>
  );
}
