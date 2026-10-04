import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

const redisUrl = process.env.ngfunded_REDIS_URL ?? process.env.REDIS_URL;
const KEY_PREFIX = "ngfunded:";

export const CacheKeys = {
  marketQuote: (symbol: string) => `${KEY_PREFIX}market:quote:${symbol.toUpperCase()}`,
  marketBar: (symbol: string) => `${KEY_PREFIX}market:bar:${symbol.toUpperCase()}`,
  marketTick: (symbol: string) => `${KEY_PREFIX}market:quote:${symbol.toUpperCase()}`,
  marketSymbols: () => `${KEY_PREFIX}market:symbols`,
  marketHeartbeat: () => `${KEY_PREFIX}market:heartbeat`,
};

/**
 * Redis is the realtime/cache layer. PostgreSQL remains the durable source of
 * truth for users, funded accounts, trades, payouts and audit history.
 *
 * Vercel's Redis integration is connected to this project through
 * ngfunded_REDIS_URL. REDIS_URL remains supported for local development.
 */
export const redis = redisUrl
  ? globalForRedis.redis ?? new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: true,
    })
  : null;

if (redis && process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}

export async function cacheMarketQuote(
  symbol: string,
  quote: { bid: number; ask: number; timestamp: number },
) {
  if (!redis) return;
  try {
    const normalized = symbol.toUpperCase();
    await Promise.all([
      redis.set(CacheKeys.marketQuote(normalized), JSON.stringify(quote), "EX", 30),
      redis.sadd(CacheKeys.marketSymbols(), normalized),
      redis.set(CacheKeys.marketHeartbeat(), String(Date.now()), "EX", 30),
      redis.publish(`${KEY_PREFIX}market:quotes:${normalized}`, JSON.stringify(quote)),
    ]);
  } catch (error) {
    console.error("[redis] market quote cache failed", error);
  }
}

export async function cacheMarketBar(symbol: string, bar: unknown) {
  if (!redis) return;
  try {
    const normalized = symbol.toUpperCase();
    await Promise.all([
      redis.set(CacheKeys.marketBar(normalized), JSON.stringify(bar), "EX", 120),
      redis.sadd(CacheKeys.marketSymbols(), normalized),
      redis.set(CacheKeys.marketHeartbeat(), String(Date.now()), "EX", 30),
    ]);
  } catch (error) {
    console.error("[redis] market bar cache failed", error);
  }
}
