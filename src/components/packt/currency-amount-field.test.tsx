import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CurrencyAmountField } from "./currency-amount-field";
import { listSupportedCurrencies } from "@/lib/currencies";

const currencyOptions = listSupportedCurrencies();

function CurrencyAmountFieldHarness({
  onAmountChange = vi.fn(),
  onCurrencyChange = vi.fn(),
}: {
  onAmountChange?: (amount: string) => void;
  onCurrencyChange?: (currency: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");

  return (
    <CurrencyAmountField
      amount={amount}
      currency={currency}
      currencyOptions={currencyOptions}
      onAmountChange={(nextAmount) => {
        setAmount(nextAmount);
        onAmountChange(nextAmount);
      }}
      onCurrencyChange={(nextCurrency) => {
        setCurrency(nextCurrency);
        onCurrencyChange(nextCurrency);
      }}
      amountInputLabel="Amount"
    />
  );
}

describe("CurrencyAmountField", () => {
  it("renders shared amount and currency controls", () => {
    render(
      <CurrencyAmountField
        amount="25"
        currency="USD"
        currencyOptions={currencyOptions}
        onAmountChange={vi.fn()}
        onCurrencyChange={vi.fn()}
        amountInputLabel="Amount"
      />
    );

    expect(screen.getByRole("textbox", { name: "Amount" })).toHaveValue("25");
    expect(screen.getByRole("button", { name: /Currency: US Dollar USD/i })).toBeInTheDocument();
  });

  it("passes amount and currency changes through callbacks", async () => {
    const user = userEvent.setup();
    const onAmountChange = vi.fn();
    const onCurrencyChange = vi.fn();

    render(<CurrencyAmountFieldHarness onAmountChange={onAmountChange} onCurrencyChange={onCurrencyChange} />);

    await user.type(screen.getByRole("textbox", { name: "Amount" }), "42");
    await user.click(screen.getByRole("button", { name: /Currency: US Dollar USD/i }));
    await user.click(screen.getByRole("option", { name: "Euro EUR" }));

    expect(onAmountChange).toHaveBeenLastCalledWith("42");
    expect(onCurrencyChange).toHaveBeenLastCalledWith("EUR");
  });

  it("blocks input past two fraction digits", async () => {
    const user = userEvent.setup();
    const onAmountChange = vi.fn();

    render(<CurrencyAmountFieldHarness onAmountChange={onAmountChange} />);

    const amountInput = screen.getByRole("textbox", { name: "Amount" });

    await user.type(amountInput, "12.345");

    expect(amountInput).toHaveValue("12.34");
    expect(onAmountChange).toHaveBeenLastCalledWith("12.34");
  });

  it("shows shared error styling on amount input", () => {
    render(
      <CurrencyAmountField
        amount=""
        currency="USD"
        currencyOptions={currencyOptions}
        onAmountChange={vi.fn()}
        onCurrencyChange={vi.fn()}
        amountInputLabel="Amount"
        error
      />
    );

    expect(screen.getByRole("textbox", { name: "Amount" })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("textbox", { name: "Amount" }).parentElement).toHaveClass("border-destructive");
  });

  it("disables both controls together", () => {
    render(
      <CurrencyAmountField
        amount="25"
        currency="USD"
        currencyOptions={currencyOptions}
        onAmountChange={vi.fn()}
        onCurrencyChange={vi.fn()}
        amountInputLabel="Amount"
        disabled
      />
    );

    expect(screen.getByRole("textbox", { name: "Amount" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Currency: US Dollar USD/i })).toBeDisabled();
  });
});
