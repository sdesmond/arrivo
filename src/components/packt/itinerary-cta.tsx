"use client";

import { useState } from "react";
import { ChevronRight, Luggage } from "lucide-react";
import type { ReactElement } from "react";

export interface ItineraryCtaProps {
  reservationCount: number;
  onActivate: () => void;
}

export function ItineraryCta({ reservationCount, onActivate }: ItineraryCtaProps): ReactElement {
  const [clicked, setClicked] = useState(false);
  const copy = reservationCount === 0 ? "Add reservations for hotels, rentals, and more" : "Add another reservation";

  return (
    <button
      type="button"
      disabled={clicked}
      onClick={() => {
        setClicked(true);
        onActivate();
      }}
      aria-label={`${copy} — opens the Reservations tab`}
      className="h-12 w-full flex items-center justify-between gap-3 px-3 mb-4 disabled:opacity-50"
      style={{
        borderRadius: 14,
        border: "1px solid var(--line)",
        background: "var(--surface)",
      }}
    >
      <span
        aria-hidden="true"
        className="flex items-center gap-2"
        style={{ fontSize: "calc(14px * var(--font-scale))", fontWeight: 500, color: "var(--fg)" }}
      >
        <Luggage size={18} strokeWidth={1.5} />
        {copy}
      </span>
      <ChevronRight aria-hidden="true" size={18} strokeWidth={1.5} style={{ color: "var(--fg-3)" }} />
    </button>
  );
}
