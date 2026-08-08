"use client";

import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { createTripNote } from "@/app/(app)/trips/[tripId]/actions";

export interface TripNotesEditorProps {
  tripId: string;
  onClose: () => void;
  onSaved: () => void;
}

const SAVING_ANNOUNCE_DELAY_MS = 400;
const SAVE_ERROR_MESSAGE = "Couldn't save note. Try again.";

export function TripNotesEditor({ tripId, onClose, onSaved }: TripNotesEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const savingTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isSavingRef = useRef(false);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [announcementId, setAnnouncementId] = useState(0);

  useEffect(() => {
    if (error) {
      retryRef.current?.focus();
    }
  }, [error]);

  useEffect(() => {
    return () => {
      clearTimeout(savingTimeoutRef.current);
    };
  }, []);

  function announce(message: string): void {
    setAnnouncement(message);
    setAnnouncementId((id) => id + 1);
  }

  async function commit(titleValue: string, bodyValue: string): Promise<void> {
    if (isSavingRef.current) return;

    const trimmedTitle = titleValue.trim();
    const trimmedBody = bodyValue.trim();
    if (!trimmedTitle && !trimmedBody) {
      onClose();
      return;
    }

    isSavingRef.current = true;
    setIsSaving(true);
    setError(null);
    savingTimeoutRef.current = setTimeout(() => announce("Saving note"), SAVING_ANNOUNCE_DELAY_MS);

    try {
      await createTripNote(tripId, { title: trimmedTitle || undefined, body: trimmedBody || undefined });
      clearTimeout(savingTimeoutRef.current);
      isSavingRef.current = false;
      setIsSaving(false);
      onSaved();
      onClose();
    } catch {
      clearTimeout(savingTimeoutRef.current);
      isSavingRef.current = false;
      setIsSaving(false);
      setError(SAVE_ERROR_MESSAGE);
      toast.error(SAVE_ERROR_MESSAGE);
    }
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>): void {
    const next = event.relatedTarget as Node | null;
    if (next && containerRef.current?.contains(next)) return;
    void commit(title, body);
  }

  function handleRetry(): void {
    void commit(title, body);
  }

  function handleTitleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void commit(title, body);
  }

  const inputBaseStyle = {
    width: "100%",
    background: "transparent",
    border: "none",
    outline: "none",
    fontFamily: "var(--font-body, ui-sans-serif)",
    color: "var(--fg)",
    padding: "6px 0",
  };

  return (
    <div ref={containerRef} onBlur={handleBlur} aria-busy={isSaving} className="flex flex-col gap-1 px-3 py-2">
      <div aria-live="polite" className="sr-only">
        <span key={announcementId}>{announcement}</span>
      </div>

      <input
        ref={titleRef}
        autoFocus
        aria-label="Note title"
        aria-describedby={error ? "trip-note-editor-error" : undefined}
        disabled={isSaving}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={handleTitleKeyDown}
        placeholder="Title"
        style={{ ...inputBaseStyle, minHeight: 44, fontSize: "calc(14px * var(--font-scale))", fontWeight: 500 }}
      />
      <textarea
        aria-label="Note body"
        aria-describedby={error ? "trip-note-editor-error" : undefined}
        disabled={isSaving}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="Write a note…"
        rows={2}
        style={{
          ...inputBaseStyle,
          resize: "vertical",
          lineHeight: 1.5,
          fontSize: "calc(13px * var(--font-scale))",
          color: "var(--fg-2)",
        }}
      />

      {error ? (
        <div className="flex items-center justify-between gap-2">
          <p
            id="trip-note-editor-error"
            role="alert"
            aria-live="polite"
            style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--destructive)" }}
          >
            {error}
          </p>
          <button
            ref={retryRef}
            type="button"
            onClick={handleRetry}
            style={{
              minHeight: 44,
              minWidth: 44,
              background: "transparent",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius-sm)",
              color: "var(--fg)",
              fontSize: "calc(12px * var(--font-scale))",
              padding: "0 12px",
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      ) : null}
    </div>
  );
}
