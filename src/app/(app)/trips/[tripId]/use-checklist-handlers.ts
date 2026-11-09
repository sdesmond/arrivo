"use client";

import { useEffect, useRef, useState } from "react";
import type { DayItinerary } from "@/data/types";
import { useApiMutation } from "@/lib/api/use-api-mutation";
import {
  createChecklist,
  deleteChecklist,
  updateChecklistItem,
  updateChecklistTitle,
} from "@/lib/api/contract/checklists";

interface ChecklistRefreshWaiter {
  value: boolean;
  revision: number;
  source: DayItinerary[];
  resolve: () => void;
}

interface ChecklistLifecycleOptions {
  tripId: string;
  setNewlyCreatedChecklistId: (id: string | null) => void;
}

export function useChecklistHandlers(
  serverDays: DayItinerary[],
  { tripId, setNewlyCreatedChecklistId }: ChecklistLifecycleOptions
) {
  const mutation = useApiMutation(updateChecklistItem);
  const createMutation = useApiMutation(createChecklist);
  const titleMutation = useApiMutation(updateChecklistTitle);
  const deleteMutation = useApiMutation(deleteChecklist);
  const [overrides, setOverrides] = useState(new Map<string, boolean>());
  const intentions = useRef(new Map<string, { value: boolean; revision: number }>());
  const revision = useRef(0);
  const committedDays = useRef(serverDays);
  const refreshWaiters = useRef(new Map<string, ChecklistRefreshWaiter>());
  const titleWrites = useRef(new Map<string, Promise<void>>());
  const [titleOverrides, setTitleOverrides] = useState(new Map<string, string | undefined>());
  const titleIntents = useRef(new Map<string, number>());
  const titleRevision = useRef(0);

  useEffect(() => {
    committedDays.current = serverDays;
    for (const [itemId, waiter] of refreshWaiters.current) {
      if (waiter.source === serverDays) continue;
      const item = serverDays
        .flatMap((day) => day.checklists ?? [])
        .flatMap((list) => list.items)
        .find((candidate) => candidate.id === itemId);
      if (!item || item.isChecked === waiter.value) {
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

  function handleToggleChecklistItem(itemId: string): void {
    const item = serverDays
      .flatMap((day) => day.checklists ?? [])
      .flatMap((list) => list.items)
      .find((candidate) => candidate.id === itemId);
    if (!item) return;
    const value = !(intentions.current.get(itemId)?.value ?? item.isChecked);
    const intentRevision = ++revision.current;
    intentions.current.set(itemId, { value, revision: intentRevision });
    setOverrides((current) => new Map(current).set(itemId, value));
    void mutation.mutate(
      { params: { itemId }, body: { isChecked: value } },
      {
        key: itemId,
        waitForRefresh: () =>
          new Promise<void>((resolve) => {
            refreshWaiters.current.set(itemId, {
              value,
              revision: intentRevision,
              source: committedDays.current,
              resolve,
            });
          }),
        onAuthLost: () => {
          for (const waiter of refreshWaiters.current.values()) waiter.resolve();
          refreshWaiters.current.clear();
          intentions.current.clear();
          setOverrides(new Map());
        },
        onSettled: () => {
          const waiter = refreshWaiters.current.get(itemId);
          if (waiter?.revision === intentRevision) {
            refreshWaiters.current.delete(itemId);
            waiter.resolve();
          }
          if (intentions.current.get(itemId)?.revision !== intentRevision) return;
          intentions.current.delete(itemId);
          setOverrides((current) => {
            const next = new Map(current);
            next.delete(itemId);
            return next;
          });
        },
      }
    );
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
    // Separate mutation hooks keep separate queues; let an in-flight rename land before the delete.
    const remove = () => deleteMutation.mutate({ params: { checklistId }, body: { tripId } }, { key: checklistId });
    const pendingTitle = titleWrites.current.get(checklistId);
    void (pendingTitle ? pendingTitle.then(remove) : remove());
  }

  const days = serverDays.map((day) => ({
    ...day,
    checklists: day.checklists?.map((checklist) => ({
      ...checklist,
      ...(titleOverrides.has(checklist.id) ? { title: titleOverrides.get(checklist.id) } : {}),
      items: checklist.items.map((item) =>
        overrides.has(item.id) ? { ...item, isChecked: overrides.get(item.id)! } : item
      ),
    })),
  }));
  return {
    days,
    handleToggleChecklistItem,
    handleAddChecklist,
    handleUpdateChecklistTitle,
    handleDeleteChecklist,
  };
}
