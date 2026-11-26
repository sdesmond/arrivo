"use client";

import { useState, useEffect, useRef } from "react";
import { DollarSign } from "lucide-react";
import { toast } from "sonner";
import { IconSize } from "@/lib/size-tokens";
import { api, ApiClientError } from "@/lib/api/client";
import { useRefreshAfterWrite } from "@/lib/api/use-refresh-after-write";
import { createExpense, deleteExpense, updateExpense } from "@/lib/api/contract/expenses";
import { CostDialog } from "@/components/arrivo/cost-dialog";
import type { CreateExpenseInput, Expense } from "@/data/types";
import { formatCurrencyChipAmount } from "@/lib/currencies";
import { createRandomId } from "@/lib/utils";

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
  const refreshAfterWrite = useRefreshAfterWrite();
  const [expense, setExpense] = useState<Expense | undefined>(initialExpense);
  // One id per create attempt, so a retry after a timeout replays the same expense instead of adding another.
  const createAttempt = useRef<{ id: string; body: string } | null>(null);
  const [showCostDialog, setShowCostDialog] = useState(false);
  const costDisplay = expense ? formatCurrencyChipAmount(expense.amount, expense.currency) : "";

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setExpense(initialExpense);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [initialExpense]);

  async function handleExpenseSave(expenseInput: CreateExpenseInput): Promise<void> {
    // Conversion fields are computed server-side; the API body is strict.
    const fields = {
      category: expenseInput.category,
      amount: expenseInput.amount,
      currency: expenseInput.currency,
      date: expenseInput.date,
      note: expenseInput.note,
    };

    try {
      if (expense?.id) {
        const updateResult = await api(updateExpense, {
          params: { expenseId: expense.id },
          body: { ...fields, note: fields.note ?? null, reservationId },
        });
        refreshAfterWrite();
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

      const bodyKey = JSON.stringify(fields);
      if (createAttempt.current?.body !== bodyKey) createAttempt.current = { id: createRandomId(), body: bodyKey };
      const createResult = await api(createExpense, {
        params: { tripId },
        body: { ...fields, id: createAttempt.current.id, reservationId },
      });
      createAttempt.current = null;
      refreshAfterWrite();
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
      const definitive =
        error instanceof ApiClientError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 408 &&
        error.status !== 409 &&
        error.status !== 429;
      if (definitive) createAttempt.current = null;
      toast.error(error instanceof Error ? error.message : "Failed to save.");
      throw error;
    }
  }

  async function handleExpenseRemove(): Promise<void> {
    if (!expense?.id) {
      return;
    }

    try {
      await api(deleteExpense, { params: { expenseId: expense.id }, body: {} });
      refreshAfterWrite();
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
