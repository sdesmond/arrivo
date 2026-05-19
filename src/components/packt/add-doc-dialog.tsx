"use client";

import { useState } from "react";
import { Paperclip } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DocKind } from "@/data/types";

export interface AddDocDialogProps {
  eventName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddDocDialog({ eventName, open, onOpenChange }: AddDocDialogProps) {
  const [draftName, setDraftName] = useState("");
  const [draftKind, setDraftKind] = useState<DocKind>(DocKind.PDF);
  const [draftUrl, setDraftUrl] = useState("");

  function handleClose(o: boolean) {
    if (!o) {
      setDraftName("");
      setDraftKind(DocKind.PDF);
      setDraftUrl("");
    }
    onOpenChange(o);
  }

  function handleAdd() {
    const name = draftName.trim();
    if (!name) return;
    handleClose(false); // no-op until Story 3.1 adds real attachment
  }

  const kinds = [DocKind.PDF, DocKind.Image, DocKind.Doc, DocKind.Link] as const;

  return (
    <Dialog open={open} onOpenChange={(o) => handleClose(o as boolean)}>
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
          <div>
            <div
              style={{
                fontFamily: "var(--font-mono-family, ui-monospace)",
                fontSize: "calc(10px * var(--font-scale))",
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--fg-4)",
                marginBottom: 6,
              }}
            >
              Type
            </div>
            <div className="flex gap-1">
              {kinds.map((k) => (
                <button
                  key={k}
                  onClick={() => setDraftKind(k)}
                  aria-pressed={draftKind === k}
                  style={{
                    flex: 1,
                    padding: "4px 0",
                    borderRadius: 6,
                    fontSize: "calc(11px * var(--font-scale))",
                    fontWeight: 600,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    fontFamily: "var(--font-mono-family, ui-monospace)",
                    cursor: "pointer",
                    border: draftKind === k ? "1px solid var(--accent-brand)" : "1px solid var(--line-strong)",
                    background: draftKind === k ? "var(--accent-soft)" : "var(--surface-2)",
                    color: draftKind === k ? "var(--accent-ink)" : "var(--fg-3)",
                    transition: "background 0.1s, border-color 0.1s, color 0.1s",
                  }}
                >
                  {k.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label
              htmlFor="add-doc-name"
              style={{
                fontFamily: "var(--font-mono-family, ui-monospace)",
                fontSize: "calc(10px * var(--font-scale))",
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--fg-4)",
                display: "block",
                marginBottom: 4,
              }}
            >
              Name
            </label>
            <Input
              id="add-doc-name"
              placeholder="Document name"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
              autoFocus
            />
          </div>
          {draftKind === DocKind.Link && (
            <div>
              <label
                htmlFor="add-doc-url"
                style={{
                  fontFamily: "var(--font-mono-family, ui-monospace)",
                  fontSize: "calc(10px * var(--font-scale))",
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--fg-4)",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                URL
              </label>
              <Input
                id="add-doc-url"
                placeholder="https://…"
                value={draftUrl}
                onChange={(e) => setDraftUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdd();
                }}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={!draftName.trim()}>
            <Paperclip size={13} strokeWidth={1.5} aria-hidden="true" />
            Attach
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
