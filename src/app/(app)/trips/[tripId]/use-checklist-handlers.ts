"use client";

import { useEffect, useRef, useState } from "react";
import type { ChecklistItem, DayItinerary } from "@/data/types";
import { useApiMutation } from "@/lib/api/use-api-mutation";
import {
  createChecklist,
  createChecklistItem,
  deleteChecklist,
  deleteChecklistItem,
  updateChecklistItem,
  updateChecklistTitle,
} from "@/lib/api/contract/checklists";

interface ChecklistRefreshWaiter {
  revision: number;
  source: DayItinerary[];
  /** True once the refreshed props show this write's outcome; a missing item counts as shown. */
  isShown: (item: ChecklistItem | undefined) => boolean;
  resolve: () => void;
}

interface ChecklistLifecycleOptions {
  tripId: string;
  setNewlyCreatedChecklistId: (id: string | null) => void;
}

function findItem(source: DayItinerary[], itemId: string): ChecklistItem | undefined {
  return source
    .flatMap((day) => day.checklists ?? [])
    .flatMap((list) => list.items)
    .find((candidate) => candidate.id === itemId);
}

export function useChecklistHandlers(
  serverDays: DayItinerary[],
  { tripId, setNewlyCreatedChecklistId }: ChecklistLifecycleOptions
) {
  // Content edits and checks share one hook so a single item's writes queue in the order they were made.
  const mutation = useApiMutation(updateChecklistItem);
  const createItemMutation = useApiMutation(createChecklistItem);
  const deleteItemMutation = useApiMutation(deleteChecklistItem);
  const createMutation = useApiMutation(createChecklist);
  const titleMutation = useApiMutation(updateChecklistTitle);
  const deleteMutation = useApiMutation(deleteChecklist);
  const [overrides, setOverrides] = useState(new Map<string, boolean>());
  const intentions = useRef(new Map<string, { value: boolean; revision: number }>());
  const [contentOverrides, setContentOverrides] = useState(new Map<string, string>());
  const contentIntents = useRef(new Map<string, { value: string; revision: number }>());
  const [deletedItemIds, setDeletedItemIds] = useState(new Set<string>());
  const revision = useRef(0);
  const committedDays = useRef(serverDays);
  const refreshWaiters = useRef(new Map<string, ChecklistRefreshWaiter>());
  // Separate mutation hooks keep separate queues, so each writer records its newest promise for cross-hook ordering.
  const itemWrites = useRef(new Map<string, Promise<void>>());
  const itemCreates = useRef(new Map<string, Promise<void>>());
  const titleWrites = useRef(new Map<string, Promise<void>>());
  const [titleOverrides, setTitleOverrides] = useState(new Map<string, string | undefined>());
  const titleIntents = useRef(new Map<string, number>());
  const titleRevision = useRef(0);

  useEffect(() => {
    committedDays.current = serverDays;
    for (const [itemId, waiter] of refreshWaiters.current) {
      if (waiter.source === serverDays) continue;
      if (waiter.isShown(findItem(serverDays, itemId))) {
        refreshWaiters.current.delete(itemId);
        waiter.resolve();
      }
    }
  }, [serverDays]);

  useEffect(() => {
    const waiters = refreshWaiters.current;
    return () => {
      for (const waiter of waiters.values()) waiter.resolve();
      waiters.clear();
    };
  }, []);

  function awaitRefresh(
    itemId: string,
    intentRevision: number,
    isShown: (item: ChecklistItem | undefined) => boolean
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      refreshWaiters.current.set(itemId, { revision: intentRevision, source: committedDays.current, isShown, resolve });
    });
  }

  function releaseRefresh(itemId: string, intentRevision: number): void {
    const waiter = refreshWaiters.current.get(itemId);
    if (waiter?.revision !== intentRevision) return;
    refreshWaiters.current.delete(itemId);
    waiter.resolve();
  }

  function dropItemOptimism(): void {
    for (const waiter of refreshWaiters.current.values()) waiter.resolve();
    refreshWaiters.current.clear();
    intentions.current.clear();
    contentIntents.current.clear();
    setOverrides(new Map());
    setContentOverrides(new Map());
    setDeletedItemIds(new Set());
  }

  function trackItemWrite(itemId: string, write: Promise<void>): void {
    itemWrites.current.set(itemId, write);
    void write.then(() => {
      if (itemWrites.current.get(itemId) === write) itemWrites.current.delete(itemId);
    });
  }

  function handleToggleChecklistItem(itemId: string): void {
    const item = findItem(serverDays, itemId);
    if (!item) return;
    const value = !(intentions.current.get(itemId)?.value ?? item.isChecked);
    const intentRevision = ++revision.current;
    intentions.current.set(itemId, { value, revision: intentRevision });
    setOverrides((current) => new Map(current).set(itemId, value));
    trackItemWrite(
      itemId,
      mutation.mutate(
        { params: { itemId }, body: { isChecked: value } },
        {
          key: itemId,
          waitForRefresh: () => awaitRefresh(itemId, intentRevision, (shown) => !shown || shown.isChecked === value),
          onAuthLost: dropItemOptimism,
          onSettled: () => {
            releaseRefresh(itemId, intentRevision);
            if (intentions.current.get(itemId)?.revision !== intentRevision) return;
            intentions.current.delete(itemId);
            setOverrides((current) => {
              const next = new Map(current);
              next.delete(itemId);
              return next;
            });
          },
        }
      )
    );
  }

  function handleUpdateChecklistItem(itemId: string, content: string): void {
    const item = findItem(serverDays, itemId);
    if (!item || content === (contentIntents.current.get(itemId)?.value ?? item.content)) return;
    const intentRevision = ++revision.current;
    contentIntents.current.set(itemId, { value: content, revision: intentRevision });
    setContentOverrides((current) => new Map(current).set(itemId, content));
    trackItemWrite(
      itemId,
      mutation.mutate(
        { params: { itemId }, body: { content } },
        {
          key: itemId,
          waitForRefresh: () => awaitRefresh(itemId, intentRevision, (shown) => !shown || shown.content === content),
          onAuthLost: dropItemOptimism,
          onSettled: () => {
            releaseRefresh(itemId, intentRevision);
            if (contentIntents.current.get(itemId)?.revision !== intentRevision) return;
            contentIntents.current.delete(itemId);
            setContentOverrides((current) => {
              const next = new Map(current);
              next.delete(itemId);
              return next;
            });
          },
        }
      )
    );
  }

  function handleAddChecklistItem(checklistId: string, content: string): void {
    // Queued per checklist so rapid adds reach the server, and appear, in the order they were typed.
    const write = createItemMutation.mutate({ params: { checklistId }, body: { content } }, { key: checklistId });
    itemCreates.current.set(checklistId, write);
    void write.then(() => {
      if (itemCreates.current.get(checklistId) === write) itemCreates.current.delete(checklistId);
    });
  }

  function handleDeleteChecklistItem(itemId: string): void {
    const intentRevision = ++revision.current;
    setDeletedItemIds((current) => new Set(current).add(itemId));
    const remove = () =>
      deleteItemMutation.mutate(
        { params: { itemId }, body: { tripId } },
        {
          key: itemId,
          waitForRefresh: () => awaitRefresh(itemId, intentRevision, (shown) => !shown),
          onAuthLost: dropItemOptimism,
          onSettled: () => {
            releaseRefresh(itemId, intentRevision);
            setDeletedItemIds((current) => {
              const next = new Set(current);
              next.delete(itemId);
              return next;
            });
          },
        }
      );
    // An in-flight edit or check must land first, or it would hit a row the delete already removed.
    const pending = itemWrites.current.get(itemId);
    void (pending ? pending.then(remove) : remove());
  }

  function handleAddChecklist(dayNumber: number, insertAtPosition: number, firstItemContent?: string): Promise<void> {
    const dayId = serverDays.find((candidate) => candidate.dayNumber === dayNumber)?.id;
    if (!dayId) return Promise.resolve();
    let created = false;
    let failure: unknown;
    return createMutation
      .mutate(
        {
          params: { tripId },
          body: {
            dayId,
            position: insertAtPosition,
            ...(firstItemContent ? { firstItem: { content: firstItemContent } } : {}),
          },
        },
        {
          onSuccess: (checklist) => {
            created = true;
            if (firstItemContent) setNewlyCreatedChecklistId(checklist.id);
          },
          onError: (error) => {
            failure = error;
          },
          onAuthLost: () => {
            failure = new Error("Your session has expired.");
          },
        }
      )
      .then(() => {
        if (created) return;
        throw failure instanceof Error ? failure : new Error("Failed to add checklist. Please try again.");
      });
  }

  function handleUpdateChecklistTitle(checklistId: string, title: string | undefined): void {
    const intentRevision = ++titleRevision.current;
    titleIntents.current.set(checklistId, intentRevision);
    setTitleOverrides((current) => new Map(current).set(checklistId, title));
    const write = titleMutation.mutate(
      { params: { checklistId }, body: { title: title ?? null } },
      {
        key: checklistId,
        onAuthLost: () => {
          titleIntents.current.clear();
          setTitleOverrides(new Map());
        },
        onSettled: () => {
          if (titleIntents.current.get(checklistId) !== intentRevision) return;
          titleIntents.current.delete(checklistId);
          setTitleOverrides((current) => {
            const next = new Map(current);
            next.delete(checklistId);
            return next;
          });
        },
      }
    );
    titleWrites.current.set(checklistId, write);
    void write.then(() => {
      if (titleWrites.current.get(checklistId) === write) titleWrites.current.delete(checklistId);
    });
  }

  function handleDeleteChecklist(checklistId: string): void {
    // Separate mutation hooks keep separate queues; let in-flight renames, item adds and item edits land first.
    const itemIds = committedDays.current
      .flatMap((day) => day.checklists ?? [])
      .filter((checklist) => checklist.id === checklistId)
      .flatMap((checklist) => checklist.items.map((item) => item.id));
    const pending = [
      titleWrites.current.get(checklistId),
      itemCreates.current.get(checklistId),
      ...itemIds.map((itemId) => itemWrites.current.get(itemId)),
    ].filter((write): write is Promise<void> => write !== undefined);
    const remove = () => deleteMutation.mutate({ params: { checklistId }, body: { tripId } }, { key: checklistId });
    void (pending.length > 0 ? Promise.all(pending).then(remove) : remove());
  }

  const days = serverDays.map((day) => ({
    ...day,
    checklists: day.checklists?.map((checklist) => ({
      ...checklist,
      ...(titleOverrides.has(checklist.id) ? { title: titleOverrides.get(checklist.id) } : {}),
      items: checklist.items
        .filter((item) => !deletedItemIds.has(item.id))
        .map((item) => {
          const isChecked = overrides.get(item.id);
          const content = contentOverrides.get(item.id);
          if (isChecked === undefined && content === undefined) return item;
          return {
            ...item,
            ...(isChecked === undefined ? {} : { isChecked }),
            ...(content === undefined ? {} : { content }),
          };
        }),
    })),
  }));
  return {
    days,
    handleToggleChecklistItem,
    handleAddChecklistItem,
    handleUpdateChecklistItem,
    handleDeleteChecklistItem,
    handleAddChecklist,
    handleUpdateChecklistTitle,
    handleDeleteChecklist,
  };
}
