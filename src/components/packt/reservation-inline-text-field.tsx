"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

export interface ReservationInlineTextFieldProps {
  value: string;
  placeholder: string;
  ariaLabel: string;
  multiline?: boolean;
  chip?: boolean;
  icon?: ReactNode;
  displayStyle?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
  renderDisplay?: (value: string) => ReactNode;
  onSave: (value: string) => Promise<void>;
}

const EDIT_INPUT_STYLE: React.CSSProperties = {
  flex: 1,
  fontFamily: "var(--font-body, ui-sans-serif)",
  fontSize: "calc(14px * var(--font-scale))",
  color: "var(--fg)",
  background: "transparent",
  border: "none",
  borderBottom: "1px solid var(--accent-brand)",
  outline: "none",
  padding: 0,
};

export const PLACEHOLDER_STYLE: React.CSSProperties = { color: "var(--fg-3)", fontSize: 13, fontStyle: "italic" };

export function ReservationInlineTextField({
  value,
  placeholder,
  ariaLabel,
  multiline = false,
  chip = false,
  icon,
  displayStyle,
  inputStyle,
  renderDisplay,
  onSave,
}: ReservationInlineTextFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const cancelRef = useRef(false);
  const displayRef = useRef<HTMLButtonElement | null>(null);
  const wasEditingRef = useRef(false);
  const savingRef = useRef(false);

  useEffect(() => {
    if (wasEditingRef.current && !editing) {
      displayRef.current?.focus();
    }
    wasEditingRef.current = editing;
  }, [editing]);

  async function save() {
    if (savingRef.current) return;

    const trimmed = draft.trim();
    if (trimmed === value) {
      setEditing(false);
      return;
    }

    savingRef.current = true;
    try {
      await onSave(trimmed);
      setEditing(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save reservation.");
    } finally {
      savingRef.current = false;
    }
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void save();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelRef.current = true;
      setEditing(false);
    }
  }

  function handleTextareaKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelRef.current = true;
      setEditing(false);
    }
  }

  function handleBlur() {
    if (cancelRef.current) {
      cancelRef.current = false;
      return;
    }
    void save();
  }

  if (editing) {
    if (multiline) {
      return (
        <textarea
          autoFocus
          aria-label={ariaLabel}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleTextareaKeyDown}
          onBlur={handleBlur}
          style={{
            ...EDIT_INPUT_STYLE,
            ...inputStyle,
            minHeight: 60,
            resize: "vertical" as const,
            whiteSpace: "pre-wrap",
          }}
        />
      );
    }

    return (
      <input
        autoFocus
        aria-label={ariaLabel}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleInputKeyDown}
        onBlur={handleBlur}
        style={{ ...EDIT_INPUT_STYLE, ...inputStyle }}
      />
    );
  }

  if (chip) {
    return (
      <button
        type="button"
        ref={displayRef}
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className="flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors hover:bg-surface-2"
        style={{
          fontSize: "calc(var(--fs-action-chip) * var(--font-scale))",
          color: value ? "var(--accent-ink)" : "var(--fg-4)",
          background: value ? "var(--accent-soft)" : "none",
          border: "1px solid transparent",
        }}
      >
        {icon}
        <span className="truncate">{value || placeholder}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      ref={displayRef}
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      style={{ textAlign: "left", ...(value ? displayStyle : PLACEHOLDER_STYLE) }}
    >
      {value ? (renderDisplay ? renderDisplay(value) : value) : placeholder}
    </button>
  );
}
