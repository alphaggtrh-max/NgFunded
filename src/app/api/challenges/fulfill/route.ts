import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createHash } from "node:crypto";

export const runtime = "nodejs";

const challenges: Record<string, { balance: number; price: number }> = {
  "10k": { balance: 10_000, price: 49 },
  "25k": { balance: 25_000, price: 99 },
  "50k": { balance: 50_000, price: 199 },
  "100k": { balance: 100_000, price: 299 },
};

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const sessionId = new URL(request.url).searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: { message: "Missing checkout session", code: "MISSING_SESSION" } }, { status: 400 });
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return NextResponse.json({ error: { message: "Payments are not configured.", code: "PAYMENTS_NOT_CONFIGURED" } }, { status: 503 });
  }

  const stripeResponse = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${secret}` },
    cache: "no-store",
  });
  const checkout = await stripeResponse.json() as {
    payment_status?: string;
    metadata?: { userId?: string; challengeId?: string };
    client_reference_id?: string;
  };

  if (!stripeResponse.ok || checkout.payment_status !== "paid") {
    return NextResponse.json({ error: { message: "Payment has not been completed.", code: "PAYMENT_NOT_COMPLETED" } }, { status: 402 });
  }

  if (checkout.metadata?.userId !== session.user.id || checkout.client_reference_id !== session.user.id) {
    return NextResponse.json({ error: { message: "This payment belongs to another account.", code: "PAYMENT_OWNER_MISMATCH" } }, { status: 403 });
  }

  const challengeId = checkout.metadata?.challengeId ?? "";
  const challenge = challenges[challengeId];
  if (!challenge) {
    return NextResponse.json({ error: { message: "Unknown challenge.", code: "INVALID_CHALLENGE" } }, { status: 400 });
  }

  const accountId = `NGF-${createHash("sha256").update(sessionId).digest("hex").slice(0, 10).toUpperCase()}`;
  const dailyLoss = challenge.balance * 0.05;
  const maxDrawdown = challenge.balance * 0.10;
  const profitTarget = challenge.balance * 0.08;

  const account = await prisma.tradingAccount.upsert({
    where: { accountId },
    update: {},
    create: {
      accountId,
      userId: session.user.id,
      accountType: "FUNDED",
      status: "ACTIVE",
      initialBalance: challenge.balance,
      currentBalance: challenge.balance,
      equity: challenge.balance,
      maxDailyLossLimit: dailyLoss,
      maxTotalDrawdownLimit: maxDrawdown,
      profitTarget,
      maxLeverage: 100,
    },
  });

  return NextResponse.json({ data: { accountId: account.accountId, balance: challenge.balance, challengeId } });
}
