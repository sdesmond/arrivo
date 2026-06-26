"use client";

import type { ReactElement } from "react";
import { BudgetStatus } from "@/data/types";

export interface BudgetProgressBarProps {
  status: BudgetStatus;
  actual: number;
  budgetTotal: number;
}

const FILL_COLOR: Record<BudgetStatus, string> = {
  [BudgetStatus.Neutral]: "var(--accent-brand)",
  [BudgetStatus.Warning]: "var(--warning)",
  [BudgetStatus.Danger]: "var(--destructive)",
};

export function BudgetProgressBar({ status, actual, budgetTotal }: BudgetProgressBarProps): ReactElement {
  const rawPercentage = budgetTotal > 0 ? (actual / budgetTotal) * 100 : 0;
  const widthPercentage = Math.min(Math.max(rawPercentage, 0), 100);

  return (
    <div
      data-slot="budget-progress-bar"
      aria-hidden="true"
      className="h-2 w-full rounded-full"
      style={{ background: "var(--surface-2)" }}
    >
      <div
        data-slot="budget-progress-bar-fill"
        className="h-full rounded-full"
        style={{ width: `${widthPercentage}%`, backgroundColor: FILL_COLOR[status] }}
      />
    </div>
  );
}
