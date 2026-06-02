"use client";

import { useState, type ChangeEvent, type FormEvent, type ReactElement } from "react";
import Link from "next/link";
import { Plus, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PackingItem, PackingTemplate, PackingTemplateItem } from "@/data/types";
import { PackingListSortable } from "./packing-list-sortable";

export interface TemplateEditorViewProps {
  template: PackingTemplate;
  items: PackingTemplateItem[];
  onAddItem: (
    text: string,
    isLabel?: boolean,
    afterItemId?: string,
    beforeItemId?: string,
    labelId?: string | null
  ) => void;
  onRemoveItem: (id: string) => void;
  onEditItem: (id: string, text: string) => void;
  onReorderItems: (ordered: { id: string; labelId: string | null; position: number }[], onError?: () => void) => void;
  onOptimisticReorder?: (items: PackingTemplateItem[] | null) => void;
  isAdding?: boolean;
}

interface TemplateEntryFormProps {
  templateId: string;
  draftText: string;
  hasItems: boolean;
  isSubmitting: boolean;
  onDraftTextChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSubmitItem: () => void;
  onSubmitLabel: () => void;
}

function toPackingItem(item: PackingTemplateItem): PackingItem {
  return {
    id: item.id,
    name: item.text,
    done: false,
    position: item.position,
    isLabel: item.isLabel,
    labelId: item.labelId ?? null,
  };
}

function toTemplateItem(item: PackingItem, templateId: string): PackingTemplateItem {
  return {
    id: item.id!,
    templateId,
    text: item.name,
    isLabel: item.isLabel ?? false,
    position: item.position ?? 0,
    labelId: item.labelId ?? null,
  };
}

function TemplateEntryForm({
  templateId,
  draftText,
  hasItems,
  isSubmitting,
  onDraftTextChange,
  onSubmitItem,
  onSubmitLabel,
}: TemplateEntryFormProps): ReactElement {
  const formId = `template-entry-${templateId}`;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmitItem();
  }

  return (
    <form
      aria-label="Add a template entry"
      className="flex flex-col gap-3 rounded-3xl border p-3"
      style={{ background: "var(--surface)", borderColor: "var(--line)" }}
      onSubmit={handleSubmit}
    >
      <label className="sr-only" htmlFor={formId}>
        Template item text
      </label>
      <Input
        id={formId}
        className="h-11 rounded-2xl border-0 px-3 text-sm shadow-none"
        maxLength={100}
        placeholder={hasItems ? "Add another item or section label" : "Add your first item or section label"}
        style={{ background: "var(--bg)", color: "var(--fg)" }}
        value={draftText}
        onChange={onDraftTextChange}
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

export function TemplateEditorView({
  template,
  items,
  onAddItem,
  onRemoveItem,
  onEditItem,
  onReorderItems,
  onOptimisticReorder,
  isAdding = false,
}: TemplateEditorViewProps): ReactElement {
  const [draftText, setDraftText] = useState("");

  function submitEntry(isLabel?: boolean): void {
    const trimmed = draftText.trim();
    if (!trimmed || isAdding) {
      return;
    }

    onAddItem(trimmed, isLabel);
    setDraftText("");
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-1">
        <Link
          href="/packing"
          className="inline-flex w-fit items-center rounded-md text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ color: "var(--fg-2)", outlineColor: "var(--accent-brand)" }}
        >
          Back to Templates
        </Link>
        <h1
          style={{
            fontFamily: "var(--font-heading-family, ui-sans-serif)",
            fontSize: "calc(22px * var(--font-scale))",
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: "var(--fg)",
          }}
        >
          {template.name}
        </h1>
      </div>

      {items.length === 0 ? (
        <section
          className="flex flex-col gap-4 rounded-3xl border p-5"
          style={{ background: "var(--surface)", borderColor: "var(--line)" }}
        >
          <div className="flex flex-col gap-1">
            <h2 style={{ color: "var(--fg)", fontSize: "calc(20px * var(--font-scale))", fontWeight: 700 }}>
              This template is empty
            </h2>
            <p style={{ color: "var(--fg-2)", fontSize: "calc(14px * var(--font-scale))" }}>
              Adding items or section labels to shape this template for the trips it supports.
            </p>
          </div>
          <TemplateEntryForm
            templateId={template.id}
            draftText={draftText}
            hasItems={false}
            isSubmitting={isAdding}
            onDraftTextChange={(event) => setDraftText(event.target.value)}
            onSubmitItem={() => submitEntry()}
            onSubmitLabel={() => submitEntry(true)}
          />
        </section>
      ) : (
        <>
          <PackingListSortable
            items={items.map(toPackingItem)}
            pendingItemIds={new Set()}
            onRemoveItem={(item) => {
              if (item.id) {
                onRemoveItem(item.id);
              }
            }}
            onOptimisticReorder={(reorderedItems) =>
              onOptimisticReorder?.(reorderedItems?.map((item) => toTemplateItem(item, template.id)) ?? null)
            }
            onReorderItems={onReorderItems}
            onEditItem={(id, name) => onEditItem(id, name)}
            onAddItem={(text, isLabel, afterItemId, beforeItemId, labelId) =>
              onAddItem(text, isLabel, afterItemId, beforeItemId, labelId)
            }
            isAdding={isAdding}
          />
          <TemplateEntryForm
            templateId={template.id}
            draftText={draftText}
            hasItems
            isSubmitting={isAdding}
            onDraftTextChange={(event) => setDraftText(event.target.value)}
            onSubmitItem={() => submitEntry()}
            onSubmitLabel={() => submitEntry(true)}
          />
        </>
      )}
    </div>
  );
}
