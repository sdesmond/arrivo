"use client";

import type { ReactElement } from "react";
import type { ExpenseCategory } from "@/data/types";
import { CATEGORY_CHART_COLORS, CATEGORY_LABELS } from "@/lib/budget";
import { ChartCard } from "@/components/ui/chart-card";
import { DonutChart } from "@/components/packt/donut-chart";

export interface CategoryBreakdownDonutProps {
  data: { category: ExpenseCategory; total: number; count: number }[];
  formatCurrency: (amount: number) => string;
}

export function CategoryBreakdownDonut({ data, formatCurrency }: CategoryBreakdownDonutProps): ReactElement | null {
  const segments = data
    .filter((entry) => entry.total > 0)
    .sort((first, second) => second.total - first.total)
    .map((entry) => ({
      name: CATEGORY_LABELS[entry.category],
      value: entry.total,
      color: CATEGORY_CHART_COLORS[entry.category],
    }));

  if (segments.length === 0) {
    return null;
  }

  const totalSpend = segments.reduce((sum, segment) => sum + segment.value, 0);
  const accessibleLabel = `Category breakdown donut chart: ${segments
    .map((segment) => `${segment.name} ${formatCurrency(segment.value)}`)
    .join(", ")}`;

  return (
    <ChartCard>
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
