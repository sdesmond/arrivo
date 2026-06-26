"use client";

import { useEffect, useState } from "react";
import type { KeyboardEventHandler, ReactElement } from "react";
import { CurrencyPicker } from "@/components/packt/currency-picker";
import { Input } from "@/components/ui/input";
import type { CurrencyOption } from "@/data/types";
import { cn } from "@/lib/utils";

export interface CurrencyAmountFieldProps {
  amount: string | number | undefined;
  currencyOptions: CurrencyOption[];
  currency?: string;
  onAmountChange: (amount: string) => void;
  onCurrencyChange: (currency: string) => void;
  amountInputId?: string;
  amountInputLabel?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  error?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  maxFractionDigits?: number;
  onAmountKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  placeholder?: string;
  searchable?: boolean;
  step?: number | string;
}

function isAllowedAmount(nextAmount: string, maxFractionDigits: number): boolean {
  const decimalPattern = new RegExp(`^\\d*(?:\\.\\d{0,${maxFractionDigits}})?$`);
  return decimalPattern.test(nextAmount);
}

export function CurrencyAmountField({
  amount,
  currencyOptions,
  currency = "USD",
  onAmountChange,
  onCurrencyChange,
  amountInputId,
  amountInputLabel,
  autoFocus = false,
  disabled = false,
  error = false,
  inputMode = "decimal",
  maxFractionDigits = 2,
  onAmountKeyDown,
  placeholder,
  searchable = true,
  step,
}: CurrencyAmountFieldProps): ReactElement {
  const normalizedAmount = amount ?? "";
  const [draftAmount, setDraftAmount] = useState(String(normalizedAmount));

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const nextAmount = String(normalizedAmount);

    if (typeof amount === "number") {
      const parsedDraftAmount = Number.parseFloat(draftAmount);

      if (Number.isFinite(parsedDraftAmount) && parsedDraftAmount === amount) {
        return;
      }
    }

    setDraftAmount(nextAmount);
  }, [amount, draftAmount, normalizedAmount]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <div
      className={cn(
        "flex h-9 items-center rounded-lg border bg-transparent transition-colors focus-within:ring-3",
        error
          ? "border-destructive focus-within:border-destructive focus-within:ring-destructive/20"
          : "border-input focus-within:border-ring focus-within:ring-ring/50",
        disabled && "opacity-50"
      )}
    >
      <CurrencyPicker
        currencyOptions={currencyOptions}
        value={currency}
        onChange={onCurrencyChange}
        disabled={disabled}
        searchable={searchable}
      />
      <Input
        id={amountInputId}
        disabled={disabled}
        type="text"
        step={step}
        inputMode={inputMode}
        placeholder={placeholder}
        value={draftAmount}
        onChange={(event) => {
          const nextAmount = event.target.value;

          if (!isAllowedAmount(nextAmount, maxFractionDigits)) {
            return;
          }

          setDraftAmount(nextAmount);
          onAmountChange(nextAmount);
        }}
        onKeyDown={onAmountKeyDown}
        autoFocus={autoFocus}
        className="flex-1 rounded-none border-0 shadow-none focus-visible:ring-0"
        aria-label={amountInputLabel}
        aria-invalid={error || undefined}
      />
    </div>
  );
}
