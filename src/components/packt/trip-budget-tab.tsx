"use client";

import type { ReactElement } from "react";
import type { Budget } from "@/data/types";
import { Button } from "@/components/ui/button";

export interface TripBudgetTabProps {
  budget?: Budget;
  onOpenEditBudget: () => void;
}

function formatBudgetAmount(budget: Budget): string {
  if (budget.total == null) {
    return "";
  }

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: budget.currency,
      maximumFractionDigits: 2,
    }).format(budget.total);
  } catch {
    const safeTotal = Number.isFinite(budget.total) ? budget.total.toFixed(2) : "??";
    return `${budget.currency} ${safeTotal}`;
  }
}

export function TripBudgetTab({ budget, onOpenEditBudget }: TripBudgetTabProps): ReactElement {
  if (!budget || budget.total == null) {
    return (
      <div className="rounded-2xl p-5" style={{ border: "1px solid var(--line)", background: "var(--surface)" }}>
        <p style={{ color: "var(--fg-2)", fontSize: "calc(14px * var(--font-scale))" }}>No budget set yet.</p>
        <Button type="button" variant="link" className="mt-2 px-0" onClick={onOpenEditBudget}>
          Set a budget
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl p-5" style={{ border: "1px solid var(--line)", background: "var(--surface)" }}>
      <p
        style={{
          color: "var(--fg-3)",
          fontSize: "calc(12px * var(--font-scale))",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        Budget total
      </p>
      <div className="mt-3 flex items-end justify-between gap-4">
        <div>
          <p style={{ color: "var(--fg-4)", fontSize: "calc(12px * var(--font-scale))" }}>{budget.currency}</p>
          <p style={{ color: "var(--fg)", fontSize: "calc(32px * var(--font-scale))", fontWeight: 600 }}>
            {formatBudgetAmount(budget)}
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onOpenEditBudget}>
          Edit budget
        </Button>
      </div>
    </div>
  );
}
