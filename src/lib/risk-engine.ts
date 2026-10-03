/**
 * NGFunded Real-Time Risk Engine
 *
 * Executes drawdown checks on every tick/equity update.
 * All monetary values are in account currency (USD by default).
 * Target: <50ms per check via Redis cache.
 */

import { prisma } from "@/lib/prisma";
import { redis, CacheKeys, CACHE_TTL } from "@/lib/redis";
import { AccountStatus, BreachType } from "@prisma/client";
import type { RiskCheckInput, RiskCheckResult } from "@/types";

// ─── Core Risk Check ──────────────────────────────────────────────────────────

/**
 * Pure function — no I/O.
 * Checks both daily and total drawdown rules.
 */
export function evaluateRisk(input: RiskCheckInput): RiskCheckResult {
  // Skip if already breached
  if (input.currentStatus === AccountStatus.BREACHED) {
    return { breached: false };
  }

  // ── Daily Loss Check ──────────────────────────────────────────────────────
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

  // ── Max Total Drawdown Check ──────────────────────────────────────────────
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

// ─── Redis-Backed Equity Fetch ────────────────────────────────────────────────

/**
 * Reads equity from Redis cache (fast path).
 * Falls back to DB on cache miss.
 */
export async function getEquityFromCache(
  accountId: string
): Promise<number | null> {
  const cached = await redis.get(CacheKeys.accountEquity(accountId));
  if (cached !== null) return parseFloat(cached);
  return null;
}

export async function setEquityInCache(
  accountId: string,
  equity: number
): Promise<void> {
  await redis.setex(
    CacheKeys.accountEquity(accountId),
    CACHE_TTL.EQUITY,
    equity.toString()
  );
}

export async function getSodEquity(accountId: string): Promise<number | null> {
  const cached = await redis.get(CacheKeys.sodEquity(accountId));
  if (cached !== null) return parseFloat(cached);
  return null;
}

export async function setSodEquity(
  accountId: string,
  equity: number
): Promise<void> {
  await redis.setex(
    CacheKeys.sodEquity(accountId),
    CACHE_TTL.SOD_EQUITY,
    equity.toString()
  );
}

// ─── Full Risk Check with DB Write ───────────────────────────────────────────

/**
 * Orchestrates:
 * 1. Read account config (cache > DB)
 * 2. Run evaluateRisk()
 * 3. On breach: write BreachLog + update account status
 * 4. Publish breach event to Redis channel
 */
export async function runRiskCheck(
  accountId: string,
  currentEquity: number,
  offendingTradeId?: string
): Promise<RiskCheckResult> {
  // Fetch account from DB (in production, cache this too)
  const account = await prisma.tradingAccount.findUnique({
    where: { id: accountId },
    select: {
      initialBalance: true,
      maxDailyLossLimit: true,
      maxTotalDrawdownLimit: true,
      status: true,
    },
  });

  if (!account) {
    return { breached: false };
  }

  // Get start-of-day equity (Redis > DB)
  let sodEquity = await getSodEquity(accountId);
  if (sodEquity === null) {
    // Load from last daily snapshot
    const snapshot = await prisma.dailyEquitySnapshot.findFirst({
      where: { accountId },
      orderBy: { date: "desc" },
      select: { openEquity: true },
    });
    sodEquity = snapshot
      ? parseFloat(snapshot.openEquity.toString())
      : parseFloat(account.initialBalance.toString());
    await setSodEquity(accountId, sodEquity);
  }

  const input: RiskCheckInput = {
    accountId,
    currentEquity,
    startOfDayEquity: sodEquity,
    initialBalance: parseFloat(account.initialBalance.toString()),
    maxDailyLossLimit: parseFloat(account.maxDailyLossLimit.toString()),
    maxTotalDrawdownLimit: parseFloat(account.maxTotalDrawdownLimit.toString()),
    currentStatus: account.status,
  };

  const result = evaluateRisk(input);

  if (result.breached && result.breachType) {
    // Write breach log and update status atomically
    await prisma.$transaction([
      prisma.breachLog.create({
        data: {
          accountId,
          tradeId: offendingTradeId ?? null,
          breachType: result.breachType,
          equityAtBreach: currentEquity,
          balanceAtBreach: currentEquity, // simplified
          drawdownValue: result.drawdownValue ?? 0,
          drawdownLimit: result.drawdownLimit ?? 0,
        },
      }),
      prisma.tradingAccount.update({
        where: { id: accountId },
        data: {
          status: AccountStatus.BREACHED,
          breachedAt: new Date(),
          equity: currentEquity,
        },
      }),
    ]);

    // Update Redis status cache
    await redis.setex(
      CacheKeys.accountStatus(accountId),
      CACHE_TTL.STATUS,
      AccountStatus.BREACHED
    );

    // Publish breach event
    await redis.publish(
      CacheKeys.equityChannel(accountId),
      JSON.stringify({
        type: "ACCOUNT_BREACHED",
        accountId,
        payload: result,
        timestamp: Date.now(),
      })
    );
  } else {
    // Update equity cache
    await setEquityInCache(accountId, currentEquity);

    // Publish equity update
    await redis.publish(
      CacheKeys.equityChannel(accountId),
      JSON.stringify({
        type: "EQUITY_UPDATE",
        accountId,
        payload: { equity: currentEquity },
        timestamp: Date.now(),
      })
    );
  }

  return result;
}

// ─── Daily SOD Reset ──────────────────────────────────────────────────────────

/**
 * Called by cron at 00:00 UTC.
 * Creates DailyEquitySnapshot for all active accounts
 * and resets the SOD equity in Redis.
 */
export async function resetDailySodEquity(): Promise<void> {
  const activeAccounts = await prisma.tradingAccount.findMany({
    where: { status: AccountStatus.ACTIVE },
    select: { id: true, equity: true },
  });

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  await prisma.$transaction(
    activeAccounts.map((acc) =>
      prisma.dailyEquitySnapshot.upsert({
        where: { accountId_date: { accountId: acc.id, date: today } },
        create: {
          accountId: acc.id,
          date: today,
          openEquity: acc.equity,
        },
        update: {},
      })
    )
  );

  // Update Redis SOD values
  await Promise.all(
    activeAccounts.map((acc) =>
      setSodEquity(acc.id, parseFloat(acc.equity.toString()))
    )
  );
}
