"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import type { RemovePackingSectionMode, TripDetailPayload, PullTemplatesResult } from "@/data/types";
import { pullTemplatesOntoTrip, saveTripListAsTemplate } from "../actions";
import { createPackingList, renamePackingList, deletePackingList } from "../packing-actions";
import {
  createPackingItem,
  removePackingSection,
  updatePackingItem,
  deletePackingItem,
  reorderPackingItems,
} from "@/lib/api/contract/packing";
import { createChecklist } from "@/lib/api/contract/checklists";
import { useApiMutation } from "@/lib/api/use-api-mutation";
import { createRandomId } from "@/lib/utils";

export interface PackingHandlers {
  setNewlyCreatedChecklistId: (id: string | null) => void;
  handleAddPackingItem: (
    name: string,
    isLabel?: boolean,
    afterItemId?: string,
    beforeItemId?: string,
    labelId?: string | null,
    listId?: string | null
  ) => Promise<void>;
  handleRemovePackingItem: (id: string) => Promise<void>;
  handleRemovePackingSection: (id: string, mode: RemovePackingSectionMode) => Promise<void>;
  handleTogglePackingItem: (id: string, isPacked: boolean) => Promise<void>;
  handleReorderPackingItems: (ordered: { id: string; labelId: string | null }[], onError?: () => void) => void;
  handleUpdatePackingItem: (id: string, name: string) => void;
  handlePullTemplates: (templateIds: string[], listId?: string | null) => Promise<PullTemplatesResult | undefined>;
  handleSaveAsTemplate: (name: string) => Promise<string | undefined>;
  handleCreatePackingList: (name: string) => Promise<string | undefined>;
  handleRenamePackingList: (listId: string, name: string) => Promise<void>;
  handleDeletePackingList: (listId: string) => Promise<void>;
  handleInsertFromPackingSource: (
    dayNumber: number,
    position: number,
    sourceType: "packing-list" | "template",
    sourceId: string
  ) => Promise<void>;
  newlyCreatedChecklistId: string | null;
}

// Writes outlive a tab or page remount; the newest promise is retained until it settles.
const packingItemWrites = new Map<string, Promise<void>>();

