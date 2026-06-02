"use client";

import { Pencil } from "lucide-react";

export interface PlaceRowNameFieldProps {
  isEditingName: boolean;
  draftName: string;
  onDraftChange: (v: string) => void;
  onBlur: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  displayName: string;
  isHovered: boolean;
  isDraft?: boolean;
  onStartEdit: () => void;
}

export function PlaceRowNameField({
  isEditingName,
  draftName,
  onDraftChange,
  onBlur,
  onKeyDown,
  displayName,
  isHovered,
  isDraft,
  onStartEdit,
}: PlaceRowNameFieldProps) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      {isEditingName ? (
        <input
          autoFocus
          placeholder={isDraft ? "Event name" : undefined}
          value={draftName}
          onChange={(event) => onDraftChange(event.target.value)}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          style={{
            fontSize: "calc(14px * var(--font-scale))",
            fontWeight: 600,
            color: "var(--fg)",
            background: "var(--surface-2)",
            border: "1px solid var(--accent-brand)",
            borderRadius: 4,
            padding: "1px 6px",
            outline: "none",
            width: "100%",
            fontFamily: "inherit",
          }}
        />
      ) : (
        <>
          <span
            style={{
              fontSize: "calc(14px * var(--font-scale))",
              fontWeight: 600,
              color: "var(--fg)",
              lineHeight: 1.2,
            }}
          >
            {displayName}
          </span>
          <button
            onClick={onStartEdit}
            style={{
              color: "var(--fg-4)",
              opacity: isHovered ? 1 : 0.25,
              transition: "opacity 0.1s",
              display: "flex",
              alignItems: "center",
              padding: 2,
              borderRadius: 3,
              background: "none",
              border: "none",
              cursor: "pointer",
              flexShrink: 0,
            }}
            title="Edit name"
          >
            <Pencil size={11} strokeWidth={1.5} />
          </button>
        </>
      )}
    </div>
  );
}
