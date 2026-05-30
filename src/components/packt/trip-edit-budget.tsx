"use client";

import { Field, Section } from "@/components/packt/form-section";
import { Input } from "@/components/ui/input";

export interface TripEditBudgetProps {
  currency?: string;
  total?: number;
  perPerson?: number;
  onCurrencyChange: (currency: string) => void;
  onTotalChange: (total: number | undefined) => void;
  onPerPersonChange: (perPerson: number | undefined) => void;
  disabled?: boolean;
}

export function TripEditBudget({
  currency,
  total,
  perPerson,
  onCurrencyChange,
  onTotalChange,
  onPerPersonChange,
  disabled = false,
}: TripEditBudgetProps) {
  return (
    <Section title="Budget">
      <Field label="Currency" htmlFor="trip-budget-currency">
        <Input
          id="trip-budget-currency"
          disabled={disabled}
          value={currency ?? ""}
          placeholder="USD"
          onChange={(event) => onCurrencyChange(event.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Total" htmlFor="trip-budget-total">
          <Input
            id="trip-budget-total"
            disabled={disabled}
            type="number"
            min={0}
            value={total ?? ""}
            onChange={(event) => {
              const val = event.target.value;
              onTotalChange(val !== "" ? Math.max(0, Number(val)) : undefined);
            }}
          />
        </Field>
        <Field label="Per person" htmlFor="trip-budget-per-person">
          <Input
            id="trip-budget-per-person"
            disabled={disabled}
            type="number"
            min={0}
            value={perPerson ?? ""}
            onChange={(event) => {
              const val = event.target.value;
              onPerPersonChange(val !== "" ? Math.max(0, Number(val)) : undefined);
            }}
          />
        </Field>
      </div>
    </Section>
  );
}
