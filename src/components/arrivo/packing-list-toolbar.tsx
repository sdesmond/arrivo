"use client";

import type { ReactElement } from "react";
import { Ellipsis, FolderOpen, Plus, Save } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface PackingListToolbarProps {
  itemCount: number;
  packedCount: number;
  onOpenPullDialog?: () => void;
  onOpenSaveDialog?: () => void;
  onOpenNewSection?: () => void;
}

export function PackingListToolbar({
  itemCount,
  packedCount,
  onOpenPullDialog,
  onOpenSaveDialog,
  onOpenNewSection,
}: PackingListToolbarProps): ReactElement {
  const hasTemplateActions =
    onOpenPullDialog !== undefined || onOpenSaveDialog !== undefined || onOpenNewSection !== undefined;

  return (
    <div className="flex items-center justify-between">
      {itemCount > 0 ? (
        <span style={{ color: "var(--fg-2)", fontSize: "calc(13px * var(--font-scale))" }}>
          {packedCount} of {itemCount} packed
        </span>
      ) : (
        <span />
      )}
      {hasTemplateActions && (
        <DropdownMenu>
          <DropdownMenuTrigger
            title="List options"
            aria-label="List options"
            className="flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-surface-2"
            style={{
              color: "var(--fg-3)",
              border: "none",
              background: "none",
              cursor: "pointer",
            }}
          >
            <Ellipsis size={16} strokeWidth={1.5} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="bottom">
            {onOpenPullDialog && (
              <DropdownMenuItem onClick={onOpenPullDialog}>
                <FolderOpen size={14} strokeWidth={1.5} />
                Pull templates
              </DropdownMenuItem>
            )}
            {onOpenNewSection && (
              <DropdownMenuItem onClick={onOpenNewSection}>
                <Plus size={14} strokeWidth={1.5} />
                New section
              </DropdownMenuItem>
            )}
            {onOpenSaveDialog && itemCount > 0 && (
              <>
                {(onOpenPullDialog || onOpenNewSection) && <DropdownMenuSeparator />}
                <DropdownMenuItem onClick={onOpenSaveDialog}>
                  <Save size={14} strokeWidth={1.5} />
                  Save as template
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
