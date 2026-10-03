import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { errorResponse, successResponse, validateBody, PaginationSchema, getPaginationMeta } from "@/lib/api";
import { runRiskCheck } from "@/lib/risk-engine";
import { TradeStatus, TradeSide } from "@prisma/client";
import { z } from "zod";

const CreateTradeSchema = z.object({
  accountId: z.string().cuid(),
  symbol: z.string().trim().min(1).max(20).transform((value) => value.toUpperCase()),
  side: z.nativeEnum(TradeSide),
  quantity: z.number().finite().positive(),
  entryPrice: z.number().finite().positive(),
  stopLoss: z.number().finite().positive().optional(),
  takeProfit: z.number().finite().positive().optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
  notes: z.string().max(2000).optional(),
});

const CloseTradeSchema = z.object({
  tradeId: z.string().cuid(),
  exitPrice: z.number().finite().positive(),
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
    ...(symbol ? { symbol: symbol.toUpperCase() } : {}),
    ...(status ? { status } : {}),
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

  // Verify ownership and load the complete risk configuration before creating the trade.
  const account = await prisma.tradingAccount.findFirst({
    where: {
      id: accountId,
      ...(session.user.role !== "ADMIN" ? { userId: session.user.id } : {}),
    },
    select: {
      id: true,
      equity: true,
      currentBalance: true,
      initialBalance: true,
      maxLeverage: true,
      status: true,
    },
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

  // Prevent logically invalid protective levels. This catches accidental
  // long/short inversions before they become part of the trader's audit trail.
  if (side === TradeSide.BUY) {
    if (stopLoss !== undefined && stopLoss >= entryPrice) {
      return NextResponse.json(
        errorResponse("For BUY trades, stop loss must be below entry price", 400, "INVALID_STOP_LOSS"),
        { status: 400 }
      );
    }
    if (takeProfit !== undefined && takeProfit <= entryPrice) {
      return NextResponse.json(
        errorResponse("For BUY trades, take profit must be above entry price", 400, "INVALID_TAKE_PROFIT"),
        { status: 400 }
      );
    }
  } else {
    if (stopLoss !== undefined && stopLoss <= entryPrice) {
      return NextResponse.json(
        errorResponse("For SELL trades, stop loss must be above entry price", 400, "INVALID_STOP_LOSS"),
        { status: 400 }
      );
    }
    if (takeProfit !== undefined && takeProfit >= entryPrice) {
      return NextResponse.json(
        errorResponse("For SELL trades, take profit must be below entry price", 400, "INVALID_TAKE_PROFIT"),
        { status: 400 }
      );
    }
  }

  // Calculate R:R if SL and TP are both provided.
  let riskRewardRatio: number | undefined;
  if (stopLoss !== undefined && takeProfit !== undefined) {
    const risk = Math.abs(entryPrice - stopLoss);
    const reward = Math.abs(takeProfit - entryPrice);
    riskRewardRatio = risk > 0 ? reward / risk : undefined;
  }

  // Basic notional/leverage guard. This is intentionally conservative: the
  // engine does not model broker-specific margin rules yet.
  const notional = entryPrice * quantity;
  const equity = parseFloat(account.equity.toString());
  const maxNotional = Math.max(0, equity * account.maxLeverage);
  if (notional > maxNotional) {
    return NextResponse.json(
      errorResponse(
        `Trade notional exceeds the account leverage limit (${account.maxLeverage}x)`,
        400,
        "LEVERAGE_LIMIT_EXCEEDED"
      ),
      { status: 400 }
    );
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
    include: {
      account: {
        select: {
          id: true,
          initialBalance: true,
          currentBalance: true,
          equity: true,
          status: true,
        },
      },
    },
  });

  if (!trade) {
    return NextResponse.json(errorResponse("Open trade not found", 404, "NOT_FOUND"), { status: 404 });
  }

  if (trade.account.status !== "ACTIVE") {
    return NextResponse.json(
      errorResponse(`Account is ${trade.account.status}`, 403, "ACCOUNT_NOT_ACTIVE"),
      { status: 403 }
    );
  }

  const qty = parseFloat(trade.quantity.toString());
  const entry = parseFloat(trade.entryPrice.toString());
  const pnl =
    trade.side === TradeSide.BUY
      ? (exitPrice - entry) * qty
      : (entry - exitPrice) * qty;

  const balance = parseFloat(trade.account.currentBalance.toString());
  const pnlPercent = balance !== 0 ? (pnl / balance) * 100 : 0;
  const newEquity = parseFloat(trade.account.equity.toString()) + pnl;

  const closedTrade = await prisma.$transaction(async (tx) => {
    // Re-read the trade inside the transaction so two close requests cannot
    // both mutate the same OPEN trade.
    const current = await tx.trade.findFirst({
      where: { id: tradeId, status: TradeStatus.OPEN },
      select: { id: true },
    });

    if (!current) return null;

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

  if (!closedTrade) {
    return NextResponse.json(
      errorResponse("Trade was already closed", 409, "TRADE_ALREADY_CLOSED"),
      { status: 409 }
    );
  }

  // Risk evaluation happens only after the transaction has committed, so the
  // risk engine sees the same equity that the account now stores.
  const riskResult = await runRiskCheck(trade.accountId, newEquity, trade.id);

  return NextResponse.json(
    successResponse({ trade: closedTrade, risk: riskResult })
  );
}
