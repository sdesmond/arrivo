"use client";

import { useState } from "react";
import type { ReactElement } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { BudgetStatus, ExpenseCategory } from "@/data/types";
import type { Budget, Expense } from "@/data/types";
import { Button } from "@/components/ui/button";
import { BudgetProgressBar } from "@/components/packt/budget-progress-bar";
import { StatusBadge } from "@/components/packt/status-badge";
import { TripAddExpenseModal } from "@/components/packt/trip-add-expense-modal";
import { useNow } from "@/components/providers/mock-date-provider";
import { recalculateConversions } from "@/app/(app)/trips/[tripId]/budget/actions";
import {
  calculateActual,
  calculateBudgetStatus,
  calculateCategoryBreakdown,
  hasCurrencyMismatch,
  DEFAULT_WARNING_THRESHOLD,
  DEFAULT_DANGER_THRESHOLD,
} from "@/lib/budget";
import { cn } from "@/lib/utils";

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  [ExpenseCategory.Food]: "Food",
  [ExpenseCategory.Lodging]: "Lodging",
  [ExpenseCategory.Transport]: "Transport",
  [ExpenseCategory.Activity]: "Activity",
  [ExpenseCategory.Sightseeing]: "Sightseeing",
  [ExpenseCategory.Gas]: "Gas",
  [ExpenseCategory.Groceries]: "Groceries",
  [ExpenseCategory.Flights]: "Flights",
  [ExpenseCategory.CarRental]: "Car Rental",
  [ExpenseCategory.Shopping]: "Shopping",
  [ExpenseCategory.Misc]: "Misc",
};

export interface TripBudgetTabProps {
  tripId: string;
  budget?: Budget;
  expenses: Expense[];
  defaultExpenseCurrency?: string;
  warningThreshold?: number;
  dangerThreshold?: number;
  onOpenEditBudget: () => void;
}

function formatCurrencyAmount(amount: number, currency: string): string {
  if (!Number.isFinite(amount)) {
    return `${currency} ??`;
  }
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    const safeAmount = amount.toFixed(2);
    return `${currency} ${safeAmount}`;
  }
}

function resolveTripCurrency(budget: Budget | undefined, expenses: Expense[]): string {
  if (budget?.currency) {
    return budget.currency;
  }

  const converted = expenses.find((expense) => expense.convertedCurrencyTrip)?.convertedCurrencyTrip;
  return converted ?? expenses[0]?.currency ?? "USD";
}

export function TripBudgetTab({
  tripId,
  budget,
  expenses,
  defaultExpenseCurrency,
  warningThreshold = DEFAULT_WARNING_THRESHOLD,
  dangerThreshold = DEFAULT_DANGER_THRESHOLD,
  onOpenEditBudget,
}: TripBudgetTabProps): ReactElement {
  const tripCurrency = resolveTripCurrency(budget, expenses);
  const actual = calculateActual(expenses, tripCurrency);
  const breakdown = calculateCategoryBreakdown(expenses, tripCurrency);
  const hasBudget = !!budget && (budget.total ?? 0) > 0 && !!budget.currency;
  const budgetStatus = hasBudget
    ? calculateBudgetStatus(actual, budget.total!, warningThreshold, dangerThreshold)
    : BudgetStatus.Neutral;
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const now = useNow();
  const showRecalculate = hasCurrencyMismatch(expenses, tripCurrency, now);

  async function handleRecalculate(): Promise<void> {
    setIsRecalculating(true);
    try {
      await recalculateConversions(tripId);
      toast.success("Conversions recalculated.");
    } catch {
      toast.error("Recalculation failed — no amounts were changed. Try again.");
    } finally {
      setIsRecalculating(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end gap-2">
        {showRecalculate ? (
          <Button type="button" variant="secondary" size="sm" disabled={isRecalculating} onClick={handleRecalculate}>
            {isRecalculating ? <Loader2 className="animate-spin" strokeWidth={1.5} aria-hidden="true" /> : null}
            {isRecalculating ? "Recalculating..." : "Recalculate Conversions"}
          </Button>
        ) : null}
        <Button type="button" onClick={() => setShowAddExpenseModal(true)}>
          Add Misc Expense
        </Button>
      </div>

      <div className="rounded-2xl p-5" style={{ border: "1px solid var(--line)", background: "var(--surface)" }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p
              style={{
                color: "var(--fg-3)",
                fontSize: "calc(12px * var(--font-scale))",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Actual spent
            </p>
            <div className="mt-1 flex items-center gap-2">
              <p style={{ color: "var(--fg)", fontSize: "calc(32px * var(--font-scale))", fontWeight: 600 }}>
                {formatCurrencyAmount(actual, tripCurrency)}
              </p>
              {hasBudget && budgetStatus !== BudgetStatus.Neutral ? (
                <StatusBadge status={budgetStatus} actual={actual} budgetTotal={budget.total!} />
              ) : null}
            </div>

            {hasBudget ? (
              <div className="mt-2">
                <BudgetProgressBar status={budgetStatus} actual={actual} budgetTotal={budget.total!} />
              </div>
            ) : null}

            {hasBudget ? (
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
                <p style={{ fontSize: "calc(13px * var(--font-scale))" }}>
                  <span style={{ color: "var(--fg-4)" }}>Budget</span>{" "}
                  <span style={{ color: "var(--fg-2)" }}>{formatCurrencyAmount(budget.total!, tripCurrency)}</span>
                </p>
                <p style={{ fontSize: "calc(13px * var(--font-scale))" }}>
                  <span style={{ color: "var(--fg-4)" }}>Remaining</span>{" "}
                  <span style={{ color: "var(--fg-2)" }}>
                    {formatCurrencyAmount(budget.total! - actual, tripCurrency)}
                  </span>
                </p>
              </div>
            ) : (
              <Button type="button" variant="link" className="mt-2 px-0" onClick={onOpenEditBudget}>
                Set a budget
              </Button>
            )}
          </div>

          {hasBudget ? (
            <Button type="button" variant="ghost" size="sm" onClick={onOpenEditBudget}>
              Edit budget
            </Button>
          ) : null}
        </div>
      </div>

      {expenses.length === 0 ? (
        <p style={{ color: "var(--fg-2)", fontSize: "calc(14px * var(--font-scale))" }}>No expenses yet</p>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
          {breakdown.map((tile) => (
            <div
              key={tile.category}
              className={cn("rounded-xl p-4")}
              style={{ border: "1px solid var(--line)", background: "var(--surface)" }}
            >
              <p style={{ color: "var(--fg-3)", fontSize: "calc(12px * var(--font-scale))" }}>
                {CATEGORY_LABELS[tile.category]}
              </p>
              <p
                className="mt-1"
                style={{ color: "var(--fg)", fontSize: "calc(20px * var(--font-scale))", fontWeight: 600 }}
              >
                {formatCurrencyAmount(tile.subtotal, tripCurrency)}
              </p>
            </div>
          ))}
        </div>
      )}

      <TripAddExpenseModal
        tripId={tripId}
        defaultCurrency={defaultExpenseCurrency}
        open={showAddExpenseModal}
        onOpenChange={setShowAddExpenseModal}
      />
    </div>
  );
}
