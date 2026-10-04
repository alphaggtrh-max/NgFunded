import { NextResponse } from "next/server";

export const runtime = "nodejs";

const ALLOWED_SYMBOLS = new Set(["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD"]);
const INTERVALS = {
  "1m": { multiplier: 1, timespan: "minute", lookbackMs: 500 * 60_000 },
  "5m": { multiplier: 5, timespan: "minute", lookbackMs: 500 * 5 * 60_000 },
  "15m": { multiplier: 15, timespan: "minute", lookbackMs: 500 * 15 * 60_000 },
  "1h": { multiplier: 1, timespan: "hour", lookbackMs: 500 * 60 * 60_000 },
} as const;

type Interval = keyof typeof INTERVALS;

type MassiveSnapshot = {
  results?: Array<{
    ticker?: string;
    market_status?: string;
    last_quote?: { bid?: number; ask?: number; last_updated?: number; timeframe?: string };
    last_minute?: { open?: number; high?: number; low?: number; close?: number; last_updated?: number };
  }>;
};

type MassiveAggs = {
  results?: Array<{ o: number; h: number; l: number; c: number; t: number; v?: number }>;
};

function validateSymbol(value: string | null) {
  const symbol = (value ?? "EURUSD").toUpperCase().replace(/[^A-Z]/g, "");
  return ALLOWED_SYMBOLS.has(symbol) ? symbol : null;
}

function validateInterval(value: string | null): Interval {
  return value && value in INTERVALS ? (value as Interval) : "1m";
}

async function massive(path: string) {
  const key = process.env.MASSIVE_API_KEY;
  if (!key) throw new Error("MASSIVE_API_KEY is not configured");

  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(`https://api.massive.com${path}${separator}apiKey=${encodeURIComponent(key)}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Massive API ${response.status}: ${body.slice(0, 300)}`);
  }
  return response.json();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = validateSymbol(url.searchParams.get("symbol"));
  const interval = validateInterval(url.searchParams.get("interval"));

  if (!symbol) {
    return NextResponse.json({ error: { message: "Unsupported forex symbol", code: "INVALID_SYMBOL" } }, { status: 400 });
  }

  try {
    const now = Date.now();
    const spec = INTERVALS[interval];
    const from = now - spec.lookbackMs;
    const ticker = `C:${symbol}`;

    const [barsResponse, snapshotResponse] = await Promise.all([
      massive(`/v2/aggs/ticker/${ticker}/range/${spec.multiplier}/${spec.timespan}/${from}/${now}?adjusted=true&sort=asc&limit=500`),
      massive(`/v2/snapshot/locale/global/markets/forex/tickers/${ticker}`),
    ]) as [MassiveAggs, MassiveSnapshot];

    const snapshot = snapshotResponse.results?.[0];
    const quote = snapshot?.last_quote;
    const minute = snapshot?.last_minute;

    return NextResponse.json({
      data: {
        provider: "Massive",
        symbol,
        interval,
        marketStatus: snapshot?.market_status ?? "unknown",
        quote: {
          bid: quote?.bid ?? null,
          ask: quote?.ask ?? null,
          timestamp: quote?.last_updated ?? null,
          timeframe: quote?.timeframe ?? null,
        },
        lastBar: minute ? {
          open: minute.open ?? null,
          high: minute.high ?? null,
          low: minute.low ?? null,
          close: minute.close ?? null,
          timestamp: minute.last_updated ?? null,
        } : null,
        bars: (barsResponse.results ?? []).map((bar) => ({
          time: Math.floor(bar.t / 1000),
          open: bar.o,
          high: bar.h,
          low: bar.l,
          close: bar.c,
          volume: bar.v ?? 0,
        })),
        serverTime: Date.now(),
      },
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error("[market/forex]", error);
    return NextResponse.json({
      error: {
        message: error instanceof Error ? error.message : "Market data provider unavailable",
        code: "MARKET_DATA_UNAVAILABLE",
      },
    }, { status: 503 });
  }
}
