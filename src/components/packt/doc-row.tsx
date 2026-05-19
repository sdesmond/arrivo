"use client";

import { DocKindBadge } from "./doc-kind-badge";
import type { Document } from "@/data/types";

export interface DocRowProps {
  doc: Document;
}

export function DocRow({ doc }: DocRowProps) {
  return (
    <div
      className="flex items-center gap-2"
      style={{
        minHeight: 44,
        borderBottom: "1px solid var(--line)",
        paddingTop: 8,
        paddingBottom: 8,
      }}
    >
      <DocKindBadge kind={doc.kind} />
      <span
        className="flex-1 truncate"
        style={{
          fontFamily: "var(--font-body, ui-sans-serif)",
          fontSize: "calc(14px * var(--font-scale))",
          color: "var(--fg)",
        }}
      >
        {doc.name}
      </span>
    </div>
  );
}
