"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, StickyNote } from "lucide-react";
import type { TripNote } from "@/data/types";
import { TripNotesRow } from "./trip-notes-row";
import { TripNotesEditor } from "./trip-notes-editor";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export interface TripNotesTabProps {
  tripId: string;
  notes: TripNote[];
}

export function TripNotesTab({ tripId, notes }: TripNotesTabProps) {
  const [isDraftOpen, setIsDraftOpen] = useState(false);
  const newNoteButtonRef = useRef<HTMLButtonElement>(null);
  const isFirstRenderRef = useRef(true);

  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }
    if (!isDraftOpen) {
      newNoteButtonRef.current?.focus();
    }
  }, [isDraftOpen]);

  function openDraft(): void {
    setIsDraftOpen(true);
  }

  function closeDraft(): void {
    setIsDraftOpen(false);
  }

  if (notes.length === 0 && !isDraftOpen) {
    return (
      <Empty>
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
            onClick={openDraft}
          >
            New Note
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div>
      {!isDraftOpen && (
        <div className="flex items-center mb-3">
          <Button
            ref={newNoteButtonRef}
            variant="outline"
            size="sm"
            className="ml-auto"
            style={{ minHeight: 44, minWidth: 44 }}
            onClick={openDraft}
          >
            <Plus strokeWidth={1.5} />
            New Note
          </Button>
        </div>
      )}
      <ol>
        {isDraftOpen && (
          <li>
            <TripNotesEditor tripId={tripId} onClose={closeDraft} />
          </li>
        )}
        {notes.map((note) => (
          <TripNotesRow key={note.id} note={note} />
        ))}
      </ol>
    </div>
  );
}
