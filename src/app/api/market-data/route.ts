import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { redis, CacheKeys } from "@/lib/redis";
import { errorResponse, successResponse } from "@/lib/api";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(errorResponse("Unauthorized", 401), { status: 401 });
  }

  // Narrow the nullable module-level Redis client once. TypeScript does not
  // reliably preserve the narrowing inside Promise.all callbacks.
  const redisClient = redis;
  if (!redisClient) {
    return NextResponse.json(
      errorResponse(
        "Realtime market data is not configured",
        503,
        "REDIS_NOT_CONFIGURED"
      ),
      { status: 503 }
    );
  }

  const { searchParams } = new URL(req.url);
  const requestedSymbol = searchParams.get("symbol")?.trim().toUpperCase();
  const symbols = requestedSymbol
    ? [requestedSymbol]
    : (await redisClient.smembers(CacheKeys.marketSymbols())).sort();

  const quotes = await Promise.all(
    symbols.map(async (symbol) => {
      const raw = await redisClient.get(CacheKeys.marketTick(symbol));
      return raw ? JSON.parse(raw) : null;
    })
  );

  const heartbeat = await redisClient.get(CacheKeys.marketHeartbeat());
  const lastTickAt = heartbeat ? Number(heartbeat) : null;
  const connected = lastTickAt !== null && Date.now() - lastTickAt < 10_000;

  return NextResponse.json(
    successResponse({
      provider: process.env.MARKET_DATA_PROVIDER ?? "massive",
      connected,
      lastTickAt,
      symbols: quotes.filter(Boolean),
    })
  );
}
