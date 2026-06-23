"use client";

import { useRef, useState, useTransition } from "react";
import { Trash2, Download, Eye, Share2 } from "lucide-react";
import { DocViewer } from "./doc-viewer";
import { DocKindBadge } from "./doc-kind-badge";
import { PendingSyncBadge } from "./pending-sync-badge";
import type { Document } from "@/data/types";
import { removeDocument, renameDocument } from "@/app/(app)/trips/[tripId]/actions";
import { deleteDocumentLocally, useOfflineDb, useOfflineEntitySyncStatus } from "@/lib/offline/db";
import { writeOfflineAware } from "@/lib/offline/offline-write";
import { useOnlineStatus } from "@/lib/offline/use-online-status";
import { shareDoc } from "@/lib/utils";
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

export interface DocRowProps {
  doc: Document;
}

export function DocRow({ doc }: DocRowProps) {
  const database = useOfflineDb();
  const isOnline = useOnlineStatus();
  const syncStatus = useOfflineEntitySyncStatus("document", doc.id);
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
      void renameDocument(doc.id, trimmed);
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

  function handleConfirm() {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setError(null);
    startTransition(async () => {
      try {
        await writeOfflineAware(
          isOnline,
          database,
          (db) => deleteDocumentLocally(db, doc.id),
          () => removeDocument(doc.id)
        );
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
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              role="img"
              aria-label={doc.offline ? "Cached offline" : "Not cached offline"}
              style={{
                display: "inline-flex",
                color: doc.offline ? "var(--accent-brand)" : "var(--fg-3)",
                flexShrink: 0,
                cursor: "default",
              }}
            >
              <Download size={13} strokeWidth={1.5} />
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
        <div className="flex min-w-0 flex-1 items-center gap-2">
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
          <PendingSyncBadge syncStatus={syncStatus} />
        </div>
      )}
      <button
        ref={viewButtonRef}
        onClick={() => setViewerOpen(true)}
        title={`View ${doc.name}`}
        aria-label={`View ${doc.name}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 44,
          minHeight: 44,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "var(--fg-3)",
          padding: 0,
        }}
      >
        <Eye size={15} strokeWidth={1.5} />
      </button>
      <button
        title={`Share ${doc.name}`}
        aria-label={`Share ${doc.name}`}
        onClick={() => {
          void shareDoc(doc);
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 44,
          minHeight: 44,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "var(--fg-3)",
          padding: 0,
        }}
      >
        <Share2 size={15} strokeWidth={1.5} />
      </button>
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
      {viewerOpen && (
        <DocViewer
          doc={doc}
          open={true}
          onClose={() => {
            setViewerOpen(false);
            viewButtonRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}
