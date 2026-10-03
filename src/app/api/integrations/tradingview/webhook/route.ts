import { NextRequest, NextResponse } from "next/server";
import { TradeSide } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { placePaperOrder, closePaperOrder } from "@/lib/broker/paper-broker";
import { runRiskCheck, markAccountEquity } from "@/lib/risk-engine";

/**
 * TradingView webhook / paper-broker bridge.
 *
 * Configure a TradingView alert to POST JSON such as:
 * { "accountId":"...", "action":"buy", "symbol":"EURUSD", "quantity":1, "price":1.08 }
 *
 * Set TRADINGVIEW_WEBHOOK_SECRET and send it as `secret` in the alert payload.
 * This endpoint only touches the selected paper trading account.
 */
export async function POST(req: NextRequest) {
  const expectedSecret = process.env.TRADINGVIEW_WEBHOOK_SECRET;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;

  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  if (expectedSecret && body.secret !== expectedSecret) {
    return NextResponse.json({ error: "Invalid webhook secret" }, { status: 401 });
  }

  const accountId = typeof body.accountId === "string" ? body.accountId : "";
  const symbol = typeof body.symbol === "string" ? body.symbol.trim().toUpperCase() : "";
  const action = typeof body.action === "string" ? body.action.toLowerCase() : "";
  const price = Number(body.price);
  const quantity = Number(body.quantity ?? 1);

  if (!accountId || !symbol || !Number.isFinite(price) || price <= 0) {
    return NextResponse.json({ error: "accountId, symbol and positive price are required" }, { status: 400 });
  }

  const account = await prisma.tradingAccount.findUnique({ where: { id: accountId }, select: { id: true, status: true } });
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  if (account.status !== "ACTIVE") return NextResponse.json({ error: `Account is ${account.status}` }, { status: 403 });

  if (["buy", "long", "sell", "short"].includes(action)) {
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ error: "quantity must be positive" }, { status: 400 });
    }

    const side = action === "buy" || action === "long" ? TradeSide.BUY : TradeSide.SELL;
    const trade = await placePaperOrder({
      accountId,
      symbol,
      side,
      quantity,
      price,
      stopLoss: body.stopLoss == null ? undefined : Number(body.stopLoss),
      takeProfit: body.takeProfit == null ? undefined : Number(body.takeProfit),
      notes: "TradingView webhook",
    });

    // Immediately mark equity at the alert price so the risk engine can act.
    const risk = await markAccountEquity(accountId, { [symbol]: price }, trade.id);
    return NextResponse.json({ trade, risk }, { status: 201 });
  }

  if (["close", "exit"].includes(action)) {
    const tradeId = typeof body.tradeId === "string" ? body.tradeId : "";
    if (!tradeId) return NextResponse.json({ error: "tradeId is required to close a trade" }, { status: 400 });
    const trade = await closePaperOrder(tradeId, price);
    if (!trade) return NextResponse.json({ error: "Open trade not found" }, { status: 404 });
    const risk = await runRiskCheck(accountId, Number((await prisma.tradingAccount.findUniqueOrThrow({ where: { id: accountId }, select: { equity: true } })).equity), trade.id);
    return NextResponse.json({ trade, risk });
  }

  return NextResponse.json({ error: "action must be buy, sell, close or exit" }, { status: 400 });
}
