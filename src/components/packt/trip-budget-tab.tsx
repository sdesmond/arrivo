"use client";

import { useState } from "react";
import type { ReactElement } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { BudgetStatus } from "@/data/types";
import type { Budget, Expense, Reservation, TripEvent } from "@/data/types";
import { Button } from "@/components/ui/button";
import { BudgetProgressBar } from "@/components/packt/budget-progress-bar";
import { StatusBadge } from "@/components/packt/status-badge";
import { TripAddExpenseModal } from "@/components/packt/trip-add-expense-modal";
import { ExpenseTable } from "@/components/packt/expense-table";
import { useNow } from "@/components/providers/mock-date-provider";
import { recalculateConversions } from "@/app/(app)/trips/[tripId]/budget/actions";
import {
  calculateActual,
  calculateBudgetStatus,
  calculateCategoryBreakdown,
  hasCurrencyMismatch,
  CATEGORY_LABELS,
  DEFAULT_WARNING_THRESHOLD,
  DEFAULT_DANGER_THRESHOLD,
} from "@/lib/budget";
import { cn, formatCurrency } from "@/lib/utils";

export interface TripBudgetTabProps {
  tripId: string;
  budget?: Budget;
  expenses: Expense[];
  events?: TripEvent[];
  reservations?: Reservation[];
  dateFormat?: string;
  defaultExpenseCurrency?: string;
  warningThreshold?: number;
  dangerThreshold?: number;
  onOpenEditBudget: () => void;
  onEditExpense?: (expense: Expense) => void;
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
  events = [],
  reservations = [],
  dateFormat,
  defaultExpenseCurrency,
  warningThreshold = DEFAULT_WARNING_THRESHOLD,
  dangerThreshold = DEFAULT_DANGER_THRESHOLD,
  onOpenEditBudget,
  onEditExpense,
}: TripBudgetTabProps): ReactElement {
  const tripCurrency = resolveTripCurrency(budget, expenses);
  const actual = calculateActual(expenses, tripCurrency);
  const breakdown = calculateCategoryBreakdown(expenses, tripCurrency);
  const hasBudget = !!budget && (budget.total ?? 0) > 0 && !!budget.currency;
  const budgetStatus = hasBudget
    ? calculateBudgetStatus(actual, budget.total!, warningThreshold, dangerThreshold)
    : BudgetStatus.Neutral;
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const now = useNow();
  const showRecalculate = hasCurrencyMismatch(expenses, tripCurrency, now);

  function handleExpenseModalOpenChange(open: boolean): void {
    if (!open) {
      setShowAddExpenseModal(false);
      setEditingExpense(null);
    }
  }

  function handleEditExpense(expense: Expense): void {
    setEditingExpense(expense);
    onEditExpense?.(expense);
  }

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

  const addMiscExpenseButton = (
    <div className="flex justify-end">
      <Button type="button" onClick={() => setShowAddExpenseModal(true)}>
        Add Misc Expense
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {showRecalculate ? (
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" disabled={isRecalculating} onClick={handleRecalculate}>
            {isRecalculating ? <Loader2 className="animate-spin" strokeWidth={1.5} aria-hidden="true" /> : null}
            {isRecalculating ? "Recalculating..." : "Recalculate Conversions"}
          </Button>
        </div>
      ) : null}

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
                {formatCurrency(actual, tripCurrency)}
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
                  <span style={{ color: "var(--fg-2)" }}>{formatCurrency(budget.total!, tripCurrency)}</span>
                </p>
                <p style={{ fontSize: "calc(13px * var(--font-scale))" }}>
                  <span style={{ color: "var(--fg-4)" }}>Remaining</span>{" "}
                  <span style={{ color: "var(--fg-2)" }}>{formatCurrency(budget.total! - actual, tripCurrency)}</span>
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
        <>
          {addMiscExpenseButton}
          <p style={{ color: "var(--fg-2)", fontSize: "calc(14px * var(--font-scale))" }}>No expenses yet</p>
        </>
      ) : (
        <>
          <div
            data-slot="category-tile-grid"
            className="grid gap-3"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}
          >
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
                  {formatCurrency(tile.subtotal, tripCurrency)}
                </p>
              </div>
            ))}
          </div>

          {addMiscExpenseButton}

          <ExpenseTable
            expenses={expenses}
            tripId={tripId}
            events={events}
            reservations={reservations}
            tripCurrency={tripCurrency}
            dateFormat={dateFormat}
            onEditExpense={handleEditExpense}
          />
        </>
      )}

      <TripAddExpenseModal
        tripId={tripId}
        defaultCurrency={defaultExpenseCurrency}
        expense={editingExpense ?? undefined}
        open={showAddExpenseModal || editingExpense !== null}
        onOpenChange={handleExpenseModalOpenChange}
      />
    </div>
  );
}
