"use client";

import { Plus } from "lucide-react";

interface NewTripCardProps {
  onNewTrip: () => void;
}

export function NewTripCard({ onNewTrip }: NewTripCardProps) {
  return (
    <button
      type="button"
      onClick={onNewTrip}
      className="flex flex-col items-center justify-center gap-2 rounded-[14px] p-6 transition-colors"
      style={{
        border: "1.5px dashed var(--line-strong)",
        background: "transparent",
        minHeight: 280,
        cursor: "pointer",
      }}
      onMouseEnter={(event) => {
        const element = event.currentTarget;
        element.style.borderColor = "var(--accent-brand)";
        element.style.background = "var(--accent-soft)";
      }}
      onMouseLeave={(event) => {
        const element = event.currentTarget;
        element.style.borderColor = "var(--line-strong)";
        element.style.background = "transparent";
      }}
    >
      <span
        className="rounded-full flex items-center justify-center"
        style={{
          width: 32,
          height: 32,
          background: "var(--surface-2)",
          color: "var(--fg-3)",
        }}
      >
        <Plus size={18} strokeWidth={1.5} />
      </span>
      <span
        style={{
          fontSize: "calc(14px * var(--font-scale))",
          fontWeight: 600,
          color: "var(--fg-2)",
          fontFamily: "var(--font-heading-family, ui-sans-serif)",
          letterSpacing: "-0.01em",
        }}
      >
        Start a new trip
      </span>
      <span
        style={{
          fontSize: "calc(12.5px * var(--font-scale))",
          color: "var(--fg-4)",
          textAlign: "center",
          lineHeight: 1.5,
        }}
      >
        A blank itinerary, ready when you are.
      </span>
    </button>
  );
}
