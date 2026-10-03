import { MetricCards } from "@/components/dashboard/metric-cards";
import { EquityChart } from "@/components/dashboard/equity-chart";
import { TradeTable } from "@/components/dashboard/trade-table";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* 4-card metrics grid */}
      <MetricCards />

      {/* Equity curve */}
      <EquityChart />

      {/* Trade journal table */}
      <TradeTable />
    </div>
  );
}
