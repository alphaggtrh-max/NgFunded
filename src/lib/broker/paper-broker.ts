import { prisma } from "@/lib/prisma";
import { TradeSide, TradeStatus } from "@prisma/client";

export type PaperOrder = {
  accountId: string;
  symbol: string;
  side: TradeSide;
  quantity: number;
  price: number;
  stopLoss?: number;
  takeProfit?: number;
  notes?: string;
};

/**
 * Local paper-broker adapter. This is deliberately separate from the risk
 * engine so a real broker adapter can replace it later without changing the
 * prop-firm rules.
 */
export async function placePaperOrder(order: PaperOrder) {
  const trade = await prisma.trade.create({
    data: {
      accountId: order.accountId,
      symbol: order.symbol.trim().toUpperCase(),
      side: order.side,
      status: TradeStatus.OPEN,
      quantity: order.quantity,
      entryPrice: order.price,
      stopLoss: order.stopLoss,
      takeProfit: order.takeProfit,
      notes: order.notes,
    },
  });

  return trade;
}

export async function closePaperOrder(tradeId: string, exitPrice: number) {
  const trade = await prisma.trade.findFirst({
    where: { id: tradeId, status: TradeStatus.OPEN },
    select: { id: true, accountId: true, side: true, quantity: true, entryPrice: true },
  });

  if (!trade) return null;

  const quantity = Number(trade.quantity);
  const entry = Number(trade.entryPrice);
  const pnl = trade.side === TradeSide.BUY
    ? (exitPrice - entry) * quantity
    : (entry - exitPrice) * quantity;

  return prisma.$transaction(async (tx) => {
    const current = await tx.trade.findFirst({
      where: { id: tradeId, status: TradeStatus.OPEN },
      select: { id: true },
    });
    if (!current) return null;

    const account = await tx.tradingAccount.findUnique({
      where: { id: trade.accountId },
      select: { currentBalance: true },
    });
    if (!account) return null;

    const balance = Number(account.currentBalance);
    const updated = await tx.trade.update({
      where: { id: tradeId },
      data: {
        status: TradeStatus.CLOSED,
        exitPrice,
        pnl,
        pnlPercent: balance === 0 ? 0 : (pnl / balance) * 100,
        closedAt: new Date(),
      },
    });

    await tx.tradingAccount.update({
      where: { id: trade.accountId },
      data: {
        currentBalance: { increment: pnl },
        equity: { increment: pnl },
      },
    });

    return updated;
  });
}
