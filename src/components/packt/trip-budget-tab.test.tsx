import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { createExpense } = vi.hoisted(() => ({ createExpense: vi.fn() }));

vi.mock("@/app/(app)/trips/[tripId]/budget/actions", () => ({
  createExpense,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { TripBudgetTab } from "./trip-budget-tab";
import { ExpenseCategory } from "@/data/types";
import type { Expense } from "@/data/types";

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
    render(
      <TripBudgetTab
        tripId="trip-1"
        budget={{ currency: "EUR", total: Number.NaN }}
        expenses={[]}
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
});
