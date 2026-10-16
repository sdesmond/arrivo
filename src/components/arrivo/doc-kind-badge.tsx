"use client";

import { FileText } from "lucide-react";
import { type Document } from "@/data/types";

export interface DocKindBadgeProps {
  kind: Document["kind"];
}

export function DocKindBadge({ kind }: DocKindBadgeProps) {
  const map = {
    pdf: { label: "PDF", color: "oklch(0.72 0.12 25)" },
    image: { label: "IMG", color: "oklch(0.72 0.10 145)" },
    doc: { label: "DOC", color: "oklch(0.70 0.10 250)" },
  } as const;
  const { label, color } = map[kind] ?? { label: "FILE", color: "oklch(0.70 0.04 250)" };
  return (
    <span
      className="inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 shrink-0"
      style={{
        fontFamily: "var(--font-mono-family, ui-monospace)",
        fontSize: "calc(9px * var(--font-scale))",
        fontWeight: 600,
        letterSpacing: "0.06em",
        color,
        background: "var(--surface-2)",
        border: `1px solid ${color}44`,
      }}
    >
      <FileText size={10} strokeWidth={1.5} style={{ color }} />
      {label}
    </span>
  );
}
