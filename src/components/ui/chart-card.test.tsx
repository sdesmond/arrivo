import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChartCard } from "./chart-card";

describe("ChartCard", () => {
  it("renders children inside bordered card", () => {
    const { container } = render(
      <ChartCard>
        <p>Chart content</p>
      </ChartCard>
    );

    expect(screen.getByText("Chart content")).toBeInTheDocument();
    expect(container.querySelector('[data-slot="chart-card"]')).toHaveClass("border");
  });

  it("applies custom className", () => {
    const { container } = render(
      <ChartCard className="custom-class">
        <p>Chart content</p>
      </ChartCard>
    );

    expect(container.querySelector('[data-slot="chart-card"]')).toHaveClass("custom-class");
  });

  it("renders a title heading when provided", () => {
    render(
      <ChartCard title="Categories">
        <p>Chart content</p>
      </ChartCard>
    );

    expect(screen.getByRole("heading", { name: "Categories" })).toBeInTheDocument();
  });

  it("renders no heading when title is omitted", () => {
    const { container } = render(
      <ChartCard>
        <p>Chart content</p>
      </ChartCard>
    );

    expect(container.querySelector("h3")).not.toBeInTheDocument();
  });
});
