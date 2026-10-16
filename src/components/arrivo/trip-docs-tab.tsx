"use client";

import { useRef, useState, useTransition } from "react";
import { FileText, Plus } from "lucide-react";
import { toast } from "sonner";
import type { Document } from "@/data/types";
import { DocRow } from "./doc-row";
import { uploadDocument } from "@/app/(app)/trips/[tripId]/actions";
import { cn } from "@/lib/utils";
import { assertValidDocumentUpload, DOCUMENT_UPLOAD_ACCEPT, DOCUMENT_UPLOAD_HINT } from "@/lib/upload-policy";
import { buttonVariants } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export interface TripDocsTabProps {
  tripId: string;
  docs: Document[];
}

export function TripDocsTab({ tripId, docs }: TripDocsTabProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");

  const visible = query.trim() ? docs.filter((doc) => doc.name.toLowerCase().includes(query.toLowerCase())) : docs;

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      assertValidDocumentUpload(file);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed. Please try again.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    startTransition(async () => {
      try {
        await uploadDocument(tripId, formData);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Upload failed. Please try again.");
      }
    });
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      <input
        id="doc-upload"
        ref={inputRef}
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
      />

      {docs.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileText strokeWidth={1.5} />
            </EmptyMedia>
            <EmptyTitle>No documents yet</EmptyTitle>
            <EmptyDescription>
              Add your first trip document — boarding passes, insurance, visas, and more.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <label
              htmlFor="doc-upload"
              title="Add document"
              className={buttonVariants({ variant: "outline", size: "sm" })}
              style={{ cursor: isPending ? "wait" : "pointer", opacity: isPending ? 0.5 : undefined }}
            >
              <Plus strokeWidth={1.5} />
              Add document
            </label>
            <div
              style={{
                fontSize: "calc(11px * var(--font-scale))",
                color: "var(--fg-2)",
                marginTop: 8,
              }}
            >
              {DOCUMENT_UPLOAD_HINT}
            </div>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <div className="flex items-center mb-3">
            <label
              htmlFor="doc-upload"
              title="Add document"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "ml-auto")}
              style={{ cursor: isPending ? "wait" : "pointer", opacity: isPending ? 0.5 : undefined }}
            >
              <Plus strokeWidth={1.5} />
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
            {DOCUMENT_UPLOAD_HINT}
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
              onChange={(event) => setQuery(event.target.value)}
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
          <div>
            {visible.map((doc) => (
              <DocRow key={doc.id} doc={doc} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
