import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { errorResponse, successResponse, PaginationSchema, getPaginationMeta } from "@/lib/api";
import { AccountStatus } from "@prisma/client";

/** GET /api/accounts — list all trading accounts for the authenticated user */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(errorResponse("Unauthorized", 401, "UNAUTHORIZED"), { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const pagination = PaginationSchema.parse({
    page: searchParams.get("page") ?? 1,
    pageSize: searchParams.get("pageSize") ?? 25,
  });

  const where =
    session.user.role === "ADMIN"
      ? {}
      : { userId: session.user.id };

  const [accounts, total] = await prisma.$transaction([
    prisma.tradingAccount.findMany({
      where,
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        accountId: true,
        accountType: true,
        status: true,
        initialBalance: true,
        currentBalance: true,
        equity: true,
        maxDailyLossLimit: true,
        maxTotalDrawdownLimit: true,
        profitTarget: true,
        createdAt: true,
        breachedAt: true,
        passedAt: true,
        user: { select: { id: true, email: true, name: true } },
      },
    }),
    prisma.tradingAccount.count({ where }),
  ]);

  return NextResponse.json(
    successResponse(accounts, getPaginationMeta(total, pagination))
  );
}
