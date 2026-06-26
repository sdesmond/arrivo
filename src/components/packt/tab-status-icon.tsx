"use client";

import type { ReactElement } from "react";
import { CircleX, TriangleAlert } from "lucide-react";
import { BudgetStatus } from "@/data/types";

export interface TabStatusIconProps {
  status: BudgetStatus;
  actual: number;
  budgetTotal: number;
}

const ICON_CONTENT = {
  [BudgetStatus.Warning]: { Icon: TriangleAlert, label: "Warning", color: "var(--warning)" },
  [BudgetStatus.Danger]: { Icon: CircleX, color: "var(--destructive)" },
} as const;

export function TabStatusIcon({ status, actual, budgetTotal }: TabStatusIconProps): ReactElement | null {
  if (status === BudgetStatus.Neutral) {
    return null;
  }

  const { Icon, color } = ICON_CONTENT[status];
  const label =
    status === BudgetStatus.Danger
      ? actual >= budgetTotal
        ? "Over budget"
        : "Near limit"
      : ICON_CONTENT[status].label;

  return (
    <>
      <Icon size={14} strokeWidth={1.5} color={color} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </>
  );
}
