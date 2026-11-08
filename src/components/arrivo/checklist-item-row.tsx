"use client";

import { useState } from "react";
import { Check, Trash2 } from "lucide-react";
import type { ChecklistItem as ChecklistEntry } from "@/data/types";
import { useCanEditTrip } from "./trip-edit-access";
import { FIELD_LIMITS } from "@/lib/validation-limits";

export interface ChecklistItemRowProps {
  item: ChecklistEntry;
  onToggle?: (itemId: string, isChecked: boolean) => void;
  onUpdate?: (itemId: string, content: string) => void;
  onDelete?: (itemId: string) => void;
}

/** One checklist entry: its checkbox, inline-editable text and delete control. Viewers see it read-only. */
export function ChecklistItemRow({ item, onToggle, onUpdate, onDelete }: ChecklistItemRowProps) {
  const canEdit = useCanEditTrip();
  const [isEditing, setIsEditing] = useState(false);
  const [draftContent, setDraftContent] = useState("");

  function startEdit() {
    setDraftContent(item.content);
    setIsEditing(true);
  }

  function saveEdit() {
    const trimmed = draftContent.trim();
    if (trimmed) onUpdate?.(item.id, trimmed);
    setIsEditing(false);
  }

  const contentStyle: React.CSSProperties = {
    flex: 1,
    display: "flex",
    alignItems: "center",
    color: item.isChecked ? "var(--fg-4)" : "var(--fg-2)",
    textDecoration: item.isChecked ? "line-through" : "none",
  };

  return (
    <div data-checklist-item-id={item.id} className="group/item relative flex items-center gap-2 py-0.5">
      <button
        onClick={() => onToggle?.(item.id, !item.isChecked)}
        disabled={!canEdit}
        title={item.isChecked ? "Uncheck item" : "Check item"}
        aria-label={item.isChecked ? "Uncheck item" : "Check item"}
        style={{
          width: 44,
          height: 44,
          border: "none",
          borderRadius: 3,
          flexShrink: 0,
          marginTop: 1,
          background: "transparent",
          cursor: canEdit ? "pointer" : "default",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          transition: "background 0.1s, border-color 0.1s",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 14,
            height: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 3,
            border: `1.5px solid ${item.isChecked ? "var(--accent-brand)" : "var(--fg-4)"}`,
            background: item.isChecked ? "var(--accent-brand)" : "transparent",
          }}
        >
          {item.isChecked && <Check size={9} strokeWidth={1.5} style={{ color: "var(--accent-fg)" }} />}
        </span>
      </button>
      {isEditing ? (
        <input
          aria-label="Checklist item content"
          className="min-h-11"
          autoFocus
          value={draftContent}
          maxLength={FIELD_LIMITS.checklistItem}
          onChange={(event) => setDraftContent(event.target.value)}
          onBlur={saveEdit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              saveEdit();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setIsEditing(false);
            }
          }}
          style={{
            flex: 1,
            fontSize: "calc(13px * var(--font-scale))",
            color: "var(--fg-2)",
            background: "transparent",
            border: "none",
            borderBottom: "1px solid var(--accent-brand)",
            outline: "none",
            fontFamily: "inherit",
            padding: 0,
          }}
        />
      ) : canEdit ? (
        <span
          className="min-h-11 min-w-11"
          role="button"
          tabIndex={0}
          onClick={startEdit}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              startEdit();
            }
          }}
          style={{ ...contentStyle, cursor: "text" }}
        >
          {item.content}
        </span>
      ) : (
        <span style={contentStyle}>{item.content}</span>
      )}
      {canEdit && (
        <button
          onClick={() => onDelete?.(item.id)}
          title="Delete item"
          className="size-11 opacity-100 sm:opacity-0 sm:group-hover/item:opacity-100 transition-opacity"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--fg-3)",
            padding: "0 2px",
            flexShrink: 0,
          }}
        >
          <Trash2 size={11} strokeWidth={1.5} />
        </button>
      )}
    </div>
  );
}
