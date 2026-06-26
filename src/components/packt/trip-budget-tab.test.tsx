import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { createExpense, recalculateConversions } = vi.hoisted(() => ({
  createExpense: vi.fn(),
  recalculateConversions: vi.fn(),
}));

vi.mock("@/app/(app)/trips/[tripId]/budget/actions", () => ({
  createExpense,
  recalculateConversions,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { TripBudgetTab } from "./trip-budget-tab";
import { MockDateProvider } from "@/components/providers/mock-date-provider";
import { ExpenseCategory } from "@/data/types";
import type { Expense } from "@/data/types";

const NOW_ISO = "2026-06-26T12:00:00.000Z";

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MockDateProvider initialISO={NOW_ISO}>{children}</MockDateProvider>;
}

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "expense-1",
    tripId: "trip-1",
    category: ExpenseCategory.Misc,
    amount: 10,
    currency: "EUR",
    convertedAmountTrip: 10,
    convertedCurrencyTrip: "EUR",
    date: "2026-08-01",
    ...overrides,
  };
}

describe("TripBudgetTab", () => {
  it("shows the Set a budget prompt and the empty state when no budget and no expenses", () => {
    render(<TripBudgetTab tripId="trip-1" budget={undefined} expenses={[]} onOpenEditBudget={vi.fn()} />);

    expect(screen.getByText("Actual spent")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set a budget" })).toBeInTheDocument();
    expect(screen.getByText("No expenses yet")).toBeInTheDocument();
    expect(screen.queryByText("Remaining")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit budget" })).not.toBeInTheDocument();
  });

  it("opens the budget editor from the Set a budget prompt", async () => {
    const user = userEvent.setup();
    const onOpenEditBudget = vi.fn();
    render(<TripBudgetTab tripId="trip-1" budget={undefined} expenses={[]} onOpenEditBudget={onOpenEditBudget} />);

    await user.click(screen.getByRole("button", { name: "Set a budget" }));

    expect(onOpenEditBudget).toHaveBeenCalledOnce();
  });

  it("renders the Actual spent figure converted to the trip currency", () => {
    const expenses = [
      makeExpense({ id: "a", category: ExpenseCategory.Food, convertedAmountTrip: 40 }),
      makeExpense({ id: "b", category: ExpenseCategory.Lodging, convertedAmountTrip: 60 }),
    ];
    render(
      <TripBudgetTab
        tripId="trip-1"
        budget={{ currency: "EUR", total: 5000 }}
        expenses={expenses}
        onOpenEditBudget={vi.fn()}
      />
    );

    expect(screen.getByText("Actual spent")).toBeInTheDocument();
    expect(screen.getByText("€100.00")).toBeInTheDocument();
  });

  it("shows Budget total and Remaining when a budget exists", () => {
    const expenses = [makeExpense({ id: "a", convertedAmountTrip: 250 })];
    render(
      <TripBudgetTab
        tripId="trip-1"
        budget={{ currency: "EUR", total: 5000 }}
        expenses={expenses}
        onOpenEditBudget={vi.fn()}
      />
    );

    expect(screen.getByText("Budget")).toBeInTheDocument();
    expect(screen.getByText("€5,000.00")).toBeInTheDocument();
    expect(screen.getByText("Remaining")).toBeInTheDocument();
    expect(screen.getByText("€4,750.00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit budget" })).toBeInTheDocument();
  });

  it("opens the editor from the Edit budget button", async () => {
    const user = userEvent.setup();
    const onOpenEditBudget = vi.fn();
    render(
      <TripBudgetTab
        tripId="trip-1"
        budget={{ currency: "EUR", total: 5000 }}
        expenses={[makeExpense()]}
        onOpenEditBudget={onOpenEditBudget}
      />
    );

    await user.click(screen.getByRole("button", { name: "Edit budget" }));

    expect(onOpenEditBudget).toHaveBeenCalledOnce();
  });

  it("renders one tile per category with its subtotal", () => {
    const expenses = [
      makeExpense({ id: "a", category: ExpenseCategory.Food, convertedAmountTrip: 20 }),
      makeExpense({ id: "b", category: ExpenseCategory.Food, convertedAmountTrip: 30 }),
      makeExpense({ id: "c", category: ExpenseCategory.Lodging, convertedAmountTrip: 200 }),
    ];
    render(
      <TripBudgetTab
        tripId="trip-1"
        budget={{ currency: "EUR", total: 5000 }}
        expenses={expenses}
        onOpenEditBudget={vi.fn()}
      />
    );

    expect(screen.getByText("Food")).toBeInTheDocument();
    expect(screen.getByText("€50.00")).toBeInTheDocument();
    expect(screen.getByText("Lodging")).toBeInTheDocument();
    expect(screen.getByText("€200.00")).toBeInTheDocument();
  });

  it("omits categories with no expenses", () => {
    const expenses = [makeExpense({ id: "a", category: ExpenseCategory.Transport, convertedAmountTrip: 42 })];
    render(
      <TripBudgetTab
        tripId="trip-1"
        budget={{ currency: "EUR", total: 5000 }}
        expenses={expenses}
        onOpenEditBudget={vi.fn()}
      />
    );

    expect(screen.getByText("Transport")).toBeInTheDocument();
    expect(screen.queryByText("Food")).not.toBeInTheDocument();
    expect(screen.queryByText("Lodging")).not.toBeInTheDocument();
  });

  it("shows the No expenses yet empty state with the toolbar still visible", () => {
    render(
      <TripBudgetTab
        tripId="trip-1"
        budget={{ currency: "EUR", total: 5000 }}
        expenses={[]}
        onOpenEditBudget={vi.fn()}
      />
    );

    expect(screen.getByText("No expenses yet")).toBeInTheDocument();
    expect(screen.getByText("Actual spent")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit budget" })).toBeInTheDocument();
  });

  it("shows the Actual figure but hides Remaining when expenses exist without a budget", () => {
    const expenses = [
      makeExpense({ id: "a", category: ExpenseCategory.Food, convertedAmountTrip: 50 }),
      makeExpense({ id: "b", category: ExpenseCategory.Lodging, convertedAmountTrip: 25 }),
    ];
    render(<TripBudgetTab tripId="trip-1" budget={undefined} expenses={expenses} onOpenEditBudget={vi.fn()} />);

    expect(screen.getByText("€75.00")).toBeInTheDocument();
    expect(screen.queryByText("Remaining")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set a budget" })).toBeInTheDocument();
  });

  it("falls back to raw amount when convertedAmountTrip is missing", () => {
    const expenses = [
      makeExpense({ id: "a", category: ExpenseCategory.Food, amount: 33, convertedAmountTrip: undefined }),
      makeExpense({ id: "b", category: ExpenseCategory.Lodging, convertedAmountTrip: 7 }),
    ];
    render(
      <TripBudgetTab
        tripId="trip-1"
        budget={{ currency: "EUR", total: 5000 }}
        expenses={expenses}
        onOpenEditBudget={vi.fn()}
      />
    );

    expect(screen.getByText("€33.00")).toBeInTheDocument();
    expect(screen.getByText("€40.00")).toBeInTheDocument();
  });

  it("treats a budget without a total as unset", () => {
    render(
      <TripBudgetTab
        tripId="trip-1"
        budget={{ currency: "EUR", total: undefined }}
        expenses={[]}
        onOpenEditBudget={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Set a budget" })).toBeInTheDocument();
    expect(screen.queryByText("Remaining")).not.toBeInTheDocument();
  });

  it("falls back to a code-prefixed amount when Intl currency formatting fails", () => {
    render(
      <TripBudgetTab
        tripId="trip-1"
        budget={{ currency: "invalid", total: 100 }}
        expenses={[]}
        onOpenEditBudget={vi.fn()}
      />
    );

    expect(screen.getByText("invalid 0.00")).toBeInTheDocument();
  });

  it("renders ?? when an amount is not finite (Infinity)", () => {
    render(
      <TripBudgetTab
        tripId="trip-1"
        budget={{ currency: "invalid", total: Number.POSITIVE_INFINITY }}
        expenses={[]}
        onOpenEditBudget={vi.fn()}
      />
    );

    expect(screen.getAllByText("invalid ??").length).toBeGreaterThan(0);
  });

  it("renders ?? for NaN amounts", () => {
    const expenses = [makeExpense({ id: "a", convertedAmountTrip: Number.NaN })];
    render(
      <TripBudgetTab
        tripId="trip-1"
        budget={{ currency: "EUR", total: 1000 }}
        expenses={expenses}
        onOpenEditBudget={vi.fn()}
      />
    );

    expect(screen.getAllByText("EUR ??").length).toBeGreaterThan(0);
  });

  it("shows negative Remaining when overspent", () => {
    const expenses = [makeExpense({ id: "a", convertedAmountTrip: 6000 })];
    render(
      <TripBudgetTab
        tripId="trip-1"
        budget={{ currency: "EUR", total: 5000 }}
        expenses={expenses}
        onOpenEditBudget={vi.fn()}
      />
    );

    expect(screen.getByText("Remaining")).toBeInTheDocument();
    expect(screen.getByText("-€1,000.00")).toBeInTheDocument();
  });

  it("hides Remaining when budget exists but has no currency", () => {
    const budgetNoCurrency = { currency: "", total: 5000 } as import("@/data/types").Budget;
    render(
      <TripBudgetTab
        tripId="trip-1"
        budget={budgetNoCurrency}
        expenses={[makeExpense({ id: "a", convertedAmountTrip: 100 })]}
        onOpenEditBudget={vi.fn()}
      />
    );

    expect(screen.getByText("Actual spent")).toBeInTheDocument();
    expect(screen.queryByText("Remaining")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set a budget" })).toBeInTheDocument();
  });

  it("shows the Add Misc Expense button in the toolbar regardless of expense state", () => {
    render(<TripBudgetTab tripId="trip-1" budget={undefined} expenses={[]} onOpenEditBudget={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Add Misc Expense" })).toBeInTheDocument();
  });

  it("keeps the Add Misc Expense button visible alongside existing expenses", () => {
    render(
      <TripBudgetTab
        tripId="trip-1"
        budget={{ currency: "EUR", total: 5000 }}
        expenses={[makeExpense()]}
        onOpenEditBudget={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Add Misc Expense" })).toBeInTheDocument();
  });

  it("opens the Misc Expense modal from the toolbar button", async () => {
    const user = userEvent.setup();
    render(<TripBudgetTab tripId="trip-1" budget={undefined} expenses={[]} onOpenEditBudget={vi.fn()} />);

    expect(screen.queryByRole("textbox", { name: "Amount" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add Misc Expense" }));

    expect(screen.getByRole("textbox", { name: "Amount" })).toBeInTheDocument();
  });

  it("defaults the Misc Expense modal currency to the resolved defaultExpenseCurrency", async () => {
    const user = userEvent.setup();
    render(
      <TripBudgetTab
        tripId="trip-1"
        budget={undefined}
        expenses={[]}
        onOpenEditBudget={vi.fn()}
        defaultExpenseCurrency="GBP"
      />
    );

    await user.click(screen.getByRole("button", { name: "Add Misc Expense" }));

    expect(screen.getByRole("button", { name: /Currency: British Pound GBP/i })).toBeInTheDocument();
  });

  describe("threshold status", () => {
    it("shows no progress bar and no badge when no budget set", () => {
      const { container } = render(
        <TripBudgetTab tripId="trip-1" budget={undefined} expenses={[]} onOpenEditBudget={vi.fn()} />
      );

      expect(container.querySelector("[data-slot='budget-progress-bar']")).not.toBeInTheDocument();
      expect(screen.queryByText("Warning")).not.toBeInTheDocument();
      expect(screen.queryByText("Over budget")).not.toBeInTheDocument();
    });

    it("shows progress bar with neutral fill and no badge when actual is below the warning threshold", () => {
      const expenses = [makeExpense({ id: "a", convertedAmountTrip: 100 })];
      const { container } = render(
        <TripBudgetTab
          tripId="trip-1"
          budget={{ currency: "EUR", total: 1000 }}
          expenses={expenses}
          onOpenEditBudget={vi.fn()}
          warningThreshold={80}
          dangerThreshold={90}
        />
      );

      const fill = container.querySelector("[data-slot='budget-progress-bar-fill']");
      expect(fill).toHaveStyle({ backgroundColor: "var(--accent-brand)" });
      expect(screen.queryByText("Warning")).not.toBeInTheDocument();
      expect(screen.queryByText("Over budget")).not.toBeInTheDocument();
    });

    it("shows badge with warning icon and text when actual crosses the warning threshold", () => {
      const expenses = [makeExpense({ id: "a", convertedAmountTrip: 850 })];
      render(
        <TripBudgetTab
          tripId="trip-1"
          budget={{ currency: "EUR", total: 1000 }}
          expenses={expenses}
          onOpenEditBudget={vi.fn()}
          warningThreshold={80}
          dangerThreshold={90}
        />
      );

      expect(screen.getByText("Warning")).toBeInTheDocument();
    });

    it("shows badge with Near limit when actual crosses the danger threshold but stays under the budget total", () => {
      const expenses = [makeExpense({ id: "a", convertedAmountTrip: 950 })];
      render(
        <TripBudgetTab
          tripId="trip-1"
          budget={{ currency: "EUR", total: 1000 }}
          expenses={expenses}
          onOpenEditBudget={vi.fn()}
          warningThreshold={80}
          dangerThreshold={90}
        />
      );

      expect(screen.getByText("Near limit")).toBeInTheDocument();
    });

    it("shows badge with Over budget when actual reaches or passes the budget total", () => {
      const expenses = [makeExpense({ id: "a", convertedAmountTrip: 1100 })];
      render(
        <TripBudgetTab
          tripId="trip-1"
          budget={{ currency: "EUR", total: 1000 }}
          expenses={expenses}
          onOpenEditBudget={vi.fn()}
          warningThreshold={80}
          dangerThreshold={90}
        />
      );

      expect(screen.getByText("Over budget")).toBeInTheDocument();
    });

    it("progress bar width matches the actual/budget percentage", () => {
      const expenses = [makeExpense({ id: "a", convertedAmountTrip: 600 })];
      const { container } = render(
        <TripBudgetTab
          tripId="trip-1"
          budget={{ currency: "EUR", total: 1000 }}
          expenses={expenses}
          onOpenEditBudget={vi.fn()}
          warningThreshold={80}
          dangerThreshold={90}
        />
      );

      const fill = container.querySelector("[data-slot='budget-progress-bar-fill']");
      expect(fill).toHaveStyle({ width: "60%" });
    });

    it("updates status immediately when expenses change (re-render)", () => {
      const expenses = [makeExpense({ id: "a", convertedAmountTrip: 100 })];
      const { rerender } = render(
        <TripBudgetTab
          tripId="trip-1"
          budget={{ currency: "EUR", total: 1000 }}
          expenses={expenses}
          onOpenEditBudget={vi.fn()}
          warningThreshold={80}
          dangerThreshold={90}
        />
      );

      expect(screen.queryByText("Over budget")).not.toBeInTheDocument();

      const updatedExpenses = [makeExpense({ id: "a", convertedAmountTrip: 1100 })];
      rerender(
        <TripBudgetTab
          tripId="trip-1"
          budget={{ currency: "EUR", total: 1000 }}
          expenses={updatedExpenses}
          onOpenEditBudget={vi.fn()}
          warningThreshold={80}
          dangerThreshold={90}
        />
      );

      expect(screen.getByText("Over budget")).toBeInTheDocument();
    });
  });

  describe("Recalculate Conversions", () => {
    it("hides the button when all expenses match the trip currency", () => {
      const expenses = [makeExpense({ id: "a", currency: "EUR" })];
      render(
        <TripBudgetTab
          tripId="trip-1"
          budget={{ currency: "EUR", total: 5000 }}
          expenses={expenses}
          onOpenEditBudget={vi.fn()}
        />
      );

      expect(screen.queryByRole("button", { name: "Recalculate Conversions" })).not.toBeInTheDocument();
    });

    it("hides the button when there are no expenses", () => {
      render(
        <TripBudgetTab
          tripId="trip-1"
          budget={{ currency: "EUR", total: 5000 }}
          expenses={[]}
          onOpenEditBudget={vi.fn()}
        />
      );

      expect(screen.queryByRole("button", { name: "Recalculate Conversions" })).not.toBeInTheDocument();
    });

    it("hides the button when the only mismatched expense already has a fixed historical rate", () => {
      const expenses = [
        makeExpense({
          id: "a",
          currency: "GBP",
          date: "2024-01-01",
          updatedAt: "2024-01-01T18:00:00.000Z",
        }),
      ];
      render(
        <TripBudgetTab
          tripId="trip-1"
          budget={{ currency: "EUR", total: 5000 }}
          expenses={expenses}
          onOpenEditBudget={vi.fn()}
        />,
        { wrapper: Wrapper }
      );

      expect(screen.queryByRole("button", { name: "Recalculate Conversions" })).not.toBeInTheDocument();
    });

    it("shows the button when at least one expense mismatches the trip currency", () => {
      const expenses = [makeExpense({ id: "a", currency: "GBP" })];
      render(
        <TripBudgetTab
          tripId="trip-1"
          budget={{ currency: "EUR", total: 5000 }}
          expenses={expenses}
          onOpenEditBudget={vi.fn()}
        />
      );

      expect(screen.getByRole("button", { name: "Recalculate Conversions" })).toBeInTheDocument();
    });

    it("shows a spinner and disables the button while recalculating", async () => {
      const user = userEvent.setup();
      let resolveRecalculation: () => void = () => {};
      recalculateConversions.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveRecalculation = resolve;
          })
      );
      const expenses = [makeExpense({ id: "a", currency: "GBP" })];
      render(
        <TripBudgetTab
          tripId="trip-1"
          budget={{ currency: "EUR", total: 5000 }}
          expenses={expenses}
          onOpenEditBudget={vi.fn()}
        />
      );

      await user.click(screen.getByRole("button", { name: "Recalculate Conversions" }));

      const recalculatingButton = screen.getByRole("button", { name: "Recalculating..." });
      expect(recalculatingButton).toBeDisabled();

      resolveRecalculation();
      await waitFor(() => expect(screen.getByRole("button", { name: "Recalculate Conversions" })).toBeEnabled());
    });

    it("calls recalculateConversions with the tripId on click", async () => {
      const user = userEvent.setup();
      recalculateConversions.mockResolvedValue({ recalculated: true });
      const expenses = [makeExpense({ id: "a", currency: "GBP" })];
      render(
        <TripBudgetTab
          tripId="trip-1"
          budget={{ currency: "EUR", total: 5000 }}
          expenses={expenses}
          onOpenEditBudget={vi.fn()}
        />
      );

      await user.click(screen.getByRole("button", { name: "Recalculate Conversions" }));

      expect(recalculateConversions).toHaveBeenCalledWith("trip-1");
    });

    it("shows a success toast on completion", async () => {
      const user = userEvent.setup();
      recalculateConversions.mockResolvedValue({ recalculated: true });
      const { toast } = await import("sonner");
      const expenses = [makeExpense({ id: "a", currency: "GBP" })];
      render(
        <TripBudgetTab
          tripId="trip-1"
          budget={{ currency: "EUR", total: 5000 }}
          expenses={expenses}
          onOpenEditBudget={vi.fn()}
        />
      );

      await user.click(screen.getByRole("button", { name: "Recalculate Conversions" }));

      await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Conversions recalculated."));
    });

    it("shows an error toast on failure", async () => {
      const user = userEvent.setup();
      recalculateConversions.mockRejectedValue(new Error("Currency conversion failed (HTTP 503)."));
      const { toast } = await import("sonner");
      const expenses = [makeExpense({ id: "a", currency: "GBP" })];
      render(
        <TripBudgetTab
          tripId="trip-1"
          budget={{ currency: "EUR", total: 5000 }}
          expenses={expenses}
          onOpenEditBudget={vi.fn()}
        />
      );

      await user.click(screen.getByRole("button", { name: "Recalculate Conversions" }));

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith("Recalculation failed — no amounts were changed. Try again.")
      );
    });
  });
});
