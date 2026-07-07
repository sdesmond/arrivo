"use client";

import { CurrencyAmountField } from "@/components/packt/currency-amount-field";
import { Field, Section } from "@/components/packt/form-section";
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
      <Field label="Total" htmlFor="trip-budget-total">
        <CurrencyAmountField
          amount={total}
          currencyOptions={currencyOptions}
          currency={currency ?? "USD"}
          onCurrencyChange={onCurrencyChange}
          onAmountChange={(value) => onTotalChange(value !== "" ? Math.max(0, Number(value)) : undefined)}
          amountInputId="trip-budget-total"
          disabled={disabled}
        />
      </Field>
    </Section>
  );
}
