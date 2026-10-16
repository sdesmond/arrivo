import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BudgetStatus } from "@/data/types";
import { StatusBadge } from "./status-badge";

describe("StatusBadge", () => {
  it("renders warning state with icon and text", () => {
    render(<StatusBadge status={BudgetStatus.Warning} actual={850} budgetTotal={1000} />);

    expect(screen.getByText("Warning")).toBeInTheDocument();
    const badge = screen.getByText("Warning").closest("span");
    expect(badge).toHaveStyle({ backgroundColor: "var(--warning-soft)", color: "var(--warning-ink)" });
    expect(badge?.querySelector("svg")).toBeInTheDocument();
  });

  it("renders danger state with Near limit when actual has crossed the danger threshold but not the budget total", () => {
    render(<StatusBadge status={BudgetStatus.Danger} actual={950} budgetTotal={1000} />);

    expect(screen.getByText("Near limit")).toBeInTheDocument();
    const badge = screen.getByText("Near limit").closest("span");
    expect(badge).toHaveStyle({ backgroundColor: "var(--danger-soft)", color: "var(--danger-ink)" });
    expect(badge?.querySelector("svg")).toBeInTheDocument();
  });

  it("renders danger state with Over budget when actual has reached or passed the budget total", () => {
    render(<StatusBadge status={BudgetStatus.Danger} actual={1100} budgetTotal={1000} />);

    expect(screen.getByText("Over budget")).toBeInTheDocument();
    const badge = screen.getByText("Over budget").closest("span");
    expect(badge).toHaveStyle({ backgroundColor: "var(--danger-soft)", color: "var(--danger-ink)" });
    expect(badge?.querySelector("svg")).toBeInTheDocument();
  });

  it("icon has strokeWidth 1.5", () => {
    render(<StatusBadge status={BudgetStatus.Warning} actual={850} budgetTotal={1000} />);

    const icon = screen.getByText("Warning").closest("span")?.querySelector("svg");
    expect(icon).toHaveAttribute("stroke-width", "1.5");
  });
});
