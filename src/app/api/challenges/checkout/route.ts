import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

const challenges: Record<string, { balance: number; price: number }> = {
  "10k": { balance: 10_000, price: 49 },
  "25k": { balance: 25_000, price: 99 },
  "50k": { balance: 50_000, price: 199 },
  "100k": { balance: 100_000, price: 299 },
};

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { challengeId?: string } | null;
  const challenge = body?.challengeId ? challenges[body.challengeId] : undefined;
  if (!challenge || !body?.challengeId) {
    return NextResponse.json({ error: { message: "Invalid challenge", code: "INVALID_CHALLENGE" } }, { status: 400 });
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return NextResponse.json({ error: { message: "Payments are not configured yet. Add STRIPE_SECRET_KEY in Vercel.", code: "PAYMENTS_NOT_CONFIGURED" } }, { status: 503 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("success_url", `${appUrl}/dashboard/challenges/success?session_id={CHECKOUT_SESSION_ID}`);
  form.set("cancel_url", `${appUrl}/dashboard/challenges?cancelled=1`);
  form.set("client_reference_id", session.user.id);
  form.set("line_items[0][quantity]", "1");
  form.set("line_items[0][price_data][currency]", "usd");
  form.set("line_items[0][price_data][unit_amount]", String(challenge.price * 100));
  form.set("line_items[0][price_data][product_data][name]", `NGFunded ${body.challengeId} Funded Demo`);
  form.set("line_items[0][price_data][product_data][description]", `Simulated $${challenge.balance.toLocaleString()} prop trading account`);
  form.set("metadata[userId]", session.user.id);
  form.set("metadata[challengeId]", body.challengeId);

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
    cache: "no-store",
  });

  const checkout = await response.json() as { url?: string; error?: { message?: string } };
  if (!response.ok || !checkout.url) {
    return NextResponse.json({ error: { message: checkout.error?.message ?? "Stripe checkout could not be created.", code: "STRIPE_ERROR" } }, { status: 502 });
  }

  return NextResponse.json({ data: { url: checkout.url } });
}
