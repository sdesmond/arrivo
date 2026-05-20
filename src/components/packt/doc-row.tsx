"use client";

import { useRef, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { DocKindBadge } from "./doc-kind-badge";
import type { Document } from "@/data/types";
import { removeDocument, renameDocument } from "@/app/(app)/trips/[tripId]/actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface DocRowProps {
  doc: Document;
}

export function DocRow({ doc }: DocRowProps) {
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [displayName, setDisplayName] = useState(doc.name);
  const cancelRef = useRef(false);

  function handleSave() {
    if (cancelRef.current) {
      cancelRef.current = false;
      return;
    }
    const trimmed = editName.trim();
    if (trimmed && trimmed !== displayName) {
      setDisplayName(trimmed);
      void renameDocument(doc.id, trimmed);
    }
    setIsEditing(false);
  }

  function handleRenameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelRef.current = true;
      setIsEditing(false);
    }
  }

  function handleConfirm() {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setError(null);
    startTransition(async () => {
      try {
        await removeDocument(doc.id);
      } catch {
        inFlightRef.current = false;
        setError("Couldn't delete. Try again.");
      }
    });
  }

  function handleOpenChange(o: boolean) {
    if (isPending) return;
    if (!o) setError(null);
    setConfirmOpen(o);
  }

  return (
    <div
      className="flex items-center gap-2"
      style={{
        minHeight: 44,
        borderBottom: "1px solid var(--line)",
        paddingTop: 8,
        paddingBottom: 8,
        opacity: isPending ? 0.5 : 1,
      }}
    >
      <DocKindBadge kind={doc.kind} />
      {isEditing ? (
        <input
          autoFocus
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleRenameKeyDown}
          style={{
            flex: 1,
            fontFamily: "var(--font-body, ui-sans-serif)",
            fontSize: "calc(14px * var(--font-scale))",
            color: "var(--fg)",
            background: "transparent",
            border: "none",
            borderBottom: "1px solid var(--accent-brand)",
            outline: "none",
            padding: 0,
          }}
        />
      ) : (
        <span
          className="flex-1 truncate"
          onClick={() => {
            setEditName(displayName);
            setIsEditing(true);
          }}
          style={{
            fontFamily: "var(--font-body, ui-sans-serif)",
            fontSize: "calc(14px * var(--font-scale))",
            color: "var(--fg)",
            cursor: "text",
          }}
        >
          {displayName}
        </span>
      )}
      <button
        onClick={() => setConfirmOpen(true)}
        disabled={isPending}
        title={`Delete ${doc.name}`}
        aria-label={`Delete ${doc.name}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 44,
          minHeight: 44,
          background: "transparent",
          border: "none",
          cursor: isPending ? "wait" : "pointer",
          color: "var(--fg-3)",
          padding: 0,
        }}
      >
        <Trash2 size={15} strokeWidth={1.5} />
      </button>
      <Dialog open={confirmOpen} onOpenChange={handleOpenChange}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{`Delete ${doc.name}?`}</DialogTitle>
            <DialogDescription>This cannot be undone.</DialogDescription>
          </DialogHeader>
          {error && (
            <p
              role="alert"
              style={{
                fontSize: "calc(12px * var(--font-scale))",
                color: "var(--destructive)",
              }}
            >
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={isPending}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
