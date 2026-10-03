"use client";

import { useSession } from "next-auth/react";
import { useAccountStore } from "@/store/account-store";
import { formatCurrency, formatPnl, formatPercent } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Activity, ChevronDown } from "lucide-react";
import { AccountStatus } from "@prisma/client";

export function TopBar() {
  const { data: session } = useSession();
  const { selectedAccount, pnlData } = useAccountStore();

  const equity = pnlData?.equity ?? selectedAccount?.equity ?? 0;
  const initialBalance =
    typeof selectedAccount?.initialBalance === "number"
      ? selectedAccount.initialBalance
      : 0;

  const openPnl = pnlData?.openPnl ?? 0;
  const { formatted: pnlFormatted, colorClass } = formatPnl(openPnl);

  const profitTarget =
    typeof selectedAccount?.profitTarget === "number"
      ? selectedAccount.profitTarget
      : 1;
  const currentGain = equity - initialBalance;
  const progressPct = Math.min(
    Math.max((currentGain / profitTarget) * 100, 0),
    100
  );

  const status = selectedAccount?.status ?? AccountStatus.ACTIVE;

  return (
    <header className="flex items-center gap-4 px-6 py-3 border-b border-border bg-surface/80 backdrop-blur-sm sticky top-0 z-20">
      {/* Brand */}
      <div className="flex items-center gap-2 mr-4">
        <span className="text-lg font-bold text-crimson text-glow-crimson">NG</span>
        <span className="text-lg font-bold text-text-primary">Funded</span>
      </div>

      {/* Account Selector */}
      <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border hover:border-border-bright transition-colors text-sm text-text-secondary hover:text-text-primary">
        <span className="font-mono">
          {selectedAccount?.accountId ?? "Select Account"}
        </span>
        <ChevronDown className="w-3 h-3" />
      </button>

      {/* Account Type Badge */}
      {selectedAccount && (
        <span className="text-xs font-mono text-text-muted border border-border px-2 py-0.5 rounded">
          {selectedAccount.accountType.replace(/_/g, " ")}
        </span>
      )}

      <div className="flex-1" />

      {/* Live P&L */}
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4 text-cyan animate-pulse" />
        <span className={cn("text-sm font-mono font-semibold", colorClass)}>
          {pnlFormatted}
        </span>
      </div>

      {/* Challenge Progress */}
      {selectedAccount && (
        <div className="flex items-center gap-3 w-48">
          <div className="flex-1">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-text-muted">Target</span>
              <span className="text-amber font-mono">
                {formatPercent(progressPct, 1)}
              </span>
            </div>
            <div className="h-1.5 bg-surface-elevated rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber to-amber/60 rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Status Badge */}
      <span
        className={cn({
          "badge-active": status === AccountStatus.ACTIVE,
          "badge-breached": status === AccountStatus.BREACHED,
          "badge-passed": status === AccountStatus.PASSED,
        })}
      >
        {status}
      </span>

      {/* User */}
      <div className="w-8 h-8 rounded-full bg-crimson/20 border border-crimson/30 flex items-center justify-center text-xs font-bold text-crimson">
        {session?.user?.name?.charAt(0) ?? "U"}
      </div>
    </header>
  );
}
