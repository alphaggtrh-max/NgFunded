import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

/**
 * Redis is the realtime/cache layer. PostgreSQL remains the durable source of
 * truth for users, funded accounts, trades, payouts and audit history.
 *
 * REDIS_URL is intentionally server-only and should be supplied by the Vercel
 * Redis/Upstash integration.
 */
export const redis = process.env.REDIS_URL
  ? globalForRedis.redis ?? new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: true,
    })
  : null;

if (redis && process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}

export async function cacheMarketQuote(symbol: string, quote: { bid: number; ask: number; timestamp: number }) {
  if (!redis) return;
  try {
    await redis.set(`market:quote:${symbol}`, JSON.stringify(quote), "EX", 30);
    await redis.publish(`market:quotes:${symbol}`, JSON.stringify(quote));
  } catch (error) {
    console.error("[redis] market quote cache failed", error);
  }
}

export async function cacheMarketBar(symbol: string, bar: unknown) {
  if (!redis) return;
  try {
    await redis.set(`market:bar:${symbol}`, JSON.stringify(bar), "EX", 120);
  } catch (error) {
    console.error("[redis] market bar cache failed", error);
  }
}
