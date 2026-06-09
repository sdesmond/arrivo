"use client";

import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import {
  type PackingItem,
  type PackingTemplate,
  type PullTemplatesResult,
  type RemovePackingSectionInput,
} from "@/data/types";
import { PackingListSortable } from "./packing-list-sortable";
import { PackingListToolbar } from "./packing-list-toolbar";
import { ContextualAddForm } from "./packing-contextual-add-form";
import { PackingListDialogs, type PackingListDialogsHandle, type PendingSectionRemoval } from "./packing-list-dialogs";

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
  onRemoveSection?: (id: string, input: RemovePackingSectionInput) => Promise<void>;
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
  onRemoveSection,
  onToggleItem,
  onReorderItems,
  onEditItem,
  templates,
  onPullTemplates,
  onSaveAsTemplate,
}: PackingListViewProps): ReactElement {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showNewSectionForm, setShowNewSectionForm] = useState(false);
  const [prevItems, setPrevItems] = useState(items);
  const [pendingItemIds, setPendingItemIds] = useState<Set<string>>(new Set());
  const [pendingSectionRemoval, setPendingSectionRemoval] = useState<PendingSectionRemoval | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [announcementId, setAnnouncementId] = useState(0);
  const mutationSeqRef = useRef(0);
  const dialogsRef = useRef<PackingListDialogsHandle>(null);

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

  function announce(message: string): void {
    setAnnouncement(message);
    setAnnouncementId((id) => id + 1);
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
      announce(`${isLabel ? "Section" : "Item"} ${trimmedName} added.`);
    } catch (error) {
      announce(`Failed to add ${isLabel ? "section" : "item"}.`);
      setIsSubmitting(false);
      throw error;
    }
  }

  async function handleRemove(item: PackingItem): Promise<void> {
    if (!item.id) return;

    if (item.isLabel && onRemoveSection) {
      const itemCount = effectiveItems.filter(
        (candidate) => candidate.isLabel !== true && candidate.labelId === item.id
      ).length;
      if (itemCount > 0) {
        setPendingSectionRemoval({ item: item as PackingItem & { id: string }, itemCount });
        return;
      }
    }

    try {
      await onRemoveItem(item.id);
      announce(`${item.isLabel ? "Section" : "Item"} ${item.name} removed.`);
    } catch {
      announce(`Failed to remove ${item.isLabel ? "section" : "item"}.`);
    }
  }

  async function handleToggle(item: PackingItem): Promise<void> {
    if (!item.id || pendingItemIds.has(item.id)) return;

    setPendingItemIds((ids) => new Set(ids).add(item.id!));

    try {
      await onToggleItem(item.id);
      const action = item.done ? "unchecked" : "checked";
      announce(`${item.name} ${action}.`);
    } catch {
      setPendingItemIds((ids) => {
        const nextIds = new Set(ids);
        nextIds.delete(item.id!);
        return nextIds;
      });
      announce(`Failed to update ${item.name}.`);
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

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div aria-live="polite" className="sr-only">
        <span key={announcementId}>{announcement}</span>
      </div>

      <PackingListDialogs
        ref={dialogsRef}
        templates={templates ?? []}
        effectiveItemCount={effectiveItems.length}
        pendingSectionRemoval={pendingSectionRemoval}
        onClearPendingSectionRemoval={() => setPendingSectionRemoval(null)}
        onPullTemplates={onPullTemplates}
        onRemoveSection={onRemoveSection}
        onSaveAsTemplate={onSaveAsTemplate}
        onAnnounce={announce}
      />

      <PackingListToolbar
        itemCount={effectiveItems.filter((item) => !item.isLabel).length}
        packedCount={effectiveItems.filter((item) => !item.isLabel && item.done).length}
        onOpenPullDialog={onPullTemplates ? () => dialogsRef.current?.openPullDialog() : undefined}
        onOpenSaveDialog={onSaveAsTemplate ? () => dialogsRef.current?.openSaveDialog() : undefined}
        onOpenNewSection={() => setShowNewSectionForm(true)}
      />

      {showNewSectionForm && (
        <ContextualAddForm
          placeholder="New section…"
          isLabel
          autoFocus
          isAdding={isSubmitting}
          onAddItem={async (name, isLabel, afterItemId, beforeItemId, labelId) => {
            await handleContextualAdd(name, isLabel, afterItemId, beforeItemId, labelId);
            setShowNewSectionForm(false);
          }}
        />
      )}

      <PackingListSortable
        items={effectiveItems}
        pendingItemIds={pendingItemIds}
        collapsedLabels={collapsedLabels}
        onToggleCollapse={toggleCollapse}
        onRemoveItem={handleRemove}
        onToggleItem={handleToggle}
        onOptimisticReorder={handleOptimisticReorder}
        onReorderItems={handleReorderItemsWithSeqGuard}
        onAnnounceMove={announce}
        isAdding={isSubmitting}
        onEditItem={onEditItem}
        onAddItem={handleContextualAdd}
      />
    </div>
  );
}
