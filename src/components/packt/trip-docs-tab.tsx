"use client";

import type { Document } from "@/data/types";

export interface TripDocsTabProps {
  docs: Document[];
}

export function TripDocsTab({ docs }: TripDocsTabProps) {
  if (docs.length === 0) {
    return (
      <div style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--fg-2)" }}>
        Add your first trip document — boarding passes, insurance, visas, and more.
      </div>
    );
  }

  // Scaffold: real list rendering comes in Story 1.2
  return (
    <div style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--fg-2)" }}>
      {docs.length} document{docs.length !== 1 ? "s" : ""}
    </div>
  );
}
