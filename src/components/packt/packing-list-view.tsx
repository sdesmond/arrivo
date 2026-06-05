"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactElement } from "react";
import type { PackingItem, PackingTemplate, PullTemplatesResult } from "@/data/types";
import { PackingListSortable } from "./packing-list-sortable";
import { TemplatePullDialog } from "./template-pull-dialog";
import { PackingListToolbar } from "./packing-list-toolbar";
import { PackingListEmptyState } from "./packing-list-empty-state";
import { SaveAsTemplateDialog } from "./save-as-template-dialog";
import { PackingEntryForm } from "./packing-entry-form";

export interface PackingListViewProps {
  tripId: string;
  items: PackingItem[];
  onAddItem: (
    name: string,
    isLabel?: boolean,
    afterItemId?: string,
    beforeItemId?: string,
    labelId?: string | null
  ) => Promise<void>;
  onRemoveItem: (id: string) => Promise<void>;
  onToggleItem: (id: string) => Promise<void>;
  onReorderItems: (ordered: { id: string; labelId: string | null; position: number }[], onError?: () => void) => void;
  onEditItem?: (id: string, name: string) => void;
  templates?: PackingTemplate[];
  onPullTemplates?: (templateIds: string[]) => Promise<PullTemplatesResult | undefined>;
  onSaveAsTemplate?: (name: string) => Promise<string | undefined>;
}

