import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { BudgetStatus } from "@/data/types";
import { BudgetProgressBar } from "./budget-progress-bar";

describe("BudgetProgressBar", () => {
  it("renders with neutral fill color", () => {
    const { container } = render(<BudgetProgressBar status={BudgetStatus.Neutral} actual={10} budgetTotal={100} />);
    const fill = container.querySelector("[data-slot='budget-progress-bar-fill']");
    expect(fill).toHaveStyle({ backgroundColor: "var(--accent-brand)" });
  });

  it("renders with warning fill color", () => {
    const { container } = render(<BudgetProgressBar status={BudgetStatus.Warning} actual={85} budgetTotal={100} />);
    const fill = container.querySelector("[data-slot='budget-progress-bar-fill']");
    expect(fill).toHaveStyle({ backgroundColor: "var(--warning)" });
  });

  it("renders with danger fill color", () => {
    const { container } = render(<BudgetProgressBar status={BudgetStatus.Danger} actual={95} budgetTotal={100} />);
    const fill = container.querySelector("[data-slot='budget-progress-bar-fill']");
    expect(fill).toHaveStyle({ backgroundColor: "var(--danger)" });
  });

  it("renders with correct width percentage", () => {
    const { container } = render(<BudgetProgressBar status={BudgetStatus.Neutral} actual={60} budgetTotal={100} />);
    const fill = container.querySelector("[data-slot='budget-progress-bar-fill']");
    expect(fill).toHaveStyle({ width: "60%" });
  });

  it("is aria-hidden", () => {
    const { container } = render(<BudgetProgressBar status={BudgetStatus.Neutral} actual={10} budgetTotal={100} />);
    const track = container.querySelector("[data-slot='budget-progress-bar']");
    expect(track).toHaveAttribute("aria-hidden", "true");
  });

  it("clamps width to 100%", () => {
    const { container } = render(<BudgetProgressBar status={BudgetStatus.Danger} actual={150} budgetTotal={100} />);
    const fill = container.querySelector("[data-slot='budget-progress-bar-fill']");
    expect(fill).toHaveStyle({ width: "100%" });
  });

  it("does not exceed 0% width when budgetTotal is zero", () => {
    const { container } = render(<BudgetProgressBar status={BudgetStatus.Neutral} actual={0} budgetTotal={0} />);
    const fill = container.querySelector("[data-slot='budget-progress-bar-fill']");
    expect(fill).toHaveStyle({ width: "0%" });
  });
});
