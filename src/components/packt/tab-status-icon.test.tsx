import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BudgetStatus } from "@/data/types";
import { TabStatusIcon } from "./tab-status-icon";

describe("TabStatusIcon", () => {
  it("returns null when neutral", () => {
    const { container } = render(<TabStatusIcon status={BudgetStatus.Neutral} actual={0} budgetTotal={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders warning icon with hidden span when warning", () => {
    render(<TabStatusIcon status={BudgetStatus.Warning} actual={850} budgetTotal={1000} />);
    expect(screen.getByText("Warning")).toBeInTheDocument();
    expect(screen.getByText("Warning")).toHaveClass("sr-only");
  });

  it("renders Near limit hidden span when danger threshold crossed but actual is under the budget total", () => {
    render(<TabStatusIcon status={BudgetStatus.Danger} actual={950} budgetTotal={1000} />);
    expect(screen.getByText("Near limit")).toBeInTheDocument();
    expect(screen.getByText("Near limit")).toHaveClass("sr-only");
  });

  it("renders Over budget hidden span when actual has reached or passed the budget total", () => {
    render(<TabStatusIcon status={BudgetStatus.Danger} actual={1100} budgetTotal={1000} />);
    expect(screen.getByText("Over budget")).toBeInTheDocument();
    expect(screen.getByText("Over budget")).toHaveClass("sr-only");
  });

  it("icon is aria-hidden", () => {
    const { container } = render(<TabStatusIcon status={BudgetStatus.Warning} actual={850} budgetTotal={1000} />);
    const icon = container.querySelector("svg");
    expect(icon).toHaveAttribute("aria-hidden", "true");
  });

  it("icon has strokeWidth 1.5", () => {
    const { container } = render(<TabStatusIcon status={BudgetStatus.Danger} actual={1100} budgetTotal={1000} />);
    const icon = container.querySelector("svg");
    expect(icon).toHaveAttribute("stroke-width", "1.5");
  });
});