export function PackingListView({
  tripId,
  items,
  onAddItem,
  onRemoveItem,
  onToggleItem,
  onReorderItems,
  onEditItem,
  templates,
  onPullTemplates,
  onSaveAsTemplate,
}: PackingListViewProps): ReactElement {
  const [draftName, setDraftName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogKey, setDialogKey] = useState(0);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [resultNotice, setResultNotice] = useState<PullTemplatesResult | null>(null);
  const [prevItems, setPrevItems] = useState(items);
  const [pendingItemIds, setPendingItemIds] = useState<Set<string>>(new Set());
  const [announcement, setAnnouncement] = useState("");
  const [announcementId, setAnnouncementId] = useState(0);
  const mutationSeqRef = useRef(0);

  useEffect(() => {
    if (!resultNotice) return;
    const timer = setTimeout(() => setResultNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [resultNotice]);
  const collapseKey = `packing_collapsed_${tripId}`;
  const [collapsedLabels, setCollapsedLabels] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const stored = localStorage.getItem(collapseKey);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (Array.isArray(parsed)) return new Set(parsed);
      }
    } catch {
      /* ignore */
    }
    return new Set();
  });

  useEffect(() => {
    try {
      localStorage.setItem(collapseKey, JSON.stringify([...collapsedLabels]));
    } catch {
      /* ignore */
    }
  }, [collapsedLabels, collapseKey]);

  const toggleCollapse = useCallback((labelId: string): void => {
    setCollapsedLabels((prev) => {
      const next = new Set(prev);
      if (next.has(labelId)) {
        next.delete(labelId);
      } else {
        next.add(labelId);
      }
      return next;
    });
  }, []);
  const [localItems, setLocalItems] = useState<PackingItem[] | null>(null);
  const effectiveItems = localItems ?? items;

  // Reset double-submit guard when the items prop changes (server revalidation completed).
  // React's "derive state from props" pattern: setState during render triggers an immediate re-render.
  // ID-based comparison handles same-length re-renders where the array reference stays stable.
  const itemsKey = items.map((item) => item.id).join(",");
  const prevItemsKey = prevItems.map((item) => item.id).join(",");
  if (prevItems !== items || itemsKey !== prevItemsKey) {
    setPrevItems(items);
    setIsSubmitting(false);
    setPendingItemIds(new Set());
    setLocalItems(null);
  }

  function handleDraftNameChange(event: ChangeEvent<HTMLInputElement>): void {
    setDraftName(event.target.value);
  }

  function announceMove(message: string): void {
    setAnnouncement(message);
    setAnnouncementId((id) => id + 1);
  }

  async function submitEntry(isLabel?: boolean): Promise<void> {
    const trimmedName = draftName.trim();
    if (!trimmedName || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onAddItem(trimmedName, isLabel);
      setAnnouncement(`${isLabel ? "Section" : "Item"} ${trimmedName} added.`);
      setAnnouncementId((id) => id + 1);
      setDraftName("");
    } catch {
      setAnnouncement(`Failed to add ${isLabel ? "section" : "item"}.`);
      setAnnouncementId((id) => id + 1);
      setIsSubmitting(false);
    }
  }

  async function handleContextualAdd(
    name: string,
    isLabel?: boolean,
    afterItemId?: string,
    beforeItemId?: string,
    labelId?: string | null
  ): Promise<void> {
    const trimmedName = name.trim();
    if (!trimmedName || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onAddItem(trimmedName, isLabel, afterItemId, beforeItemId, labelId);
      setAnnouncement(`${isLabel ? "Section" : "Item"} ${trimmedName} added.`);
      setAnnouncementId((id) => id + 1);
    } catch {
      setAnnouncement(`Failed to add ${isLabel ? "section" : "item"}.`);
      setAnnouncementId((id) => id + 1);
      setIsSubmitting(false);
    }
  }

  async function handleRemove(item: PackingItem): Promise<void> {
    if (!item.id) return;
    try {
      await onRemoveItem(item.id);
      setAnnouncement(`${item.isLabel ? "Section" : "Item"} ${item.name} removed.`);
      setAnnouncementId((id) => id + 1);
    } catch {
      setAnnouncement(`Failed to remove ${item.isLabel ? "section" : "item"}.`);
      setAnnouncementId((id) => id + 1);
    }
  }

  async function handleToggle(item: PackingItem): Promise<void> {
    if (!item.id || pendingItemIds.has(item.id)) return;

    setPendingItemIds((ids) => new Set(ids).add(item.id!));

    try {
      await onToggleItem(item.id);
      const action = item.done ? "unchecked" : "checked";
      setAnnouncement(`${item.name} ${action}.`);
      setAnnouncementId((id) => id + 1);
    } catch {
      setPendingItemIds((ids) => {
        const nextIds = new Set(ids);
        nextIds.delete(item.id!);
        return nextIds;
      });
      setAnnouncement(`Failed to update ${item.name}.`);
      setAnnouncementId((id) => id + 1);
    }
  }

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

  function handleOptimisticReorder(reorderedItems: PackingItem[] | null): void {
    if (reorderedItems !== null) {
      mutationSeqRef.current += 1;
    }
    setLocalItems(reorderedItems);
  }

  function handleReorderItemsWithSeqGuard(
    ordered: { id: string; labelId: string | null; position: number }[],
    onError?: () => void
  ): void {
    const capturedSeq = mutationSeqRef.current;
    onReorderItems(
      ordered,
      onError !== undefined
        ? (): void => {
            if (mutationSeqRef.current === capturedSeq) {
              onError();
            }
          }
        : undefined
    );
  }

  function openPullDialog(): void {
    setDialogKey((k) => k + 1);
    setDialogOpen(true);
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div aria-live="polite" className="sr-only">
        <span key={announcementId}>{announcement}</span>
      </div>

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

      {effectiveItems.length === 0 ? (
        <PackingListEmptyState
          tripId={tripId}
          draftName={draftName}
          isSubmitting={isSubmitting}
          onDraftNameChange={handleDraftNameChange}
          onSubmitItem={() => submitEntry()}
          onSubmitLabel={() => submitEntry(true)}
          onOpenPullDialog={onPullTemplates ? openPullDialog : undefined}
        />
      ) : (
        <>
          <PackingListToolbar
            itemCount={effectiveItems.length}
            onOpenPullDialog={onPullTemplates ? openPullDialog : undefined}
            onOpenSaveDialog={onSaveAsTemplate ? () => setSaveDialogOpen(true) : undefined}
          />

          <PackingListSortable
            items={effectiveItems}
            pendingItemIds={pendingItemIds}
            collapsedLabels={collapsedLabels}
            onToggleCollapse={toggleCollapse}
            onRemoveItem={handleRemove}
            onToggleItem={handleToggle}
            onOptimisticReorder={handleOptimisticReorder}
            onReorderItems={handleReorderItemsWithSeqGuard}
            onAnnounceMove={announceMove}
            isAdding={isSubmitting}
            onEditItem={onEditItem}
            onAddItem={handleContextualAdd}
          />

          <PackingEntryForm
            draftName={draftName}
            hasItems
            isSubmitting={isSubmitting}
            onDraftNameChange={handleDraftNameChange}
            onSubmitItem={() => submitEntry()}
            onSubmitLabel={() => submitEntry(true)}
          />
        </>
      )}

      {onPullTemplates && (
        <TemplatePullDialog
          key={dialogKey}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          templates={templates ?? []}
          onPull={handleDialogPull}
        />
      )}

      {onSaveAsTemplate && (
        <SaveAsTemplateDialog
          key={String(saveDialogOpen)}
          open={saveDialogOpen && effectiveItems.length > 0}
          onClose={() => setSaveDialogOpen(false)}
          onSave={onSaveAsTemplate}
          itemCount={effectiveItems.length}
        />
      )}
    </div>
  );
}
