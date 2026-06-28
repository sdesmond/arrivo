"use client";

import type { ReactElement } from "react";
import { ChartCard } from "@/components/ui/chart-card";
import { DonutChart } from "@/components/packt/donut-chart";

export interface DestinationBreakdownDonutProps {
  data: { countryCode: string | null; countryName: string; total: number }[];
  formatCurrency: (amount: number) => string;
}

function getDestinationSegmentColor(index: number, isUnknown: boolean): string {
  if (isUnknown) {
    return "var(--fg-4)";
  }
  return `var(--chart-${(index % 11) + 1})`;
}

export function DestinationBreakdownDonut({
  data,
  formatCurrency,
}: DestinationBreakdownDonutProps): ReactElement | null {
  const totalSpend = data.reduce((sum, entry) => sum + entry.total, 0);

  const segments = data
    .filter((entry) => entry.total > 0)
    .sort((first, second) => second.total - first.total)
    .map((entry, index) => ({
      name: entry.countryName,
      value: entry.total,
      color: getDestinationSegmentColor(index, entry.countryCode === null),
    }));

  if (segments.length === 0) {
    return null;
  }

  const accessibleLabel = `Destination breakdown donut chart: ${segments
    .map((segment) => `${segment.name} ${formatCurrency(segment.value)}`)
    .join(", ")}`;

  return (
    <ChartCard title="Countries">
      <DonutChart
        data={segments}
        centerFigure={formatCurrency(totalSpend)}
        centerLabel="Total Spend"
        formatValue={formatCurrency}
        accessibleLabel={accessibleLabel}
      />
    </ChartCard>
  );
}
