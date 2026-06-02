"use client";

import { useState, type ChangeEvent, type FormEvent, type ReactElement } from "react";
import { FolderOpen, Plus, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PackingItem, PackingTemplate, PullTemplatesResult } from "@/data/types";
import { PackingListSortable } from "./packing-list-sortable";
import { TemplatePullDialog } from "./template-pull-dialog";

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
}: PackingListViewProps): ReactElement {
  const [draftName, setDraftName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogKey, setDialogKey] = useState(0);
  const [resultNotice, setResultNotice] = useState<PullTemplatesResult | null>(null);
  const [prevItems, setPrevItems] = useState(items);
  const [pendingItemIds, setPendingItemIds] = useState<Set<string>>(new Set());
  const [announcement, setAnnouncement] = useState("");
  const [announcementId, setAnnouncementId] = useState(0);
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
    const result = await onPullTemplates(templateIds);
    if (result) {
      setResultNotice(result);
      setDialogOpen(false);
      setTimeout(() => setResultNotice(null), 4000);
    }
    return result;
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div aria-live="polite" className="sr-only">
        <span key={announcementId}>{announcement}</span>
      </div>

      {resultNotice && (
        <div
          aria-live="polite"
          className="rounded-2xl border p-3 text-sm"
          style={{ background: "var(--surface)", borderColor: "var(--line)", color: "var(--fg)" }}
        >
          {resultNotice.added} item(s) added
          {resultNotice.skipped > 0 ? `, ${resultNotice.skipped} duplicate(s) skipped` : ""}
        </div>
      )}

      {effectiveItems.length === 0 ? (
        <section
          className="flex flex-col gap-4 rounded-3xl border p-5"
          style={{ background: "var(--surface)", borderColor: "var(--line)" }}
        >
          <div className="flex flex-col gap-1">
            <h2 style={{ color: "var(--fg)", fontSize: "calc(20px * var(--font-scale))", fontWeight: 700 }}>
              Your packing list is empty
            </h2>
            <p style={{ color: "var(--fg-2)", fontSize: "calc(14px * var(--font-scale))" }}>
              Start with a quick item or create a section label for this trip.
            </p>
          </div>
          <PackingEntryForm
            tripId={tripId}
            draftName={draftName}
            hasItems={false}
            isSubmitting={isSubmitting}
            onDraftNameChange={handleDraftNameChange}
            onSubmitItem={() => submitEntry()}
            onSubmitLabel={() => submitEntry(true)}
          />
          {onPullTemplates && (
            <Button
              className="min-h-11 min-w-11 rounded-2xl"
              variant="outline"
              onClick={() => {
                setDialogKey((k) => k + 1);
                setDialogOpen(true);
              }}
            >
              <FolderOpen size={16} strokeWidth={1.5} />
              Pull from a template
            </Button>
          )}
        </section>
      ) : (
        <>
          {onPullTemplates && (
            <div className="flex items-center justify-between">
              <span style={{ color: "var(--fg-2)", fontSize: "calc(13px * var(--font-scale))" }}>
                {effectiveItems.length} item{effectiveItems.length !== 1 ? "s" : ""}
              </span>
              <Button
                className="min-h-9 min-w-9 rounded-xl"
                variant="outline"
                size="sm"
                onClick={() => {
                  setDialogKey((k) => k + 1);
                  setDialogOpen(true);
                }}
              >
                <FolderOpen size={14} strokeWidth={1.5} />
                Pull templates
              </Button>
            </div>
          )}

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
    </div>
  );
}
