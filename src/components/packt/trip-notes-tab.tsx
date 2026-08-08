"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, StickyNote } from "lucide-react";
import type { TripNote } from "@/data/types";
import { TripNotesRow } from "./trip-notes-row";
import { TripNotesEditor, type TripNotesEditorCommitResult, type TripNotesEditorHandle } from "./trip-notes-editor";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export interface TripNotesTabProps {
  tripId: string;
  notes: TripNote[];
}

export function TripNotesTab({ tripId, notes }: TripNotesTabProps) {
  const [isDraftOpen, setIsDraftOpen] = useState(false);
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [announcementId, setAnnouncementId] = useState(0);
  const newNoteButtonRef = useRef<HTMLButtonElement>(null);
  const editorRef = useRef<TripNotesEditorHandle>(null);
  const focusReturnNoteIdRef = useRef<string | null>(null);
  const isFirstRenderRef = useRef(true);

  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }
    if (!isDraftOpen && !expandedNoteId) {
      newNoteButtonRef.current?.focus();
    }
  }, [expandedNoteId, isDraftOpen]);

  useEffect(() => {
    if (expandedNoteId || !focusReturnNoteIdRef.current) return;
    document.getElementById(`trip-note-disclosure-${focusReturnNoteIdRef.current}`)?.focus();
    focusReturnNoteIdRef.current = null;
  }, [expandedNoteId]);

  async function commitCurrentEditor(): Promise<TripNotesEditorCommitResult> {
    return editorRef.current?.commit() ?? "clean";
  }

  async function openDraft(): Promise<void> {
    if (expandedNoteId) {
      const result = await commitCurrentEditor();
      if (result === "failed") return;
      setExpandedNoteId(null);
    }
    setIsDraftOpen(true);
  }

  function closeDraft(): void {
    setIsDraftOpen(false);
  }

  function announceSaved(): void {
    setAnnouncement("Note saved");
    setAnnouncementId((currentId) => currentId + 1);
  }

  async function handleToggle(noteId: string): Promise<void> {
    if (isDraftOpen) {
      const result = await commitCurrentEditor();
      if (result === "failed") return;
      setIsDraftOpen(false);
      setExpandedNoteId(noteId);
      return;
    }

    if (expandedNoteId === noteId) {
      const result = await commitCurrentEditor();
      if (result === "failed") return;
      focusReturnNoteIdRef.current = noteId;
      setExpandedNoteId(null);
      return;
    }

    if (expandedNoteId) {
      const result = await commitCurrentEditor();
      if (result === "failed") return;
    }

    setExpandedNoteId(noteId);
  }

  const liveRegion = (
    <div aria-live="polite" className="sr-only">
      <span key={announcementId}>{announcement}</span>
    </div>
  );

  if (notes.length === 0 && !isDraftOpen) {
    return (
      <Empty>
        {liveRegion}
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <StickyNote strokeWidth={1.5} />
          </EmptyMedia>
          <EmptyTitle>No notes yet</EmptyTitle>
          <EmptyDescription>
            Add quick trip-wide reminders — thoughts that don&apos;t belong in a Day Note or Document.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            ref={newNoteButtonRef}
            variant="outline"
            size="sm"
            style={{ minHeight: 44, minWidth: 44 }}
            onClick={() => void openDraft()}
          >
            New Note
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div>
      {liveRegion}
      {!isDraftOpen && (
        <div className="flex items-center mb-3">
          <Button
            ref={newNoteButtonRef}
            variant="outline"
            size="sm"
            className="ml-auto"
            style={{ minHeight: 44, minWidth: 44 }}
            onClick={() => void openDraft()}
          >
            <Plus strokeWidth={1.5} />
            New Note
          </Button>
        </div>
      )}
      <ol>
        {isDraftOpen && (
          <li>
            <TripNotesEditor ref={editorRef} tripId={tripId} onClose={closeDraft} onSaved={announceSaved} />
          </li>
        )}
        {notes.map((note) => (
          <TripNotesRow
            key={note.id}
            note={note}
            isExpanded={expandedNoteId === note.id}
            onToggle={handleToggle}
            editor={
              expandedNoteId === note.id ? (
                <TripNotesEditor
                  ref={editorRef}
                  tripId={tripId}
                  mode="edit"
                  noteId={note.id}
                  initialTitle={note.title}
                  initialBody={note.body}
                  onClose={() => undefined}
                  onSaved={announceSaved}
                />
              ) : undefined
            }
          />
        ))}
      </ol>
    </div>
  );
}
