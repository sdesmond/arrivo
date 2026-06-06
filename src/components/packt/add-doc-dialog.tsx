"use client";

import { useRef, useState, useEffect, useTransition } from "react";
import { Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import type { Document } from "@/data/types";
import { DocKindBadge } from "./doc-kind-badge";
import { attachTripDocToEvent, uploadDocumentToEvent } from "@/app/(app)/trips/[tripId]/actions";
import { MAX_UPLOAD_BYTES } from "@/lib/utils";

type DialogMode = "pick" | "upload";

export interface AddDocDialogProps {
  eventId: string;
  eventName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripDocs?: Document[];
}

export function AddDocDialog({ eventId, eventName, open, onOpenChange, tripDocs }: AddDocDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isUploading, startTransition] = useTransition();

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
      setMode(defaultMode());
      setPendingFile(null);
    }
    onOpenChange(open);
  }

  function handlePickDoc(docId: string) {
    startTransition(async () => {
      try {
        await attachTripDocToEvent(docId, eventId);
        handleClose(false);
      } catch {
        toast.error("Failed to attach document. Please try again.");
      }
    });
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("File is too large. Max 25 MB.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setPendingFile(file);
  }

  function handleUpload() {
    if (!pendingFile) return;
    const formData = new FormData();
    formData.append("file", pendingFile);
    startTransition(async () => {
      try {
        await uploadDocumentToEvent(eventId, formData);
        handleClose(false);
      } catch {
        toast.error("Upload failed. Please try again.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => handleClose(isOpen as boolean)}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Attach document</DialogTitle>
          {eventName && (
            <p style={{ fontSize: "calc(11px * var(--font-scale))", color: "var(--fg-4)", marginTop: -4 }}>
              {eventName}
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
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--fg-3)",
                  fontSize: "calc(12px * var(--font-scale))",
                  cursor: "pointer",
                  padding: "4px 0",
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
                accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
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
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") fileInputRef.current?.click();
                }}
                style={{
                  border: "1.5px dashed var(--line-strong)",
                  borderRadius: 6,
                  padding: "12px 16px",
                  cursor: "pointer",
                  color: pendingFile ? "var(--fg)" : "var(--fg-4)",
                  fontSize: "calc(13px * var(--font-scale))",
                  textAlign: "center",
                }}
              >
                {pendingFile ? pendingFile.name : "Choose file (PDF, JPG, PNG, WEBP, HEIC)"}
              </div>
              {(tripDocs?.length ?? 0) > 0 && (
                <button
                  onClick={() => setMode("pick")}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--fg-3)",
                    fontSize: "calc(12px * var(--font-scale))",
                    cursor: "pointer",
                    padding: "4px 0",
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
