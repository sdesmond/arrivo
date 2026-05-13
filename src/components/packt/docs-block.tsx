"use client";

import { Check, Paperclip, X } from "lucide-react";
import { type Document } from "@/data/types";
import { DocKindBadge } from "./doc-kind-badge";

export interface DocsBlockProps {
  docs: Document[];
  onDelete: (id: string) => void;
  onAdd: () => void;
}

export function DocsBlock({ docs, onDelete, onAdd }: DocsBlockProps) {
  return (
    <div className="mt-2" style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
      <div
        style={{
          fontFamily: "var(--font-mono-family, ui-monospace)",
          fontSize: "9.5px", fontWeight: 600,
          letterSpacing: "0.08em", textTransform: "uppercase",
          color: "var(--fg-4)", marginBottom: 6,
        }}
      >
        DOCS
      </div>
      <div className="flex flex-col gap-1.5">
        {docs.map((d) => (
          <div
            key={d.id}
            className="flex items-center gap-2 rounded-[6px] px-2 py-1.5 transition-colors hover:bg-surface-2 w-full"
            style={{ background: "var(--surface)" }}
          >
            <DocKindBadge kind={d.kind} />
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--fg)", lineHeight: 1.2 }} className="truncate">
                {d.name}
              </div>
              <div style={{ fontSize: 11, color: "var(--fg-4)" }}>{d.size}</div>
            </div>
            {d.offline ? (
              <span
                className="shrink-0 flex items-center gap-0.5 rounded-full px-1.5 py-0.5"
                style={{ fontSize: 10, color: "var(--accent-ink)", background: "var(--accent-soft)" }}
              >
                <Check size={9} strokeWidth={2} /> Offline
              </span>
            ) : (
              <span style={{ fontSize: 11, color: "var(--fg-4)" }}>↓</span>
            )}
            <button
              onClick={() => onDelete(d.id)}
              aria-label={`Remove ${d.name}`}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                minWidth: 28, minHeight: 28,
                padding: 4, borderRadius: 4,
                background: "none", border: "none", cursor: "pointer",
                color: "var(--fg-4)", flexShrink: 0,
              }}
            >
              <X size={12} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>
        ))}
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 rounded-[6px] px-2 py-1.5 transition-colors hover:bg-surface-2 w-full"
          style={{
            fontSize: 12, color: "var(--fg-4)",
            background: "none", border: "none", cursor: "pointer",
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
