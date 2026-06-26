"use client";

import type { ReactElement } from "react";
import { CircleX, TriangleAlert } from "lucide-react";
import { BudgetStatus } from "@/data/types";

export interface StatusBadgeProps {
  status: Exclude<BudgetStatus, typeof BudgetStatus.Neutral>;
  actual: number;
  budgetTotal: number;
}

const BADGE_CONTENT = {
  [BudgetStatus.Warning]: {
    Icon: TriangleAlert,
    label: "Warning",
    bg: "var(--warning-soft)",
    ink: "var(--warning-ink)",
  },
  [BudgetStatus.Danger]: { Icon: CircleX, bg: "var(--danger-soft)", ink: "var(--danger-ink)" },
} as const;

export function StatusBadge({ status, actual, budgetTotal }: StatusBadgeProps): ReactElement {
  const { Icon, bg, ink } = BADGE_CONTENT[status];
  const label =
    status === BudgetStatus.Danger
      ? actual >= budgetTotal
        ? "Over budget"
        : "Near limit"
      : BADGE_CONTENT[status].label;

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
      style={{
        backgroundColor: bg,
        color: ink,
        fontSize: "calc(12px * var(--font-scale))",
        fontWeight: 600,
      }}
    >
      <Icon size={14} strokeWidth={1.5} aria-hidden="true" />
      {label}
    </span>
  );
}
