import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { errorResponse, successResponse } from "@/lib/api";
import { getAccountMetrics, buildEquityCurve } from "@/lib/metrics";
import { TradeStatus } from "@prisma/client";

/** GET /api/metrics?accountId=...&symbol=...&tags=a,b&from=...&to=... */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(errorResponse("Unauthorized", 401), { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get("accountId");
  if (!accountId) {
    return NextResponse.json(errorResponse("accountId is required", 400), { status: 400 });
  }

  // Verify ownership
  const account = await prisma.tradingAccount.findFirst({
    where: {
      id: accountId,
      ...(session.user.role !== "ADMIN" ? { userId: session.user.id } : {}),
    },
    select: { id: true, initialBalance: true },
  });

  if (!account) {
    return NextResponse.json(errorResponse("Account not found", 404), { status: 404 });
  }

  const symbol = searchParams.get("symbol") ?? undefined;
  const tagsParam = searchParams.get("tags");
  const tags = tagsParam ? tagsParam.split(",").filter(Boolean) : undefined;
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const [metrics, rawTrades] = await Promise.all([
    getAccountMetrics(accountId, {
      symbol,
      tags,
      fromDate: from ? new Date(from) : undefined,
      toDate: to ? new Date(to) : undefined,
    }),
    prisma.trade.findMany({
      where: { accountId, status: TradeStatus.CLOSED },
      select: {
        id: true,
        pnl: true,
        closedAt: true,
        status: true,
        side: true,
        symbol: true,
        accountId: true,
        quantity: true,
        entryPrice: true,
        exitPrice: true,
        stopLoss: true,
        takeProfit: true,
        pnlPercent: true,
        riskRewardRatio: true,
        openedAt: true,
        tags: true,
        notes: true,
      },
      orderBy: { closedAt: "asc" },
    }),
  ]);

  const trades = rawTrades.map((t) => ({
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
    notes: t.notes ?? undefined,
  }));

  const equityCurve = buildEquityCurve(
    parseFloat(account.initialBalance.toString()),
    trades
  );

  return NextResponse.json(
    successResponse({ metrics, equityCurve })
  );
}
