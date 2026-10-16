import { afterEach, describe, expect, it, vi } from "vitest";
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

function getNextCurrencyCode(code: string): string {
  const index = currencyOptions.findIndex((currencyOption) => currencyOption.code === code);
  if (index === -1 || index === currencyOptions.length - 1) {
    throw new Error(`Missing next currency option for ${code}`);
  }

  return currencyOptions[index + 1].code;
}

function getFirstCurrencyCode(): string {
  const firstCode = currencyOptions[0]?.code;
  if (!firstCode) {
    throw new Error("Currency options are empty");
  }

  return firstCode;
}

function getLastCurrencyCode(): string {
  const lastCode = currencyOptions.at(-1)?.code;
  if (!lastCode) {
    throw new Error("Currency options are empty");
  }

  return lastCode;
}

function getSearchInput() {
  return screen.getByRole("textbox", { name: "Search currencies" });
}

function getUnitedStatesTrigger() {
  return screen.getByRole("button", { name: /Currency: United States Dollar USD/i });
}

describe("CurrencyPicker", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the full server-provided currency list", async () => {
    const user = userEvent.setup();
    render(<CurrencyPicker currencyOptions={currencyOptions} value="USD" onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Currency:/i }));

    expect(screen.getAllByRole("option")).toHaveLength(currencyOptions.length);
  });

  it("renders each option with a two-letter badge and a stacked name/code", async () => {
    const user = userEvent.setup();
    render(<CurrencyPicker currencyOptions={currencyOptions} value="USD" onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Currency:/i }));

    const eurOption = getCurrencyOption("EUR");
    expect(eurOption).toHaveTextContent("EU");
    expect(eurOption).toHaveTextContent("Euro");
    expect(eurOption).toHaveTextContent("EUR");
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
    await waitFor(() => expect(getUnitedStatesTrigger()).toHaveFocus());
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    render(<CurrencyPicker currencyOptions={currencyOptions} value="USD" onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Currency:/i }));
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await waitFor(() => expect(getUnitedStatesTrigger()).toHaveFocus());
  });

  it("opens from the keyboard, focuses the search box, and supports arrow navigation", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const nextCurrencyCode = getNextCurrencyCode("USD");
    render(<CurrencyPicker currencyOptions={currencyOptions} value="USD" onChange={onChange} />);

    const trigger = screen.getByRole("button", { name: /Currency:/i });
    trigger.focus();

    await user.keyboard("{Enter}");
    await waitFor(() => expect(getSearchInput()).toHaveFocus());

    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(getCurrencyOption("USD")).toHaveFocus());

    await user.keyboard("{ArrowDown}{Enter}");

    expect(onChange).toHaveBeenCalledWith(nextCurrencyCode);
  });

  it("filters options by search query", async () => {
    const user = userEvent.setup();
    render(<CurrencyPicker currencyOptions={currencyOptions} value="USD" onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Currency:/i }));
    await waitFor(() => expect(getSearchInput()).toHaveFocus());

    await user.type(getSearchInput(), "japanese");

    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(getCurrencyOption("JPY")).toBeInTheDocument();
  });

  it("shows an empty state when no currency matches the search query", async () => {
    const user = userEvent.setup();
    render(<CurrencyPicker currencyOptions={currencyOptions} value="USD" onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Currency:/i }));
    await waitFor(() => expect(getSearchInput()).toHaveFocus());

    await user.type(getSearchInput(), "not-a-real-currency");

    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(screen.getByText("No currencies found")).toBeInTheDocument();
  });

  it("closes the picker when Escape is pressed in the search input", async () => {
    const user = userEvent.setup();
    render(<CurrencyPicker currencyOptions={currencyOptions} value="USD" onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Currency:/i }));
    await waitFor(() => expect(getSearchInput()).toHaveFocus());

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await waitFor(() => expect(getUnitedStatesTrigger()).toHaveFocus());
  });

  it("wraps option navigation forward past the last filtered option", async () => {
    const user = userEvent.setup();
    render(<CurrencyPicker currencyOptions={currencyOptions} value="USD" onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Currency:/i }));
    await waitFor(() => expect(getSearchInput()).toHaveFocus());
    await user.type(getSearchInput(), "guinea");

    expect(screen.getAllByRole("option")).toHaveLength(2);

    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(getCurrencyOption("GNF")).toHaveFocus());

    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(getCurrencyOption("PGK")).toHaveFocus());

    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(getCurrencyOption("GNF")).toHaveFocus());
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
    const firstCurrencyCode = getFirstCurrencyCode();
    const lastCurrencyCode = getLastCurrencyCode();
    render(<CurrencyPicker currencyOptions={currencyOptions} value="USD" onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Currency:/i }));
    await waitFor(() => expect(getSearchInput()).toHaveFocus());
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(getCurrencyOption("USD")).toHaveFocus());

    await user.keyboard("{End}");
    await waitFor(() => expect(getCurrencyOption(lastCurrencyCode)).toHaveFocus());

    await user.keyboard("{Home}");
    await waitFor(() => expect(getCurrencyOption(firstCurrencyCode)).toHaveFocus());

    await user.keyboard("{Tab}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("opens the picker via ArrowUp on the trigger and focuses the search input", async () => {
    render(<CurrencyPicker currencyOptions={currencyOptions} value="USD" onChange={vi.fn()} />);

    const trigger = screen.getByRole("button", { name: /Currency:/i });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowUp" });

    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await waitFor(() => expect(getSearchInput()).toHaveFocus());
  });

  it("wraps option navigation upward and closes on option escape", async () => {
    const user = userEvent.setup();
    const firstCurrencyCode = getFirstCurrencyCode();
    const lastCurrencyCode = getLastCurrencyCode();
    render(<CurrencyPicker currencyOptions={currencyOptions} value={firstCurrencyCode} onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Currency:/i }));
    await waitFor(() => expect(getSearchInput()).toHaveFocus());
    await user.keyboard("{ArrowDown}");
    const firstOption = getCurrencyOption(firstCurrencyCode);
    await waitFor(() => expect(firstOption).toHaveFocus());

    fireEvent.keyDown(firstOption, { key: "ArrowUp" });
    await waitFor(() => expect(getCurrencyOption(lastCurrencyCode)).toHaveFocus());

    fireEvent.keyDown(getCurrencyOption(lastCurrencyCode), { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("ignores disabled trigger keyboard input and falls back to the raw code for unknown values", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <CurrencyPicker currencyOptions={currencyOptions} value="USD" onChange={vi.fn()} disabled={true} />
    );

    const disabledTrigger = screen.getByRole("button", { name: /Currency:/i });
    disabledTrigger.focus();
    fireEvent.keyDown(disabledTrigger, { key: "ArrowDown" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    rerender(<CurrencyPicker currencyOptions={currencyOptions} value="ZZZ" onChange={vi.fn()} />);

    const fallbackTrigger = screen.getByRole("button", { name: "Currency: ZZZ ZZZ" });
    await user.click(fallbackTrigger);

    expect(screen.getAllByRole("option").every((option) => option.getAttribute("data-selected") === "false")).toBe(
      true
    );
  });

  it("hides the search input and focuses options when searchable is false", async () => {
    const user = userEvent.setup();
    render(<CurrencyPicker currencyOptions={currencyOptions} value="USD" onChange={vi.fn()} searchable={false} />);

    await user.click(screen.getByRole("button", { name: /Currency:/i }));

    expect(screen.queryByRole("textbox", { name: "Search currencies" })).not.toBeInTheDocument();
    await waitFor(() => expect(getCurrencyOption("USD")).toHaveFocus());
  });

  it("keeps the picker open for trigger Escape when already closed", () => {
    render(<CurrencyPicker currencyOptions={currencyOptions} value="USD" onChange={vi.fn()} />);

    const trigger = screen.getByRole("button", { name: /Currency:/i });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Escape" });

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("leaves picker open for unhandled option keys", async () => {
    const user = userEvent.setup();
    render(<CurrencyPicker currencyOptions={currencyOptions} value="USD" onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Currency:/i }));
    await waitFor(() => expect(getSearchInput()).toHaveFocus());
    await user.keyboard("{ArrowDown}");
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

  it("does not constrain the dropdown panel width when the viewport has plenty of room", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(800);
    render(<CurrencyPicker currencyOptions={currencyOptions} value="USD" onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Currency:/i }));

    expect(screen.getByTestId("currency-picker-panel").style.width).toBe("");
  });

  it("clamps the dropdown panel width on a narrow viewport", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(300);
    render(<CurrencyPicker currencyOptions={currencyOptions} value="USD" onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Currency:/i }));

    await waitFor(() => expect(screen.getByTestId("currency-picker-panel")).toHaveStyle({ width: "284px" }));
  });

  it("floors the clamped dropdown panel width on a very narrow viewport", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(200);
    render(<CurrencyPicker currencyOptions={currencyOptions} value="USD" onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Currency:/i }));

    await waitFor(() => expect(screen.getByTestId("currency-picker-panel")).toHaveStyle({ width: "240px" }));
  });
});
