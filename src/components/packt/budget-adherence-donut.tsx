"use client";

import type { ReactElement } from "react";
import { ChartCard } from "@/components/ui/chart-card";
import { DonutChart } from "@/components/packt/donut-chart";

export interface BudgetAdherenceDonutProps {
  data: { underBudget: number; onBudget: number; overBudget: number };
}

function pluralizeTrips(count: number): string {
  return count === 1 ? "trip" : "trips";
}

export function BudgetAdherenceDonut({ data }: BudgetAdherenceDonutProps): ReactElement {
  const { underBudget, onBudget, overBudget } = data;
  const total = underBudget + onBudget + overBudget;

  const segments = [
    { name: "Under budget", value: underBudget, color: "var(--accent-brand)" },
    { name: "On budget", value: onBudget, color: "var(--warning)" },
    { name: "Over budget", value: overBudget, color: "var(--destructive)" },
  ].sort((first, second) => second.value - first.value);

  const accessibleLabel = `Budget adherence donut chart: Under budget ${underBudget} ${pluralizeTrips(
    underBudget
  )}, On budget ${onBudget} ${pluralizeTrips(onBudget)}, Over budget ${overBudget} ${pluralizeTrips(overBudget)}`;

  return (
    <ChartCard title="Budget Adherence">
      <DonutChart
        data={segments}
        centerFigure={String(total)}
        centerLabel={total === 1 ? "Trip" : "Trips"}
        accessibleLabel={accessibleLabel}
      />
      <p className="mt-2 text-center" style={{ color: "var(--fg-3)", fontSize: "0.8125rem" }}>
        On budget means within 2% of the budget total
      </p>
    </ChartCard>
  );
}
