"use client";

import { CurrencyPicker } from "@/components/packt/currency-picker";
import { Field, Section } from "@/components/packt/form-section";
import { Input } from "@/components/ui/input";
import type { CurrencyOption } from "@/data/types";

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
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Total" htmlFor="trip-budget-total">
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
          />
        </Field>
        <Field label="Currency">
          <CurrencyPicker
            currencyOptions={currencyOptions}
            value={currency ?? "USD"}
            onChange={onCurrencyChange}
            disabled={disabled}
          />
        </Field>
      </div>
    </Section>
  );
}
