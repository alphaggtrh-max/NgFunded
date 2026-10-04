import { experimental_upgradeWebSocket, type WebSocketData } from "@vercel/functions";
import WebSocket from "ws";
import { cacheMarketBar, cacheMarketQuote } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { markAccountEquityFromQuotes } from "@/lib/risk-engine";

export const runtime = "nodejs";
export const maxDuration = 1800;

const SYMBOLS = new Set(["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD"]);
type ClientSocket = import("@vercel/functions").WebSocket;
type ClientMessage = { type?: string; symbol?: string };
type UpstreamEvent = { ev?: string; status?: string; message?: string; a?: number; b?: number; t?: number; o?: number; h?: number; l?: number; c?: number; v?: number; s?: number };
type Quote = { bid: number; ask: number; timestamp: number };
type Upstream = { symbol: string; socket: WebSocket | null; clients: Set<ClientSocket>; reconnectTimer?: ReturnType<typeof setTimeout>; reconnectDelay: number; closed: boolean };

const streams = new Map<string, Upstream>();
const latestQuotes = new Map<string, Quote>();

function normalizeSymbol(value: string | undefined) {
  const symbol = (value ?? "EURUSD").toUpperCase().replace(/[^A-Z]/g, "");
  return SYMBOLS.has(symbol) ? symbol : null;
}
function pair(symbol: string) { return `${symbol.slice(0, 3)}/${symbol.slice(3)}`; }
function send(ws: ClientSocket, payload: unknown) { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload)); }
function broadcast(stream: Upstream, payload: unknown) { for (const client of stream.clients) send(client, payload); }

async function markAllActiveAccounts(symbol: string, quote: Quote) {
  const accounts = await prisma.tradingAccount.findMany({
    where: { status: "ACTIVE", trades: { some: { status: "OPEN", symbol } } },
    select: { id: true },
  });
  const quotes = { [symbol]: { symbol, ...quote, last: (quote.bid + quote.ask) / 2 } };
  await Promise.all(accounts.map(account => markAccountEquityFromQuotes(account.id, quotes)));
}

async function enforceProtectiveOrders(symbol: string, quote: Quote) {
  const trades = await prisma.trade.findMany({
    where: { status: "OPEN", symbol },
    select: { id: true, accountId: true, side: true, quantity: true, entryPrice: true, stopLoss: true, takeProfit: true },
  });

  for (const trade of trades) {
    const isBuy = trade.side === "BUY";
    const closePrice = isBuy ? quote.bid : quote.ask;
    const stopHit = trade.stopLoss != null && (isBuy ? closePrice <= Number(trade.stopLoss) : closePrice >= Number(trade.stopLoss));
    const targetHit = trade.takeProfit != null && (isBuy ? closePrice >= Number(trade.takeProfit) : closePrice <= Number(trade.takeProfit));
    if (!stopHit && !targetHit) continue;

    const quantity = Number(trade.quantity);
    const entry = Number(trade.entryPrice);
    const pnl = isBuy ? (closePrice - entry) * quantity : (entry - closePrice) * quantity;

    const closed = await prisma.$transaction(async tx => {
      const current = await tx.trade.findFirst({ where: { id: trade.id, status: "OPEN" }, select: { id: true } });
      if (!current) return false;
      await tx.trade.update({
        where: { id: trade.id },
        data: { status: "CLOSED", exitPrice: closePrice, pnl, pnlPercent: 0, closedAt: new Date() },
      });
      await tx.tradingAccount.update({
        where: { id: trade.accountId },
        data: { currentBalance: { increment: pnl }, equity: { increment: pnl } },
      });
      return true;
    });

    if (closed) broadcast(streams.get(symbol)!, { type: "trade_closed", tradeId: trade.id, reason: stopHit ? "stop_loss" : "take_profit", exitPrice: closePrice, pnl });
  }
}

