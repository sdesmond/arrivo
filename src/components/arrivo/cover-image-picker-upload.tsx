"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { LoaderIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { uploadTripCoverImage } from "@/lib/api/contract/covers";
import { useApiMutation } from "@/lib/api/use-api-mutation";
import { assertValidCoverUpload, COVER_UPLOAD_ACCEPT, COVER_UPLOAD_HINT } from "@/lib/upload-policy";

export interface CoverImagePickerUploadProps {
  tripId: string;
  onClose: () => void;
}

export function CoverImagePickerUpload({ tripId, onClose }: CoverImagePickerUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { mutate, isPending: uploading } = useApiMutation(uploadTripCoverImage);
  const [dragOver, setDragOver] = useState(false);

  function resetInputValue() {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleFile(file: File) {
    try {
      assertValidCoverUpload(file);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed. Try again.");
      resetInputValue();
      return;
    }

    // The hook reports an API error itself; the picker only stays open so the user can pick another file.
    void mutate(
      { params: { tripId }, body: {}, file },
      { onSuccess: onClose, onError: resetInputValue, onAuthLost: onClose }
    );
  }

  function onFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) handleFile(file);
  }

  function onDragOver(event: React.DragEvent) {
    event.preventDefault();
    setDragOver(true);
  }

  function onDragLeave() {
    setDragOver(false);
  }

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function onTriggerKeyDown(event: React.KeyboardEvent<HTMLLabelElement>) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    fileInputRef.current?.click();
  }

  if (uploading) {
    return (
      <div
        role="status"
        aria-label="Uploading image"
        style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: 32 }}
      >
        <LoaderIcon strokeWidth={1.5} className="animate-spin" />
        <span className="sr-only">Uploading…</span>
      </div>
    );
  }

  return (
    <div style={{ padding: "8px 0" }}>
      <input
        ref={fileInputRef}
        type="file"
        accept={COVER_UPLOAD_ACCEPT}
        id="cover-upload-input"
        onChange={onFileSelected}
        className="sr-only"
      />
      <label
        htmlFor="cover-upload-input"
        tabIndex={0}
        role="button"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg p-8",
          "border-2 border-dashed"
        )}
        style={{
          borderColor: "var(--line)",
          background: dragOver ? "var(--accent-soft)" : undefined,
        }}
      >
        Drop file here or browse
      </label>
      <p
        style={{
          color: "var(--fg-3)",
          fontFamily: "var(--font-mono-family, ui-monospace)",
          fontSize: "calc(10.5px * var(--font-scale))",
          letterSpacing: "0.04em",
          marginTop: 8,
          textTransform: "uppercase",
        }}
      >
        {COVER_UPLOAD_HINT}
      </p>
    </div>
  );
}
