import { MetricCards } from "@/components/dashboard/metric-cards";
import { EquityChart } from "@/components/dashboard/equity-chart";
import { TradeTable } from "@/components/dashboard/trade-table";
import { OrderTicket } from "@/components/dashboard/order-ticket";
import { MarketDataStatus } from "@/components/dashboard/market-data-status";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <MarketDataStatus />
      <MetricCards />
      <OrderTicket />
      <EquityChart />
      <TradeTable />
    </div>
  );
}
