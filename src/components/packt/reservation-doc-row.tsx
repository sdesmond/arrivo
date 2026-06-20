"use client";

import { useRef, useState, useTransition } from "react";
import { ArrowUpToLine, Download, Eye, Share2, Trash2 } from "lucide-react";
import { DocViewer } from "./doc-viewer";
import { DocKindBadge } from "./doc-kind-badge";
import type { Document } from "@/data/types";
import {
  removeReservationDocument,
  renameReservationDocument,
  promoteReservationDocToTrip,
} from "@/app/(app)/trips/[tripId]/reservations/reservation-document-actions";
import { shareDoc, cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

export interface ReservationDocRowProps {
  doc: Document;
}

const compactBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 28,
  minHeight: 28,
  padding: 4,
  background: "transparent",
  border: "none",
  cursor: "pointer",
  color: "var(--fg-3)",
  borderRadius: 4,
  flexShrink: 0,
};

export function ReservationDocRow({ doc }: ReservationDocRowProps) {
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [displayName, setDisplayName] = useState(doc.name);
  const cancelRef = useRef(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const viewButtonRef = useRef<HTMLButtonElement | null>(null);

  function handleSave() {
    if (cancelRef.current) {
      cancelRef.current = false;
      return;
    }
    const trimmed = editName.trim();
    if (trimmed && trimmed !== displayName) {
      setDisplayName(trimmed);
      void renameReservationDocument(doc.id, trimmed);
    }
    setIsEditing(false);
  }

  function handleRenameKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSave();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelRef.current = true;
      setIsEditing(false);
    }
  }

  function handlePromote() {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    startTransition(async () => {
      try {
        await promoteReservationDocToTrip(doc.id);
      } catch {
        inFlightRef.current = false;
      }
    });
  }

  function handleConfirm() {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setError(null);
    startTransition(async () => {
      try {
        await removeReservationDocument(doc.id);
      } catch {
        inFlightRef.current = false;
        setError("Couldn't delete. Try again.");
      }
    });
  }

  function handleOpenChange(isOpen: boolean) {
    if (isPending) return;
    if (!isOpen) setError(null);
    setConfirmOpen(isOpen);
  }

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-[6px] px-2 py-1.5 transition-colors hover:bg-surface-2 w-full",
        isPending && "opacity-50 pointer-events-none"
      )}
      style={{ background: "var(--surface)" }}
    >
      <DocKindBadge kind={doc.kind} />

      <Tooltip>
        <TooltipTrigger
          render={
            <span
              role="img"
              aria-label={doc.offline ? "Cached offline" : "Not cached offline"}
              style={{
                display: "inline-flex",
                color: doc.offline ? "var(--accent-brand)" : "var(--fg-4)",
                flexShrink: 0,
                cursor: "default",
              }}
            >
              <Download size={11} strokeWidth={1.5} />
            </span>
          }
        />
        <TooltipContent>{doc.offline ? "Cached offline" : "Not cached offline"}</TooltipContent>
      </Tooltip>

      {isEditing ? (
        <input
          autoFocus
          value={editName}
          onChange={(event) => setEditName(event.target.value)}
          onBlur={handleSave}
          onKeyDown={handleRenameKeyDown}
          style={{
            flex: 1,
            fontSize: "calc(12px * var(--font-scale))",
            color: "var(--fg)",
            background: "transparent",
            border: "none",
            borderBottom: "1px solid var(--accent-brand)",
            outline: "none",
            padding: 0,
            fontFamily: "var(--font-body, ui-sans-serif)",
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setEditName(displayName);
            setIsEditing(true);
          }}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            textAlign: "left",
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontSize: "calc(12px * var(--font-scale))",
            color: "var(--fg)",
            cursor: "text",
            fontFamily: "var(--font-body, ui-sans-serif)",
          }}
        >
          {displayName}
        </button>
      )}

      <button
        ref={viewButtonRef}
        onClick={() => setViewerOpen(true)}
        title={`View ${doc.name}`}
        aria-label={`View ${doc.name}`}
        style={compactBtn}
      >
        <Eye size={13} strokeWidth={1.5} />
      </button>

      <button
        title={`Share ${doc.name}`}
        aria-label={`Share ${doc.name}`}
        onClick={() => {
          void shareDoc(doc);
        }}
        style={compactBtn}
      >
        <Share2 size={13} strokeWidth={1.5} />
      </button>

      <button
        title={`Move ${doc.name} to trip`}
        aria-label={`Move ${doc.name} to trip`}
        disabled={isPending}
        onClick={handlePromote}
        style={compactBtn}
      >
        <ArrowUpToLine size={13} strokeWidth={1.5} />
      </button>

      <button
        onClick={() => setConfirmOpen(true)}
        disabled={isPending}
        title={`Delete ${doc.name}`}
        aria-label={`Delete ${doc.name}`}
        style={{ ...compactBtn, cursor: isPending ? "wait" : "pointer" }}
      >
        <Trash2 size={13} strokeWidth={1.5} />
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

      <DocViewer doc={doc} open={viewerOpen} onClose={() => setViewerOpen(false)} finalFocusRef={viewButtonRef} />
    </div>
  );
}
