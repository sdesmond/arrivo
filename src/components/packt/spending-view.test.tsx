import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SpendingView } from "./spending-view";
import { SpendingDateRange } from "@/data/types";
import type { SpendingSummary, Trip } from "@/data/types";

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return { id: "trip-1", status: "past", name: "Trip", ...overrides };
}

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

describe("SpendingView", () => {
  it("renders SpendingDateFilter and SpendingHeadlineFigures", () => {
    render(
      <SpendingView
        initialRange={SpendingDateRange.ThisYear}
        initialSummary={makeSummary({ tripCount: 2, totalSpend: 100 })}
        trips={[makeTrip()]}
        currency="USD"
        dateFormat="MM/DD/YYYY"
        onRangeChange={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Date Range" })).toBeInTheDocument();
    expect(screen.getByText("Total Spend")).toBeInTheDocument();
  });

  it("passes range change up to parent", async () => {
    const user = userEvent.setup();
    const onRangeChange = vi.fn();
    render(
      <SpendingView
        initialRange={SpendingDateRange.ThisYear}
        initialSummary={makeSummary({ tripCount: 1 })}
        trips={[makeTrip()]}
        currency="USD"
        dateFormat="MM/DD/YYYY"
        onRangeChange={onRangeChange}
      />
    );

    await user.click(screen.getByRole("button", { name: "Date Range" }));
    await user.click(screen.getByRole("option", { name: "All Time" }));

    expect(onRangeChange).toHaveBeenCalledWith(SpendingDateRange.AllTime);
  });

  it("renders zero-trips empty state when trips array is empty", () => {
    render(
      <SpendingView
        initialRange={SpendingDateRange.ThisYear}
        initialSummary={makeSummary()}
        trips={[]}
        currency="USD"
        dateFormat="MM/DD/YYYY"
        onRangeChange={vi.fn()}
      />
    );

    expect(
      screen.getByText("Add costs to your trips (reservations, events, misc) and track them over time here.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Date Range" })).not.toBeInTheDocument();
  });

  it("renders no-trips-in-range state when trips exist but summary has empty charts", () => {
    render(
      <SpendingView
        initialRange={SpendingDateRange.ThisYear}
        initialSummary={makeSummary({ tripCount: 0 })}
        trips={[makeTrip()]}
        currency="USD"
        dateFormat="MM/DD/YYYY"
        onRangeChange={vi.fn()}
      />
    );

    expect(screen.getByText("No trips in the selected range")).toBeInTheDocument();
  });

  it("filter stays visible in no-trips-in-range state", () => {
    render(
      <SpendingView
        initialRange={SpendingDateRange.ThisYear}
        initialSummary={makeSummary({ tripCount: 0 })}
        trips={[makeTrip()]}
        currency="USD"
        dateFormat="MM/DD/YYYY"
        onRangeChange={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Date Range" })).toBeInTheDocument();
  });

  it("headline figures show $0/$0/—/— in no-trips-in-range state (per FR20)", () => {
    render(
      <SpendingView
        initialRange={SpendingDateRange.ThisYear}
        initialSummary={makeSummary({ tripCount: 0 })}
        trips={[makeTrip()]}
        currency="USD"
        dateFormat="MM/DD/YYYY"
        onRangeChange={vi.fn()}
      />
    );

    expect(screen.getAllByText("$0.00")).toHaveLength(2);
    expect(screen.getAllByText("—")).toHaveLength(2);
  });
});
