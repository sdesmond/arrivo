"use client";

import { forwardRef, useEffect, useImperativeHandle, useState, type ReactElement } from "react";
import {
  RemovePackingSectionMode,
  type PackingItem,
  type PackingTemplate,
  type PullTemplatesResult,
  type RemovePackingSectionInput,
} from "@/data/types";
import { TemplatePullDialog } from "./template-pull-dialog";
import { SaveAsTemplateDialog } from "./save-as-template-dialog";
import { DeletePackingSectionAlertDialog } from "./delete-packing-section-alert-dialog";

export interface PackingListDialogsHandle {
  openPullDialog: () => void;
  openSaveDialog: () => void;
}

export interface PendingSectionRemoval {
  item: PackingItem & { id: string };
  itemCount: number;
}

interface PackingListDialogsProps {
  templates: PackingTemplate[];
  effectiveItemCount: number;
  pendingSectionRemoval: PendingSectionRemoval | null;
  onClearPendingSectionRemoval: () => void;
  onPullTemplates?: (templateIds: string[]) => Promise<PullTemplatesResult | undefined>;
  onRemoveSection?: (id: string, input: RemovePackingSectionInput) => Promise<void>;
  onSaveAsTemplate?: (name: string) => Promise<string | undefined>;
  onAnnounce: (message: string) => void;
}

export const PackingListDialogs = forwardRef<PackingListDialogsHandle, PackingListDialogsProps>(
  function PackingListDialogs(
    {
      templates,
      effectiveItemCount,
      pendingSectionRemoval,
      onClearPendingSectionRemoval,
      onPullTemplates,
      onRemoveSection,
      onSaveAsTemplate,
      onAnnounce,
    },
    ref
  ): ReactElement {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [dialogKey, setDialogKey] = useState(0);
    const [saveDialogOpen, setSaveDialogOpen] = useState(false);
    const [resultNotice, setResultNotice] = useState<PullTemplatesResult | null>(null);
    const [isRemovingSection, setIsRemovingSection] = useState(false);

    useEffect(() => {
      if (!resultNotice) return;
      const timer = setTimeout(() => setResultNotice(null), 4000);
      return () => clearTimeout(timer);
    }, [resultNotice]);

    useImperativeHandle(ref, () => ({
      openPullDialog: () => {
        setDialogKey((k) => k + 1);
        setDialogOpen(true);
      },
      openSaveDialog: () => setSaveDialogOpen(true),
    }));

    async function handleDialogPull(templateIds: string[]): Promise<PullTemplatesResult | undefined> {
      if (!onPullTemplates) return undefined;
      try {
        const result = await onPullTemplates(templateIds);
        if (result) {
          setResultNotice(result);
          setDialogOpen(false);
        }
        return result;
      } catch {
        return undefined;
      }
    }

    async function handleSectionRemoval(mode: RemovePackingSectionMode): Promise<void> {
      if (!pendingSectionRemoval || !onRemoveSection) return;
      setIsRemovingSection(true);
      try {
        await onRemoveSection(pendingSectionRemoval.item.id, { mode });
        const itemLabel = pendingSectionRemoval.itemCount === 1 ? "item" : "items";
        if (mode === RemovePackingSectionMode.MoveItemsToUngrouped) {
          onAnnounce(
            `Section ${pendingSectionRemoval.item.name} removed. ${pendingSectionRemoval.itemCount} ${itemLabel} moved to Ungrouped.`
          );
        } else {
          onAnnounce(
            `Section ${pendingSectionRemoval.item.name} and ${pendingSectionRemoval.itemCount} ${itemLabel} removed.`
          );
        }
        onClearPendingSectionRemoval();
      } catch {
        onAnnounce("Failed to remove section.");
      } finally {
        setIsRemovingSection(false);
      }
    }

    return (
      <>
        {resultNotice && (
          <div
            role="status"
            className="rounded-2xl border p-3 text-sm"
            style={{ background: "var(--surface)", borderColor: "var(--line)", color: "var(--fg)" }}
          >
            {resultNotice.added} item(s) added
            {resultNotice.skipped > 0 ? `, ${resultNotice.skipped} duplicate(s) skipped` : ""}
          </div>
        )}

        {onPullTemplates && (
          <TemplatePullDialog
            key={dialogKey}
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            templates={templates}
            onPull={handleDialogPull}
          />
        )}

        {onSaveAsTemplate && (
          <SaveAsTemplateDialog
            key={String(saveDialogOpen)}
            open={saveDialogOpen && effectiveItemCount > 0}
            onClose={() => setSaveDialogOpen(false)}
            onSave={onSaveAsTemplate}
            itemCount={effectiveItemCount}
          />
        )}

        {pendingSectionRemoval && onRemoveSection ? (
          <DeletePackingSectionAlertDialog
            open
            sectionName={pendingSectionRemoval.item.name}
            itemCount={pendingSectionRemoval.itemCount}
            isDeleting={isRemovingSection}
            onOpenChange={(open) => {
              if (!open && !isRemovingSection) {
                onClearPendingSectionRemoval();
              }
            }}
            onMoveItems={() => handleSectionRemoval(RemovePackingSectionMode.MoveItemsToUngrouped)}
            onDeleteItems={() => handleSectionRemoval(RemovePackingSectionMode.DeleteItems)}
          />
        ) : null}
      </>
    );
  }
);
