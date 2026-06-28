import type { ReactElement } from "react";
import type { SpendingSummary } from "@/data/types";
import { cn, formatCurrency, pluralize } from "@/lib/utils";

export interface SpendingHeadlineFiguresProps {
  summary: SpendingSummary;
  currency: string;
  dateFormat: string;
}

function formatTripDuration(days: number): string {
  const rounded = Math.round(days * 10) / 10;
  return `${rounded} ${pluralize(rounded, "day")}`;
}

export function SpendingHeadlineFigures({ summary, currency }: SpendingHeadlineFiguresProps): ReactElement {
  const figures: { label: string; display: string }[] = [
    { label: "Total Spend", display: formatCurrency(summary.totalSpend, currency) },
    { label: "Average Trip Spend", display: formatCurrency(summary.averageTripSpend, currency) },
    {
      label: "Average Daily Spend",
      display: summary.averageDailySpend === null ? "—" : formatCurrency(summary.averageDailySpend, currency),
    },
    {
      label: "Average Days per Trip",
      display: summary.averageTripDuration === null ? "—" : formatTripDuration(summary.averageTripDuration),
    },
  ];

  return (
    <div
      data-slot="spending-headline-figures"
      className="grid gap-3"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}
    >
      {figures.map((figure) => (
        <div
          key={figure.label}
          className={cn("rounded-xl p-4")}
          style={{ border: "1px solid var(--line)", background: "var(--surface)" }}
        >
          <p style={{ color: "var(--fg-3)", fontSize: "calc(12px * var(--font-scale))" }}>{figure.label}</p>
          <p
            className="mt-1"
            style={{ color: "var(--fg)", fontSize: "calc(20px * var(--font-scale))", fontWeight: 600 }}
          >
            {figure.display}
          </p>
        </div>
      ))}
    </div>
  );
}
