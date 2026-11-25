"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { format } from "date-fns";
import type { z } from "zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useNow } from "@/components/providers/mock-date-provider";
import { CategoryPicker } from "@/components/arrivo/category-picker";
import { CurrencyAmountField } from "@/components/arrivo/currency-amount-field";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, ApiClientError } from "@/lib/api/client";
import { createExpense, deleteExpense, updateExpense } from "@/lib/api/contract/expenses";
import { listSupportedCurrencies } from "@/lib/currencies";
import { createRandomId } from "@/lib/utils";
import { FIELD_LIMITS, validateExpenseAmountInput } from "@/lib/validation-limits";
import { type Expense, type ExpenseCategory } from "@/data/types";

const currencyOptions = listSupportedCurrencies();

const FIELD_LABEL_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-mono-family, ui-monospace)",
  fontSize: "calc(9px * var(--font-scale))",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--fg-4)",
};

const TEXTAREA_CLASS_NAME =
  "min-h-24 w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

interface RowProps {
  children: ReactNode;
  label: string;
  error?: string;
}

function FieldRow({ children, label, error }: RowProps): ReactElement {
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
      <span style={FIELD_LABEL_STYLE}>{label}</span>
      <div className="mt-2">{children}</div>
      {error ? (
        <p
          role="status"
          aria-live="polite"
          className="mt-2"
          style={{ fontSize: "calc(11px * var(--font-scale))", color: "var(--destructive)" }}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

type CreateExpenseBody = Omit<z.input<typeof createExpense.body>, "id">;

export interface TripAddExpenseModalProps {
  tripId: string;
  defaultCurrency?: string;
  expense?: Expense;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TripAddExpenseModal({
  tripId,
  defaultCurrency = "USD",
  expense,
  open,
  onOpenChange,
}: TripAddExpenseModalProps): ReactElement {
  const now = useNow();
  const router = useRouter();
  const defaultDate = format(now, "yyyy-MM-dd");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [category, setCategory] = useState<ExpenseCategory | undefined>(undefined);
  const [date, setDate] = useState(defaultDate);
  const [note, setNote] = useState("");
  const [amountError, setAmountError] = useState<string | undefined>(undefined);
  const [categoryError, setCategoryError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const submittingRef = useRef(false);
  const attempt = useRef<{ id: string; input: CreateExpenseBody } | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    attempt.current = null;
    /* eslint-disable react-hooks/set-state-in-effect */
    if (expense) {
      setAmount(String(expense.amount));
      setCurrency(expense.currency);
      setCategory(expense.category);
      setDate(expense.date);
      setNote(expense.note ?? "");
    } else {
      setAmount("");
      setCurrency(defaultCurrency);
      setCategory(undefined);
      setDate(defaultDate);
      setNote("");
    }
    setAmountError(undefined);
    setCategoryError(undefined);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [defaultCurrency, defaultDate, expense, open]);

  async function handleSave(): Promise<void> {
    if (submittingRef.current) {
      return;
    }

    const { amount: parsedAmount, error: nextAmountError } = validateExpenseAmountInput(amount);
    const nextCategoryError = category ? undefined : "Category is required.";

    setAmountError(nextAmountError);
    setCategoryError(nextCategoryError);

    if (nextAmountError || nextCategoryError) {
      return;
    }

    if (!category) {
      return;
    }

    submittingRef.current = true;
    setSaving(true);

    try {
      const patch = {
        category,
        amount: parsedAmount,
        currency,
        date,
        note: note.trim() || undefined,
      };

      let result: { conversionError?: boolean } | void;
      if (expense) {
        // `null` clears the note: an absent field would leave it alone.
        result = await api(updateExpense, {
          params: { expenseId: expense.id },
          body: { ...patch, note: patch.note ?? null },
        });
        router.refresh();
      } else {
        // One id per save attempt, so a retry after a timeout replays the same expense instead of adding another.
        attempt.current ??= { id: createRandomId(), input: patch };
        const previousInput = attempt.current.input;
        const changed = JSON.stringify(previousInput) !== JSON.stringify(patch);
        result = await api(createExpense, {
          params: { tripId },
          body: { ...previousInput, id: attempt.current.id },
        });
        if (changed) toast.info("Your earlier expense was saved. Your recent changes were not saved.");
        router.refresh();
      }

      attempt.current = null;
      if (result?.conversionError)
        toast.error("Expense saved, but the currency couldn't be converted. Edit it later to retry.");
      onOpenChange(false);
    } catch (error) {
      if (
        error instanceof ApiClientError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 408 &&
        error.status !== 409 &&
        error.status !== 429
      )
        attempt.current = null;
      toast.error(error instanceof Error ? error.message : "Failed to save expense.");
    } finally {
      setSaving(false);
      submittingRef.current = false;
    }
  }

  async function handleRemove(): Promise<void> {
    if (!expense || submittingRef.current) {
      return;
    }

    submittingRef.current = true;
    setSaving(true);

    try {
      await api(deleteExpense, { params: { expenseId: expense.id }, body: {} });
      router.refresh();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove expense.");
    } finally {
      setSaving(false);
      submittingRef.current = false;
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => onOpenChange(isOpen as boolean)}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{expense ? "Edit Misc Expense" : "Add Misc Expense"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <FieldRow label="Amount" error={amountError}>
            <CurrencyAmountField
              amount={amount}
              currency={currency}
              currencyOptions={currencyOptions}
              onAmountChange={(nextAmount) => {
                setAmount(nextAmount);
                if (amountError) {
                  setAmountError(undefined);
                }
              }}
              onCurrencyChange={setCurrency}
              amountInputLabel="Amount"
              autoFocus
              error={!!amountError}
              inputMode="decimal"
              placeholder="0.00"
              step="0.01"
              onAmountKeyDown={(event) => {
                if (event.key === "Enter") {
                  void handleSave();
                }
              }}
            />
          </FieldRow>

          <FieldRow label="Category" error={categoryError}>
            <CategoryPicker
              value={category}
              onChange={(nextCategory) => {
                setCategory(nextCategory);
                if (categoryError) {
                  setCategoryError(undefined);
                }
              }}
              error={!!categoryError}
              required
            />
          </FieldRow>

          <FieldRow label="Date">
            <DatePicker value={date} onChange={(nextDate) => setDate(nextDate ?? defaultDate)} clearable={false} />
          </FieldRow>

          <FieldRow label="Note">
            <textarea
              value={note}
              maxLength={FIELD_LIMITS.expenseNote}
              onChange={(event) => setNote(event.target.value)}
              className={TEXTAREA_CLASS_NAME}
              style={{ borderColor: "var(--input)" }}
              aria-label="Note"
            />
          </FieldRow>
        </div>

        <DialogFooter className="gap-2">
          {expense ? (
            <Button variant="ghost" className="sm:mr-auto" onClick={() => void handleRemove()} disabled={saving}>
              Remove
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
