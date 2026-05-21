"use client";

import { useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import type { Document } from "@/data/types";
import { DocRow } from "./doc-row";
import { uploadDocument, markAllDocsOffline } from "@/app/(app)/trips/[tripId]/actions";
import { MAX_UPLOAD_BYTES } from "@/lib/utils";

export interface TripDocsTabProps {
  tripId: string;
  docs: Document[];
}

export function TripDocsTab({ tripId, docs }: TripDocsTabProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [isSavingOffline, startSaveOfflineTransition] = useTransition();
  const [query, setQuery] = useState("");

  const visible = query.trim() ? docs.filter((d) => d.name.toLowerCase().includes(query.toLowerCase())) : docs;

  function handleSaveOffline() {
    startSaveOfflineTransition(async () => {
      await markAllDocsOffline(tripId);
    });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("File is too large. Max 25 MB.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    startTransition(async () => {
      try {
        await uploadDocument(tripId, formData);
      } catch {
        toast.error("Upload failed. Please try again.");
      }
    });
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      <div className="flex items-center mb-3">
        {docs.length > 0 && (
          <button
            onClick={handleSaveOffline}
            disabled={isSavingOffline}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "5px 10px",
              minHeight: 44,
              minWidth: 44,
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--line)",
              background: "var(--surface)",
              color: "var(--fg)",
              fontFamily: "var(--font-body, ui-sans-serif)",
              fontSize: "calc(12px * var(--font-scale))",
              fontWeight: 500,
              cursor: isSavingOffline ? "wait" : "pointer",
              opacity: isSavingOffline ? 0.5 : 1,
            }}
          >
            Save offline
          </button>
        )}
        <input
          id="doc-upload"
          ref={inputRef}
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
        <label
          htmlFor="doc-upload"
          title="Add document"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "5px 10px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--line)",
            background: "var(--surface)",
            color: "var(--fg)",
            fontFamily: "var(--font-body, ui-sans-serif)",
            fontSize: "calc(12px * var(--font-scale))",
            fontWeight: 500,
            cursor: isPending ? "wait" : "pointer",
            opacity: isPending ? 0.5 : 1,
            marginLeft: "auto",
          }}
        >
          <Plus size={13} strokeWidth={1.5} />
          Add
        </label>
      </div>

      <div
        style={{
          textAlign: "right",
          fontSize: "calc(11px * var(--font-scale))",
          color: "var(--fg-2)",
          marginBottom: 8,
        }}
      >
        PDF, JPG, PNG, WEBP, HEIC · max 25 MB
      </div>

      <div style={{ position: "relative", marginBottom: 12 }}>
        <label
          htmlFor="doc-search"
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
        >
          Search documents
        </label>
        <input
          id="doc-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search"
          style={{
            width: "100%",
            padding: "5px 8px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--line)",
            background: "var(--surface)",
            color: "var(--fg)",
            fontFamily: "var(--font-body, ui-sans-serif)",
            fontSize: "calc(12px * var(--font-scale))",
            boxSizing: "border-box",
          }}
        />
      </div>

      {docs.length === 0 ? (
        <div style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--fg-2)" }}>
          Add your first trip document — boarding passes, insurance, visas, and more.
        </div>
      ) : (
        <div>
          {visible.map((doc) => (
            <DocRow key={doc.id} doc={doc} />
          ))}
        </div>
      )}
    </div>
  );
}
