"use client";

import { useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import type { Document } from "@/data/types";
import { DocRow } from "./doc-row";
import { uploadDocument } from "@/app/(app)/trips/[tripId]/actions";

export interface TripDocsTabProps {
  tripId: string;
  docs: Document[];
}

export function TripDocsTab({ tripId, docs }: TripDocsTabProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");

  const visible = query.trim() ? docs.filter((d) => d.name.toLowerCase().includes(query.toLowerCase())) : docs;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    startTransition(async () => {
      await uploadDocument(tripId, formData);
    });
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
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
          }}
        >
          <Plus size={13} strokeWidth={1.5} />
          Add
        </label>
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
