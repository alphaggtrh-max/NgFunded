/**
 * NGFunded real-time risk engine.
 * Open positions are marked to market from the MT5 paper-market data feed.
 */

import { prisma } from "@/lib/prisma";
import { redis, CacheKeys, CACHE_TTL } from "@/lib/redis";
import { AccountStatus, BreachType, TradeSide, TradeStatus } from "@prisma/client";
import type { RiskCheckInput, RiskCheckResult } from "@/types";

export interface MarketQuote {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  timestamp: number;
}

function getRedis() {
  if (!redis) {
    throw new Error("Redis is not configured. Set ngfunded_REDIS_URL or REDIS_URL.");
  }
  return redis;
}

export function evaluateRisk(input: RiskCheckInput): RiskCheckResult {
  if (input.currentStatus === AccountStatus.BREACHED) return { breached: false };

  const dailyDrawdown = input.startOfDayEquity - input.currentEquity;
  if (dailyDrawdown >= input.maxDailyLossLimit) {
    return {
      breached: true,
      breachType: BreachType.DAILY_LOSS_LIMIT,
      drawdownValue: dailyDrawdown,
      drawdownLimit: input.maxDailyLossLimit,
      message: `Daily loss limit breached: -$${dailyDrawdown.toFixed(2)} / limit $${input.maxDailyLossLimit.toFixed(2)}`,
    };
  }

  const totalDrawdown = input.initialBalance - input.currentEquity;
  if (totalDrawdown >= input.maxTotalDrawdownLimit) {
    return {
      breached: true,
      breachType: BreachType.MAX_TRAILING_DRAWDOWN,
      drawdownValue: totalDrawdown,
      drawdownLimit: input.maxTotalDrawdownLimit,
      message: `Max total drawdown breached: -$${totalDrawdown.toFixed(2)} / limit $${input.maxTotalDrawdownLimit.toFixed(2)}`,
    };
  }

  return { breached: false };
}

export async function getEquityFromCache(accountId: string): Promise<number | null> {
  const cached = await getRedis().get(CacheKeys.accountEquity(accountId));
  return cached === null ? null : Number(cached);
}

export async function setEquityInCache(accountId: string, equity: number): Promise<void> {
  await getRedis().setex(CacheKeys.accountEquity(accountId), CACHE_TTL.EQUITY, equity.toString());
}

export async function getSodEquity(accountId: string): Promise<number | null> {
  const cached = await getRedis().get(CacheKeys.sodEquity(accountId));
  return cached === null ? null : Number(cached);
}

export async function setSodEquity(accountId: string, equity: number): Promise<void> {
  await getRedis().setex(CacheKeys.sodEquity(accountId), CACHE_TTL.SOD_EQUITY, equity.toString());
}

