"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactElement } from "react";
import { Plus, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PackingItem, PackingTemplate, PullTemplatesResult } from "@/data/types";
import { PackingListSortable } from "./packing-list-sortable";
import { TemplatePullDialog } from "./template-pull-dialog";
import { PackingListToolbar } from "./packing-list-toolbar";
import { PackingListEmptyState } from "./packing-list-empty-state";
import { SaveAsTemplateDialog } from "./save-as-template-dialog";

export interface PackingListViewProps {
  tripId: string;
  items: PackingItem[];
  onAddItem: (
    name: string,
    isLabel?: boolean,
    afterItemId?: string,
    beforeItemId?: string,
    labelId?: string | null
  ) => void;
  onRemoveItem: (id: string) => void;
  onToggleItem: (id: string) => Promise<void>;
  onReorderItems: (ordered: { id: string; labelId: string | null; position: number }[], onError?: () => void) => void;
  onEditItem?: (id: string, name: string) => void;
  templates?: PackingTemplate[];
  onPullTemplates?: (templateIds: string[]) => Promise<PullTemplatesResult | undefined>;
  onSaveAsTemplate?: (name: string) => Promise<string | undefined>;
}

interface PackingEntryFormProps {
  tripId: string;
  draftName: string;
  hasItems: boolean;
  isSubmitting: boolean;
  onDraftNameChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSubmitItem: () => void;
  onSubmitLabel: () => void;
}

function PackingEntryForm({
  tripId,
  draftName,
  hasItems,
  isSubmitting,
  onDraftNameChange,
  onSubmitItem,
  onSubmitLabel,
}: PackingEntryFormProps): ReactElement {
  const formId = `packing-entry-${tripId}`;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmitItem();
  }

  return (
    <form
      aria-label="Add a packing entry"
      className="flex flex-col gap-3 rounded-3xl border p-3"
      style={{ background: "var(--surface)", borderColor: "var(--line)" }}
      onSubmit={handleSubmit}
    >
      <label className="sr-only" htmlFor={formId}>
        Packing item name
      </label>
      <Input
        id={formId}
        className="h-11 rounded-2xl border-0 px-3 text-sm shadow-none"
        maxLength={100}
        placeholder={hasItems ? "Add another item or section label" : "Add your first item or section label"}
        style={{ background: "var(--bg)", color: "var(--fg)" }}
        value={draftName}
        onChange={onDraftNameChange}
      />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button className="min-h-11 min-w-11 flex-1 rounded-2xl" disabled={isSubmitting} type="submit">
          <Plus size={16} strokeWidth={1.5} />
          Add item
        </Button>
        <Button
          className="min-h-11 min-w-11 flex-1 rounded-2xl"
          disabled={isSubmitting}
          type="button"
          variant="outline"
          onClick={onSubmitLabel}
        >
          <Tag size={16} strokeWidth={1.5} />
          Add label
        </Button>
      </div>
    </form>
  );
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

  useEffect(() => {
    if (!resultNotice) return;
    const timer = setTimeout(() => setResultNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [resultNotice]);
  const [localItems, setLocalItems] = useState<PackingItem[] | null>(null);
  const effectiveItems = localItems ?? items;

  // Reset double-submit guard when the items prop changes (server revalidation completed).
  // React's "derive state from props" pattern: setState during render triggers an immediate re-render.
  if (prevItems !== items) {
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

  function submitEntry(isLabel?: boolean): void {
    const trimmedName = draftName.trim();
    if (!trimmedName || isSubmitting) return;

    setIsSubmitting(true);
    onAddItem(trimmedName, isLabel);
    setAnnouncement(`${isLabel ? "Section" : "Item"} ${trimmedName} added.`);
    setAnnouncementId((id) => id + 1);
    setDraftName("");
  }

  function handleContextualAdd(
    name: string,
    isLabel?: boolean,
    afterItemId?: string,
    beforeItemId?: string,
    labelId?: string | null
  ): void {
    const trimmedName = name.trim();
    if (!trimmedName || isSubmitting) return;

    setIsSubmitting(true);
    onAddItem(trimmedName, isLabel, afterItemId, beforeItemId, labelId);
    setAnnouncement(`${isLabel ? "Section" : "Item"} ${trimmedName} added.`);
    setAnnouncementId((id) => id + 1);
  }

  function handleRemove(item: PackingItem): void {
    if (!item.id) return;
    onRemoveItem(item.id);
    setAnnouncement(`${item.isLabel ? "Section" : "Item"} ${item.name} removed.`);
    setAnnouncementId((id) => id + 1);
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
            onRemoveItem={handleRemove}
            onToggleItem={handleToggle}
            onOptimisticReorder={setLocalItems}
            onReorderItems={onReorderItems}
            onAnnounceMove={announceMove}
            isAdding={isSubmitting}
            onEditItem={onEditItem}
            onAddItem={handleContextualAdd}
          />

          <PackingEntryForm
            tripId={tripId}
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
