/**
 * NGFunded Mock Exchange WebSocket Server
 *
 * Simulates:
 * - Live price ticks for configured symbols
 * - Position P&L updates streamed to connected clients
 * - Risk check triggers on every equity update
 *
 * Run: npx ts-node --esm src/server/mock-exchange.ts
 * Or:  node --experimental-specifier-resolution=node dist/server/mock-exchange.js
 */

import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { runRiskCheck } from "@/lib/risk-engine";
import { redis, CacheKeys } from "@/lib/redis";
import type { WsMessage, TickPayload, EquityUpdatePayload } from "@/types";

const PORT = parseInt(process.env.RISK_ENGINE_PORT ?? "3001", 10);

// ─── Symbols ──────────────────────────────────────────────────────────────────

interface SymbolState {
  bid: number;
  ask: number;
  spread: number;
  volatility: number; // daily vol approximation
}

const symbols: Record<string, SymbolState> = {
  "$PURR": { bid: 1.2450, ask: 1.2455, spread: 0.0005, volatility: 0.02 },
  "XAUUSD": { bid: 2350.50, ask: 2350.80, spread: 0.30, volatility: 0.008 },
  "EURUSD": { bid: 1.0952, ask: 1.0954, spread: 0.0002, volatility: 0.005 },
  "BTCUSDT": { bid: 68420.0, ask: 68425.0, spread: 5.0, volatility: 0.03 },
};

// ─── Client Registry ──────────────────────────────────────────────────────────

type ClientMap = Map<string, Set<WebSocket>>; // accountId -> clients
const clientsByAccount: ClientMap = new Map();

function registerClient(accountId: string, ws: WebSocket): void {
  if (!clientsByAccount.has(accountId)) {
    clientsByAccount.set(accountId, new Set());
  }
  clientsByAccount.get(accountId)!.add(ws);
}

function deregisterClient(accountId: string, ws: WebSocket): void {
  clientsByAccount.get(accountId)?.delete(ws);
}

function broadcast(accountId: string, msg: WsMessage): void {
  const clients = clientsByAccount.get(accountId);
  if (!clients) return;
  const data = JSON.stringify(msg);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

// ─── Tick Generator ───────────────────────────────────────────────────────────

function nextPrice(state: SymbolState): SymbolState {
  const change = (Math.random() - 0.5) * state.bid * state.volatility * 0.01;
  const newBid = parseFloat((state.bid + change).toFixed(5));
  const newAsk = parseFloat((newBid + state.spread).toFixed(5));
  return { ...state, bid: newBid, ask: newAsk };
}

// ─── Equity Calculator (simplified) ──────────────────────────────────────────

async function updateEquityForAccount(
  accountId: string,
  currentEquity: number
): Promise<void> {
  // Tiny random equity drift for simulation
  const drift = (Math.random() - 0.49) * 5;
  const newEquity = parseFloat((currentEquity + drift).toFixed(2));

  // Run risk check (sub-50ms target)
  const result = await runRiskCheck(accountId, newEquity);

  // Build equity update payload
  const cached = await redis.get(CacheKeys.sodEquity(accountId));
  const sodEquity = cached ? parseFloat(cached) : newEquity;

  const payload: EquityUpdatePayload = {
    equity: newEquity,
    balance: newEquity, // simplified
    openPnl: drift,
    dailyPnl: newEquity - sodEquity,
    drawdownUsedPct: 0, // placeholder
    dailyDrawdownUsedPct: 0, // placeholder
  };

  const msgType = result.breached ? "ACCOUNT_BREACHED" : "EQUITY_UPDATE";

  broadcast(accountId, {
    type: msgType,
    accountId,
    payload: result.breached ? result : payload,
    timestamp: Date.now(),
  });
}

// ─── WebSocket Server ─────────────────────────────────────────────────────────

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
  const url = new URL(req.url ?? "", `ws://localhost:${PORT}`);
  const accountId = url.searchParams.get("accountId");

  if (!accountId) {
    ws.close(1008, "Missing accountId");
    return;
  }

  console.log(`[WS] Client connected → accountId=${accountId}`);
  registerClient(accountId, ws);

  ws.on("message", (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString()) as WsMessage;
      if (msg.type === "PONG") return; // heartbeat ack
    } catch {
      // ignore malformed messages
    }
  });

  ws.on("close", () => {
    deregisterClient(accountId, ws);
    console.log(`[WS] Client disconnected → accountId=${accountId}`);
  });

  // Send initial ping
  ws.send(JSON.stringify({ type: "PING", payload: {}, timestamp: Date.now() }));
});

console.log(`🚀 NGFunded Mock Exchange WS running on ws://localhost:${PORT}`);

// ─── Tick Loop ────────────────────────────────────────────────────────────────

// Broadcast ticks every 500ms
setInterval(() => {
  for (const [sym, state] of Object.entries(symbols)) {
    symbols[sym] = nextPrice(state);
    const tick: TickPayload = {
      symbol: sym,
      bid: symbols[sym].bid,
      ask: symbols[sym].ask,
      last: symbols[sym].bid,
      timestamp: Date.now(),
    };

    // Broadcast tick to all connected clients
    for (const [accountId] of clientsByAccount) {
      broadcast(accountId, {
        type: "TICK",
        payload: tick,
        timestamp: Date.now(),
      });
    }
  }
}, 500);

// Update equity every second (simulating open position mark-to-market)
const equityTracking = new Map<string, number>(); // accountId -> equity

setInterval(async () => {
  for (const [accountId] of clientsByAccount) {
    const current = equityTracking.get(accountId) ?? 10000;
    await updateEquityForAccount(accountId, current);
    // Store updated estimate
    equityTracking.set(
      accountId,
      current + (Math.random() - 0.49) * 5
    );
  }
}, 1000);
