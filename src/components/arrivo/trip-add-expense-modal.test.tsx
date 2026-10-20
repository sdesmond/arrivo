import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockDateProvider } from "@/components/providers/mock-date-provider";
import { TripAddExpenseModal } from "./trip-add-expense-modal";
import { ExpenseCategory } from "@/data/types";
import type { Expense } from "@/data/types";
import { pickSelectOption } from "@/test-utils/pick-select-option";

const { createExpense, updateExpense, deleteExpense } = vi.hoisted(() => ({
  createExpense: vi.fn(),
  updateExpense: vi.fn(),
  deleteExpense: vi.fn(),
}));

vi.mock("@/app/(app)/trips/[tripId]/budget/actions", () => ({
  createExpense,
  updateExpense,
  deleteExpense,
}));

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "expense-1",
    tripId: "trip-1",
    category: ExpenseCategory.Misc,
    amount: 25,
    currency: "USD",
    date: "2026-08-02",
    note: "Visa fee",
    ...overrides,
  };
}

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open: boolean;
    onOpenChange?: (open: boolean) => void;
  }) =>
    open ? (
      <>
        {children}
        <button data-testid="dialog-backdrop-close" onClick={() => onOpenChange?.(false)} />
      </>
    ) : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-footer">{children}</div>,
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MockDateProvider initialISO="2026-08-02T12:00:00.000Z">{children}</MockDateProvider>;
}

