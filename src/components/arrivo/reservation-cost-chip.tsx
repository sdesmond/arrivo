"use client";

import { useState, useEffect } from "react";
import { DollarSign } from "lucide-react";
import { toast } from "sonner";
import { IconSize } from "@/lib/size-tokens";
import { createExpense, deleteExpense, updateExpense } from "@/app/(app)/trips/[tripId]/budget/actions";
import { CostDialog } from "@/components/arrivo/cost-dialog";
import type { CreateExpenseInput, Expense } from "@/data/types";
import { formatCurrencyChipAmount } from "@/lib/currencies";

export interface ReservationCostChipProps {
  reservationId: string;
  tripId: string;
  expense?: Expense;
  defaultCurrency?: string;
}

export function ReservationCostChip({
  reservationId,
  tripId,
  expense: initialExpense,
  defaultCurrency,
}: ReservationCostChipProps) {
  const [expense, setExpense] = useState<Expense | undefined>(initialExpense);
  const [showCostDialog, setShowCostDialog] = useState(false);
  const costDisplay = expense ? formatCurrencyChipAmount(expense.amount, expense.currency) : "";

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setExpense(initialExpense);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [initialExpense]);

  async function handleExpenseSave(expenseInput: CreateExpenseInput): Promise<void> {
    try {
      if (expense?.id) {
        const updateResult = await updateExpense(expense.id, { ...expenseInput, reservationId });
        if (updateResult?.conversionError) {
          toast.error("Couldn't convert currency — try again.");
        }
        setExpense({
          ...expense,
          ...expenseInput,
          reservationId,
          convertedAmountTrip: expenseInput.convertedAmountTrip ?? undefined,
          conversionRateTrip: expenseInput.conversionRateTrip ?? undefined,
          convertedCurrencyTrip: expenseInput.convertedCurrencyTrip ?? undefined,
          convertedAmountProfile: expenseInput.convertedAmountProfile ?? undefined,
          conversionRateProfile: expenseInput.conversionRateProfile ?? undefined,
          convertedCurrencyProfile: expenseInput.convertedCurrencyProfile ?? undefined,
        });
        return;
      }

      const createResult = await createExpense(tripId, {
        ...expenseInput,
        reservationId,
      });
      if (createResult.conversionError) {
        toast.error("Couldn't convert currency — try again.");
      }
      setExpense({
        id: createResult.id,
        tripId,
        reservationId,
        category: expenseInput.category,
        amount: expenseInput.amount,
        currency: expenseInput.currency,
        date: expenseInput.date,
        note: expenseInput.note,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save.");
      throw error;
    }
  }

  async function handleExpenseRemove(): Promise<void> {
    if (!expense?.id) {
      return;
    }

    try {
      await deleteExpense(expense.id);
      setExpense(undefined);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save.");
      throw error;
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowCostDialog(true)}
        className="flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors hover:bg-surface-2"
        style={{
          fontSize: "calc(var(--fs-action-chip) * var(--font-scale))",
          color: expense ? "var(--accent-ink)" : "var(--fg-4)",
          background: expense ? "var(--accent-soft)" : "none",
          border: "1px solid transparent",
        }}
      >
        {expense ? (
          costDisplay
        ) : (
          <>
            <DollarSign size={IconSize.actionChip} strokeWidth={1.5} aria-hidden="true" />
            Add cost
          </>
        )}
      </button>
      <CostDialog
        expense={expense}
        defaultCurrency={defaultCurrency}
        open={showCostDialog}
        onOpenChange={setShowCostDialog}
        onSave={handleExpenseSave}
        onRemove={handleExpenseRemove}
      />
    </>
  );
}
