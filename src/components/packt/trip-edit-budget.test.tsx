import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TripEditBudget } from "./trip-edit-budget";

interface TripEditBudgetHarnessProps {
  disabled?: boolean;
  onCurrencyChange?: (currency: string) => void;
  onTotalChange?: (total: number | undefined) => void;
  onPerPersonChange?: (perPerson: number | undefined) => void;
}

function TripEditBudgetHarness({
  disabled = false,
  onCurrencyChange = vi.fn(),
  onTotalChange = vi.fn(),
  onPerPersonChange = vi.fn(),
}: TripEditBudgetHarnessProps) {
  const [currency, setCurrency] = useState("USD");
  const [total, setTotal] = useState<number | undefined>(3000);
  const [perPerson, setPerPerson] = useState<number | undefined>(1500);

  return (
    <TripEditBudget
      currency={currency}
      total={total}
      perPerson={perPerson}
      onCurrencyChange={(nextCurrency) => {
        setCurrency(nextCurrency);
        onCurrencyChange(nextCurrency);
      }}
      onTotalChange={(nextTotal) => {
        setTotal(nextTotal);
        onTotalChange(nextTotal);
      }}
      onPerPersonChange={(nextPerPerson) => {
        setPerPerson(nextPerPerson);
        onPerPersonChange(nextPerPerson);
      }}
      disabled={disabled}
    />
  );
}

describe("TripEditBudget", () => {
  it("renders the currency, total, and per person inputs", () => {
    render(<TripEditBudgetHarness />);

    expect(screen.getByDisplayValue("USD")).toBeInTheDocument();
    expect(screen.getByDisplayValue("3000")).toBeInTheDocument();
    expect(screen.getByDisplayValue("1500")).toBeInTheDocument();
  });

  it("calls the change callbacks with parsed values", async () => {
    const user = userEvent.setup();
    const onCurrencyChange = vi.fn();
    const onTotalChange = vi.fn();
    const onPerPersonChange = vi.fn();
    render(
      <TripEditBudgetHarness
        onCurrencyChange={onCurrencyChange}
        onTotalChange={onTotalChange}
        onPerPersonChange={onPerPersonChange}
      />
    );

    const currencyInput = screen.getByDisplayValue("USD");
    const totalInput = screen.getByDisplayValue("3000");
    const perPersonInput = screen.getByDisplayValue("1500");

    await user.clear(currencyInput);
    await user.type(currencyInput, "EUR");
    await user.clear(totalInput);
    await user.type(totalInput, "4200");
    await user.clear(perPersonInput);
    await user.type(perPersonInput, "2100");

    expect(onCurrencyChange).toHaveBeenLastCalledWith("EUR");
    expect(onTotalChange).toHaveBeenLastCalledWith(4200);
    expect(onPerPersonChange).toHaveBeenLastCalledWith(2100);
  });

  it("maps cleared numeric inputs to undefined", async () => {
    const user = userEvent.setup();
    const onTotalChange = vi.fn();
    const onPerPersonChange = vi.fn();
    render(<TripEditBudgetHarness onTotalChange={onTotalChange} onPerPersonChange={onPerPersonChange} />);

    await user.clear(screen.getByDisplayValue("3000"));
    await user.clear(screen.getByDisplayValue("1500"));

    expect(onTotalChange).toHaveBeenLastCalledWith(undefined);
    expect(onPerPersonChange).toHaveBeenLastCalledWith(undefined);
  });

  it("disables all inputs when disabled is true", () => {
    render(<TripEditBudgetHarness disabled />);

    expect(screen.getByDisplayValue("USD")).toBeDisabled();
    expect(screen.getByDisplayValue("3000")).toBeDisabled();
    expect(screen.getByDisplayValue("1500")).toBeDisabled();
  });
});