describe("TripAddExpenseModal", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when closed", () => {
    render(<TripAddExpenseModal tripId="trip-1" open={false} onOpenChange={vi.fn()} />, { wrapper: Wrapper });

    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("renders amount, currency, category, date, and note fields", () => {
    render(<TripAddExpenseModal tripId="trip-1" defaultCurrency="EUR" open onOpenChange={vi.fn()} />, {
      wrapper: Wrapper,
    });

    expect(screen.getByText("Add Misc Expense")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Amount" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Currency: Euro EUR/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /select category/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /august 2, 2026/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Note" })).toBeInTheDocument();
  });

  it("defaults currency to the Trip Currency prop and date to today", () => {
    render(<TripAddExpenseModal tripId="trip-1" defaultCurrency="EUR" open onOpenChange={vi.fn()} />, {
      wrapper: Wrapper,
    });

    expect(screen.getByRole("button", { name: /Currency: Euro EUR/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /august 2, 2026/i })).toBeInTheDocument();
  });

  it("falls back to USD when no default currency is provided (profile currency resolved upstream)", () => {
    render(<TripAddExpenseModal tripId="trip-1" open onOpenChange={vi.fn()} />, { wrapper: Wrapper });

    expect(screen.getByRole("button", { name: /Currency: United States Dollar USD/i })).toBeInTheDocument();
  });

  it("uses a searchable currency picker", async () => {
    const user = userEvent.setup();
    render(<TripAddExpenseModal tripId="trip-1" defaultCurrency="USD" open onOpenChange={vi.fn()} />, {
      wrapper: Wrapper,
    });

    await user.click(screen.getByRole("button", { name: /Currency: United States Dollar USD/i }));

    expect(screen.getByRole("textbox", { name: "Search currencies" })).toBeInTheDocument();
  });

  it("marks the category control as aria-required", () => {
    render(<TripAddExpenseModal tripId="trip-1" open onOpenChange={vi.fn()} />, { wrapper: Wrapper });

    expect(screen.getByRole("button", { name: /select category/i })).toHaveAttribute("aria-required", "true");
  });

  it("rejects a zero or negative amount with an inline message", async () => {
    const user = userEvent.setup();
    render(<TripAddExpenseModal tripId="trip-1" open onOpenChange={vi.fn()} />, { wrapper: Wrapper });

    await pickSelectOption(user, /select category/i, "Food");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByText("Amount must be greater than 0.")).toBeInTheDocument());
    expect(createExpense).not.toHaveBeenCalled();
  });

  it("rejects an amount above the 50,000 ceiling with an inline message", async () => {
    const user = userEvent.setup();
    render(<TripAddExpenseModal tripId="trip-1" open onOpenChange={vi.fn()} />, { wrapper: Wrapper });

    await user.type(screen.getByRole("textbox", { name: "Amount" }), "50000.01");
    await pickSelectOption(user, /select category/i, "Food");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByText("Amount must be 50,000 or less.")).toBeInTheDocument());
    expect(createExpense).not.toHaveBeenCalled();
  });

  it("rejects a save with no category selected", async () => {
    const user = userEvent.setup();
    render(<TripAddExpenseModal tripId="trip-1" open onOpenChange={vi.fn()} />, { wrapper: Wrapper });

    await user.type(screen.getByRole("textbox", { name: "Amount" }), "25");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByText("Category is required.")).toBeInTheDocument());
    expect(createExpense).not.toHaveBeenCalled();
  });

  it("clears validation errors after correcting amount and category", async () => {
    const user = userEvent.setup();
    render(<TripAddExpenseModal tripId="trip-1" open onOpenChange={vi.fn()} />, { wrapper: Wrapper });

    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(screen.getByText("Amount must be greater than 0.")).toBeInTheDocument();
      expect(screen.getByText("Category is required.")).toBeInTheDocument();
    });

    await user.type(screen.getByRole("textbox", { name: "Amount" }), "14");
    await pickSelectOption(user, /select category/i, "Food");

    expect(screen.queryByText("Amount must be greater than 0.")).not.toBeInTheDocument();
    expect(screen.queryByText("Category is required.")).not.toBeInTheDocument();
  });

  it("calls createExpense with a structured unlinked input and closes on success", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    createExpense.mockResolvedValue({ id: "expense-1" });
    render(<TripAddExpenseModal tripId="trip-1" defaultCurrency="USD" open onOpenChange={onOpenChange} />, {
      wrapper: Wrapper,
    });

    await user.type(screen.getByRole("textbox", { name: "Amount" }), "120.50");
    await pickSelectOption(user, /select category/i, "Activity");
    await user.type(screen.getByRole("textbox", { name: "Note" }), "Visa fee");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(createExpense).toHaveBeenCalledWith("trip-1", {
        category: "activity",
        amount: 120.5,
        currency: "USD",
        date: "2026-08-02",
        note: "Visa fee",
      })
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("shows a toast and stays open when the save returns a conversionError", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    createExpense.mockResolvedValue({ id: "expense-1", conversionError: true });
    render(<TripAddExpenseModal tripId="trip-1" defaultCurrency="USD" open onOpenChange={onOpenChange} />, {
      wrapper: Wrapper,
    });

    const { toast } = await import("sonner");

    await user.type(screen.getByRole("textbox", { name: "Amount" }), "25");
    await pickSelectOption(user, /select category/i, "Food");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't convert currency — try again."));
    await waitFor(() => expect(onOpenChange).not.toHaveBeenCalled());
  });

  it("stays open and shows a toast when createExpense rejects", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    createExpense.mockRejectedValue(new Error("Network error"));
    render(<TripAddExpenseModal tripId="trip-1" defaultCurrency="USD" open onOpenChange={onOpenChange} />, {
      wrapper: Wrapper,
    });

    const { toast } = await import("sonner");

    await user.type(screen.getByRole("textbox", { name: "Amount" }), "25");
    await pickSelectOption(user, /select category/i, "Food");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Network error"));
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("forwards cancel and backdrop close to onOpenChange(false)", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<TripAddExpenseModal tripId="trip-1" open onOpenChange={onOpenChange} />, { wrapper: Wrapper });

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByTestId("dialog-backdrop-close"));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("supports full keyboard tab order starting at amount and ending on save/cancel", async () => {
    const user = userEvent.setup();
    render(<TripAddExpenseModal tripId="trip-1" defaultCurrency="USD" open onOpenChange={vi.fn()} />, {
      wrapper: Wrapper,
    });

    expect(screen.getByRole("textbox", { name: "Amount" })).toHaveFocus();

    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(screen.getByRole("button", { name: /Currency: United States Dollar USD/i })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("textbox", { name: "Amount" })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: /select category/i })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: /august 2, 2026/i })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("textbox", { name: "Note" })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "Save" })).toHaveFocus();
  });

  it("closes the category picker on Escape and returns focus to its trigger", async () => {
    const user = userEvent.setup();
    render(<TripAddExpenseModal tripId="trip-1" open onOpenChange={vi.fn()} />, { wrapper: Wrapper });

    await user.click(screen.getByRole("button", { name: /select category/i }));
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox", { name: "Expense categories" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /select category/i })).toHaveFocus());
  });

  it("closes the currency picker on Escape without changing the selection", async () => {
    const user = userEvent.setup();
    render(<TripAddExpenseModal tripId="trip-1" defaultCurrency="USD" open onOpenChange={vi.fn()} />, {
      wrapper: Wrapper,
    });

    const trigger = screen.getByRole("button", { name: /Currency: United States Dollar USD/i });
    await user.click(trigger);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox", { name: "Currency options" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Currency: United States Dollar USD/i })).toBeInTheDocument();
  });

  describe("edit mode", () => {
    it("renders in add mode with Add Misc Expense title when no expense prop", () => {
      render(<TripAddExpenseModal tripId="trip-1" open onOpenChange={vi.fn()} />, { wrapper: Wrapper });

      expect(screen.getByText("Add Misc Expense")).toBeInTheDocument();
      expect(screen.queryByText("Edit Misc Expense")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    });

    it("renders in edit mode with Edit Misc Expense title when expense prop provided", () => {
      const expense = makeExpense();
      render(<TripAddExpenseModal tripId="trip-1" expense={expense} open onOpenChange={vi.fn()} />, {
        wrapper: Wrapper,
      });

      expect(screen.getByText("Edit Misc Expense")).toBeInTheDocument();
      expect(screen.queryByText("Add Misc Expense")).not.toBeInTheDocument();
    });

    it("pre-fills amount, currency, category, date, and note from the expense prop", () => {
      const expense = makeExpense({
        amount: 120.5,
        currency: "EUR",
        category: ExpenseCategory.Activity,
        date: "2026-08-03",
        note: "Visa fee",
      });
      render(<TripAddExpenseModal tripId="trip-1" expense={expense} open onOpenChange={vi.fn()} />, {
        wrapper: Wrapper,
      });

      expect(screen.getByRole("textbox", { name: "Amount" })).toHaveValue("120.5");
      expect(screen.getByRole("button", { name: /Currency: Euro EUR/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Activity" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /august 3, 2026/i })).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue("Visa fee");
    });

    it("shows Remove button only in edit mode, not in add mode", () => {
      const expense = makeExpense();
      render(<TripAddExpenseModal tripId="trip-1" expense={expense} open onOpenChange={vi.fn()} />, {
        wrapper: Wrapper,
      });

      expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
    });

    it("calls updateExpense with updated fields on Save in edit mode", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      const expense = makeExpense({ id: "expense-9" });
      updateExpense.mockResolvedValue(undefined);
      render(<TripAddExpenseModal tripId="trip-1" expense={expense} open onOpenChange={onOpenChange} />, {
        wrapper: Wrapper,
      });

      const amountInput = screen.getByRole("textbox", { name: "Amount" });
      await user.clear(amountInput);
      await user.type(amountInput, "75");
      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() =>
        expect(updateExpense).toHaveBeenCalledWith("expense-9", {
          category: ExpenseCategory.Misc,
          amount: 75,
          currency: "USD",
          date: "2026-08-02",
          note: "Visa fee",
        })
      );
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    });

    it("calls deleteExpense with expense.id on Remove in edit mode", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      const expense = makeExpense({ id: "expense-9" });
      deleteExpense.mockResolvedValue(undefined);
      render(<TripAddExpenseModal tripId="trip-1" expense={expense} open onOpenChange={onOpenChange} />, {
        wrapper: Wrapper,
      });

      await user.click(screen.getByRole("button", { name: "Remove" }));

      await waitFor(() => expect(deleteExpense).toHaveBeenCalledWith("expense-9"));
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    });

    it("Cancel in edit mode closes without saving", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      const expense = makeExpense();
      render(<TripAddExpenseModal tripId="trip-1" expense={expense} open onOpenChange={onOpenChange} />, {
        wrapper: Wrapper,
      });

      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(updateExpense).not.toHaveBeenCalled();
    });

    it("validation errors work the same in edit mode as add mode", async () => {
      const user = userEvent.setup();
      const expense = makeExpense();
      render(<TripAddExpenseModal tripId="trip-1" expense={expense} open onOpenChange={vi.fn()} />, {
        wrapper: Wrapper,
      });

      const amountInput = screen.getByRole("textbox", { name: "Amount" });
      await user.clear(amountInput);
      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(screen.getByText("Amount must be greater than 0.")).toBeInTheDocument());
      expect(updateExpense).not.toHaveBeenCalled();
    });
  });
});
