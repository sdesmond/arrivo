import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TripBudgetTab } from "./trip-budget-tab";

describe("TripBudgetTab", () => {
  it("renders the no-budget prompt when no budget exists", () => {
    render(<TripBudgetTab budget={undefined} onOpenEditBudget={vi.fn()} />);

    expect(screen.getByText("No budget set yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set a budget" })).toBeInTheDocument();
    expect(screen.queryByText("Budget total")).not.toBeInTheDocument();
    expect(screen.queryByText("Remaining")).not.toBeInTheDocument();
  });

  it("opens the budget editor from the prompt", async () => {
    const user = userEvent.setup();
    const onOpenEditBudget = vi.fn();
    render(<TripBudgetTab budget={undefined} onOpenEditBudget={onOpenEditBudget} />);

    await user.click(screen.getByRole("button", { name: "Set a budget" }));

    expect(onOpenEditBudget).toHaveBeenCalledOnce();
  });

  it("renders the trip budget amount in the trip currency when a budget exists", () => {
    render(<TripBudgetTab budget={{ currency: "EUR", total: 5000 }} onOpenEditBudget={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Set a budget" })).not.toBeInTheDocument();
    expect(screen.getByText("Budget total")).toBeInTheDocument();
    expect(screen.getByText("EUR")).toBeInTheDocument();
    expect(screen.getByText("€5,000.00")).toBeInTheDocument();
  });

  it("treats a budget without a total as unset", () => {
    render(<TripBudgetTab budget={{ currency: "USD", total: undefined }} onOpenEditBudget={vi.fn()} />);

    expect(screen.getByText("No budget set yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set a budget" })).toBeInTheDocument();
  });

  it("opens the editor from the populated budget state", async () => {
    const user = userEvent.setup();
    const onOpenEditBudget = vi.fn();
    render(<TripBudgetTab budget={{ currency: "EUR", total: 5000 }} onOpenEditBudget={onOpenEditBudget} />);

    await user.click(screen.getByRole("button", { name: "Edit budget" }));

    expect(onOpenEditBudget).toHaveBeenCalledOnce();
  });

  it("falls back to a code-prefixed amount when Intl currency formatting fails", () => {
    render(<TripBudgetTab budget={{ currency: "invalid", total: 123.45 }} onOpenEditBudget={vi.fn()} />);

    expect(screen.getByText("invalid")).toBeInTheDocument();
    expect(screen.getByText("invalid 123.45")).toBeInTheDocument();
  });
});
