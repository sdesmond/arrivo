"use client";

import { useCallback, useState } from "react";
import type { ReactElement } from "react";
import type { SpendingDateRange, SpendingSummary, Trip } from "@/data/types";
import { SpendingDateFilter } from "@/components/packt/spending-date-filter";
import { SpendingHeadlineFigures } from "@/components/packt/spending-headline-figures";
import { CategoryBreakdownDonut } from "@/components/packt/category-breakdown-donut";
import { DestinationBreakdownDonut } from "@/components/packt/destination-breakdown-donut";
import { formatCurrency } from "@/lib/utils";

export interface SpendingViewProps {
  initialRange: SpendingDateRange;
  initialSummary: SpendingSummary;
  trips: Trip[];
  currency: string;
  onRangeChange: (range: SpendingDateRange) => void;
}

export function SpendingView({
  initialRange,
  initialSummary,
  trips,
  currency,
  onRangeChange,
}: SpendingViewProps): ReactElement {
  const [range, setRange] = useState(initialRange);
  const [syncedRange, setSyncedRange] = useState(initialRange);

  if (initialRange !== syncedRange) {
    setSyncedRange(initialRange);
    setRange(initialRange);
  }

  function handleRangeChange(nextRange: SpendingDateRange): void {
    setRange(nextRange);
    onRangeChange(nextRange);
  }

  const handleFormatCurrency = useCallback((amount: number) => formatCurrency(amount, currency), [currency]);

  if (trips.length === 0) {
    return (
      <p style={{ color: "var(--fg-2)" }}>
        Add costs to your trips (reservations, events, misc) and track them over time here.
      </p>
    );
  }

  const hasTripsInRange = initialSummary.tripCount > 0;

  return (
    <div className="flex flex-col gap-6">
      <SpendingDateFilter range={range} onChange={handleRangeChange} tripCount={initialSummary.tripCount} />
      <SpendingHeadlineFigures summary={initialSummary} currency={currency} />
      <section aria-live="polite">
        {hasTripsInRange ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <CategoryBreakdownDonut data={initialSummary.categoryBreakdown} formatCurrency={handleFormatCurrency} />
            <DestinationBreakdownDonut
              data={initialSummary.destinationBreakdown}
              formatCurrency={handleFormatCurrency}
            />
          </div>
        ) : (
          <p style={{ color: "var(--fg-2)" }}>No trips in the selected range</p>
        )}
      </section>
    </div>
  );
}
