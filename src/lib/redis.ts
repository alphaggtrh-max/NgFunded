import Redis from "ioredis";

const redisOptions = {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  enableReadyCheck: false,
};

/**
 * Small in-memory fallback used when REDIS_URL is not configured.
 * Vercel preview/demo deployments can therefore build and boot without a
 * Redis service; a real Redis client is used automatically when configured.
 */
class MemoryRedis {
  private readonly values = new Map<string, { value: string; expiresAt: number }>();

  async get(key: string): Promise<string | null> {
    const entry = this.values.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.values.delete(key);
      return null;
    }
    return entry.value;
  }

  async setex(key: string, seconds: number, value: string): Promise<"OK"> {
    this.values.set(key, {
      value,
      expiresAt: Date.now() + seconds * 1000,
    });
    return "OK";
  }

  async publish(_channel: string, _message: string): Promise<number> {
    return 0;
  }

  async smembers(_key: string): Promise<string[]> {
    return [];
  }
}

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

export const redis: Redis =
  globalForRedis.redis ??
  (process.env.REDIS_URL
    ? new Redis(process.env.REDIS_URL, redisOptions)
    : (new MemoryRedis() as unknown as Redis));

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}

export const CacheKeys = {
  accountEquity: (accountId: string) => `ngf:equity:${accountId}`,
  sodEquity: (accountId: string) => `ngf:sod_equity:${accountId}`,
  accountStatus: (accountId: string) => `ngf:status:${accountId}`,
  openPnl: (accountId: string) => `ngf:open_pnl:${accountId}`,
  equityChannel: (accountId: string) => `ngf:channel:equity:${accountId}`,
  rateLimit: (accountId: string) => `ngf:rl:${accountId}`,
  marketTick: (symbol: string) => `ngf:market:tick:${symbol.toUpperCase()}`,
  marketSymbols: () => "ngf:market:symbols",
  marketHeartbeat: () => "ngf:market:heartbeat",
  marketTickChannel: () => "ngf:market:tick",
} as const;

export const CACHE_TTL = {
  EQUITY: 300,
  SOD_EQUITY: 86400,
  STATUS: 60,
  MARKET_TICK: 10,
  MARKET_HEARTBEAT: 10,
} as const;
