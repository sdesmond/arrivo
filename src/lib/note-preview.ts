import type { TripNote } from "@/data/types";

function firstNonEmptyLine(text?: string): string | undefined {
  if (!text) return undefined;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

export function getNoteTitle(note: Pick<TripNote, "title" | "body">): string {
  const trimmedTitle = note.title?.trim();
  if (trimmedTitle) return trimmedTitle;
  return firstNonEmptyLine(note.body) ?? "";
}

export function getNotePreviewLine(note: Pick<TripNote, "title" | "body">): string {
  return firstNonEmptyLine(note.body) ?? getNoteTitle(note);
}
