"use client";

import { useState } from "react";
import type { ReactElement } from "react";
import type { SpendingDateRange, SpendingSummary, Trip } from "@/data/types";
import { SpendingDateFilter } from "@/components/packt/spending-date-filter";
import { SpendingHeadlineFigures } from "@/components/packt/spending-headline-figures";

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
        {hasTripsInRange ? null : <p style={{ color: "var(--fg-2)" }}>No trips in the selected range</p>}
      </section>
    </div>
  );
}
