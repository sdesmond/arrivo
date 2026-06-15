"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

export interface ReservationInlineTextFieldProps {
  value: string;
  placeholder: string;
  ariaLabel: string;
  multiline?: boolean;
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

const PLACEHOLDER_STYLE: React.CSSProperties = { color: "var(--fg-3)", fontSize: 13, fontStyle: "italic" };

export function ReservationInlineTextField({
  value,
  placeholder,
  ariaLabel,
  multiline = false,
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

  useEffect(() => {
    if (wasEditingRef.current && !editing) {
      displayRef.current?.focus();
    }
    wasEditingRef.current = editing;
  }, [editing]);

  async function save() {
    if (draft === value) {
      setEditing(false);
      return;
    }
    try {
      await onSave(draft);
      setEditing(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save reservation.");
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

  return (
    <button
      type="button"
      ref={displayRef}
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      style={value ? displayStyle : PLACEHOLDER_STYLE}
    >
      {value ? (renderDisplay ? renderDisplay(value) : value) : placeholder}
    </button>
  );
}
