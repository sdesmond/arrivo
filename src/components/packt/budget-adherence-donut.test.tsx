import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BudgetAdherenceDonut } from "./budget-adherence-donut";

describe("BudgetAdherenceDonut", () => {
  it("renders 3 segments: Under budget, On budget, Over budget", () => {
    const { container } = render(<BudgetAdherenceDonut data={{ underBudget: 2, onBudget: 1, overBudget: 1 }} />);

    const names = [...container.querySelectorAll('[data-slot="donut-chart-legend-item"] > span:nth-child(2)')].map(
      (item) => item.textContent
    );
    expect(names).toEqual(["Under budget", "On budget", "Over budget"]);
  });

  it("segments sorted largest count first", () => {
    const { container } = render(<BudgetAdherenceDonut data={{ underBudget: 1, onBudget: 5, overBudget: 2 }} />);

    const names = [...container.querySelectorAll('[data-slot="donut-chart-legend-item"] > span:nth-child(2)')].map(
      (item) => item.textContent
    );
    expect(names).toEqual(["On budget", "Over budget", "Under budget"]);
  });

  it("Under budget uses var(--accent-brand) color", () => {
    const { container } = render(<BudgetAdherenceDonut data={{ underBudget: 1, onBudget: 0, overBudget: 0 }} />);

    const swatch = container.querySelector('[data-slot="donut-chart-legend-item"] span[aria-hidden]');
    expect(swatch).toHaveAttribute("style", expect.stringContaining("var(--accent-brand)"));
  });

  it("On budget uses var(--warning) color", () => {
    const { container } = render(<BudgetAdherenceDonut data={{ underBudget: 0, onBudget: 1, overBudget: 0 }} />);

    const swatch = container.querySelector('[data-slot="donut-chart-legend-item"] span[aria-hidden]');
    expect(swatch).toHaveAttribute("style", expect.stringContaining("var(--warning)"));
  });

  it("Over budget uses var(--destructive) color", () => {
    const { container } = render(<BudgetAdherenceDonut data={{ underBudget: 0, onBudget: 0, overBudget: 1 }} />);

    const swatch = container.querySelector('[data-slot="donut-chart-legend-item"] span[aria-hidden]');
    expect(swatch).toHaveAttribute("style", expect.stringContaining("var(--destructive)"));
  });

  it("generates accessibleLabel summarizing all segments with counts", () => {
    render(<BudgetAdherenceDonut data={{ underBudget: 4, onBudget: 2, overBudget: 1 }} />);

    expect(
      screen.getByRole("img", {
        name: "Budget adherence donut chart: Under budget 4 trips, On budget 2 trips, Over budget 1 trip",
      })
    ).toBeInTheDocument();
  });

  it("center figure shows total with 'Trips' plural (total !== 1)", () => {
    render(<BudgetAdherenceDonut data={{ underBudget: 2, onBudget: 1, overBudget: 1 }} />);

    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("Trips")).toBeInTheDocument();
  });

  it("center figure shows '1 Trip' singular (total === 1)", () => {
    const { container } = render(<BudgetAdherenceDonut data={{ underBudget: 1, onBudget: 0, overBudget: 0 }} />);

    const tspans = [...container.querySelectorAll('[data-testid="center-figure"] tspan')].map(
      (tspan) => tspan.textContent
    );
    expect(tspans).toEqual(["1", "Trip"]);
  });

  it("caption explains ±2% on-budget band", () => {
    render(<BudgetAdherenceDonut data={{ underBudget: 1, onBudget: 1, overBudget: 1 }} />);

    expect(screen.getByText("On budget means within 2% of the budget total")).toBeInTheDocument();
  });

  it("renders inside chart-card wrapper", () => {
    const { container } = render(<BudgetAdherenceDonut data={{ underBudget: 1, onBudget: 1, overBudget: 1 }} />);

    expect(container.querySelector('[data-slot="chart-card"]')).toBeInTheDocument();
  });

  it("all-zero data renders with center figure '0 Trips'", () => {
    const { container } = render(<BudgetAdherenceDonut data={{ underBudget: 0, onBudget: 0, overBudget: 0 }} />);

    const tspans = [...container.querySelectorAll('[data-testid="center-figure"] tspan')].map(
      (tspan) => tspan.textContent
    );
    expect(tspans).toEqual(["0", "Trips"]);
  });
});
