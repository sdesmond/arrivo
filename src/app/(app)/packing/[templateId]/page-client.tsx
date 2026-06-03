"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addTemplateItem, removeTemplateItem, reorderTemplateItems, updateTemplateItem } from "./actions";
import { TemplateEditorView } from "@/components/packt/template-editor-view";
import type { PackingTemplate, PackingTemplateItem } from "@/data/types";

export interface TemplateEditorClientProps {
  template: PackingTemplate;
  items: PackingTemplateItem[];
}

function getActionErrorMessage(error: unknown, fallbackMessage: string): string {
  return error instanceof Error && error.message ? error.message : fallbackMessage;
}

export function TemplateEditorClient({ template, items }: TemplateEditorClientProps) {
  const [localItems, setLocalItems] = useState<PackingTemplateItem[] | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [prevItems, setPrevItems] = useState(items);
  const [, startTransition] = useTransition();

  if (prevItems !== items) {
    setPrevItems(items);
    setLocalItems(null);
    setIsAdding(false);
  }

  async function handleAddItem(
    text: string,
    isLabel?: boolean,
    afterItemId?: string,
    beforeItemId?: string,
    labelId?: string | null
  ): Promise<void> {
    if (isAdding) {
      return;
    }

    setIsAdding(true);
    try {
      await addTemplateItem(template.id, { text, isLabel, afterItemId, beforeItemId, labelId });
    } catch (error) {
      setIsAdding(false);
      toast.error(getActionErrorMessage(error, "Could not add template item"));
    }
  }

  function handleRemoveItem(id: string): void {
    startTransition(async () => {
      try {
        await removeTemplateItem(id);
      } catch (error) {
        toast.error(getActionErrorMessage(error, "Could not remove template item"));
      }
    });
  }

  function handleEditItem(id: string, text: string): void {
    startTransition(async () => {
      try {
        await updateTemplateItem(id, { text });
      } catch (error) {
        toast.error(getActionErrorMessage(error, "Could not update template item"));
      }
    });
  }

  function handleReorderItems(
    ordered: { id: string; labelId: string | null; position: number }[],
    onError?: () => void
  ): void {
    startTransition(async () => {
      try {
        await reorderTemplateItems(template.id, ordered);
      } catch (error) {
        onError?.();
        toast.error(getActionErrorMessage(error, "Could not reorder template items"));
      }
    });
  }

  return (
    <TemplateEditorView
      template={template}
      items={localItems ?? items}
      onAddItem={handleAddItem}
      onRemoveItem={handleRemoveItem}
      onEditItem={handleEditItem}
      onReorderItems={handleReorderItems}
      onOptimisticReorder={setLocalItems}
      isAdding={isAdding}
    />
  );
}
