"use client";

import { useRef, useState } from "react";
import { ArrowUpToLine, Eye, Share2, Trash2 } from "lucide-react";
import { DocViewer } from "./doc-viewer";
import { DocKindBadge } from "./doc-kind-badge";
import type { Document } from "@/data/types";
import { shareDoc, cn } from "@/lib/utils";
import { DocumentDeleteDialog } from "./document-delete-dialog";
import { useCanEditTrip } from "./trip-edit-access";
import { useApiMutation } from "@/lib/api/use-api-mutation";
import { updateDocument, deleteDocument } from "@/lib/api/contract/documents";
import { FIELD_LIMITS } from "@/lib/validation-limits";

export interface EventDocRowProps {
  doc: Document;
  tripId: string;
}

const compactBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 44,
  minHeight: 44,
  padding: 4,
  background: "transparent",
  border: "none",
  cursor: "pointer",
  color: "var(--fg-3)",
  borderRadius: 4,
  flexShrink: 0,
};

const nameStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 44,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: "calc(12px * var(--font-scale))",
  color: "var(--fg)",
  fontFamily: "var(--font-body, ui-sans-serif)",
};

export function EventDocRow({ doc, tripId }: EventDocRowProps) {
  const canEdit = useCanEditTrip();
  const [promotePending, setPromotePending] = useState(false);
  const rename = useApiMutation(updateDocument),
    remove = useApiMutation(deleteDocument);
  const isPending = promotePending || remove.isPending;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [displayName, setDisplayName] = useState(doc.name);
  const cancelRef = useRef(false);
  const savedNameRef = useRef(doc.name);
  const [viewerOpen, setViewerOpen] = useState(false);
  const viewButtonRef = useRef<HTMLButtonElement | null>(null);
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null);

  function handleSave() {
    if (cancelRef.current) {
      cancelRef.current = false;
      return;
    }
    const trimmed = editName.trim();
    if (trimmed && trimmed !== displayName) {
      setDisplayName(trimmed);
      void rename.mutate(
        { params: { documentId: doc.id }, body: { name: trimmed } },
        {
          key: doc.id,
          onSuccess: () => {
            savedNameRef.current = trimmed;
          },
          onError: () => setDisplayName((current) => (current === trimmed ? savedNameRef.current : current)),
          onAuthLost: () => setDisplayName(savedNameRef.current),
        }
      );
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
    setPromotePending(true);
    const finishPromotion = () => {
      inFlightRef.current = false;
      setPromotePending(false);
    };
    void rename.mutate(
      { params: { documentId: doc.id }, body: { eventId: null } },
      {
        key: doc.id,
        onAuthLost: finishPromotion,
        onSettled: finishPromotion,
      }
    );
  }
  function handleConfirm() {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setError(null);
    void remove.mutate(
      { params: { documentId: doc.id }, body: { tripId } },
      {
        key: doc.id,
        onSuccess: () => setConfirmOpen(false),
        onError: () => setError("Couldn't delete. Try again."),
        onAuthLost: () => setConfirmOpen(false),
        onSettled: () => {
          inFlightRef.current = false;
        },
      }
    );
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
      {isEditing ? (
        <input
          aria-label="Document name"
          autoFocus
          value={editName}
          maxLength={FIELD_LIMITS.documentName}
          onChange={(event) => setEditName(event.target.value)}
          onBlur={handleSave}
          onKeyDown={handleRenameKeyDown}
          style={{
            minHeight: 44,
            minWidth: 44,
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
      ) : canEdit ? (
        <button
          type="button"
          onClick={() => {
            setEditName(displayName);
            setIsEditing(true);
          }}
          style={{
            ...nameStyle,
            background: "none",
            border: "none",
            padding: 0,
            minHeight: 44,
            textAlign: "left",
            cursor: "text",
          }}
        >
          {displayName}
        </button>
      ) : (
        <span style={nameStyle}>{displayName}</span>
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
      {canEdit && (
        <button
          title={`Move ${doc.name} to trip`}
          aria-label={`Move ${doc.name} to trip`}
          disabled={isPending}
          onClick={handlePromote}
          style={compactBtn}
        >
          <ArrowUpToLine size={13} strokeWidth={1.5} />
        </button>
      )}
      {canEdit && (
        <button
          ref={deleteButtonRef}
          onClick={() => setConfirmOpen(true)}
          disabled={isPending}
          title={`Delete ${doc.name}`}
          aria-label={`Delete ${doc.name}`}
          style={{ ...compactBtn, cursor: isPending ? "wait" : "pointer" }}
        >
          <Trash2 size={13} strokeWidth={1.5} />
        </button>
      )}

      <DocumentDeleteDialog
        name={doc.name}
        open={confirmOpen}
        isPending={isPending}
        error={error}
        onOpenChange={handleOpenChange}
        onConfirm={handleConfirm}
        finalFocusRef={deleteButtonRef}
      />

      <DocViewer doc={doc} open={viewerOpen} onClose={() => setViewerOpen(false)} finalFocusRef={viewButtonRef} />
    </div>
  );
}
