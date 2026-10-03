"use client";

import { useQuery } from "@tanstack/react-query";
import { useAccountStore } from "@/store/account-store";
import { formatCurrency, formatPercent, calcDrawdownPct } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Wallet, TrendingDown, ShieldAlert, Target } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string;
  subValue?: string;
  icon: React.ReactNode;
  accentColor: "crimson" | "cyan" | "amber" | "success";
  loading?: boolean;
}

function MetricCard({ title, value, subValue, icon, accentColor, loading }: MetricCardProps) {
  const colorMap = {
    crimson: "text-crimson border-crimson/20 bg-crimson/5",
    cyan: "text-cyan border-cyan/20 bg-cyan/5",
    amber: "text-amber border-amber/20 bg-amber/5",
    success: "text-success border-success/20 bg-success/5",
  };

  return (
    <div className="metric-card animate-slide-up">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono uppercase tracking-widest text-text-muted">
          {title}
        </span>
        <div
          className={cn(
            "w-8 h-8 rounded-lg border flex items-center justify-center",
            colorMap[accentColor]
          )}
        >
          {icon}
        </div>
      </div>
      {loading ? (
        <div className="h-8 w-32 bg-surface-elevated rounded animate-pulse" />
      ) : (
        <div className={cn("text-2xl font-bold font-mono", `text-${accentColor}`)}>
          {value}
        </div>
      )}
      {subValue && (
        <div className="text-xs text-text-muted font-mono">{subValue}</div>
      )}
    </div>
  );
}

export function MetricCards() {
  const { selectedAccount } = useAccountStore();
  const accountId = selectedAccount?.id;

  const { data, isLoading } = useQuery({
    queryKey: ["account", accountId],
    queryFn: async () => {
      if (!accountId) return null;
      const res = await fetch(`/api/accounts/${accountId}`);
      if (!res.ok) throw new Error("Failed to fetch account");
      const json = await res.json();
      return json.data;
    },
    enabled: !!accountId,
    refetchInterval: 5000, // refresh every 5s
  });

  const equity = data?.equity ?? selectedAccount?.equity ?? 0;
  const initialBalance = data?.initialBalance ?? selectedAccount?.initialBalance ?? 1;
  const maxDailyLoss = data?.maxDailyLossLimit ?? selectedAccount?.maxDailyLossLimit ?? 0;
  const maxTotalDrawdown = data?.maxTotalDrawdownLimit ?? selectedAccount?.maxTotalDrawdownLimit ?? 0;
  const profitTarget = data?.profitTarget ?? selectedAccount?.profitTarget ?? 1;

  // Daily loss remaining (simplified — real version reads from SOD snapshot)
  const dailyLossRemaining = maxDailyLoss; // placeholder until WS provides live value
  const totalDrawdownRemaining = maxTotalDrawdown - (initialBalance - equity);
  const profitProgress = Math.max(0, equity - initialBalance);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <MetricCard
        title="Current Equity"
        value={formatCurrency(equity)}
        subValue={`${formatPercent(calcDrawdownPct(initialBalance, equity) * -1)} from start`}
        icon={<Wallet className="w-4 h-4" />}
        accentColor="cyan"
        loading={isLoading}
      />
      <MetricCard
        title="Daily Loss Remaining"
        value={formatCurrency(dailyLossRemaining)}
        subValue={`Limit: ${formatCurrency(maxDailyLoss)}`}
        icon={<TrendingDown className="w-4 h-4" />}
        accentColor="amber"
        loading={isLoading}
      />
      <MetricCard
        title="Max Drawdown Remaining"
        value={formatCurrency(Math.max(0, totalDrawdownRemaining))}
        subValue={`Limit: ${formatCurrency(maxTotalDrawdown)}`}
        icon={<ShieldAlert className="w-4 h-4" />}
        accentColor="crimson"
        loading={isLoading}
      />
      <MetricCard
        title="Profit Target Progress"
        value={formatCurrency(profitProgress)}
        subValue={`Target: ${formatCurrency(profitTarget)} (${formatPercent((profitProgress / profitTarget) * 100, 1)})`}
        icon={<Target className="w-4 h-4" />}
        accentColor="success"
        loading={isLoading}
      />
    </div>
  );
}
