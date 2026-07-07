import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SpendingHeadlineFigures } from "./spending-headline-figures";
import type { SpendingSummary } from "@/data/types";

function makeSummary(overrides: Partial<SpendingSummary> = {}): SpendingSummary {
  return {
    totalSpend: 0,
    averageTripSpend: 0,
    averageDailySpend: null,
    averageTripDuration: null,
    tripCount: 0,
    countedTripCount: 0,
    totalTripDays: 0,
    categoryBreakdown: [],
    destinationBreakdown: [],
    budgetAdherence: { underBudget: 0, onBudget: 0, overBudget: 0 },
    ...overrides,
  };
}

describe("SpendingHeadlineFigures", () => {
  it("renders Total Spend, Average Trip Spend, Average Daily Spend, Average Days per Trip in order", () => {
    render(<SpendingHeadlineFigures summary={makeSummary()} currency="USD" />);

    const labels = screen.getAllByText(/Total Spend|Average Trip Spend|Average Daily Spend|Average Days per Trip/);
    expect(labels.map((label) => label.textContent)).toEqual([
      "Total Spend",
      "Average Trip Spend",
      "Average Daily Spend",
      "Average Days per Trip",
    ]);
  });

  it("formats figures with profile currency", () => {
    const summary = makeSummary({
      totalSpend: 1234.5,
      averageTripSpend: 617.25,
      averageDailySpend: 88.18,
      averageTripDuration: 4.5,
    });
    render(<SpendingHeadlineFigures summary={summary} currency="EUR" />);

    expect(screen.getByText("€1,234.50")).toBeInTheDocument();
    expect(screen.getByText("€617.25")).toBeInTheDocument();
    expect(screen.getByText("€88.18")).toBeInTheDocument();
    expect(screen.getByText("4.5 days")).toBeInTheDocument();
  });

  it("shows $0 for currency figures and a dash for daily spend and trip length when summary has zero spend", () => {
    render(<SpendingHeadlineFigures summary={makeSummary()} currency="USD" />);

    expect(screen.getAllByText("$0.00")).toHaveLength(2);
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("renders labels above each figure", () => {
    render(<SpendingHeadlineFigures summary={makeSummary({ totalSpend: 100 })} currency="USD" />);

    const label = screen.getByText("Total Spend");
    const figure = screen.getByText("$100.00");
    expect(label.compareDocumentPosition(figure) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
