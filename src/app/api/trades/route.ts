import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { errorResponse, successResponse, validateBody, PaginationSchema, getPaginationMeta } from "@/lib/api";
import { runRiskCheck } from "@/lib/risk-engine";
import { TradeStatus, TradeSide } from "@prisma/client";
import { z } from "zod";

const CreateTradeSchema = z.object({
  accountId: z.string().cuid(),
  symbol: z.string().min(1).max(20),
  side: z.nativeEnum(TradeSide),
  quantity: z.number().positive(),
  entryPrice: z.number().positive(),
  stopLoss: z.number().positive().optional(),
  takeProfit: z.number().positive().optional(),
  tags: z.array(z.string().max(50)).default([]),
  notes: z.string().max(2000).optional(),
});

const CloseTradeSchema = z.object({
  tradeId: z.string().cuid(),
  exitPrice: z.number().positive(),
  closedAt: z.string().datetime().optional(),
});

/** GET /api/trades?accountId=...&page=1&pageSize=25 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(errorResponse("Unauthorized", 401), { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get("accountId");
  const symbol = searchParams.get("symbol");
  const status = searchParams.get("status") as TradeStatus | null;
  const pagination = PaginationSchema.parse({
    page: searchParams.get("page") ?? 1,
    pageSize: searchParams.get("pageSize") ?? 25,
  });

  const where = {
    ...(accountId ? { accountId } : {}),
    ...(symbol ? { symbol } : {}),
    ...(status ? { status } : {}),
    // Scope to user unless admin
    ...(session.user.role !== "ADMIN"
      ? { account: { userId: session.user.id } }
      : {}),
  };

  const [trades, total] = await prisma.$transaction([
    prisma.trade.findMany({
      where,
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      orderBy: { openedAt: "desc" },
    }),
    prisma.trade.count({ where }),
  ]);

  return NextResponse.json(
    successResponse(trades, getPaginationMeta(total, pagination))
  );
}

/** POST /api/trades — open a new trade */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(errorResponse("Unauthorized", 401), { status: 401 });
  }

  const body = await req.json();
  const validation = validateBody(CreateTradeSchema, body);
  if (!validation.success) {
    return NextResponse.json(validation.error, { status: 400 });
  }

  const { accountId, symbol, side, quantity, entryPrice, stopLoss, takeProfit, tags, notes } =
    validation.data;

  // Verify account ownership
  const account = await prisma.tradingAccount.findFirst({
    where: {
      id: accountId,
      ...(session.user.role !== "ADMIN" ? { userId: session.user.id } : {}),
    },
    select: { id: true, equity: true, status: true },
  });

  if (!account) {
    return NextResponse.json(errorResponse("Account not found", 404, "NOT_FOUND"), { status: 404 });
  }

  if (account.status !== "ACTIVE") {
    return NextResponse.json(
      errorResponse(`Account is ${account.status}`, 403, "ACCOUNT_NOT_ACTIVE"),
      { status: 403 }
    );
  }

  // Calculate R:R if SL and TP provided
  let riskRewardRatio: number | undefined;
  if (stopLoss && takeProfit) {
    const risk = Math.abs(entryPrice - stopLoss);
    const reward = Math.abs(takeProfit - entryPrice);
    riskRewardRatio = risk > 0 ? reward / risk : undefined;
  }

  const trade = await prisma.trade.create({
    data: {
      accountId,
      symbol,
      side,
      status: TradeStatus.OPEN,
      quantity,
      entryPrice,
      stopLoss,
      takeProfit,
      riskRewardRatio,
      tags,
      notes,
    },
  });

  return NextResponse.json(successResponse(trade), { status: 201 });
}

/** PATCH /api/trades — close an existing trade */
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(errorResponse("Unauthorized", 401), { status: 401 });
  }

  const body = await req.json();
  const validation = validateBody(CloseTradeSchema, body);
  if (!validation.success) {
    return NextResponse.json(validation.error, { status: 400 });
  }

  const { tradeId, exitPrice, closedAt } = validation.data;

  const trade = await prisma.trade.findFirst({
    where: {
      id: tradeId,
      status: TradeStatus.OPEN,
      ...(session.user.role !== "ADMIN"
        ? { account: { userId: session.user.id } }
        : {}),
    },
    include: { account: { select: { id: true, initialBalance: true, currentBalance: true, equity: true } } },
  });

  if (!trade) {
    return NextResponse.json(errorResponse("Open trade not found", 404, "NOT_FOUND"), { status: 404 });
  }

  // Calculate P&L
  const qty = parseFloat(trade.quantity.toString());
  const entry = parseFloat(trade.entryPrice.toString());
  const pnl =
    trade.side === TradeSide.BUY
      ? (exitPrice - entry) * qty
      : (entry - exitPrice) * qty;

  const balance = parseFloat(trade.account.currentBalance.toString());
  const pnlPercent = (pnl / balance) * 100;

  const newEquity = parseFloat(trade.account.equity.toString()) + pnl;

  const closedTrade = await prisma.$transaction(async (tx) => {
    const updated = await tx.trade.update({
      where: { id: tradeId },
      data: {
        status: TradeStatus.CLOSED,
        exitPrice,
        pnl,
        pnlPercent,
        closedAt: closedAt ? new Date(closedAt) : new Date(),
      },
    });

    await tx.tradingAccount.update({
      where: { id: trade.accountId },
      data: {
        equity: newEquity,
        currentBalance: { increment: pnl },
      },
    });

    return updated;
  });

  // Run risk check after closing
  await runRiskCheck(trade.accountId, newEquity, trade.id);

  return NextResponse.json(successResponse(closedTrade));
}
