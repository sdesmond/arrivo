"use client";

import { useRef, useState, useEffect } from "react";
import { Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import type { Document } from "@/data/types";
import { DocKindBadge } from "./doc-kind-badge";
import { assertValidDocumentUpload, DOCUMENT_UPLOAD_ACCEPT, DOCUMENT_UPLOAD_CHOOSER_LABEL } from "@/lib/upload-policy";

import { updateDocument, uploadReservationDocument } from "@/lib/api/contract/documents";
import { useApiMutation } from "@/lib/api/use-api-mutation";
import { ApiClientError } from "@/lib/api/client";
import { createRandomId } from "@/lib/utils";

type DialogMode = "pick" | "upload";

export interface AddReservationDocDialogProps {
  reservationId: string;
  providerName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripDocs?: Document[];
}

export function AddReservationDocDialog({
  reservationId,
  providerName,
  open,
  onOpenChange,
  tripDocs,
}: AddReservationDocDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const pick = useApiMutation(updateDocument);
  const pickingRef = useRef(false);
  const { mutate, isPending } = useApiMutation(uploadReservationDocument);
  const attempt = useRef<{ file: File; targetId: string; id: string }>(undefined);
  const isUploading = pick.isPending || isPending;
  // Each open-to-close span is one session; a write only closes the session it started in.
  const session = useRef(0);

  const defaultMode = (): DialogMode => ((tripDocs?.length ?? 0) > 0 ? "pick" : "upload");
  const [mode, setMode] = useState<DialogMode>(defaultMode);

  useEffect(() => {
    if (open && mode === "pick") {
      const timeoutId = setTimeout(() => firstItemRef.current?.focus(), 50);
      return () => clearTimeout(timeoutId);
    }
  }, [open, mode]);

  function handleClose(open: boolean) {
    if (!open) {
      session.current += 1;
      setMode(defaultMode());
      setPendingFile(null);
      attempt.current = undefined;
    }
    onOpenChange(open);
  }

  /** A write that finishes after the user cancelled leaves the reopened dialog and its selection alone. */
  function closeSession(started: number) {
    if (session.current === started) handleClose(false);
  }

  function handlePickDoc(docId: string) {
    if (pickingRef.current || isUploading) return;
    pickingRef.current = true;
    const started = session.current;
    void pick.mutate(
      { params: { documentId: docId }, body: { reservationId } },
      {
        key: docId,
        onSuccess: () => closeSession(started),
        onAuthLost: () => handleClose(false),
        onSettled: () => {
          pickingRef.current = false;
        },
      }
    );
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (isUploading) {
      event.target.value = "";
      return;
    }
    try {
      assertValidDocumentUpload(file);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed. Please try again.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setPendingFile(file);
  }

  function handleUpload() {
    if (!pendingFile || isUploading) return;
    if (attempt.current?.file !== pendingFile || attempt.current?.targetId !== reservationId) {
      attempt.current = { file: pendingFile, targetId: reservationId, id: createRandomId() };
    }
    const started = session.current;
    void mutate(
      { params: { reservationId }, body: { id: attempt.current.id }, file: pendingFile },
      {
        onSuccess: () => closeSession(started),
        onAuthLost: () => handleClose(false),
        // The server refuses a conflicting id for good (reused or deleted), so the next try needs a new one.
        onError: (error) => {
          if (error instanceof ApiClientError && error.code === "conflict") attempt.current = undefined;
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => handleClose(isOpen as boolean)}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Attach document</DialogTitle>
          {providerName && (
            <p style={{ fontSize: "calc(11px * var(--font-scale))", color: "var(--fg-4)", marginTop: -4 }}>
              {providerName}
            </p>
          )}
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {mode === "pick" && (
            <>
              <div className="flex flex-col gap-1">
                {(tripDocs ?? []).map((doc, idx) => (
                  <button
                    key={doc.id}
                    ref={idx === 0 ? firstItemRef : undefined}
                    onClick={() => handlePickDoc(doc.id)}
                    disabled={isUploading}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: "1px solid var(--line)",
                      background: "var(--surface)",
                      cursor: "pointer",
                      textAlign: "left",
                      minHeight: 44,
                      color: "var(--fg)",
                    }}
                  >
                    <DocKindBadge kind={doc.kind} />
                    <span style={{ fontSize: "calc(13px * var(--font-scale))", fontWeight: 500 }}>{doc.name}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setMode("upload")}
                disabled={isUploading}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--fg-3)",
                  fontSize: "calc(12px * var(--font-scale))",
                  cursor: "pointer",
                  padding: "4px 0",
                  minHeight: 44,
                  textDecoration: "underline",
                }}
              >
                Upload new instead
              </button>
            </>
          )}

          {mode === "upload" && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept={DOCUMENT_UPLOAD_ACCEPT}
                style={{
                  position: "absolute",
                  width: 1,
                  height: 1,
                  padding: 0,
                  margin: -1,
                  overflow: "hidden",
                  clip: "rect(0,0,0,0)",
                  whiteSpace: "nowrap",
                  border: 0,
                }}
                onChange={handleFileChange}
                disabled={isUploading}
              />
              <div
                onClick={() => {
                  if (!isUploading) fileInputRef.current?.click();
                }}
                role="button"
                tabIndex={0}
                aria-disabled={isUploading}
                onKeyDown={(event) => {
                  if (!isUploading && (event.key === "Enter" || event.key === " ")) fileInputRef.current?.click();
                }}
                style={{
                  border: "1.5px dashed var(--line-strong)",
                  borderRadius: 6,
                  padding: "12px 16px",
                  minHeight: 44,
                  cursor: isUploading ? "not-allowed" : "pointer",
                  opacity: isUploading ? 0.6 : 1,
                  color: pendingFile ? "var(--fg)" : "var(--fg-4)",
                  fontSize: "calc(13px * var(--font-scale))",
                  textAlign: "center",
                }}
              >
                {pendingFile ? pendingFile.name : DOCUMENT_UPLOAD_CHOOSER_LABEL}
              </div>
              {(tripDocs?.length ?? 0) > 0 && (
                <button
                  onClick={() => setMode("pick")}
                  disabled={isUploading}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--fg-3)",
                    fontSize: "calc(12px * var(--font-scale))",
                    cursor: "pointer",
                    padding: "4px 0",
                    minHeight: 44,
                    textDecoration: "underline",
                  }}
                >
                  ← Choose existing instead
                </button>
              )}
            </>
          )}
        </div>

        {mode === "pick" && (
          <DialogFooter>
            <Button variant="ghost" onClick={() => handleClose(false)}>
              Cancel
            </Button>
          </DialogFooter>
        )}

        {mode === "upload" && (
          <DialogFooter>
            <Button variant="ghost" onClick={() => handleClose(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={!pendingFile || isUploading}>
              <Paperclip size={13} strokeWidth={1.5} aria-hidden="true" />
              Attach
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
