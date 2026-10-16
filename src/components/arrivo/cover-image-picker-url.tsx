"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export interface CoverImagePickerUrlProps {
  onImageSelected: (url: string) => void;
  onClose: () => void;
}

export function CoverImagePickerUrl({ onImageSelected, onClose }: CoverImagePickerUrlProps) {
  const [urlInput, setUrlInput] = useState("");

  function handleApplyUrl() {
    const url = urlInput.trim();
    try {
      new URL(url);
    } catch {
      toast.error("Please enter a valid URL.");
      return;
    }

    if (url.startsWith("javascript:")) {
      toast.error("Please enter a valid URL.");
      return;
    }

    onImageSelected(url);
    onClose();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "8px 0" }}>
      <label htmlFor="cover-url-input" className="sr-only">
        Image URL
      </label>
      <input
        id="cover-url-input"
        type="url"
        placeholder="https://..."
        value={urlInput}
        onChange={(event) => setUrlInput(event.target.value)}
        style={{
          border: "1px solid var(--line)",
          borderRadius: 6,
          padding: "8px 12px",
          width: "100%",
          fontSize: 14,
          background: "var(--surface)",
          color: "var(--fg)",
        }}
      />
      <Button type="button" onClick={handleApplyUrl} disabled={!urlInput.trim()}>
        Apply
      </Button>
    </div>
  );
}
