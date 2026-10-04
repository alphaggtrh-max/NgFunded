/**
 * NGFunded market-data WebSocket fanout.
 *
 * MT5 is the price source; this process never places live orders.
 * The Python MT5 bridge publishes quotes to Redis and this service fans them
 * out to paper-trading clients while marking open paper positions to market.
 *
 * Run: npx ts-node --esm src/server/mock-exchange.ts
 */

import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { redis, CacheKeys, CACHE_TTL } from "@/lib/redis";
import { markAccountEquityFromQuotes, getEquityFromCache } from "@/lib/risk-engine";
import type { MarketQuote } from "@/lib/risk-engine";
import type { WsMessage, TickPayload, EquityUpdatePayload } from "@/types";

const PORT = parseInt(process.env.RISK_ENGINE_PORT ?? "3001", 10);
const subscriber = redis.duplicate();
const latestQuotes: Record<string, MarketQuote> = {};

type ClientMap = Map<string, Set<WebSocket>>;
const clientsByAccount: ClientMap = new Map();

function registerClient(accountId: string, ws: WebSocket): void {
  if (!clientsByAccount.has(accountId)) clientsByAccount.set(accountId, new Set());
  clientsByAccount.get(accountId)!.add(ws);
}

function deregisterClient(accountId: string, ws: WebSocket): void {
  const clients = clientsByAccount.get(accountId);
  clients?.delete(ws);
  if (clients?.size === 0) clientsByAccount.delete(accountId);
}

function broadcast(accountId: string, msg: WsMessage): void {
  const clients = clientsByAccount.get(accountId);
  if (!clients) return;
  const data = JSON.stringify(msg);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  }
}

async function publishAccountMark(accountId: string): Promise<void> {
  const risk = await markAccountEquityFromQuotes(accountId, latestQuotes);
  const equity = await getEquityFromCache(accountId);
  if (equity === null) return;

  const openPnlRaw = await redis.get(CacheKeys.openPnl(accountId));
  const sodRaw = await redis.get(CacheKeys.sodEquity(accountId));
  const openPnl = Number(openPnlRaw ?? 0);
  const sod = Number(sodRaw ?? equity);

  const payload: EquityUpdatePayload = {
    equity,
    balance: equity - openPnl,
    openPnl,
    dailyPnl: equity - sod,
    drawdownUsedPct: 0,
    dailyDrawdownUsedPct: 0,
  };

  broadcast(accountId, {
    type: risk.breached ? "ACCOUNT_BREACHED" : "EQUITY_UPDATE",
    accountId,
    payload: risk.breached ? risk : payload,
    timestamp: Date.now(),
  });
}

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
  const url = new URL(req.url ?? "", `ws://localhost:${PORT}`);
  const accountId = url.searchParams.get("accountId");

  if (!accountId) {
    ws.close(1008, "Missing accountId");
    return;
  }

  registerClient(accountId, ws);
  console.log(`[WS] Paper client connected → ${accountId}`);

  for (const quote of Object.values(latestQuotes)) {
    const tick: TickPayload = {
      symbol: quote.symbol,
      bid: quote.bid,
      ask: quote.ask,
      last: quote.last,
      timestamp: quote.timestamp,
    };
    ws.send(JSON.stringify({ type: "TICK", payload: tick, timestamp: Date.now() }));
  }

  ws.send(JSON.stringify({ type: "PING", payload: {}, timestamp: Date.now() }));

  ws.on("message", (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString()) as WsMessage;
      if (msg.type === "PONG") return;
    } catch {
      // Ignore malformed client messages.
    }
  });

  ws.on("close", () => {
    deregisterClient(accountId, ws);
    console.log(`[WS] Paper client disconnected → ${accountId}`);
  });
});

async function start() {
  await subscriber.subscribe(CacheKeys.marketTickChannel());
  subscriber.on("message", async (channel, raw) => {
    if (channel !== CacheKeys.marketTickChannel()) return;

    try {
      const quote = JSON.parse(raw) as MarketQuote;
      if (!quote.symbol || !Number.isFinite(quote.bid) || !Number.isFinite(quote.ask)) return;

      const symbol = quote.symbol.toUpperCase();
      latestQuotes[symbol] = { ...quote, symbol };

      await redis.setex(CacheKeys.marketTick(symbol), CACHE_TTL.MARKET_TICK, JSON.stringify(latestQuotes[symbol]));

      const tick: TickPayload = {
        symbol,
        bid: quote.bid,
        ask: quote.ask,
        last: quote.last,
        timestamp: quote.timestamp,
      };

      for (const accountId of clientsByAccount.keys()) {
        broadcast(accountId, { type: "TICK", payload: tick, timestamp: Date.now() });
        await publishAccountMark(accountId);
      }
    } catch (error) {
      console.error("[MT5] Invalid Redis market-data message", error);
    }
  });

  console.log(`🚀 NGFunded MT5 market-data WS running on ws://localhost:${PORT}`);
}

void start().catch((error) => {
  console.error("[MT5] Market-data fanout failed to start", error);
  process.exit(1);
});
