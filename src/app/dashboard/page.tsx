"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  ChevronDown,
  Clock3,
  Crosshair,
  ShieldCheck,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { LiveMarketChart } from "@/components/dashboard/live-market-chart";

const equitySeries = [
  100000, 100420, 100180, 100760, 101140, 100930, 101520, 101860,
  102240, 101980, 102760, 103180, 102940, 103620, 104120, 103880,
  104760, 105140, 105420, 106080, 105760, 106430, 106920, 107380,
];

const trades = [
  { symbol: "EURUSD", side: "BUY", size: "1.20", entry: "1.17142", exit: "1.17418", pnl: 331.2, time: "12:42" },
  { symbol: "XAUUSD", side: "SELL", size: "0.50", entry: "3858.40", exit: "3851.70", pnl: 335.0, time: "11:18" },
  { symbol: "NAS100", side: "BUY", size: "0.80", entry: "24782.2", exit: "24754.1", pnl: -224.8, time: "10:36" },
  { symbol: "GBPUSD", side: "SELL", size: "0.75", entry: "1.34392", exit: "1.34186", pnl: 154.5, time: "09:51" },
];

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function Sparkline({ data }: { data: number[] }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * 100;
    const y = 92 - ((value - min) / Math.max(max - min, 1)) * 72;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full overflow-visible">
      <defs>
        <linearGradient id="equity-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00F5D4" stopOpacity="0.20" />
          <stop offset="100%" stopColor="#00F5D4" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,100 ${points} 100,100`} fill="url(#equity-fill)" />
      <polyline points={points} fill="none" stroke="#00F5D4" strokeWidth="1.7" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Metric({ label, value, sub, icon: Icon, tone = "cyan" }: { label: string; value: string; sub: string; icon: typeof Wallet; tone?: "cyan" | "amber" | "crimson" | "success" }) {
  const tones = {
    cyan: "text-cyan bg-cyan/10 border-cyan/20",
    amber: "text-amber bg-amber/10 border-amber/20",
    crimson: "text-crimson bg-crimson/10 border-crimson/20",
    success: "text-success bg-success/10 border-success/20",
  };
  return (
    <div className="rounded-2xl border border-border bg-surface/80 p-5 transition hover:border-border-bright hover:bg-surface-elevated/70">
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-muted">{label}</span>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl border ${tones[tone]}`}><Icon className="h-4 w-4" /></span>
      </div>
      <div className="mt-5 text-2xl font-semibold tracking-tight text-text-primary">{value}</div>
      <div className="mt-1 text-xs text-text-secondary">{sub}</div>
    </div>
  );
}