export function usePackingHandlers(detail: TripDetailPayload): PackingHandlers {
  const { trip, days } = detail;
  const router = useRouter();
  const [newlyCreatedChecklistId, setNewlyCreatedChecklistId] = useState<string | null>(null);
  const insertMutation = useApiMutation(createChecklist);
  const insertInFlight = useRef(false);
  const createMutation = useApiMutation(createPackingItem);
  const createRetry = useRef<{ details: string; id: string } | null>(null);
  const createAttempt = useRef(0);
  const sectionMutation = useApiMutation(removePackingSection);
  const updateMutation = useApiMutation(updatePackingItem);
  const deleteMutation = useApiMutation(deletePackingItem);
  const reorderMutation = useApiMutation(reorderPackingItems);

  useEffect(() => {
    if (newlyCreatedChecklistId === null) return;
    // The create action can resolve well before the revalidated `days` land, so clear the flag once
    // the checklist actually shows up (the render carrying it already expanded it) instead of on a timer.
    const isRendered = days.some((day) =>
      day.checklists?.some((checklist) => checklist.id === newlyCreatedChecklistId)
    );
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear the flag once refreshed props catch up
    if (isRendered) setNewlyCreatedChecklistId(null);
  }, [days, newlyCreatedChecklistId]);

  function handleAddPackingItem(
    name: string,
    isLabel?: boolean,
    afterItemId?: string,
    beforeItemId?: string,
    labelId?: string | null,
    listId?: string | null
  ): Promise<void> {
    return (async () => {
      const details = JSON.stringify([
        trip.id,
        name,
        isLabel ?? false,
        afterItemId ?? null,
        beforeItemId ?? null,
        labelId ?? null,
        listId ?? null,
      ]);
      const id = createRetry.current?.details === details ? createRetry.current.id : createRandomId();
      createRetry.current = null;
      const attempt = ++createAttempt.current;
      let failure: unknown;
      await createMutation.mutate(
        {
          params: { tripId: trip.id },
          body: { id, name, isLabel, afterItemId, beforeItemId, labelId, listId: listId ?? null },
        },
        {
          onError: (error) => {
            failure = error;
            router.refresh();
          },
          onAuthLost: () => {
            failure = new Error("Your session has expired.");
          },
        }
      );
      if (failure) {
        if (createAttempt.current === attempt) createRetry.current = { details, id };
        throw failure;
      }
    })();
  }

  function queueItemWrite(id: string, write: () => Promise<void>): Promise<void> {
    const key = `${trip.id}:${id}`;
    const previous = packingItemWrites.get(key);
    const pending = previous ? previous.then(write, write) : write();
    packingItemWrites.set(key, pending);
    void pending.then(
      () => {
        if (packingItemWrites.get(key) === pending) packingItemWrites.delete(key);
      },
      () => {
        if (packingItemWrites.get(key) === pending) packingItemWrites.delete(key);
      }
    );
    return pending;
  }

  function patchItem(id: string, body: { name?: string; isPacked?: boolean }): Promise<void> {
    return queueItemWrite(id, async () => {
      let failure: unknown;
      await updateMutation.mutate(
        { params: { itemId: id }, body },
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
    });
  }

  function handleUpdatePackingItem(id: string, name: string): void {
    void patchItem(id, { name }).catch(() => {});
  }

  function handleRemovePackingItem(id: string): Promise<void> {
    return queueItemWrite(id, async () => {
      let failure: unknown;
      await deleteMutation.mutate(
        { params: { itemId: id }, body: { tripId: trip.id } },
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
    });
  }

  function handleRemovePackingSection(id: string, mode: RemovePackingSectionMode): Promise<void> {
    return queueItemWrite(id, async () => {
      let failure: unknown;
      await sectionMutation.mutate(
        { params: { itemId: id }, body: { tripId: trip.id, mode } },
        {
          onError: (error) => {
            failure = error;
            router.refresh();
          },
          onAuthLost: () => {
            failure = new Error("Your session has expired.");
          },
        }
      );
      if (failure) throw failure;
    });
  }

  function handleTogglePackingItem(id: string, isPacked: boolean): Promise<void> {
    return patchItem(id, { isPacked });
  }

  function handleReorderPackingItems(ordered: { id: string; labelId: string | null }[], onError?: () => void): void {
    // The view sends one whole list, so the first item names it; null is the default list.
    const first = detail.packingItems.find((item) => item.id === ordered[0]?.id);
    if (!first) {
      // Nothing can be sent, so undo the optimistic drag and reload the stored order.
      onError?.();
      router.refresh();
      return;
    }
    const listId = first.listId ?? null;
    // Drags of one list share a chain, so rapid drags reach the server in order and the last one wins. The hook
    // toasts the failure (a stale list is a 409); the caller rolls back and the page reloads the stored order.
    void queueItemWrite(`order:${listId}`, () =>
      reorderMutation.mutate(
        { params: { tripId: trip.id }, body: { listId, items: ordered.map(({ id, labelId }) => ({ id, labelId })) } },
        {
          onError: () => {
            onError?.();
            router.refresh();
          },
        }
      )
    );
  }

  async function handlePullTemplates(
    templateIds: string[],
    listId?: string | null
  ): Promise<PullTemplatesResult | undefined> {
    try {
      const result = await pullTemplatesOntoTrip(trip.id, templateIds, listId);
      router.refresh();
      return result;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to pull templates. Please try again.");
      return undefined;
    }
  }

  async function handleSaveAsTemplate(name: string): Promise<string | undefined> {
    try {
      const result = await saveTripListAsTemplate(trip.id, name);
      return result.templateId;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save template. Please try again.");
      return undefined;
    }
  }

  async function handleCreatePackingList(name: string): Promise<string | undefined> {
    try {
      return await createPackingList(trip.id, name);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create packing list. Please try again.");
      return undefined;
    }
  }

  async function handleRenamePackingList(listId: string, name: string): Promise<void> {
    try {
      await renamePackingList(listId, name);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to rename packing list. Please try again.");
    }
  }

  async function handleDeletePackingList(listId: string): Promise<void> {
    try {
      await deletePackingList(listId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete packing list. Please try again.");
    }
  }

  async function handleInsertFromPackingSource(
    dayNumber: number,
    position: number,
    sourceType: "packing-list" | "template",
    sourceId: string
  ): Promise<void> {
    const day = days.find((candidate) => candidate.dayNumber === dayNumber);
    if (!day?.id) return;
    // A second select while the first insert is in flight would mint a second ID and a second checklist.
    if (insertInFlight.current) return;
    insertInFlight.current = true;
    try {
      // The id is client-generated so a transport-level retry of the same request body is idempotent; each user
      // gesture mints a new one. useApiMutation reports errors and auth loss itself.
      await insertMutation.mutate(
        {
          params: { tripId: trip.id },
          body: { dayId: day.id, position, id: createRandomId(), source: { type: sourceType, id: sourceId } },
        },
        { onSuccess: (checklist) => setNewlyCreatedChecklistId(checklist.id) }
      );
    } finally {
      insertInFlight.current = false;
    }
  }

  return {
    setNewlyCreatedChecklistId,
    handleAddPackingItem,
    handleRemovePackingItem,
    handleRemovePackingSection,
    handleTogglePackingItem,
    handleReorderPackingItems,
    handleUpdatePackingItem,
    handlePullTemplates,
    handleSaveAsTemplate,
    handleCreatePackingList,
    handleRenamePackingList,
    handleDeletePackingList,
    handleInsertFromPackingSource,
    newlyCreatedChecklistId,
  };
}
