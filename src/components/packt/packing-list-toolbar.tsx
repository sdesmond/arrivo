"use client";

import type { ReactElement } from "react";
import { FolderOpen, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface PackingListToolbarProps {
  itemCount: number;
  onOpenPullDialog?: () => void;
  onOpenSaveDialog?: () => void;
}

export function PackingListToolbar({
  itemCount,
  onOpenPullDialog,
  onOpenSaveDialog,
}: PackingListToolbarProps): ReactElement {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: "var(--fg-2)", fontSize: "calc(13px * var(--font-scale))" }}>
        {itemCount} item{itemCount !== 1 ? "s" : ""}
      </span>
      <div className="flex items-center gap-2">
        {onOpenSaveDialog && (
          <Button className="min-h-11 min-w-11 rounded-xl" variant="outline" size="sm" onClick={onOpenSaveDialog}>
            <Save size={14} strokeWidth={1.5} />
            Save as template
          </Button>
        )}
        {onOpenPullDialog && (
          <Button className="min-h-11 min-w-11 rounded-xl" variant="outline" size="sm" onClick={onOpenPullDialog}>
            <FolderOpen size={14} strokeWidth={1.5} />
            Pull templates
          </Button>
        )}
      </div>
    </div>
  );
}
