"use client";

import { Plus } from "lucide-react";

export function NewTripCard() {
  return (
    <button
      className="flex flex-col items-center justify-center gap-2 rounded-[14px] p-6 transition-colors"
      style={{
        border: "1.5px dashed var(--line-strong)",
        background: "transparent",
        minHeight: 280,
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.borderColor = "var(--accent-brand)";
        el.style.background = "var(--accent-soft)";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.borderColor = "var(--line-strong)";
        el.style.background = "transparent";
      }}
    >
      <span
        className="rounded-full flex items-center justify-center"
        style={{
          width: 32, height: 32,
          background: "var(--surface-2)",
          color: "var(--fg-3)",
        }}
      >
        <Plus size={18} strokeWidth={1.5} />
      </span>
      <span
        style={{
          fontSize: 14, fontWeight: 600,
          color: "var(--fg-2)",
          fontFamily: "var(--font-heading-family, ui-sans-serif)",
          letterSpacing: "-0.01em",
        }}
      >
        Start a new trip
      </span>
      <span style={{ fontSize: 12.5, color: "var(--fg-4)", textAlign: "center", lineHeight: 1.5 }}>
        A blank itinerary, ready when you are.
      </span>
    </button>
  );
}
