import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CurrencyPicker } from "./currency-picker";
import { listSupportedCurrencies } from "@/lib/currencies";

const currencyOptions = listSupportedCurrencies();

function getCurrencyOption(code: string) {
  const option = currencyOptions.find((currencyOption) => currencyOption.code === code);

  if (!option) {
    throw new Error(`Missing currency option for ${code}`);
  }

  return screen.getByRole("option", { name: `${option.name} ${option.code}` });
}

describe("CurrencyPicker", () => {
  it("renders the full server-provided currency list", async () => {
    const user = userEvent.setup();
    render(<CurrencyPicker currencyOptions={currencyOptions} value="USD" onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Currency:/i }));

    expect(screen.getAllByRole("option")).toHaveLength(currencyOptions.length);
  });

  it("highlights the selected option and selects a new currency on click", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CurrencyPicker currencyOptions={currencyOptions} value="USD" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /Currency:/i }));

    expect(getCurrencyOption("USD")).toHaveAttribute("data-selected", "true");

    await user.click(getCurrencyOption("EUR"));

    expect(onChange).toHaveBeenCalledWith("EUR");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /Currency: US Dollar USD/i })).toHaveFocus());
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    render(<CurrencyPicker currencyOptions={currencyOptions} value="USD" onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Currency:/i }));
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /Currency: US Dollar USD/i })).toHaveFocus());
  });

  it("opens from the keyboard and supports arrow navigation", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CurrencyPicker currencyOptions={currencyOptions} value="USD" onChange={onChange} />);

    const trigger = screen.getByRole("button", { name: /Currency:/i });
    trigger.focus();

    await user.keyboard("{Enter}");
    await waitFor(() => expect(getCurrencyOption("USD")).toHaveFocus());
    await user.keyboard("{ArrowDown}{Enter}");

    expect(onChange).toHaveBeenCalledWith("USN");
  });

  it("renders a disabled fallback trigger when no server options exist", async () => {
    const user = userEvent.setup();
    render(<CurrencyPicker currencyOptions={[]} value="ZZZ" onChange={vi.fn()} />);

    const trigger = screen.getByRole("button", { name: "Currency: ZZZ ZZZ" });

    expect(trigger).toBeDisabled();
    await user.click(trigger);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes when clicking the trigger again or clicking outside", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <CurrencyPicker currencyOptions={currencyOptions} value="USD" onChange={vi.fn()} />
        <button type="button">Outside</button>
      </div>
    );

    const trigger = screen.getByRole("button", { name: /Currency:/i });

    await user.click(trigger);
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await user.click(trigger);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await user.click(trigger);
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("supports home, end, and tab keyboard handling while open", async () => {
    const user = userEvent.setup();
    render(<CurrencyPicker currencyOptions={currencyOptions} value="USD" onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Currency:/i }));
    await waitFor(() => expect(getCurrencyOption("USD")).toHaveFocus());

    await user.keyboard("{End}");
    await waitFor(() => expect(getCurrencyOption("ZWL")).toHaveFocus());

    await user.keyboard("{Home}");
    await waitFor(() => expect(getCurrencyOption("AED")).toHaveFocus());

    await user.keyboard("{Tab}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("supports trigger arrow navigation while open", async () => {
    const user = userEvent.setup();
    render(<CurrencyPicker currencyOptions={currencyOptions} value="USD" onChange={vi.fn()} />);

    const trigger = screen.getByRole("button", { name: /Currency:/i });
    await user.click(trigger);

    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await waitFor(() => expect(getCurrencyOption("USN")).toHaveFocus());

    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowUp" });
    await waitFor(() => expect(getCurrencyOption("USD")).toHaveFocus());
  });

  it("wraps option navigation upward and closes on option escape", async () => {
    const user = userEvent.setup();
    render(<CurrencyPicker currencyOptions={currencyOptions} value="AED" onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Currency:/i }));
    const firstOption = getCurrencyOption("AED");
    await waitFor(() => expect(firstOption).toHaveFocus());

    fireEvent.keyDown(firstOption, { key: "ArrowUp" });
    await waitFor(() => expect(getCurrencyOption("ZWL")).toHaveFocus());

    fireEvent.keyDown(getCurrencyOption("ZWL"), { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("ignores disabled trigger keyboard input and falls back to first option for unknown values", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <CurrencyPicker currencyOptions={currencyOptions} value="USD" onChange={vi.fn()} disabled={true} />
    );

    const disabledTrigger = screen.getByRole("button", { name: /Currency:/i });
    disabledTrigger.focus();
    fireEvent.keyDown(disabledTrigger, { key: "ArrowDown" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    rerender(<CurrencyPicker currencyOptions={currencyOptions} value="ZZZ" onChange={vi.fn()} />);

    const fallbackTrigger = screen.getByRole("button", { name: "Currency: United Arab Emirates Dirham AED" });
    await user.click(fallbackTrigger);
    expect(getCurrencyOption("AED")).toHaveAttribute("data-selected", "true");
  });

  it("leaves picker open for unhandled option keys", async () => {
    const user = userEvent.setup();
    render(<CurrencyPicker currencyOptions={currencyOptions} value="USD" onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Currency:/i }));
    const selectedOption = getCurrencyOption("USD");
    await waitFor(() => expect(selectedOption).toHaveFocus());

    fireEvent.keyDown(selectedOption, { key: "A" });
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("handles closed-trigger arrow and escape keys", async () => {
    render(<CurrencyPicker currencyOptions={currencyOptions} value="USD" onChange={vi.fn()} />);

    const trigger = screen.getByRole("button", { name: /Currency:/i });
    trigger.focus();

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    fireEvent.keyDown(getCurrencyOption("USD"), { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowUp" });
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    fireEvent.keyDown(getCurrencyOption("USD"), { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    fireEvent.keyDown(trigger, { key: "A" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
