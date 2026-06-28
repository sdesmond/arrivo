import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChartCard } from "./chart-card";

describe("ChartCard", () => {
  it("renders children inside bordered card", () => {
    render(
      <ChartCard>
        <p>Chart content</p>
      </ChartCard>
    );

    const card = screen.getByText("Chart content").parentElement;
    expect(screen.getByText("Chart content")).toBeInTheDocument();
    expect(card).toHaveClass("border");
  });

  it("applies custom className", () => {
    render(
      <ChartCard className="custom-class">
        <p>Chart content</p>
      </ChartCard>
    );

    expect(screen.getByText("Chart content").parentElement).toHaveClass("custom-class");
  });
});
