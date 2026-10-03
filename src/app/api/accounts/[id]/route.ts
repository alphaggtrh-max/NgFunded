import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { errorResponse, successResponse } from "@/lib/api";

/** GET /api/accounts/[id] — fetch single trading account */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(errorResponse("Unauthorized", 401), { status: 401 });
  }

  const { id } = await params;

  const account = await prisma.tradingAccount.findFirst({
    where: {
      id,
      ...(session.user.role !== "ADMIN" ? { userId: session.user.id } : {}),
    },
    include: {
      _count: { select: { trades: true } },
    },
  });

  if (!account) {
    return NextResponse.json(errorResponse("Account not found", 404), { status: 404 });
  }

  return NextResponse.json(successResponse(account));
}
