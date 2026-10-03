import { MetricCards } from "@/components/dashboard/metric-cards";
import { EquityChart } from "@/components/dashboard/equity-chart";
import { TradeTable } from "@/components/dashboard/trade-table";
import { OrderTicket } from "@/components/dashboard/order-ticket";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <MetricCards />
      <OrderTicket />
      <EquityChart />
      <TradeTable />
    </div>
  );
}
