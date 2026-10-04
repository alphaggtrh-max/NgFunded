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