function utcToday(): Date {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

async function ensureSodEquity(accountId: string, fallbackEquity: number): Promise<number> {
  const cached = await getSodEquity(accountId);
  if (cached !== null && Number.isFinite(cached)) return cached;

  const snapshot = await prisma.dailyEquitySnapshot.findUnique({
    where: { accountId_date: { accountId, date: utcToday() } },
    select: { openEquity: true },
  });

  const sod = snapshot ? Number(snapshot.openEquity) : fallbackEquity;
  await setSodEquity(accountId, sod);
  return sod;
}

export async function runRiskCheck(
  accountId: string,
  currentEquity: number,
  offendingTradeId?: string,
): Promise<RiskCheckResult> {
  if (!Number.isFinite(currentEquity)) return { breached: false };

  const account = await prisma.tradingAccount.findUnique({
    where: { id: accountId },
    select: {
      initialBalance: true,
      maxDailyLossLimit: true,
      maxTotalDrawdownLimit: true,
      currentBalance: true,
      status: true,
    },
  });
  if (!account) return { breached: false };

  const sodEquity = await ensureSodEquity(accountId, Number(account.currentBalance));
  const result = evaluateRisk({
    accountId,
    currentEquity,
    startOfDayEquity: sodEquity,
    initialBalance: Number(account.initialBalance),
    maxDailyLossLimit: Number(account.maxDailyLossLimit),
    maxTotalDrawdownLimit: Number(account.maxTotalDrawdownLimit),
    currentStatus: account.status,
  });

  if (!result.breached || !result.breachType) {
    await setEquityInCache(accountId, currentEquity);
    await prisma.tradingAccount.updateMany({
      where: { id: accountId, status: AccountStatus.ACTIVE },
      data: { equity: currentEquity },
    });
    await getRedis().publish(CacheKeys.equityChannel(accountId), JSON.stringify({
      type: "EQUITY_UPDATE",
      accountId,
      payload: { equity: currentEquity },
      timestamp: Date.now(),
    }));
    return result;
  }

  const transitioned = await prisma.$transaction(async (tx) => {
    const updated = await tx.tradingAccount.updateMany({
      where: { id: accountId, status: AccountStatus.ACTIVE },
      data: { status: AccountStatus.BREACHED, breachedAt: new Date(), equity: currentEquity },
    });
    if (updated.count !== 1) return false;

    await tx.breachLog.create({
      data: {
        accountId,
        tradeId: offendingTradeId ?? null,
        breachType: result.breachType!,
        equityAtBreach: currentEquity,
        balanceAtBreach: Number(account.currentBalance),
        drawdownValue: result.drawdownValue ?? 0,
        drawdownLimit: result.drawdownLimit ?? 0,
      },
    });
    return true;
  });

  if (!transitioned) return { breached: false };

  await getRedis().setex(CacheKeys.accountStatus(accountId), CACHE_TTL.STATUS, AccountStatus.BREACHED);
  await setEquityInCache(accountId, currentEquity);
  await getRedis().publish(CacheKeys.equityChannel(accountId), JSON.stringify({
    type: "ACCOUNT_BREACHED",
    accountId,
    payload: result,
    timestamp: Date.now(),
  }));

  return result;
}

export async function markAccountEquity(
  accountId: string,
  prices: Record<string, number>,
  offendingTradeId?: string,
): Promise<RiskCheckResult> {
  const account = await prisma.tradingAccount.findUnique({
    where: { id: accountId },
    select: { currentBalance: true, status: true },
  });
  if (!account) return { breached: false };

  const openTrades = await prisma.trade.findMany({
    where: { accountId, status: TradeStatus.OPEN },
    select: { id: true, symbol: true, side: true, quantity: true, entryPrice: true },
  });

  let equity = Number(account.currentBalance);
  for (const trade of openTrades) {
    const entry = Number(trade.entryPrice);
    const price = Number(prices[trade.symbol.toUpperCase()] ?? entry);
    const qty = Number(trade.quantity);
    equity += trade.side === TradeSide.BUY
      ? (price - entry) * qty
      : (entry - price) * qty;
  }

  return runRiskCheck(accountId, equity, offendingTradeId);
}

/** Mark an account using the correct executable side of an MT5 quote. */
export async function markAccountEquityFromQuotes(
  accountId: string,
  quotes: Record<string, MarketQuote>,
): Promise<RiskCheckResult> {
  const account = await prisma.tradingAccount.findUnique({
    where: { id: accountId },
    select: { currentBalance: true },
  });
  if (!account) return { breached: false };

  const openTrades = await prisma.trade.findMany({
    where: { accountId, status: TradeStatus.OPEN },
    select: { id: true, symbol: true, side: true, quantity: true, entryPrice: true },
  });

  let equity = Number(account.currentBalance);
  let openPnl = 0;

  for (const trade of openTrades) {
    const entry = Number(trade.entryPrice);
    const quote = quotes[trade.symbol.toUpperCase()];
    if (!quote) continue;

    // Longs close against bid; shorts close against ask.
    const mark = trade.side === TradeSide.BUY ? quote.bid : quote.ask;
    const pnl = trade.side === TradeSide.BUY
      ? (mark - entry) * Number(trade.quantity)
      : (entry - mark) * Number(trade.quantity);

    openPnl += pnl;
    equity += pnl;
  }

  await getRedis().setex(CacheKeys.openPnl(accountId), CACHE_TTL.EQUITY, openPnl.toString());
  return runRiskCheck(accountId, equity);
}

export async function resetDailySodEquity(): Promise<void> {
  const activeAccounts = await prisma.tradingAccount.findMany({
    where: { status: AccountStatus.ACTIVE },
    select: { id: true, equity: true },
  });
  const today = utcToday();

  await prisma.$transaction(activeAccounts.map((acc) =>
    prisma.dailyEquitySnapshot.upsert({
      where: { accountId_date: { accountId: acc.id, date: today } },
      create: { accountId: acc.id, date: today, openEquity: acc.equity },
      update: {},
    })
  ));

  await Promise.all(activeAccounts.map((acc) => setSodEquity(acc.id, Number(acc.equity))));
}
