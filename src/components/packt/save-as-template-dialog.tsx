"use client";

import { useState, type ReactElement } from "react";
import { Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

export interface SaveAsTemplateDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (name: string) => Promise<string | undefined>;
  itemCount: number;
}

export function SaveAsTemplateDialog({ open, onClose, onSave, itemCount }: SaveAsTemplateDialogProps): ReactElement {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave(): Promise<void> {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError("Template name is required");
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const templateId = await onSave(trimmed);
      if (templateId) {
        toast.success("Template saved");
        setName("");
        onClose();
      } else {
        setError("Could not save template. Please try again.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  function handleNameChange(value: string): void {
    setName(value);
    if (error) setError(null);
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter" && !isSaving) {
      event.preventDefault();
      void handleSave();
    }
  }

  return (
    <Dialog open={open} onOpenChange={() => onClose()} disablePointerDismissal>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle id="save-template-dialog-title">Save as template</DialogTitle>
            <Button
              aria-label="Close"
              className="min-h-11 min-w-11"
              size="icon-sm"
              variant="ghost"
              type="button"
              onClick={onClose}
            >
              <X size={16} strokeWidth={1.5} />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="save-template-name"
              style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--fg-2)" }}
            >
              Template name
            </label>
            <Input
              id="save-template-name"
              className="h-11"
              placeholder="e.g. Beach Holiday"
              value={name}
              maxLength={30}
              onChange={(event) => handleNameChange(event.target.value)}
              onKeyDown={handleInputKeyDown}
              style={{ color: "var(--fg)" }}
            />
            {error && (
              <span
                role="alert"
                style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--destructive, red)" }}
              >
                {error}
              </span>
            )}
            <span style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--fg-3)" }}>
              {itemCount} {itemCount === 1 ? "item" : "items"} will be saved
            </span>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              className="min-h-11 min-w-11"
              disabled={name.trim().length === 0 || isSaving}
              onClick={() => void handleSave()}
            >
              <Save size={16} strokeWidth={1.5} />
              Save template
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
