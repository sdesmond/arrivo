"use client";

import { useEffect, useRef, useState } from "react";
import type { DayItinerary } from "@/data/types";
import { useApiMutation } from "@/lib/api/use-api-mutation";
import { updateChecklistItem } from "@/lib/api/contract/checklists";

interface ChecklistRefreshWaiter {
  value: boolean;
  revision: number;
  source: DayItinerary[];
  resolve: () => void;
}

export function useChecklistHandlers(serverDays: DayItinerary[]) {
  const mutation = useApiMutation(updateChecklistItem);
  const [overrides, setOverrides] = useState(new Map<string, boolean>());
  const intentions = useRef(new Map<string, { value: boolean; revision: number }>());
  const revision = useRef(0);
  const committedDays = useRef(serverDays);
  const refreshWaiters = useRef(new Map<string, ChecklistRefreshWaiter>());

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

  const days = serverDays.map((day) => ({
    ...day,
    checklists: day.checklists?.map((checklist) => ({
      ...checklist,
      items: checklist.items.map((item) =>
        overrides.has(item.id) ? { ...item, isChecked: overrides.get(item.id)! } : item
      ),
    })),
  }));
  return { days, handleToggleChecklistItem };
}
