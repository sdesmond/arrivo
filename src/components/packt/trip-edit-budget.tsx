"use client";

import { CurrencyPicker } from "@/components/packt/currency-picker";
import { Field, Section } from "@/components/packt/form-section";
import { Input } from "@/components/ui/input";
import type { CurrencyOption } from "@/data/types";
import { cn } from "@/lib/utils";

export interface TripEditBudgetProps {
  currencyOptions: CurrencyOption[];
  currency?: string;
  total?: number;
  onCurrencyChange: (currency: string) => void;
  onTotalChange: (total: number | undefined) => void;
  disabled?: boolean;
}

export function TripEditBudget({
  currencyOptions,
  currency,
  total,
  onCurrencyChange,
  onTotalChange,
  disabled = false,
}: TripEditBudgetProps) {
  return (
    <Section title="Budget">
      <Field label="Total" htmlFor="trip-budget-total">
        <div
          className={cn(
            "flex h-9 items-center rounded-lg border border-input bg-transparent transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
            disabled && "opacity-50"
          )}
        >
          <CurrencyPicker
            currencyOptions={currencyOptions}
            value={currency ?? "USD"}
            onChange={onCurrencyChange}
            disabled={disabled}
          />
          <Input
            id="trip-budget-total"
            disabled={disabled}
            type="number"
            min={0}
            value={total ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              onTotalChange(value !== "" ? Math.max(0, Number(value)) : undefined);
            }}
            className="flex-1 rounded-none border-0 ring-0 focus-visible:ring-0"
          />
        </div>
      </Field>
    </Section>
  );
}
