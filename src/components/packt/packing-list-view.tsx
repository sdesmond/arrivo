"use client";

import { useMemo, useState, type ChangeEvent, type FormEvent, type ReactElement } from "react";
import { Check, Plus, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { PackingItem } from "@/data/types";

interface PackingListViewProps {
  tripId: string;
  items: PackingItem[];
  onAddItem: (name: string, isLabel?: boolean) => void;
  onRemoveItem: (id: string) => void;
}

interface PackingSection {
  label: PackingItem;
  items: PackingItem[];
}

interface GroupedPackingItems {
  sections: PackingSection[];
  ungroupedItems: PackingItem[];
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

interface PackingRowProps {
  item: PackingItem;
  isLabel?: boolean;
  onRemove: () => void;
}

function groupPackingItems(items: PackingItem[]): GroupedPackingItems {
  const sortedItems = [...items].sort((first, second) => {
    const firstPosition = first.position ?? Infinity;
    const secondPosition = second.position ?? Infinity;
    return firstPosition - secondPosition;
  });

  const sections: PackingSection[] = [];
  const ungroupedItems: PackingItem[] = [];
  let currentSection: PackingSection | null = null;

  for (const item of sortedItems) {
    if (item.isLabel) {
      currentSection = { label: item, items: [] };
      sections.push(currentSection);
      continue;
    }

    if (currentSection) {
      currentSection.items.push(item);
      continue;
    }

    ungroupedItems.push(item);
  }

  return { sections, ungroupedItems };
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

function PackingRow({ item, isLabel, onRemove }: PackingRowProps): ReactElement {
  return (
    <div
      className={cn("flex min-h-11 items-center gap-3 rounded-2xl border px-3 py-2", isLabel ? "shadow-none" : "")}
      data-packing-kind={isLabel ? "label" : "item"}
      style={{
        background: isLabel ? "var(--surface-2)" : "var(--bg)",
        borderColor: "var(--line)",
      }}
    >
      {isLabel ? null : (
        <span
          aria-hidden="true"
          className="flex size-5 shrink-0 items-center justify-center rounded-full"
          style={{
            background: item.done ? "var(--accent-brand)" : "transparent",
            border: item.done ? "1.5px solid var(--accent-brand)" : "1.5px solid var(--line-strong)",
            color: item.done ? "var(--accent-fg)" : "transparent",
          }}
        >
          {item.done ? <Check size={12} strokeWidth={1.5} /> : null}
        </span>
      )}
      <div className="min-w-0 flex-1">
        {isLabel ? (
          <h3 className="truncate text-sm font-semibold" data-packing-name style={{ color: "var(--fg)" }}>
            {item.name}
          </h3>
        ) : (
          <p className="truncate text-sm font-medium" data-packing-name style={{ color: "var(--fg)" }}>
            {item.name}
          </p>
        )}
        {isLabel ? (
          <p style={{ color: "var(--fg-3)", fontSize: "calc(12px * var(--font-scale))" }}>Section label</p>
        ) : null}
      </div>
      <Button
        aria-label={`Remove ${item.name}`}
        className="min-h-11 min-w-11 rounded-2xl text-fg-3 hover:text-fg"
        title={`Remove ${item.name}`}
        type="button"
        variant="ghost"
        onClick={onRemove}
      >
        <X size={14} strokeWidth={1.5} />
      </Button>
    </div>
  );
}

export function PackingListView({ tripId, items, onAddItem, onRemoveItem }: PackingListViewProps): ReactElement {
  const [draftName, setDraftName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [prevItems, setPrevItems] = useState(items);
  const [announcement, setAnnouncement] = useState("");
  const [announcementId, setAnnouncementId] = useState(0);
  const { sections, ungroupedItems } = useMemo(() => groupPackingItems(items), [items]);

  // Reset double-submit guard when the items prop changes (server revalidation completed).
  // React's "derive state from props" pattern: setState during render triggers an immediate re-render.
  if (prevItems !== items) {
    setPrevItems(items);
    setIsSubmitting(false);
  }

  function handleDraftNameChange(event: ChangeEvent<HTMLInputElement>): void {
    setDraftName(event.target.value);
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

  function handleRemove(item: PackingItem): void {
    if (!item.id) return;
    onRemoveItem(item.id);
    setAnnouncement(`${item.isLabel ? "Section" : "Item"} ${item.name} removed.`);
    setAnnouncementId((id) => id + 1);
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div aria-live="polite" className="sr-only">
        <span key={announcementId}>{announcement}</span>
      </div>

      {items.length === 0 ? (
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
        </section>
      ) : (
        <>
          <section className="flex flex-col gap-4" aria-label="Packing list">
            {sections.map((section) => (
              <div key={section.label.id} className="flex flex-col gap-2">
                <PackingRow item={section.label} isLabel onRemove={() => handleRemove(section.label)} />
                {section.items.length > 0 ? (
                  <div className="ml-3 flex flex-col gap-2 border-l pl-3" style={{ borderColor: "var(--line)" }}>
                    {section.items.map((item) => (
                      <PackingRow key={item.id} item={item} onRemove={() => handleRemove(item)} />
                    ))}
                  </div>
                ) : null}
              </div>
            ))}

            {ungroupedItems.length > 0 ? (
              <div className="flex flex-col gap-2">
                {sections.length > 0 ? (
                  <h3 style={{ color: "var(--fg-2)", fontSize: "calc(13px * var(--font-scale))", fontWeight: 600 }}>
                    Ungrouped
                  </h3>
                ) : null}
                {ungroupedItems.map((item) => (
                  <PackingRow key={item.id} item={item} onRemove={() => handleRemove(item)} />
                ))}
              </div>
            ) : null}
          </section>

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
    </div>
  );
}
