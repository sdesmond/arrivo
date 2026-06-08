"use client";

import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import {
  RemovePackingSectionMode,
  type PackingItem,
  type PackingTemplate,
  type PackingTemplateItem,
  type RemovePackingSectionInput,
} from "@/data/types";
import { PackingListSortable } from "./packing-list-sortable";
import { DeletePackingSectionAlertDialog } from "./delete-packing-section-alert-dialog";
import { ContextualAddForm } from "./packing-contextual-add-form";

export interface TemplateEditorViewProps {
  template: PackingTemplate;
  items: PackingTemplateItem[];
  onAddItem: (
    text: string,
    isLabel?: boolean,
    afterItemId?: string,
    beforeItemId?: string,
    labelId?: string | null
  ) => Promise<void>;
  onRemoveItem: (id: string) => void;
  onRemoveSection?: (id: string, input: RemovePackingSectionInput) => Promise<void>;
  onEditItem: (id: string, text: string) => void;
  onReorderItems: (ordered: { id: string; labelId: string | null; position: number }[], onError?: () => void) => void;
  onOptimisticReorder?: (items: PackingTemplateItem[] | null) => void;
  isAdding?: boolean;
  onRenameTemplate?: (name: string) => Promise<void>;
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

export function TemplateEditorView({
  template,
  items,
  onAddItem,
  onRemoveItem,
  onRemoveSection,
  onEditItem,
  onReorderItems,
  onOptimisticReorder,
  isAdding = false,
  onRenameTemplate,
}: TemplateEditorViewProps): ReactElement {
  interface PendingSectionRemoval {
    item: PackingItem & { id: string };
    itemCount: number;
  }

  const [pendingSectionRemoval, setPendingSectionRemoval] = useState<PendingSectionRemoval | null>(null);
  const [isRemovingSection, setIsRemovingSection] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(template.name);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const collapseKey = `packing_collapsed_template_${template.id}`;
  const [collapsedLabels, setCollapsedLabels] = useState<Set<string>>(() => {
    if (typeof window === "undefined") {
      return new Set();
    }

    try {
      const stored = localStorage.getItem(collapseKey);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return new Set(parsed);
        }
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

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.setSelectionRange(titleInputRef.current.value.length, titleInputRef.current.value.length);
    }
  }, [isEditingTitle]);

  async function commitTitleEdit(): Promise<void> {
    const trimmed = titleDraft.trim();
    setIsEditingTitle(false);
    if (!trimmed || trimmed === template.name) return;
    await onRenameTemplate?.(trimmed);
  }

  function cancelTitleEdit(): void {
    setTitleDraft(template.name);
    setIsEditingTitle(false);
  }

  const toggleCollapse = useCallback((labelId: string): void => {
    setCollapsedLabels((previousLabels) => {
      const nextLabels = new Set(previousLabels);
      if (nextLabels.has(labelId)) {
        nextLabels.delete(labelId);
      } else {
        nextLabels.add(labelId);
      }
      return nextLabels;
    });
  }, []);

  const packingItems = items.map(toPackingItem);

  async function handleRemove(item: PackingItem): Promise<void> {
    if (!item.id) {
      return;
    }

    if (item.isLabel && onRemoveSection) {
      const itemCount = packingItems.filter(
        (candidate) => candidate.isLabel !== true && candidate.labelId === item.id
      ).length;

      if (itemCount > 0) {
        setPendingSectionRemoval({ item: item as PackingItem & { id: string }, itemCount });
        return;
      }
    }

    onRemoveItem(item.id);
  }

  async function handleSectionRemoval(mode: RemovePackingSectionMode): Promise<void> {
    if (!pendingSectionRemoval || !onRemoveSection) {
      return;
    }

    setIsRemovingSection(true);
    try {
      await onRemoveSection(pendingSectionRemoval.item.id, { mode });
      setPendingSectionRemoval(null);
    } catch {
      /* keep dialog open so the user can retry after the toast */
    } finally {
      setIsRemovingSection(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-1">
        <Link
          href="/packing"
          className="inline-flex w-fit items-center gap-1.5 rounded-lg px-2 py-1 transition-colors hover:bg-surface"
          style={{
            fontSize: "calc(13px * var(--font-scale))",
            color: "var(--fg-3)",
            textDecoration: "none",
          }}
        >
          <ChevronLeft size={14} strokeWidth={1.5} />
          All Templates
        </Link>
        {isEditingTitle ? (
          <input
            ref={titleInputRef}
            className="w-full rounded-md border px-2 py-1"
            maxLength={30}
            value={titleDraft}
            onChange={(event) => setTitleDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void commitTitleEdit();
              if (event.key === "Escape") cancelTitleEdit();
            }}
            onBlur={() => void commitTitleEdit()}
            style={{
              fontFamily: "var(--font-heading-family, ui-sans-serif)",
              fontSize: "calc(22px * var(--font-scale))",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "var(--fg)",
              background: "var(--surface)",
              borderColor: "var(--accent-brand)",
              outline: "none",
            }}
          />
        ) : (
          <h1
            onClick={() => {
              if (!onRenameTemplate) return;
              setTitleDraft(template.name);
              setIsEditingTitle(true);
            }}
            style={{
              fontFamily: "var(--font-heading-family, ui-sans-serif)",
              fontSize: "calc(22px * var(--font-scale))",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "var(--fg)",
              cursor: onRenameTemplate ? "pointer" : "default",
            }}
          >
            {template.name}
          </h1>
        )}
      </div>

      <ContextualAddForm
        placeholder="New section…"
        isLabel
        isAdding={isAdding}
        onAddItem={(text, labelFlag, afterItemId, beforeItemId, labelId) =>
          onAddItem(text, labelFlag, afterItemId, beforeItemId, labelId)
        }
      />

      <PackingListSortable
        items={packingItems}
        pendingItemIds={new Set()}
        collapsedLabels={collapsedLabels}
        onToggleCollapse={toggleCollapse}
        onRemoveItem={handleRemove}
        onOptimisticReorder={(reorderedItems) =>
          onOptimisticReorder?.(reorderedItems?.map((item) => toTemplateItem(item, template.id)) ?? null)
        }
        onReorderItems={onReorderItems}
        onEditItem={(id, name) => onEditItem(id, name)}
        onAddItem={(text, labelFlag, afterItemId, beforeItemId, labelId) =>
          onAddItem(text, labelFlag, afterItemId, beforeItemId, labelId)
        }
        isAdding={isAdding}
      />

      {pendingSectionRemoval && onRemoveSection ? (
        <DeletePackingSectionAlertDialog
          open
          sectionName={pendingSectionRemoval.item.name}
          itemCount={pendingSectionRemoval.itemCount}
          isDeleting={isRemovingSection}
          onOpenChange={(open) => {
            if (!open && !isRemovingSection) {
              setPendingSectionRemoval(null);
            }
          }}
          onMoveItems={() => handleSectionRemoval(RemovePackingSectionMode.MoveItemsToUngrouped)}
          onDeleteItems={() => handleSectionRemoval(RemovePackingSectionMode.DeleteItems)}
        />
      ) : null}
    </div>
  );
}
