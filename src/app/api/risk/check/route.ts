import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse } from "@/lib/api";
import { runRiskCheck } from "@/lib/risk-engine";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

const RiskCheckSchema = z.object({
  accountId: z.string().cuid(),
  currentEquity: z.number().positive(),
  offendingTradeId: z.string().cuid().optional(),
});

/**
 * POST /api/risk/check
 * Manually trigger a risk check for an account.
 * Typically called by the mock exchange server internally.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(errorResponse("Unauthorized", 401), { status: 401 });
  }

  const body = await req.json();
  const parsed = RiskCheckSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(errorResponse("Invalid request", 400), { status: 400 });
  }

  const { accountId, currentEquity, offendingTradeId } = parsed.data;

  // Verify ownership
  const account = await prisma.tradingAccount.findFirst({
    where: {
      id: accountId,
      ...(session.user.role !== "ADMIN" ? { userId: session.user.id } : {}),
    },
    select: { id: true },
  });

  if (!account) {
    return NextResponse.json(errorResponse("Account not found", 404), { status: 404 });
  }

  const result = await runRiskCheck(accountId, currentEquity, offendingTradeId);

  return NextResponse.json(successResponse(result));
}