export default function DashboardPage() {
  const [range, setRange] = useState("24H");
  const [account, setAccount] = useState("NGF-100042");
  const [symbol, setSymbol] = useState("EURUSD");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [quantity, setQuantity] = useState("1.00");
  const [notice, setNotice] = useState("");

  const currentEquity = equitySeries[equitySeries.length - 1];
  const initial = 100000;
  const gain = currentEquity - initial;
  const target = 8000;
  const targetProgress = Math.min((gain / target) * 100, 100);
  const drawdownUsed = Math.max(0, initial - Math.min(...equitySeries));
  const drawdownRemaining = 10000 - drawdownUsed;
  const dailyLoss = 740;

  const quote = useMemo(() => symbol === "EURUSD" ? { bid: "1.17418", ask: "1.17421" } : symbol === "XAUUSD" ? { bid: "3851.70", ask: "3852.10" } : { bid: "24782.2", ask: "24782.8" }, [symbol]);

  function submitOrder() {
    setNotice(`${side} ${quantity} ${symbol} paper order accepted at ${side === "BUY" ? quote.ask : quote.bid}.`);
    window.setTimeout(() => setNotice(""), 3500);
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-mono uppercase tracking-[0.2em] text-cyan">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan" /> Live paper environment
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-text-primary">Trading Overview</h1>
          <p className="mt-1 text-sm text-text-secondary">Real-time challenge monitoring with simulated execution.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <select value={account} onChange={(e) => setAccount(e.target.value)} className="appearance-none rounded-xl border border-border bg-surface px-4 py-2.5 pr-10 text-sm font-mono text-text-primary outline-none transition focus:border-crimson">
              <option>NGF-100042</option><option>NGF-100031</option><option>NGF-100018</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-text-muted" />
          </div>
          <span className="badge-active flex items-center gap-1.5"><Activity className="h-3 w-3" /> ACTIVE</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Equity" value={money(currentEquity)} sub={`+$${gain.toLocaleString()} · +${((gain / initial) * 100).toFixed(2)}%`} icon={Wallet} />
        <Metric label="Daily Loss Remaining" value={money(5000 - dailyLoss)} sub={`$5,000 limit · ${((dailyLoss / 5000) * 100).toFixed(1)}% used`} icon={TrendingUp} tone="amber" />
        <Metric label="Max Drawdown Remaining" value={money(drawdownRemaining)} sub={`$10,000 limit · ${(drawdownUsed / 10000 * 100).toFixed(1)}% used`} icon={ShieldCheck} tone="crimson" />
        <Metric label="Profit Target" value={`${targetProgress.toFixed(1)}%`} sub={`${money(gain)} of ${money(target)} target`} icon={Target} tone="success" />
      </div>

      <LiveMarketChart />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-2xl border border-border bg-surface/80 p-5 shadow-glass">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-cyan" /><h2 className="font-medium">Equity curve</h2></div>
              <p className="mt-1 text-xs text-text-muted">Account performance · {range}</p>
            </div>
            <div className="flex rounded-lg border border-border bg-background/60 p-1">
              {["1H", "24H", "7D", "ALL"].map((item) => <button key={item} onClick={() => setRange(item)} className={`rounded-md px-3 py-1.5 text-[11px] font-mono transition ${range === item ? "bg-cyan/10 text-cyan" : "text-text-muted hover:text-text-primary"}`}>{item}</button>)}
            </div>
          </div>
          <div className="mt-6 h-[290px] rounded-xl border border-border/60 bg-background/50 p-4">
            <Sparkline data={equitySeries} />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-4 text-xs">
            <div><span className="text-text-muted">Start</span><div className="mt-1 font-mono text-text-primary">$100,000</div></div>
            <div><span className="text-text-muted">High</span><div className="mt-1 font-mono text-cyan">$107,380</div></div>
            <div><span className="text-text-muted">Return</span><div className="mt-1 font-mono text-cyan">+7.38%</div></div>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-surface/80 p-5">
          <div className="flex items-center justify-between"><div><h2 className="font-medium">Paper order</h2><p className="mt-1 text-xs text-text-muted">Execution uses live quotes, no live orders.</p></div><Crosshair className="h-5 w-5 text-cyan" /></div>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button onClick={() => setSide("BUY")} className={`rounded-xl border py-3 text-sm font-semibold transition ${side === "BUY" ? "border-cyan/50 bg-cyan/10 text-cyan" : "border-border text-text-muted"}`}>BUY</button>
            <button onClick={() => setSide("SELL")} className={`rounded-xl border py-3 text-sm font-semibold transition ${side === "SELL" ? "border-crimson/50 bg-crimson/10 text-crimson" : "border-border text-text-muted"}`}>SELL</button>
          </div>
          <label className="mt-4 block text-xs text-text-muted">Instrument<select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-text-primary outline-none focus:border-crimson"><option>EURUSD</option><option>GBPUSD</option><option>USDJPY</option><option>XAUUSD</option><option>NAS100</option></select></label>
          <label className="mt-4 block text-xs text-text-muted">Quantity<input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="decimal" className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 font-mono text-sm text-text-primary outline-none focus:border-crimson" /></label>
          <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-border bg-background/50 p-3 text-xs"><div><span className="text-text-muted">Bid</span><div className="mt-1 font-mono text-crimson">{quote.bid}</div></div><div><span className="text-text-muted">Ask</span><div className="mt-1 font-mono text-cyan">{quote.ask}</div></div></div>
          <button onClick={submitOrder} className="mt-4 w-full rounded-xl bg-crimson py-3 text-sm font-semibold text-white shadow-glow-crimson transition hover:bg-crimson/90">Place {side} order</button>
          {notice && <div className="mt-3 rounded-xl border border-cyan/20 bg-cyan/5 p-3 text-xs text-cyan">{notice}</div>}
        </section>
      </div>

      <section className="rounded-2xl border border-border bg-surface/80 p-5">
        <div className="flex items-center justify-between"><div><h2 className="font-medium">Recent trades</h2><p className="mt-1 text-xs text-text-muted">Simulated executions for {account}</p></div><button className="text-xs text-text-muted hover:text-text-primary">View all</button></div>
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="border-b border-border text-[10px] font-mono uppercase tracking-widest text-text-muted"><tr><th className="pb-3">Instrument</th><th className="pb-3">Side</th><th className="pb-3">Size</th><th className="pb-3">Entry</th><th className="pb-3">Exit</th><th className="pb-3">Time</th><th className="pb-3 text-right">P&L</th></tr></thead><tbody>{trades.map((trade) => <tr key={`${trade.symbol}-${trade.time}`} className="border-b border-border/60 last:border-0"><td className="py-4 font-medium">{trade.symbol}</td><td className="py-4"><span className={trade.side === "BUY" ? "badge-long" : "badge-short"}>{trade.side === "BUY" ? <ArrowUpRight className="mr-1 inline h-3 w-3" /> : <ArrowDownRight className="mr-1 inline h-3 w-3" />}{trade.side}</span></td><td className="py-4 font-mono text-text-secondary">{trade.size}</td><td className="py-4 font-mono text-text-secondary">{trade.entry}</td><td className="py-4 font-mono text-text-secondary">{trade.exit}</td><td className="py-4 text-text-muted"><Clock3 className="mr-1 inline h-3 w-3" />{trade.time}</td><td className={`py-4 text-right font-mono font-semibold ${trade.pnl >= 0 ? "text-cyan" : "text-crimson"}`}>{trade.pnl >= 0 ? "+" : ""}{money(trade.pnl)}</td></tr>)}</tbody></table></div>
      </section>

      <div className="rounded-xl border border-amber/20 bg-amber/5 px-4 py-3 text-xs text-amber/90"><strong>Demo environment:</strong> market prices are live via Massive; order execution and account balances remain simulated.</div>
    </div>
  );
}
