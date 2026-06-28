import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CategoryBreakdownDonut } from "./category-breakdown-donut";
import { ExpenseCategory } from "@/data/types";
import { CATEGORY_CHART_COLORS } from "@/lib/budget";

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

describe("CategoryBreakdownDonut", () => {
  it("renders segments for each category in sorted order (largest first)", () => {
    const { container } = render(
      <CategoryBreakdownDonut
        data={[
          { category: ExpenseCategory.Food, total: 100, count: 2 },
          { category: ExpenseCategory.Lodging, total: 500, count: 1 },
          { category: ExpenseCategory.Transport, total: 50, count: 1 },
        ]}
        formatCurrency={formatCurrency}
      />
    );

    const names = [...container.querySelectorAll('[data-slot="donut-chart-legend-item"]')].map(
      (item) => item.textContent
    );
    expect(names[0]).toContain("Lodging");
    expect(names[1]).toContain("Food");
    expect(names[2]).toContain("Transport");
  });

  it("uses CATEGORY_CHART_COLORS for segment colors", () => {
    const { container } = render(
      <CategoryBreakdownDonut
        data={[{ category: ExpenseCategory.Food, total: 100, count: 1 }]}
        formatCurrency={formatCurrency}
      />
    );

    const swatch = container.querySelector('[data-slot="donut-chart-legend-item"] span[aria-hidden]');
    expect(swatch).toHaveStyle({ backgroundColor: CATEGORY_CHART_COLORS[ExpenseCategory.Food] });
  });

  it("generates accessibleLabel summarizing all segments", () => {
    render(
      <CategoryBreakdownDonut
        data={[
          { category: ExpenseCategory.Food, total: 100, count: 1 },
          { category: ExpenseCategory.Lodging, total: 200, count: 1 },
        ]}
        formatCurrency={formatCurrency}
      />
    );

    expect(
      screen.getByRole("img", {
        name: "Category breakdown donut chart: Lodging $200.00, Food $100.00",
      })
    ).toBeInTheDocument();
  });

  it("renders inside chart-card wrapper", () => {
    const { container } = render(
      <CategoryBreakdownDonut
        data={[{ category: ExpenseCategory.Food, total: 100, count: 1 }]}
        formatCurrency={formatCurrency}
      />
    );

    expect(container.querySelector('[data-slot="chart-card"]')).toBeInTheDocument();
  });

  it("zero items data array renders nothing", () => {
    const { container } = render(<CategoryBreakdownDonut data={[]} formatCurrency={formatCurrency} />);

    expect(container).toBeEmptyDOMElement();
  });
});
