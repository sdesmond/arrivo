"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import type { RemovePackingSectionMode, TripDetailPayload, PullTemplatesResult } from "@/data/types";
import { useOfflineDb, writePackingItemLocally } from "@/lib/offline/db";
import { writeOfflineAware } from "@/lib/offline/offline-write";
import { useOnlineStatus } from "@/lib/offline/use-online-status";
import {
  addPackingItem,
  pullTemplatesOntoTrip,
  removePackingItem,
  reorderPackingItems,
  saveTripListAsTemplate,
  togglePackingItem,
  updatePackingItem,
} from "../actions";
import { removePackingSection, createPackingList, renamePackingList, deletePackingList } from "../packing-actions";
import { addChecklistFromPackingSource } from "./actions";

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
  handleTogglePackingItem: (id: string) => Promise<void>;
  handleReorderPackingItems: (
    ordered: { id: string; labelId: string | null; position: number }[],
    onError?: () => void
  ) => void;
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

export function usePackingHandlers(detail: TripDetailPayload): PackingHandlers {
  const { trip, days } = detail;
  const router = useRouter();
  const database = useOfflineDb();
  const isOnline = useOnlineStatus();
  const [newlyCreatedChecklistId, setNewlyCreatedChecklistId] = useState<string | null>(null);

  function handleAddPackingItem(
    name: string,
    isLabel?: boolean,
    afterItemId?: string,
    beforeItemId?: string,
    labelId?: string | null,
    listId?: string | null
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      React.startTransition(async () => {
        try {
          const input = {
            id: crypto.randomUUID(),
            name,
            isLabel,
            afterItemId,
            beforeItemId,
            labelId,
            listId,
          };

          await writeOfflineAware(
            isOnline,
            database,
            (db) => writePackingItemLocally(db, { operation: "create", tripId: trip.id, input }),
            () => addPackingItem(trip.id, input)
          );
          resolve();
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to add packing entry. Please try again.";
          toast.error(message);
          reject(error instanceof Error ? error : new Error(message));
        }
      });
    });
  }

  function handleUpdatePackingItem(id: string, name: string): void {
    React.startTransition(async () => {
      try {
        await writeOfflineAware(
          isOnline,
          database,
          (db) => writePackingItemLocally(db, { operation: "update", itemId: id, patch: { name } }),
          () => updatePackingItem(id, { name })
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update packing item. Please try again.");
      }
    });
  }

  function handleRemovePackingItem(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      React.startTransition(async () => {
        try {
          await removePackingItem(id);
          resolve();
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to remove packing entry. Please try again.";
          toast.error(message);
          reject(error instanceof Error ? error : new Error(message));
        }
      });
    });
  }

  function handleRemovePackingSection(id: string, mode: RemovePackingSectionMode): Promise<void> {
    return new Promise((resolve, reject) => {
      React.startTransition(async () => {
        try {
          await removePackingSection(id, { mode });
          resolve();
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Failed to remove packing section. Please try again.";
          toast.error(message);
          reject(error instanceof Error ? error : new Error(message));
        }
      });
    });
  }

  function handleTogglePackingItem(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      React.startTransition(async () => {
        try {
          await writeOfflineAware(
            isOnline,
            database,
            (db) => writePackingItemLocally(db, { operation: "toggle", itemId: id }),
            () => togglePackingItem(id)
          );
          resolve();
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to update packing item. Please try again.";
          toast.error(message);
          reject(error instanceof Error ? error : new Error(message));
        }
      });
    });
  }

  function handleReorderPackingItems(
    ordered: { id: string; labelId: string | null; position: number }[],
    onError?: () => void
  ): void {
    React.startTransition(async () => {
      try {
        await reorderPackingItems(trip.id, ordered);
        router.refresh();
      } catch (error) {
        onError?.();
        toast.error(error instanceof Error ? error.message : "Failed to reorder packing items. Please try again.");
      }
    });
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
      return await createPackingList(trip.id, name, crypto.randomUUID());
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
    try {
      const checklistId = await addChecklistFromPackingSource(
        trip.id,
        day.id,
        position,
        sourceType,
        sourceId,
        crypto.randomUUID()
      );
      setNewlyCreatedChecklistId(checklistId);
      setTimeout(() => setNewlyCreatedChecklistId(null), 1000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to insert packing list. Please try again.");
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
