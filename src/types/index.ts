import {
  AccountStatus,
  AccountType,
  BreachType,
  TradeSide,
  TradeStatus,
  Role,
  KycStatus,
  PayoutStatus,
} from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

// ─── Re-export Prisma enums ───────────────────────────────────────────────────
export {
  AccountStatus,
  AccountType,
  BreachType,
  TradeSide,
  TradeStatus,
  Role,
  KycStatus,
  PayoutStatus,
};

// ─── Domain Types ─────────────────────────────────────────────────────────────

export interface TradingAccountSnapshot {
  accountId: string;
  userId: string;
  accountType: AccountType;
  status: AccountStatus;
  initialBalance: number;
  currentBalance: number;
  equity: number;
  maxDailyLossLimit: number;
  maxTotalDrawdownLimit: number;
  profitTarget: number;
}

export interface TradePayload {
  id: string;
  accountId: string;
  symbol: string;
  side: TradeSide;
  status: TradeStatus;
  quantity: number;
  entryPrice: number;
  exitPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  pnl?: number;
  pnlPercent?: number;
  openedAt: Date;
  closedAt?: Date;
  tags: string[];
  notes?: string;
}

// ─── Risk Engine Types ────────────────────────────────────────────────────────

export interface RiskCheckInput {
  accountId: string;
  currentEquity: number;
  startOfDayEquity: number;
  initialBalance: number;
  maxDailyLossLimit: number;
  maxTotalDrawdownLimit: number;
  currentStatus: AccountStatus;
}

export interface RiskCheckResult {
  breached: boolean;
  breachType?: BreachType;
  drawdownValue?: number;
  drawdownLimit?: number;
  message?: string;
}

// ─── WebSocket Message Types ──────────────────────────────────────────────────

export type WsMessageType =
  | "EQUITY_UPDATE"
  | "TRADE_OPENED"
  | "TRADE_CLOSED"
  | "ACCOUNT_BREACHED"
  | "ACCOUNT_PASSED"
  | "TICK"
  | "ERROR"
  | "PING"
  | "PONG";

export interface WsMessage<T = unknown> {
  type: WsMessageType;
  accountId?: string;
  payload: T;
  timestamp: number;
}

export interface EquityUpdatePayload {
  equity: number;
  balance: number;
  openPnl: number;
  dailyPnl: number;
  drawdownUsedPct: number;
  dailyDrawdownUsedPct: number;
}

export interface TickPayload {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  timestamp: number;
}

// ─── Performance Metrics ──────────────────────────────────────────────────────

export interface PerformanceMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  profitFactor: number;
  avgRiskReward: number;
  avgHoldTimeMinutes: number;
  grossProfit: number;
  grossLoss: number;
  netPnl: number;
  maxDrawdown: number;
  sharpeRatio?: number;
}

export interface EquityDataPoint {
  time: number; // Unix timestamp seconds
  value: number;
}

// ─── Zod Schemas for API validation ──────────────────────────────────────────

export type { Decimal };