function connectUpstream(stream: Upstream) {
  if (stream.closed || stream.socket) return;
  const key = process.env.MASSIVE_API_KEY;
  if (!key) { broadcast(stream, { type: "error", message: "MASSIVE_API_KEY is not configured" }); return; }

  const socket = new WebSocket("wss://socket.massive.com/forex");
  stream.socket = socket;
  socket.on("open", () => {
    stream.reconnectDelay = 1000;
    socket.send(JSON.stringify({ action: "auth", params: key }));
  });
  socket.on("message", raw => {
    try {
      const events = JSON.parse(raw.toString()) as UpstreamEvent[];
      for (const event of events) {
        if (event.ev === "status") {
          if (event.status === "auth_success") socket.send(JSON.stringify({ action: "subscribe", params: `C.${pair(stream.symbol)},CA.${pair(stream.symbol)}` }));
          if (["error", "auth_failed", "max_connections"].includes(event.status ?? "")) broadcast(stream, { type: "error", symbol: stream.symbol, message: event.message ?? event.status });
          continue;
        }
        if (event.ev === "C" && event.b != null && event.a != null) {
          const quote = { bid: event.b, ask: event.a, timestamp: event.t ?? Date.now() };
          latestQuotes.set(stream.symbol, quote);
          broadcast(stream, { type: "quote", symbol: stream.symbol, ...quote });
          void cacheMarketQuote(stream.symbol, quote);
          void enforceProtectiveOrders(stream.symbol, quote).catch(error => console.error("[protective-orders]", error));
          void markAllActiveAccounts(stream.symbol, quote).catch(error => console.error("[risk]", error));
        }
        if (event.ev === "CA" && event.o != null && event.h != null && event.l != null && event.c != null && event.s != null) {
          const bar = { time: Math.floor(event.s / 1000), open: event.o, high: event.h, low: event.l, close: event.c, volume: event.v ?? 0 };
          broadcast(stream, { type: "bar", symbol: stream.symbol, bar });
          void cacheMarketBar(stream.symbol, bar);
        }
      }
    } catch (error) { console.error("[market/ws] upstream parse error", error); }
  });
  socket.on("error", error => { console.error("[market/ws] upstream error", error); broadcast(stream, { type: "reconnecting", symbol: stream.symbol }); });
  socket.on("close", () => {
    if (stream.socket === socket) stream.socket = null;
    if (stream.closed || stream.clients.size === 0) { streams.delete(stream.symbol); return; }
    broadcast(stream, { type: "reconnecting", symbol: stream.symbol });
    stream.reconnectTimer = setTimeout(() => { stream.reconnectTimer = undefined; connectUpstream(stream); }, stream.reconnectDelay);
    stream.reconnectDelay = Math.min(stream.reconnectDelay * 2, 30000);
  });
}

function getStream(symbol: string) {
  const existing = streams.get(symbol);
  if (existing) return existing;
  const stream: Upstream = { symbol, socket: null, clients: new Set(), reconnectDelay: 1000, closed: false };
  streams.set(symbol, stream);
  connectUpstream(stream);
  return stream;
}
function detach(stream: Upstream, client: ClientSocket) {
  stream.clients.delete(client);
  if (stream.clients.size > 0) return;
  stream.closed = true;
  if (stream.reconnectTimer) clearTimeout(stream.reconnectTimer);
  try { stream.socket?.close(); } catch {}
  stream.socket = null;
  streams.delete(stream.symbol);
}

export function GET(request: Request) {
  return experimental_upgradeWebSocket(client => {
    let symbol = normalizeSymbol(new URL(request.url).searchParams.get("symbol") ?? undefined) ?? "EURUSD";
    let stream = getStream(symbol);
    stream.clients.add(client);
    const cached = latestQuotes.get(symbol);
    send(client, { type: "connected", symbol, ...(cached ? { quote: cached } : {}) });

    client.on("message", (raw: WebSocketData) => {
      try {
        const message = JSON.parse(raw.toString()) as ClientMessage;
        if (message.type !== "subscribe") return;
        const nextSymbol = normalizeSymbol(message.symbol);
        if (!nextSymbol || nextSymbol === symbol) return;
        detach(stream, client);
        symbol = nextSymbol;
        stream = getStream(symbol);
        stream.clients.add(client);
        const nextCached = latestQuotes.get(symbol);
        send(client, { type: "connected", symbol, ...(nextCached ? { quote: nextCached } : {}) });
      } catch { send(client, { type: "error", message: "Invalid websocket message" }); }
    });
    client.on("close", () => detach(stream, client));
  });
}
