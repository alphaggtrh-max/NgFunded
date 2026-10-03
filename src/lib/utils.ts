import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes safely */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number as a compact currency string */
export function formatCurrency(
  value: number,
  currency = "USD",
  compact = false
): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: 2,
  }).format(value);
}

/** Format P&L with sign and color class */
export function formatPnl(value: number): {
  formatted: string;
  colorClass: string;
  isPositive: boolean;
} {
  const isPositive = value >= 0;
  const formatted = `${isPositive ? "+" : ""}${formatCurrency(value)}`;
  const colorClass = isPositive ? "pnl-positive" : "pnl-negative";
  return { formatted, colorClass, isPositive };
}

/** Format a percentage */
export function formatPercent(value: number, decimals = 2): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}%`;
}

/** Format hold time in human-readable form */
export function formatHoldTime(openedAt: Date, closedAt?: Date): string {
  const end = closedAt ?? new Date();
  const diffMs = end.getTime() - openedAt.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

/** Calculate drawdown percentage */
export function calcDrawdownPct(
  initial: number,
  current: number
): number {
  if (initial === 0) return 0;
  return ((initial - current) / initial) * 100;
}

/** Calculate profit factor */
export function calcProfitFactor(
  grossProfit: number,
  grossLoss: number
): number {
  if (grossLoss === 0) return grossProfit > 0 ? Infinity : 0;
  return grossProfit / Math.abs(grossLoss);
}

/** Truncate long strings with ellipsis */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength)}…`;
}

/** Generate a short human-readable account ID */
export function generateAccountId(index: number): string {
  return `NGF-${String(index).padStart(5, "0")}`;
}
