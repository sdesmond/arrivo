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
import { ApiClientError } from "@/lib/api/client";
import {
  createTripNote as createTripNoteEndpoint,
  updateTripNote as updateTripNoteEndpoint,
} from "@/lib/api/contract/trip-notes";
import { useApiMutation } from "@/lib/api/use-api-mutation";
import { createRandomId } from "@/lib/utils";
import { FIELD_LIMITS } from "@/lib/validation-limits";

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
  // One client UUID per create draft: a retry reuses it, so a create that landed server-side replays instead of
  // duplicating. It is replaced only when the server reports the id already belongs to a different note.
  const draftIdRef = useRef<string | null>(null);

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
    // Intentionally mount/unmount-only: this must fire once on unmount, not on every
    // `commit` identity change (a new function every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Declared after the unmount-commit effect on purpose: effect cleanups run in declaration order, so that save is
  // sent before these hooks mark themselves unmounted.
  const createMutation = useApiMutation(createTripNoteEndpoint);
  const updateMutation = useApiMutation(updateTripNoteEndpoint);

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

  /** Resolves true once the write committed. The hook has already toasted a failure. */
  function save(values: EditorValues): Promise<boolean> {
    const baseline = baselineRef.current;
    let saved = false;
    const onSuccess = () => {
      saved = true;
    };
    if (mode === "edit") {
      if (!noteId) return Promise.resolve(false);
      // Only the fields that changed are sent; an emptied one is sent blank, which clears it.
      const body: { title?: string; body?: string } = {};
      if (values.title !== baseline.title) body.title = values.title;
      if (values.body !== baseline.body) body.body = values.body;
      return updateMutation
        .mutate({ params: { noteId }, body }, { key: `trip-note:${noteId}`, onSuccess })
        .then(() => saved);
    }
    draftIdRef.current ??= createRandomId();
    const id = draftIdRef.current;
    return createMutation
      .mutate(
        {
          params: { tripId },
          body: { id, ...(values.title ? { title: values.title } : {}), ...(values.body ? { body: values.body } : {}) },
        },
        {
          key: `trip-note:${id}`,
          onSuccess,
          onError: (error) => {
            if (error instanceof ApiClientError && error.code === "conflict") draftIdRef.current = createRandomId();
          },
        }
      )
      .then(() => saved);
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
        if (!(await save(values))) {
          clearTimeout(savingTimeoutRef.current);
          setAnnouncement("");
          setIsSaving(false);
          setError(SAVE_ERROR_MESSAGE);
          return "failed";
        }
        baselineRef.current = values;
        valuesRef.current = mode === "edit" ? values : { title: "", body: "" };
        if (mode === "edit") {
          setTitle(values.title);
          setBody(values.body);
        }
        clearTimeout(savingTimeoutRef.current);
        setAnnouncement("");
        setIsSaving(false);
        onSaved();
        if (mode === "create") {
          draftIdRef.current = null;
          onClose();
        }
        return "saved";
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
        maxLength={FIELD_LIMITS.noteTitle}
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
        maxLength={FIELD_LIMITS.noteBody}
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
