"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import {
  getPackingTemplate,
  reorderPackingTemplateItems,
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

export function TemplateEditorClient({ template, items }: TemplateEditorClientProps) {
  const reorder = useApiMutation(reorderPackingTemplateItems);
  const confirmed = useRef(items.map(({ id, position, labelId }) => ({ id, position, labelId: labelId ?? null })));
  const reorderLocked = useRef(false);
  const reconciling = useRef(false);
  const [recoveryFailed, setRecoveryFailed] = useState(false);
  const [reorderDisabled, setReorderDisabled] = useState(false);
  const rename = useApiMutation(renamePackingTemplate);
  const createItem = useApiMutation(createPackingTemplateItem);
  const updateItem = useApiMutation(updatePackingTemplateItem);
  const deleteItem = useApiMutation(deletePackingTemplateItem);
  const removeSection = useApiMutation(removePackingTemplateSection);
  const [localItems, setLocalItems] = useState<PackingTemplateItem[] | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [prevItems, setPrevItems] = useState(items);
  // A failed create keeps its id, so the retry of the same entry cannot add it twice.
  const createRetry = useRef<{ details: string; id: string } | null>(null);

  if (prevItems !== items) {
    setPrevItems(items);
    if (!reorderDisabled) setLocalItems(null);
    setIsAdding(false);
  }

  useEffect(() => {
    if (!reorderLocked.current) {
      confirmed.current = items.map(({ id, position, labelId }) => ({ id, position, labelId: labelId ?? null }));
    }
  }, [items]);

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

  async function reconcileOrder(): Promise<void> {
    reconciling.current = true;
    setRecoveryFailed(false);
    try {
      const fresh = await api(getPackingTemplate, { params: { templateId: template.id }, body: {} });
      confirmed.current = fresh.items.map(({ id, position, labelId }) => ({ id, position, labelId: labelId ?? null }));
      setLocalItems(fresh.items);
      reconciling.current = false;
      reorderLocked.current = false;
      setReorderDisabled(false);
    } catch {
      setRecoveryFailed(true);
    }
  }

  function handleReorderItems(
    ordered: { id: string; labelId: string | null; position: number }[],
    onError?: () => void
  ): void {
    if (reorderLocked.current) {
      onError?.();
      return;
    }
    reorderLocked.current = true;
    setReorderDisabled(true);
    const items = ordered.map(({ id, labelId }) => ({ id, labelId }));
    void reorder.mutate(
      { params: { templateId: template.id }, body: { items, expectedItems: confirmed.current } },
      {
        onSuccess: () => {
          confirmed.current = ordered.map(({ id, position, labelId }) => ({ id, position, labelId }));
        },
        onError: () => {
          onError?.();
          void reconcileOrder();
        },
        onAuthLost: () => {
          onError?.();
          toast.error("Your session has expired.");
        },
        onSettled: () => {
          if (!reconciling.current) {
            reorderLocked.current = false;
            setReorderDisabled(false);
          }
        },
      }
    );
  }

  return (
    <>
      {recoveryFailed ? (
        <button type="button" className="h-11 px-4" onClick={() => void reconcileOrder()}>
          Retry loading order
        </button>
      ) : null}
      <TemplateEditorView
        reorderDisabled={reorderDisabled}
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
    </>
  );
}
