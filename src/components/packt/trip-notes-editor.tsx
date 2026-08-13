"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type FocusEvent,
  type ForwardedRef,
  type KeyboardEvent,
} from "react";
import { toast } from "sonner";
import { createTripNote, updateTripNote } from "@/app/(app)/trips/[tripId]/actions";

export type TripNotesEditorCommitResult = "saved" | "failed" | "clean";

export interface TripNotesEditorHandle {
  commit: () => Promise<TripNotesEditorCommitResult>;
}

export interface TripNotesEditorProps {
  tripId: string;
  onClose: () => void;
  onSaved: () => void;
  mode?: "create" | "edit";
  noteId?: string;
  initialTitle?: string;
  initialBody?: string;
}

interface EditorValues {
  title: string;
  body: string;
}

const SAVING_ANNOUNCE_DELAY_MS = 400;
const SAVE_ERROR_MESSAGE = "Couldn't save note. Try again.";

function normalizeValues({ title, body }: EditorValues): EditorValues {
  return { title: title.trim(), body: body.trim() };
}

function TripNotesEditorComponent(
  { tripId, onClose, onSaved, mode = "create", noteId, initialTitle = "", initialBody = "" }: TripNotesEditorProps,
  forwardedRef: ForwardedRef<TripNotesEditorHandle>
) {
  const initialValues = normalizeValues({ title: initialTitle, body: initialBody });
  const containerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const savingTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inFlightCommitRef = useRef<Promise<TripNotesEditorCommitResult> | null>(null);
  const baselineRef = useRef<EditorValues>(initialValues);
  const valuesRef = useRef<EditorValues>(initialValues);

  const [title, setTitle] = useState(initialValues.title);
  const [body, setBody] = useState(initialValues.body);
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
      const values = normalizeValues(valuesRef.current);
      if (values.title || values.body) {
        void commit();
      }
    };
  }, []);

  function announce(message: string): void {
    setAnnouncement(message);
    setAnnouncementId((currentId) => currentId + 1);
  }

  function restoreBaseline(): void {
    const baseline = baselineRef.current;
    valuesRef.current = baseline;
    setTitle(baseline.title);
    setBody(baseline.body);
    setError(null);
  }

  function commit(): Promise<TripNotesEditorCommitResult> {
    if (inFlightCommitRef.current) return inFlightCommitRef.current;

    const values = normalizeValues(valuesRef.current);
    const baseline = baselineRef.current;

    if (!values.title && !values.body) {
      if (mode === "edit") {
        restoreBaseline();
      } else {
        onClose();
      }
      return Promise.resolve("clean");
    }

    if (mode === "edit" && values.title === baseline.title && values.body === baseline.body) {
      restoreBaseline();
      return Promise.resolve("clean");
    }

    const request = (async (): Promise<TripNotesEditorCommitResult> => {
      setIsSaving(true);
      setError(null);
      savingTimeoutRef.current = setTimeout(() => announce("Saving note"), SAVING_ANNOUNCE_DELAY_MS);

      try {
        if (mode === "edit") {
          if (!noteId) throw new Error("Edit mode requires a note ID");
          await updateTripNote(noteId, {
            title: values.title,
            body: values.body,
          });
          baselineRef.current = values;
          valuesRef.current = values;
          setTitle(values.title);
          setBody(values.body);
        } else {
          await createTripNote(tripId, {
            title: values.title || undefined,
            body: values.body || undefined,
          });
          valuesRef.current = { title: "", body: "" };
        }

        baselineRef.current = values;
        if (mode === "edit") valuesRef.current = values;
        clearTimeout(savingTimeoutRef.current);
        setAnnouncement("");
        setIsSaving(false);
        onSaved();
        if (mode === "create") {
          onClose();
        }
        return "saved";
      } catch {
        clearTimeout(savingTimeoutRef.current);
        setAnnouncement("");
        setIsSaving(false);
        setError(SAVE_ERROR_MESSAGE);
        toast.error(SAVE_ERROR_MESSAGE);
        return "failed";
      } finally {
        inFlightCommitRef.current = null;
      }
    })();

    inFlightCommitRef.current = request;
    return request;
  }

  useImperativeHandle(forwardedRef, () => ({ commit }));

  function handleBlur(event: FocusEvent<HTMLDivElement>): void {
    const nextTarget = event.relatedTarget as Node | null;
    const row = containerRef.current?.closest("li");
    if (nextTarget && (containerRef.current?.contains(nextTarget) || row?.contains(nextTarget))) return;
    if (error) return;
    void commit();
  }

  function handleRetry(): void {
    void commit();
  }

  function handleTitleChange(value: string): void {
    valuesRef.current = { ...valuesRef.current, title: value };
    setTitle(value);
  }

  function handleBodyChange(value: string): void {
    valuesRef.current = { ...valuesRef.current, body: value };
    setBody(value);
  }

  function handleTitleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void commit();
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
        onChange={(event) => handleTitleChange(event.target.value)}
        onKeyDown={handleTitleKeyDown}
        placeholder="Title"
        style={{ ...inputBaseStyle, minHeight: 44, fontSize: "calc(14px * var(--font-scale))", fontWeight: 500 }}
      />
      <textarea
        aria-label="Note body"
        aria-describedby={error ? "trip-note-editor-error" : undefined}
        disabled={isSaving}
        value={body}
        onChange={(event) => handleBodyChange(event.target.value)}
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

export const TripNotesEditor = forwardRef<TripNotesEditorHandle, TripNotesEditorProps>(TripNotesEditorComponent);
TripNotesEditor.displayName = "TripNotesEditor";
