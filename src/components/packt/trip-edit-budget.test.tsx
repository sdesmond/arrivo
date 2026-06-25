import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TripEditBudget } from "./trip-edit-budget";
import { listSupportedCurrencies } from "@/lib/currencies";

interface TripEditBudgetHarnessProps {
  disabled?: boolean;
  onCurrencyChange?: (currency: string) => void;
  onTotalChange?: (total: number | undefined) => void;
}

const currencyOptions = listSupportedCurrencies();

function getCurrencyOption(code: string) {
  const option = currencyOptions.find((currencyOption) => currencyOption.code === code);

  if (!option) {
    throw new Error(`Missing currency option for ${code}`);
  }

  return screen.getByRole("option", { name: `${option.name} ${option.code}` });
}

function TripEditBudgetHarness({
  disabled = false,
  onCurrencyChange = vi.fn(),
  onTotalChange = vi.fn(),
}: TripEditBudgetHarnessProps) {
  const [currency, setCurrency] = useState("USD");
  const [total, setTotal] = useState<number | undefined>(3000);

  return (
    <TripEditBudget
      currencyOptions={currencyOptions}
      currency={currency}
      total={total}
      onCurrencyChange={(nextCurrency) => {
        setCurrency(nextCurrency);
        onCurrencyChange(nextCurrency);
      }}
      onTotalChange={(nextTotal) => {
        setTotal(nextTotal);
        onTotalChange(nextTotal);
      }}
      disabled={disabled}
    />
  );
}

describe("TripEditBudget", () => {
  it("renders the total input and currency picker without per-person input", () => {
    render(<TripEditBudgetHarness />);

    expect(screen.getByDisplayValue("3000")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Currency: US Dollar USD/i })).toBeInTheDocument();
    expect(screen.queryByText("Per person")).not.toBeInTheDocument();
  });

  it("shows currency options, highlights selection, and updates callbacks", async () => {
    const user = userEvent.setup();
    const onCurrencyChange = vi.fn();
    const onTotalChange = vi.fn();
    render(<TripEditBudgetHarness onCurrencyChange={onCurrencyChange} onTotalChange={onTotalChange} />);

    const totalInput = screen.getByDisplayValue("3000");

    await user.click(screen.getByRole("button", { name: /Currency: US Dollar USD/i }));

    expect(getCurrencyOption("USD")).toHaveAttribute("data-selected", "true");

    await user.click(getCurrencyOption("EUR"));
    await user.clear(totalInput);
    await user.type(totalInput, "4200");

    expect(onCurrencyChange).toHaveBeenLastCalledWith("EUR");
    expect(onTotalChange).toHaveBeenLastCalledWith(4200);
  });

  it("closes the picker on Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    render(<TripEditBudgetHarness />);

    await user.click(screen.getByRole("button", { name: /Currency: US Dollar USD/i }));
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /Currency: US Dollar USD/i })).toHaveFocus());
  });

  it("maps a cleared total input to undefined", async () => {
    const user = userEvent.setup();
    const onTotalChange = vi.fn();
    render(<TripEditBudgetHarness onTotalChange={onTotalChange} />);

    await user.clear(screen.getByDisplayValue("3000"));

    expect(onTotalChange).toHaveBeenLastCalledWith(undefined);
  });

  it("disables the total input and currency picker when disabled is true", () => {
    render(<TripEditBudgetHarness disabled />);

    expect(screen.getByDisplayValue("3000")).toBeDisabled();
    expect(screen.getByRole("button", { name: /Currency: US Dollar USD/i })).toBeDisabled();
  });

  it("defaults to USD and enabled controls when currency and disabled are omitted", () => {
    render(<TripEditBudget currencyOptions={currencyOptions} onCurrencyChange={vi.fn()} onTotalChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: /Currency: US Dollar USD/i })).toBeEnabled();
  });
});
