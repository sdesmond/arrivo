import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DonutChart } from "./donut-chart";

const SEGMENTS = [
  { name: "Food", value: 100, color: "var(--chart-1)" },
  { name: "Lodging", value: 200, color: "var(--chart-2)" },
  { name: "Transport", value: 50, color: "var(--chart-3)" },
];

describe("DonutChart", () => {
  it("renders PieChart with correct number of segments", () => {
    const { container } = render(
      <DonutChart
        data={SEGMENTS}
        centerFigure="$350.00"
        accessibleLabel="Category breakdown donut chart: Food $100.00, Lodging $200.00, Transport $50.00"
      />
    );

    expect(container.querySelectorAll('[data-slot="donut-chart-legend-item"]')).toHaveLength(SEGMENTS.length);
  });

  it("renders center figure and label", () => {
    render(
      <DonutChart
        data={SEGMENTS}
        centerFigure="$350.00"
        centerLabel="Total Spend"
        accessibleLabel="Category breakdown donut chart"
      />
    );

    expect(screen.getByText("$350.00")).toBeInTheDocument();
    expect(screen.getByText("Total Spend")).toBeInTheDocument();
  });

  it("renders legend below chart", () => {
    render(<DonutChart data={SEGMENTS} centerFigure="$350.00" accessibleLabel="Category breakdown donut chart" />);

    for (const segment of SEGMENTS) {
      expect(screen.getByText(segment.name)).toBeInTheDocument();
    }
  });

  it("root element has role=img and accessibleLabel", () => {
    render(
      <DonutChart
        data={SEGMENTS}
        centerFigure="$350.00"
        accessibleLabel="Category breakdown donut chart: Food $100.00, Lodging $200.00, Transport $50.00"
      />
    );

    expect(
      screen.getByRole("img", {
        name: "Category breakdown donut chart: Food $100.00, Lodging $200.00, Transport $50.00",
      })
    ).toBeInTheDocument();
  });

  it("uses formatValue for tooltip/legend values", () => {
    render(
      <DonutChart
        data={SEGMENTS}
        centerFigure="$350.00"
        accessibleLabel="Category breakdown donut chart"
        formatValue={(value) => `$${value.toFixed(2)}`}
      />
    );

    expect(screen.getByText("$100.00")).toBeInTheDocument();
    expect(screen.getByText("$200.00")).toBeInTheDocument();
    expect(screen.getByText("$50.00")).toBeInTheDocument();
  });
});
