import Redis from "ioredis";

const getRedisUrl = () => {
  if (process.env.REDIS_URL) {
    return process.env.REDIS_URL;
  }
  throw new Error("REDIS_URL environment variable is not defined");
};

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

export const redis =
  globalForRedis.redis ??
  new Redis(getRedisUrl(), {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    enableReadyCheck: false,
  });

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}

// ─── Cache key helpers ────────────────────────────────────────────────────────

export const CacheKeys = {
  /** Current equity for an account (refreshed on every tick) */
  accountEquity: (accountId: string) => `ngf:equity:${accountId}`,
  /** Start-of-day equity for daily drawdown calculation */
  sodEquity: (accountId: string) => `ngf:sod_equity:${accountId}`,
  /** Account status cache (ACTIVE | BREACHED | PASSED) */
  accountStatus: (accountId: string) => `ngf:status:${accountId}`,
  /** Live open P&L across all positions for an account */
  openPnl: (accountId: string) => `ngf:open_pnl:${accountId}`,
  /** Pub/Sub channel for live equity updates */
  equityChannel: (accountId: string) => `ngf:channel:equity:${accountId}`,
  /** Rate-limit key for risk check calls */
  rateLimit: (accountId: string) => `ngf:rl:${accountId}`,
} as const;

export const CACHE_TTL = {
  EQUITY: 300,      // 5 minutes — refreshed on ticks
  SOD_EQUITY: 86400, // 24 hours
  STATUS: 60,       // 1 minute
} as const;
