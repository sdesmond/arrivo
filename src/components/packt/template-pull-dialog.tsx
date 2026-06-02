"use client";

import { useState, type ReactElement } from "react";
import { FolderOpen } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PackingTemplate, PullTemplatesResult } from "@/data/types";

export interface TemplatePullDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: PackingTemplate[];
  onPull: (templateIds: string[]) => Promise<PullTemplatesResult | undefined>;
}

export function TemplatePullDialog({ open, onOpenChange, templates, onPull }: TemplatePullDialogProps): ReactElement {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isPulling, setIsPulling] = useState(false);

  function toggleId(id: string): void {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handlePull(): Promise<void> {
    if (isPulling || selectedIds.size === 0) return;
    setIsPulling(true);
    try {
      await onPull([...selectedIds]);
    } finally {
      setIsPulling(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-md">
        <DialogHeader className="px-5 pt-5 pb-4" style={{ borderBottom: "1px solid var(--line)" }}>
          <DialogTitle>Pull from templates</DialogTitle>
        </DialogHeader>

        <div className="px-5 py-4">
          {templates.length === 0 ? (
            <p style={{ color: "var(--fg-2)", fontSize: "calc(14px * var(--font-scale))" }}>
              No templates yet —{" "}
              <Link
                href="/packing"
                className="underline"
                style={{ color: "var(--accent-brand)" }}
                onClick={() => onOpenChange(false)}
              >
                create one from the template library
              </Link>
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {templates.map((template) => (
                <li key={template.id}>
                  <label
                    className="flex items-center gap-3 min-h-11 cursor-pointer rounded-lg px-2"
                    style={{ color: "var(--fg)" }}
                  >
                    <input
                      type="checkbox"
                      className="min-h-6 min-w-6 cursor-pointer"
                      checked={selectedIds.has(template.id)}
                      onChange={() => toggleId(template.id)}
                    />
                    <span style={{ fontSize: "calc(14px * var(--font-scale))" }}>{template.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPulling}>
            Cancel
          </Button>
          {templates.length > 0 && (
            <Button
              className="min-h-11 min-w-11"
              disabled={selectedIds.size === 0 || isPulling}
              onClick={() => void handlePull()}
            >
              <FolderOpen size={16} strokeWidth={1.5} />
              Pull selected ({selectedIds.size})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
