"use client";

import { useEffect, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { createExpense } from "@/app/(app)/trips/[tripId]/budget/actions";
import { useNow } from "@/components/providers/mock-date-provider";
import { CategoryPicker } from "@/components/packt/category-picker";
import { CurrencyAmountField } from "@/components/packt/currency-amount-field";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listSupportedCurrencies } from "@/lib/currencies";
import { type ExpenseCategory } from "@/data/types";

const currencyOptions = listSupportedCurrencies();
const MAX_EXPENSE_AMOUNT = 50000;

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

function validateAmountInput(rawAmount: string): { amount: number; error?: string } {
  const amount = Number.parseFloat(rawAmount);

  if (!Number.isFinite(amount) || amount <= 0) {
    return { amount: Number.NaN, error: "Amount must be greater than 0." };
  }

  if (amount > MAX_EXPENSE_AMOUNT) {
    return { amount, error: "Amount must be 50,000 or less." };
  }

  return { amount };
}

export interface TripAddExpenseModalProps {
  tripId: string;
  defaultCurrency?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TripAddExpenseModal({
  tripId,
  defaultCurrency = "USD",
  open,
  onOpenChange,
}: TripAddExpenseModalProps): ReactElement {
  const now = useNow();
  const defaultDate = format(now, "yyyy-MM-dd");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [category, setCategory] = useState<ExpenseCategory | undefined>(undefined);
  const [date, setDate] = useState(defaultDate);
  const [note, setNote] = useState("");
  const [amountError, setAmountError] = useState<string | undefined>(undefined);
  const [categoryError, setCategoryError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    /* eslint-disable react-hooks/set-state-in-effect */
    setAmount("");
    setCurrency(defaultCurrency);
    setCategory(undefined);
    setDate(defaultDate);
    setNote("");
    setAmountError(undefined);
    setCategoryError(undefined);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [defaultCurrency, defaultDate, open]);

  async function handleSave(): Promise<void> {
    const { amount: parsedAmount, error: nextAmountError } = validateAmountInput(amount);
    const nextCategoryError = category ? undefined : "Category is required.";

    setAmountError(nextAmountError);
    setCategoryError(nextCategoryError);

    if (nextAmountError || nextCategoryError) {
      return;
    }

    setSaving(true);

    try {
      const result = await createExpense(tripId, {
        category: category!,
        amount: parsedAmount,
        currency,
        date,
        note: note.trim() || undefined,
      });

      if (result.conversionError) {
        toast.error("Couldn't convert currency — try again.");
      }

      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save expense.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => onOpenChange(isOpen as boolean)}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Add Misc Expense</DialogTitle>
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
              searchable={false}
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
              onChange={(event) => setNote(event.target.value)}
              className={TEXTAREA_CLASS_NAME}
              style={{ borderColor: "var(--input)" }}
              aria-label="Note"
            />
          </FieldRow>
        </div>

        <DialogFooter className="gap-2">
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
