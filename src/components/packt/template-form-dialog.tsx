"use client";

import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export interface TemplateFormDialogProps {
  mode: "create" | "rename";
  initialName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => void | Promise<void>;
  isPending?: boolean;
}

export function TemplateFormDialog({
  mode,
  initialName,
  open,
  onOpenChange,
  onSubmit,
  isPending = false,
}: TemplateFormDialogProps) {
  const [name, setName] = useState(initialName ?? "");

  const trimmedName = name.trim();
  const showNameError = name.length > 0 && trimmedName.length === 0;
  const title = mode === "create" ? "New template" : "Rename template";
  const description =
    mode === "create"
      ? "Give your template a name. You can add items and sections once it's created."
      : "Updating the template name everywhere it appears in your library.";
  const submitLabel = mode === "create" ? "Create template" : "Save name";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending || !trimmedName) return;
    void onSubmit(trimmedName);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="px-5 pt-5 pb-4" style={{ borderBottom: "1px solid var(--line)" }}>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="px-5 py-4">
            <label htmlFor={`template-${mode}-name`} className="sr-only">
              Template name
            </label>
            <Input
              id={`template-${mode}-name`}
              autoFocus
              maxLength={30}
              value={name}
              aria-label="Template name"
              aria-describedby={showNameError ? `template-${mode}-name-error` : undefined}
              aria-invalid={showNameError ? true : undefined}
              placeholder="Beach weekend essentials"
              onChange={(event) => setName(event.target.value)}
            />
            {showNameError ? (
              <p
                id={`template-${mode}-name-error`}
                role="status"
                className="pt-2"
                style={{ color: "var(--destructive)", fontSize: "calc(13px * var(--font-scale))" }}
              >
                Template name is required.
              </p>
            ) : null}
          </div>
          <DialogFooter className="mx-0 mb-0">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || trimmedName.length === 0}>
              {isPending ? "Saving..." : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
