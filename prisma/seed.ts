/**
 * NGFunded Database Seed
 *
 * Creates:
 * - 1 Admin user
 * - 2 Trader users
 * - Trading accounts for each (Phase 1, Phase 2, Funded)
 * - Sample closed trades with tags and P&L
 * - Daily equity snapshots
 *
 * Run: npx prisma db seed
 */

import { PrismaClient, AccountType, AccountStatus, TradeSide, TradeStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding NGFunded database...");

  // ─── Users ──────────────────────────────────────────────────────────────────

  const adminHash = await bcrypt.hash("Admin@1234", 12);
  const traderHash = await bcrypt.hash("Trader@1234", 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@ngfunded.io" },
    update: {},
    create: {
      email: "admin@ngfunded.io",
      name: "Admin",
      role: "ADMIN",
      kycStatus: "APPROVED",
      passwordHash: adminHash,
    },
  });

  const trader1 = await prisma.user.upsert({
    where: { email: "trader1@ngfunded.io" },
    update: {},
    create: {
      email: "trader1@ngfunded.io",
      name: "Alex Morgan",
      role: "TRADER",
      kycStatus: "APPROVED",
      passwordHash: traderHash,
    },
  });

  const trader2 = await prisma.user.upsert({
    where: { email: "trader2@ngfunded.io" },
    update: {},
    create: {
      email: "trader2@ngfunded.io",
      name: "Jordan Lee",
      role: "TRADER",
      kycStatus: "APPROVED",
      passwordHash: traderHash,
    },
  });

  console.log(`✅ Users created: ${admin.email}, ${trader1.email}, ${trader2.email}`);

  // ─── Trading Accounts ────────────────────────────────────────────────────────

  const account1 = await prisma.tradingAccount.upsert({
    where: { accountId: "NGF-00001" },
    update: {},
    create: {
      accountId: "NGF-00001",
      userId: trader1.id,
      accountType: AccountType.EVALUATION_PHASE_1,
      status: AccountStatus.ACTIVE,
      initialBalance: 10000,
      currentBalance: 10420,
      equity: 10420,
      maxDailyLossLimit: 500,   // 5%
      maxTotalDrawdownLimit: 1000, // 10%
      profitTarget: 1000,        // 10% target
    },
  });

  const account2 = await prisma.tradingAccount.upsert({
    where: { accountId: "NGF-00002" },
    update: {},
    create: {
      accountId: "NGF-00002",
      userId: trader2.id,
      accountType: AccountType.EVALUATION_PHASE_2,
      status: AccountStatus.ACTIVE,
      initialBalance: 50000,
      currentBalance: 52100,
      equity: 52100,
      maxDailyLossLimit: 2500,
      maxTotalDrawdownLimit: 5000,
      profitTarget: 2500,
    },
  });

  console.log(`✅ Trading accounts: ${account1.accountId}, ${account2.accountId}`);

  // ─── Sample Trades ───────────────────────────────────────────────────────────

  const tradeData = [
    {
      accountId: account1.id,
      symbol: "$PURR",
      side: TradeSide.BUY,
      status: TradeStatus.CLOSED,
      quantity: 1000,
      entryPrice: 1.2100,
      exitPrice: 1.2350,
      pnl: 250,
      pnlPercent: 2.5,
      riskRewardRatio: 2.5,
      openedAt: new Date("2026-10-01T09:00:00Z"),
      closedAt: new Date("2026-10-01T14:30:00Z"),
      tags: ["Opening Liquidity Sweep", "Trend Follow"],
      notes: "Clean break above daily high. Held for full TP.",
    },
    {
      accountId: account1.id,
      symbol: "$PURR",
      side: TradeSide.SELL,
      status: TradeStatus.CLOSED,
      quantity: 500,
      entryPrice: 1.2400,
      exitPrice: 1.2280,
      pnl: 60,
      pnlPercent: 0.6,
      riskRewardRatio: 1.2,
      openedAt: new Date("2026-10-02T10:15:00Z"),
      closedAt: new Date("2026-10-02T11:45:00Z"),
      tags: ["Resistance Fade"],
      notes: "Faded the morning spike. Quick scalp.",
    },
    {
      accountId: account1.id,
      symbol: "XAUUSD",
      side: TradeSide.BUY,
      status: TradeStatus.CLOSED,
      quantity: 0.5,
      entryPrice: 2340.00,
      exitPrice: 2315.00,
      pnl: -125,
      pnlPercent: -1.25,
      riskRewardRatio: 1.5,
      openedAt: new Date("2026-10-02T15:00:00Z"),
      closedAt: new Date("2026-10-02T17:00:00Z"),
      tags: ["Support Break", "Gold"],
      notes: "SL hit. Misread the structure.",
    },
    {
      accountId: account1.id,
      symbol: "$PURR",
      side: TradeSide.BUY,
      status: TradeStatus.OPEN,
      quantity: 2000,
      entryPrice: 1.2200,
      stopLoss: 1.2100,
      takeProfit: 1.2500,
      riskRewardRatio: 3.0,
      openedAt: new Date("2026-10-03T08:00:00Z"),
      tags: ["Opening Liquidity Sweep", "HTF Confluence"],
      notes: "Strong D1 level. Waiting for TP.",
    },
  ];

  for (const td of tradeData) {
    await prisma.trade.create({ data: td });
  }

  console.log(`✅ Created ${tradeData.length} sample trades`);

  // ─── Daily Equity Snapshots ──────────────────────────────────────────────────

  const snapshots = [
    { accountId: account1.id, date: new Date("2026-10-01T00:00:00Z"), openEquity: 10000, closeEquity: 10250 },
    { accountId: account1.id, date: new Date("2026-10-02T00:00:00Z"), openEquity: 10250, closeEquity: 10185 },
    { accountId: account1.id, date: new Date("2026-10-03T00:00:00Z"), openEquity: 10185, closeEquity: null },
  ];

  for (const snap of snapshots) {
    await prisma.dailyEquitySnapshot.upsert({
      where: { accountId_date: { accountId: snap.accountId, date: snap.date } },
      update: {},
      create: snap,
    });
  }

  console.log(`✅ Equity snapshots created`);
  console.log("\n🎉 Seed complete!\n");
  console.log("Login credentials:");
  console.log("  Admin:   admin@ngfunded.io   / Admin@1234");
  console.log("  Trader1: trader1@ngfunded.io / Trader@1234");
  console.log("  Trader2: trader2@ngfunded.io / Trader@1234");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
