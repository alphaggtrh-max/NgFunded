"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type LineData,
} from "lightweight-charts";
import { useQuery } from "@tanstack/react-query";
import { useAccountStore } from "@/store/account-store";
import type { EquityDataPoint } from "@/types";

export function EquityChart() {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartApiRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  const { selectedAccount } = useAccountStore();
  const accountId = selectedAccount?.accountId;

  const { data, isLoading } = useQuery({
    queryKey: ["metrics", accountId],
    queryFn: async () => {
      if (!accountId) return null;
      const res = await fetch(`/api/metrics?accountId=${accountId}`);
      if (!res.ok) throw new Error("Failed to fetch metrics");
      const json = await res.json();
      return json.data as { metrics: unknown; equityCurve: EquityDataPoint[] };
    },
    enabled: !!accountId,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!chartRef.current) return;

    const chart = createChart(chartRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#9B8FA8",
        fontFamily: "'JetBrains Mono', monospace",
      },
      grid: {
        vertLines: { color: "#2A2430" },
        horzLines: { color: "#2A2430" },
      },
      crosshair: {
        vertLine: { color: "#E63946", labelBackgroundColor: "#E63946" },
        horzLine: { color: "#E63946", labelBackgroundColor: "#E63946" },
      },
      rightPriceScale: { borderColor: "#2A2430" },
      timeScale: { borderColor: "#2A2430", timeVisible: true },
      width: chartRef.current.clientWidth,
      height: 300,
    });

    const series = chart.addLineSeries({
      color: "#00F5D4",
      lineWidth: 2,
      crosshairMarkerRadius: 5,
      crosshairMarkerBorderColor: "#00F5D4",
      crosshairMarkerBackgroundColor: "#0B080C",
      priceLineVisible: false,
      lastValueVisible: true,
    });

    chartApiRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    ro.observe(chartRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartApiRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current || !data?.equityCurve?.length) return;
    const lineData: LineData[] = data.equityCurve.map((p) => ({
      time: p.time as LineData["time"],
      value: p.value,
    }));
    seriesRef.current.setData(lineData);
    chartApiRef.current?.timeScale().fitContent();
  }, [data]);

  return (
    <div className="glass-panel p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-mono uppercase tracking-widest text-text-muted">
          Equity Curve
        </h2>
        <span className="text-xs text-text-muted font-mono">
          {accountId ? `Account ${selectedAccount?.accountId}` : "No account selected"}
        </span>
      </div>
      <div className="chart-container relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface/50 z-10">
            <span className="text-xs font-mono text-text-muted animate-pulse">Loading chart...</span>
          </div>
        )}
        <div ref={chartRef} className="w-full" style={{ height: 300 }} />
      </div>
    </div>
  );
}
