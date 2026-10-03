/**
 * NGFunded Performance Analytics Engine
 *
 * Calculates all performance metrics from closed trade data.
 * Runs server-side; results are cached and served via REST API.
 */

import type { PerformanceMetrics, TradePayload, EquityDataPoint } from "@/types";
import { calcProfitFactor } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { TradeStatus } from "@prisma/client";

// ─── Metrics Calculator ───────────────────────────────────────────────────────

export function calculateMetrics(trades: TradePayload[]): PerformanceMetrics {
  const closed = trades.filter(
    (t) => t.status === TradeStatus.CLOSED && t.pnl !== undefined
  );

  const winners = closed.filter((t) => (t.pnl ?? 0) > 0);
  const losers = closed.filter((t) => (t.pnl ?? 0) <= 0);

  const grossProfit = winners.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  const grossLoss = losers.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  const netPnl = grossProfit + grossLoss;

  const winRate = closed.length > 0 ? (winners.length / closed.length) * 100 : 0;
  const profitFactor = calcProfitFactor(grossProfit, grossLoss);

  // Average R:R from trades that have it set
  const tradesWithRR = closed.filter(
    (t) => t.riskRewardRatio !== undefined
  ) as (TradePayload & { riskRewardRatio: number })[];
  const avgRiskReward =
    tradesWithRR.length > 0
      ? tradesWithRR.reduce((sum, t) => sum + t.riskRewardRatio, 0) /
        tradesWithRR.length
      : 0;

  // Average hold time in minutes
  const avgHoldTimeMinutes =
    closed.length > 0
      ? closed.reduce((sum, t) => {
          const end = t.closedAt ?? new Date();
          const diffMin =
            (new Date(end).getTime() - new Date(t.openedAt).getTime()) / 60_000;
          return sum + diffMin;
        }, 0) / closed.length
      : 0;

  // Max drawdown from equity curve
  const maxDrawdown = calcMaxDrawdown(closed);

  return {
    totalTrades: closed.length,
    winningTrades: winners.length,
    losingTrades: losers.length,
    winRate,
    profitFactor,
    avgRiskReward,
    avgHoldTimeMinutes,
    grossProfit,
    grossLoss,
    netPnl,
    maxDrawdown,
  };
}

// ─── Max Drawdown ─────────────────────────────────────────────────────────────

function calcMaxDrawdown(sortedTrades: TradePayload[]): number {
  let peak = 0;
  let running = 0;
  let maxDD = 0;

  for (const trade of sortedTrades) {
    running += trade.pnl ?? 0;
    if (running > peak) peak = running;
    const dd = peak - running;
    if (dd > maxDD) maxDD = dd;
  }

  return maxDD;
}

// ─── Equity Curve Builder ─────────────────────────────────────────────────────

export function buildEquityCurve(
  initialBalance: number,
  trades: TradePayload[]
): EquityDataPoint[] {
  const sorted = [...trades]
    .filter((t) => t.status === TradeStatus.CLOSED && t.closedAt)
    .sort(
      (a, b) =>
        new Date(a.closedAt!).getTime() - new Date(b.closedAt!).getTime()
    );

  const points: EquityDataPoint[] = [
    {
      time: Math.floor(Date.now() / 1000) - sorted.length * 3600,
      value: initialBalance,
    },
  ];

  let running = initialBalance;
  for (const trade of sorted) {
    running += trade.pnl ?? 0;
    points.push({
      time: Math.floor(new Date(trade.closedAt!).getTime() / 1000),
      value: parseFloat(running.toFixed(2)),
    });
  }

  return points;
}

// ─── DB Query Helpers ─────────────────────────────────────────────────────────

export async function getAccountMetrics(
  accountId: string,
  filters?: {
    symbol?: string;
    tags?: string[];
    fromDate?: Date;
    toDate?: Date;
  }
): Promise<PerformanceMetrics> {
  const where: Parameters<typeof prisma.trade.findMany>[0]["where"] = {
    accountId,
    status: TradeStatus.CLOSED,
    ...(filters?.symbol ? { symbol: filters.symbol } : {}),
    ...(filters?.fromDate || filters?.toDate
      ? {
          closedAt: {
            ...(filters.fromDate ? { gte: filters.fromDate } : {}),
            ...(filters.toDate ? { lte: filters.toDate } : {}),
          },
        }
      : {}),
    ...(filters?.tags?.length
      ? { tags: { hasSome: filters.tags } }
      : {}),
  };

  const rawTrades = await prisma.trade.findMany({
    where,
    select: {
      id: true,
      accountId: true,
      symbol: true,
      side: true,
      status: true,
      quantity: true,
      entryPrice: true,
      exitPrice: true,
      stopLoss: true,
      takeProfit: true,
      pnl: true,
      pnlPercent: true,
      riskRewardRatio: true,
      openedAt: true,
      closedAt: true,
      tags: true,
      notes: true,
    },
    orderBy: { closedAt: "asc" },
  });

  const trades: TradePayload[] = rawTrades.map((t) => ({
    ...t,
    quantity: parseFloat(t.quantity.toString()),
    entryPrice: parseFloat(t.entryPrice.toString()),
    exitPrice: t.exitPrice ? parseFloat(t.exitPrice.toString()) : undefined,
    stopLoss: t.stopLoss ? parseFloat(t.stopLoss.toString()) : undefined,
    takeProfit: t.takeProfit ? parseFloat(t.takeProfit.toString()) : undefined,
    pnl: t.pnl ? parseFloat(t.pnl.toString()) : undefined,
    pnlPercent: t.pnlPercent ? parseFloat(t.pnlPercent.toString()) : undefined,
    riskRewardRatio: t.riskRewardRatio
      ? parseFloat(t.riskRewardRatio.toString())
      : undefined,
    closedAt: t.closedAt ?? undefined,
  }));

  return calculateMetrics(trades);
}
