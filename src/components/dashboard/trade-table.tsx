"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccountStore } from "@/store/account-store";
import { formatCurrency, formatPercent, formatHoldTime, cn } from "@/lib/utils";
import { TradeSide, TradeStatus } from "@prisma/client";
import { ChevronLeft, ChevronRight, Search, Filter } from "lucide-react";
import { format } from "date-fns";

interface Trade {
  id: string;
  symbol: string;
  side: TradeSide;
  status: TradeStatus;
  quantity: number;
  entryPrice: number;
  exitPrice?: number;
  pnl?: number;
  pnlPercent?: number;
  openedAt: string;
  closedAt?: string;
  tags: string[];
  notes?: string;
}

const PAGE_SIZE = 15;

export function TradeTable() {
  const { selectedAccount } = useAccountStore();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TradeStatus | "">("");

  const accountId = selectedAccount?.id;

  const { data, isLoading } = useQuery({
    queryKey: ["trades", accountId, page, statusFilter],
    queryFn: async () => {
      if (!accountId) return null;
      const params = new URLSearchParams({
        accountId,
        page: String(page),
        pageSize: String(PAGE_SIZE),
        ...(statusFilter ? { status: statusFilter } : {}),
      });
      const res = await fetch(`/api/trades?${params}`);
      if (!res.ok) throw new Error("Failed to fetch trades");
      return res.json() as Promise<{
        data: Trade[];
        meta: { total: number; totalPages: number; page: number };
      }>;
    },
    enabled: !!accountId,
  });

  const trades = data?.data ?? [];
  const meta = data?.meta;

  const filtered = search
    ? trades.filter(
        (t) =>
          t.symbol.toLowerCase().includes(search.toLowerCase()) ||
          t.tags.some((tag) => tag.toLowerCase().includes(search.toLowerCase()))
      )
    : trades;

  return (
    <div className="glass-panel p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-mono uppercase tracking-widest text-text-muted">
          Trade Journal
        </h2>
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
            <input
              type="text"
              placeholder="Search symbol or tag…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs bg-surface border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-crimson/50 transition-colors w-48"
            />
          </div>
          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as TradeStatus | "");
              setPage(1);
            }}
            className="px-2 py-1.5 text-xs bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-crimson/50 transition-colors"
          >
            <option value="">All</option>
            <option value={TradeStatus.OPEN}>Open</option>
            <option value={TradeStatus.CLOSED}>Closed</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-text-muted font-mono uppercase tracking-wider">
              <th className="text-left py-2 pr-4">Symbol</th>
              <th className="text-left py-2 pr-4">Side</th>
              <th className="text-right py-2 pr-4">Entry</th>
              <th className="text-right py-2 pr-4">Exit</th>
              <th className="text-right py-2 pr-4">Qty</th>
              <th className="text-right py-2 pr-4">P&amp;L</th>
              <th className="text-right py-2 pr-4">P&amp;L %</th>
              <th className="text-left py-2 pr-4">Hold Time</th>
              <th className="text-left py-2 pr-4">Opened</th>
              <th className="text-left py-2">Tags</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border/50">
                  {Array.from({ length: 10 }).map((_, j) => (
                    <td key={j} className="py-3 pr-4">
                      <div className="h-3 bg-surface-elevated rounded animate-pulse w-16" />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={10}
                  className="text-center py-12 text-text-muted font-mono text-xs"
                >
                  No trades found
                </td>
              </tr>
            ) : (
              filtered.map((trade) => {
                const pnl = trade.pnl ?? 0;
                const isProfit = pnl >= 0;
                return (
                  <tr
                    key={trade.id}
                    className="border-b border-border/50 hover:bg-surface-elevated/50 transition-colors group"
                  >
                    {/* Symbol */}
                    <td className="py-3 pr-4">
                      <span className="font-mono font-semibold text-text-primary">
                        {trade.symbol}
                      </span>
                    </td>
                    {/* Side */}
                    <td className="py-3 pr-4">
                      <span
                        className={cn(
                          trade.side === TradeSide.BUY
                            ? "badge-long"
                            : "badge-short"
                        )}
                      >
                        {trade.side === TradeSide.BUY ? "LONG" : "SHORT"}
                      </span>
                    </td>
                    {/* Entry */}
                    <td className="py-3 pr-4 text-right font-mono text-text-secondary">
                      {trade.entryPrice.toFixed(4)}
                    </td>
                    {/* Exit */}
                    <td className="py-3 pr-4 text-right font-mono text-text-secondary">
                      {trade.exitPrice?.toFixed(4) ?? "—"}
                    </td>
                    {/* Qty */}
                    <td className="py-3 pr-4 text-right font-mono text-text-secondary">
                      {trade.quantity}
                    </td>
                    {/* P&L */}
                    <td
                      className={cn(
                        "py-3 pr-4 text-right font-mono font-semibold",
                        isProfit ? "text-cyan" : "text-crimson"
                      )}
                    >
                      {pnl !== 0
                        ? `${isProfit ? "+" : ""}${formatCurrency(pnl)}`
                        : "—"}
                    </td>
                    {/* P&L % */}
                    <td
                      className={cn(
                        "py-3 pr-4 text-right font-mono",
                        isProfit ? "text-cyan/70" : "text-crimson/70"
                      )}
                    >
                      {trade.pnlPercent != null
                        ? formatPercent(trade.pnlPercent)
                        : "—"}
                    </td>
                    {/* Hold Time */}
                    <td className="py-3 pr-4 font-mono text-text-muted">
                      {formatHoldTime(
                        new Date(trade.openedAt),
                        trade.closedAt ? new Date(trade.closedAt) : undefined
                      )}
                    </td>
                    {/* Opened */}
                    <td className="py-3 pr-4 font-mono text-text-muted">
                      {format(new Date(trade.openedAt), "MMM d HH:mm")}
                    </td>
                    {/* Tags */}
                    <td className="py-3">
                      <div className="flex flex-wrap gap-1">
                        {trade.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber/10 text-amber border border-amber/20"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
          <span className="text-xs font-mono text-text-muted">
            {meta.total} trades · Page {meta.page} of {meta.totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1 rounded border border-border hover:border-border-bright disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-text-secondary" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
              disabled={page === meta.totalPages}
              className="p-1 rounded border border-border hover:border-border-bright disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-text-secondary" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
