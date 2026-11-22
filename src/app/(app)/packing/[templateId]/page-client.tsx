"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { reorderTemplateItems } from "./actions";
import {
  createPackingTemplateItem,
  deletePackingTemplateItem,
  removePackingTemplateSection,
  renamePackingTemplate,
  updatePackingTemplateItem,
} from "@/lib/api/contract/packing-templates";
import { useApiMutation } from "@/lib/api/use-api-mutation";
import { TemplateEditorView } from "@/components/arrivo/template-editor-view";
import type { PackingTemplate, PackingTemplateItem, RemovePackingSectionInput } from "@/data/types";

export interface TemplateEditorClientProps {
  template: PackingTemplate;
  items: PackingTemplateItem[];
}

function getActionErrorMessage(error: unknown, fallbackMessage: string): string {
  return error instanceof Error && error.message ? error.message : fallbackMessage;
}

export function TemplateEditorClient({ template, items }: TemplateEditorClientProps) {
  const rename = useApiMutation(renamePackingTemplate);
  const createItem = useApiMutation(createPackingTemplateItem);
  const updateItem = useApiMutation(updatePackingTemplateItem);
  const deleteItem = useApiMutation(deletePackingTemplateItem);
  const removeSection = useApiMutation(removePackingTemplateSection);
  const [localItems, setLocalItems] = useState<PackingTemplateItem[] | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [prevItems, setPrevItems] = useState(items);
  const [, startTransition] = useTransition();
  // A failed create keeps its id, so the retry of the same entry cannot add it twice.
  const createRetry = useRef<{ details: string; id: string } | null>(null);

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
    const details = JSON.stringify([template.id, text, isLabel ?? false, afterItemId, beforeItemId, labelId]);
    const id = createRetry.current?.details === details ? createRetry.current.id : crypto.randomUUID();
    createRetry.current = null;
    // The hook toasts a failure; the adding state clears here so the entry can be sent again.
    await createItem.mutate(
      {
        params: { templateId: template.id },
        body: { id, text, isLabel, afterItemId, beforeItemId, labelId },
      },
      {
        onError: () => {
          createRetry.current = { details, id };
          setIsAdding(false);
        },
        onAuthLost: () => setIsAdding(false),
      }
    );
  }

  function handleRemoveItem(id: string): void {
    void deleteItem.mutate({ params: { itemId: id }, body: {} });
  }

  async function handleRemoveSection(id: string, input: RemovePackingSectionInput): Promise<void> {
    let failure: unknown;
    await removeSection.mutate(
      { params: { itemId: id }, body: { mode: input.mode } },
      {
        onError: (error) => {
          failure = error;
        },
        onAuthLost: () => {
          failure = new Error("Your session has expired.");
        },
      }
    );
    if (failure) throw failure;
  }

  function handleEditItem(id: string, text: string): void {
    void updateItem.mutate({ params: { itemId: id }, body: { text } });
  }

  function handleRenameTemplate(name: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      void rename.mutate(
        { params: { templateId: template.id }, body: { name } },
        { onSuccess: () => resolve(), onError: reject, onAuthLost: () => reject(new Error("Authentication required")) }
      );
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
      onRemoveSection={handleRemoveSection}
      onEditItem={handleEditItem}
      onReorderItems={handleReorderItems}
      onOptimisticReorder={setLocalItems}
      isAdding={isAdding}
      onRenameTemplate={handleRenameTemplate}
    />
  );
}
