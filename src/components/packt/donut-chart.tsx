"use client";

import type { ReactElement } from "react";
import { Cell, Pie, PieChart, Tooltip } from "recharts";
import { ChartContainer, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

export interface DonutChartProps {
  data: { name: string; value: number; color: string }[];
  centerFigure: string;
  centerLabel?: string;
  formatValue?: (value: number) => string;
  accessibleLabel: string;
}

export function DonutChart({
  data,
  centerFigure,
  centerLabel,
  formatValue,
  accessibleLabel,
}: DonutChartProps): ReactElement {
  const formatter = formatValue ?? ((value: number) => String(value));

  const chartConfig: ChartConfig = {};
  for (const segment of data) {
    chartConfig[segment.name] = { label: segment.name, color: segment.color };
  }

  return (
    <div data-slot="donut-chart" className="flex flex-col items-center gap-4">
      <ChartContainer config={chartConfig} className="mx-auto aspect-square w-full" style={{ maxHeight: 260 }}>
        <PieChart role="img" aria-label={accessibleLabel}>
          <Tooltip
            content={
              <ChartTooltipContent
                hideLabel
                formatter={(value, name) => (
                  <div className="flex w-full items-center justify-between gap-3">
                    <span style={{ color: "var(--fg-3)" }}>{name}</span>
                    <span style={{ color: "var(--fg)", fontWeight: 600 }}>{formatter(Number(value))}</span>
                  </div>
                )}
              />
            }
          />
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="60%" outerRadius="100%" strokeWidth={2}>
            {data.map((segment) => (
              <Cell key={segment.name} fill={segment.color} />
            ))}
          </Pie>
          <text x="50%" y="50%" textAnchor="middle">
            <tspan
              x="50%"
              dy={centerLabel ? "-0.3em" : "0.3em"}
              style={{ fontSize: 20, fontWeight: 600, fill: "var(--fg)" }}
            >
              {centerFigure}
            </tspan>
            {centerLabel ? (
              <tspan x="50%" dy="1.4em" style={{ fontSize: 12, fill: "var(--fg-3)" }}>
                {centerLabel}
              </tspan>
            ) : null}
          </text>
        </PieChart>
      </ChartContainer>
      <div className="flex w-full flex-wrap justify-center gap-x-5 gap-y-2">
        {data.map((segment) => (
          <div key={segment.name} data-slot="donut-chart-legend-item" className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: segment.color }}
            />
            <span style={{ color: "var(--fg)" }}>{segment.name}</span>
            <span style={{ color: "var(--fg-3)" }}>{formatter(segment.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
