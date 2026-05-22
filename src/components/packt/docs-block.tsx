"use client";

import { Paperclip } from "lucide-react";
import { type Document } from "@/data/types";
import { EventDocRow } from "./event-doc-row";

export interface DocsBlockProps {
  docs: Document[];
  onAdd: () => void;
}

export function DocsBlock({ docs, onAdd }: DocsBlockProps) {
  return (
    <div className="mt-2" style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
      <div
        style={{
          fontFamily: "var(--font-mono-family, ui-monospace)",
          fontSize: "calc(9.5px * var(--font-scale))",
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--fg-4)",
          marginBottom: 6,
        }}
      >
        DOCS
      </div>
      <div className="flex flex-col gap-1.5">
        {docs.map((d) => (
          <EventDocRow key={d.id} doc={d} />
        ))}
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 rounded-[6px] px-2 py-1.5 transition-colors hover:bg-surface-2 w-full"
          style={{
            fontSize: "calc(12px * var(--font-scale))",
            color: "var(--fg-4)",
            background: "none",
            border: "none",
            cursor: "pointer",
            borderTop: docs.length > 0 ? "1px solid var(--line)" : "none",
            marginTop: docs.length > 0 ? 4 : 0,
            paddingTop: docs.length > 0 ? 8 : 4,
          }}
        >
          <Paperclip size={12} strokeWidth={1.5} aria-hidden="true" />
          Add doc
        </button>
      </div>
    </div>
  );
}
