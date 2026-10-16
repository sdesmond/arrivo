"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { useNow } from "@/components/providers/mock-date-provider";
import { CategoryPicker } from "@/components/arrivo/category-picker";
import { CurrencyAmountField } from "@/components/arrivo/currency-amount-field";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listSupportedCurrencies } from "@/lib/currencies";
import { type CreateExpenseInput, type Expense, type ExpenseCategory } from "@/data/types";

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
  children: React.ReactNode;
  label: string;
  error?: string;
}

function FieldRow({ children, label, error }: RowProps) {
  return (
    <div className="flex flex-col gap-2">
      <span style={FIELD_LABEL_STYLE}>{label}</span>
      {children}
      {error ? (
        <p
          role="status"
          aria-live="polite"
          style={{ fontSize: "calc(11px * var(--font-scale))", color: "var(--destructive)" }}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export interface CostDialogProps {
  expense?: Expense;
  defaultCurrency?: string;
  eventName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (expense: CreateExpenseInput) => Promise<void> | void;
  onRemove?: () => Promise<void> | void;
}

export function CostDialog({
  expense,
  defaultCurrency = "USD",
  eventName,
  open,
  onOpenChange,
  onSave,
  onRemove,
}: CostDialogProps) {
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
    setAmount(expense ? String(expense.amount) : "");
    setCurrency(expense?.currency ?? defaultCurrency);
    setCategory(expense?.category);
    setDate(expense?.date ?? defaultDate);
    setNote(expense?.note ?? "");
    setAmountError(undefined);
    setCategoryError(undefined);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [defaultCurrency, defaultDate, expense, open]);

  async function handleSave(): Promise<void> {
    const parsedAmount = Number.parseFloat(amount);
    const nextAmountError = Number.isFinite(parsedAmount) ? undefined : "Amount is required.";
    const nextCategoryError = category ? undefined : "Category is required.";

    setAmountError(nextAmountError);
    setCategoryError(nextCategoryError);

    if (nextAmountError || nextCategoryError) {
      return;
    }

    setSaving(true);

    try {
      await onSave({
        category: category!,
        amount: parsedAmount,
        currency,
        date,
        note: note.trim() || undefined,
      });
      onOpenChange(false);
    } catch {
      return;
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(): Promise<void> {
    if (!onRemove) {
      return;
    }

    setSaving(true);

    try {
      await onRemove();
      onOpenChange(false);
    } catch {
      return;
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => onOpenChange(isOpen as boolean)}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Cost</DialogTitle>
          {eventName ? (
            <p style={{ fontSize: "calc(11px * var(--font-scale))", color: "var(--fg-4)", marginTop: -4 }}>
              {eventName}
            </p>
          ) : null}
        </DialogHeader>

        <div className="flex flex-col gap-4">
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

        <DialogFooter className="flex-row items-center justify-between">
          {expense && onRemove ? (
            <Button variant="ghost" title="Remove cost" onClick={() => void handleRemove()} disabled={saving}>
              Remove
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
