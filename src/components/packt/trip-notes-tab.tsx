"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, StickyNote } from "lucide-react";
import type { TripNote } from "@/data/types";
import { deleteTripNote } from "@/app/(app)/trips/[tripId]/actions";
import { getNoteTitle } from "@/lib/note-preview";
import { TripNotesRow } from "./trip-notes-row";
import { TripNotesEditor, type TripNotesEditorCommitResult, type TripNotesEditorHandle } from "./trip-notes-editor";
import { TripNotesDeleteDialog } from "./trip-notes-delete-dialog";
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
  const [deleteTargetNoteId, setDeleteTargetNoteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const newNoteButtonRef = useRef<HTMLButtonElement>(null);
  const editorRef = useRef<TripNotesEditorHandle>(null);
  const focusReturnNoteIdRef = useRef<string | null>(null);
  const expandedNoteIdRef = useRef<string | null>(null);
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

  useEffect(() => {
    if (expandedNoteId && !notes.some((note) => note.id === expandedNoteId)) {
      setExpanded(null);
    }
  }, [notes, expandedNoteId]);

  function setExpanded(noteId: string | null): void {
    expandedNoteIdRef.current = noteId;
    setExpandedNoteId(noteId);
  }

  async function commitCurrentEditor(): Promise<TripNotesEditorCommitResult> {
    return editorRef.current?.commit() ?? "clean";
  }

  async function openDraft(): Promise<void> {
    if (expandedNoteIdRef.current) {
      const result = await commitCurrentEditor();
      if (result === "failed") return;
      setExpanded(null);
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

  function announceDeleted(): void {
    setAnnouncement("Note deleted");
    setAnnouncementId((currentId) => currentId + 1);
  }

  function handleDeleteRequest(noteId: string): void {
    setDeleteTargetNoteId(noteId);
    setDeleteError(null);
  }

  function handleDeleteOpenChange(open: boolean): void {
    if (open || !deleteTargetNoteId) return;
    const noteId = deleteTargetNoteId;
    setDeleteTargetNoteId(null);
    setDeleteError(null);
    setIsDeleting(false);
    window.setTimeout(() => document.getElementById(`trip-note-delete-${noteId}`)?.focus(), 0);
  }

  async function handleDeleteConfirm(): Promise<void> {
    if (!deleteTargetNoteId) return;
    const noteId = deleteTargetNoteId;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      await deleteTripNote(noteId);
      const deletedIndex = notes.findIndex((note) => note.id === noteId);
      const focusTargetId = notes[deletedIndex + 1]?.id ?? notes[deletedIndex - 1]?.id ?? null;
      focusReturnNoteIdRef.current = focusTargetId;
      setDeleteTargetNoteId(null);
      setExpanded(null);
      announceDeleted();
    } catch {
      setDeleteError("Couldn't delete note. Try again.");
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleToggle(noteId: string): Promise<void> {
    if (isDraftOpen) {
      const result = await commitCurrentEditor();
      if (result === "failed") return;
      setIsDraftOpen(false);
      setExpanded(noteId);
      return;
    }

    const currentExpanded = expandedNoteIdRef.current;

    if (currentExpanded === noteId) {
      const result = await commitCurrentEditor();
      if (result === "failed" || expandedNoteIdRef.current !== noteId) return;
      focusReturnNoteIdRef.current = noteId;
      setExpanded(null);
      return;
    }

    if (currentExpanded) {
      const result = await commitCurrentEditor();
      if (result === "failed") return;
    }

    if (expandedNoteIdRef.current !== noteId) {
      setExpanded(noteId);
    }
  }

  const liveRegion = (
    <div aria-live="polite" className="sr-only">
      <span key={announcementId}>{announcement}</span>
    </div>
  );
  const deleteTargetNote = notes.find((note) => note.id === deleteTargetNoteId);

  if (notes.length === 0 && !isDraftOpen) {
    return (
      <div className="mx-auto w-full max-w-3xl">
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
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      {liveRegion}
      <TripNotesDeleteDialog
        open={deleteTargetNoteId !== null}
        noteLabel={deleteTargetNote ? getNoteTitle(deleteTargetNote) : "note"}
        isDeleting={isDeleting}
        error={deleteError}
        onOpenChange={handleDeleteOpenChange}
        onConfirm={handleDeleteConfirm}
      />
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
      <ol className="flex flex-col gap-1">
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
            onDeleteRequest={handleDeleteRequest}
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
                  onSaved={() => {
                    if (expandedNoteIdRef.current === note.id) announceSaved();
                  }}
                />
              ) : undefined
            }
          />
        ))}
      </ol>
    </div>
  );
}
