"use client";

import React from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import type {
  DayItemType,
  DayItinerary,
  TripDetailPayload,
  TripEvent,
  TripDateChangeConfirmation,
  TripDateConflictResolution,
  UpdateTripMetadataResult,
  UpdateTripPatch,
} from "@/data/types";
import {
  deleteEventLocally,
  reorderEventsLocally,
  updateDayLocally,
  updateEventLocally,
  useOfflineDb,
  writeEventLocally,
} from "@/lib/offline/db";
import { writeOfflineAware } from "@/lib/offline/offline-write";
import { useOnlineStatus } from "@/lib/offline/use-online-status";
import { pickDayPatch } from "@/lib/utils";
import { deleteTrip, updateTripMetadata } from "../actions";
import {
  createChecklist,
  createChecklistItem,
  createChecklistWithItem,
  addDay,
  createEvent,
  createNote,
  deleteChecklist,
  deleteChecklistItem,
  deleteEvent,
  deleteNote,
  reorderDayItems,
  removeLastDay,
  toggleChecklistItem,
  updateChecklistItem,
  updateChecklistTitle,
  updateDay,
  updateEvent,
  updateNote,
} from "./actions";
import { usePackingHandlers, type PackingHandlers } from "./use-packing-handlers";

export interface TripDetailHandlers extends PackingHandlers {
  addingDay: boolean;
  removingDay: boolean;
  savingTrip: boolean;
  isDeleting: boolean;
  handleEventUpdate: (updated: TripEvent) => void;
  handleEventDelete: (id: string) => void;
  handleDayItemsReorder: (dayNumber: number, orderedItems: { type: DayItemType; id: string }[]) => void;
  handleDayUpdate: (dayNumber: number, updates: Partial<DayItinerary>) => void;
  handleAddEvent: (dayNumber: number, name: string, afterEventId?: string, insertAtPosition?: number) => void;
  handleAddNote: (dayNumber: number, content: string, insertAtPosition?: number) => void;
  handleUpdateNote: (noteId: string, content: string) => void;
  handleDeleteNote: (noteId: string) => void;
  handleAddChecklist: (dayNumber: number, insertAtPosition: number, firstItemContent?: string) => void;
  handleUpdateChecklistTitle: (checklistId: string, title: string | undefined) => void;
  handleDeleteChecklist: (checklistId: string) => void;
  handleAddChecklistItem: (checklistId: string, content: string) => void;
  handleUpdateChecklistItem: (itemId: string, content: string) => void;
  handleDeleteChecklistItem: (itemId: string) => void;
  handleToggleChecklistItem: (itemId: string) => void;
  handleTripSave: (patch: UpdateTripPatch) => Promise<UpdateTripMetadataResult | undefined>;
  handleTripSaveResolution: (
    patch: UpdateTripPatch,
    resolution: TripDateConflictResolution,
    confirmation: TripDateChangeConfirmation
  ) => Promise<UpdateTripMetadataResult | undefined>;
  handleDeleteTrip: () => void;
  handleAddDay: () => void;
  handleRemoveLastDay: (
    confirmedDestructiveRemoval: boolean,
    onConfirmationRequired: (hasPlannedContent: boolean) => void
  ) => void;
}

export function useTripDetailHandlers(detail: TripDetailPayload): TripDetailHandlers {
  const { trip, days } = detail;
  const router = useRouter();
  const database = useOfflineDb();
  const isOnline = useOnlineStatus();
  const [addingDay, startAddDayTransition] = React.useTransition();
  const [removingDay, startRemoveDayTransition] = React.useTransition();
  const [savingTrip, startSaveTripTransition] = React.useTransition();
  const [isDeleting, startDeleteTripTransition] = React.useTransition();

  const packingHandlers = usePackingHandlers(detail);

  function handleEventUpdate(updated: TripEvent): void {
    React.startTransition(() => {
      const patch = {
        name: updated.name,
        startAt: updated.startAt,
        endAt: updated.endAt,
        locationName: updated.locationName,
        locationAddress: updated.locationAddress,
        locationLat: updated.locationLat,
        locationLng: updated.locationLng,
        cost: updated.cost,
        confirmationNumber: updated.confirmationNumber,
        note: updated.note,
      };

      void writeOfflineAware(
        isOnline,
        database,
        (db) => updateEventLocally(db, updated.id, patch),
        () => updateEvent(updated.id, patch)
      );
    });
  }

  function handleEventDelete(id: string): void {
    React.startTransition(async () => {
      try {
        await writeOfflineAware(
          isOnline,
          database,
          (db) => deleteEventLocally(db, id),
          () => deleteEvent(id)
        );
      } catch {
        toast.error("Failed to delete event. Refreshing the itinerary.");
        router.refresh();
      }
    });
  }

  function handleDayItemsReorder(dayNumber: number, orderedItems: { type: DayItemType; id: string }[]): void {
    const day = days.find((candidate) => candidate.dayNumber === dayNumber);
    if (!day?.id) return;
    const reorderedEvents = orderedItems
      .map((item, position) => (item.type === "event" ? { id: item.id, position } : null))
      .filter((item): item is { id: string; position: number } => item !== null);

    React.startTransition(async () => {
      try {
        await writeOfflineAware(
          isOnline,
          database,
          (db) => reorderEventsLocally(db, day.id!, reorderedEvents),
          () => reorderDayItems({ dayId: day.id!, orderedItems })
        );
      } catch (error) {
        if (error instanceof Error && error.message === "CONCURRENT_MODIFICATION") {
          toast.error("This day changed elsewhere. Refreshing the itinerary.");
        } else {
          toast.error("Failed to reorder items. Refreshing the itinerary.");
        }
        router.refresh();
      }
    });
  }

  function handleDayUpdate(dayNumber: number, updates: Partial<DayItinerary>): void {
    const day = days.find((candidate) => candidate.dayNumber === dayNumber);
    if (!day?.id) return;

    const patch = pickDayPatch(updates);

    React.startTransition(async () => {
      try {
        await writeOfflineAware(
          isOnline,
          database,
          (db) => updateDayLocally(db, day.id!, patch),
          () => updateDay(day.id!, patch)
        );
      } catch (error) {
        toast.error("Failed to update day. Refreshing the itinerary.");
        router.refresh();
      }
    });
  }

  function handleAddEvent(dayNumber: number, name: string, afterEventId?: string, insertAtPosition?: number): void {
    const day = days.find((candidate) => candidate.dayNumber === dayNumber);
    if (!day?.id) return;
    React.startTransition(() => {
      const input = { id: crypto.randomUUID(), name, afterEventId, insertAtPosition };

      void writeOfflineAware(
        isOnline,
        database,
        (db) => writeEventLocally(db, trip.id, day.id!, input),
        () => createEvent(day.id!, input)
      );
    });
  }

  function handleAddNote(dayNumber: number, content: string, insertAtPosition?: number): void {
    const day = days.find((candidate) => candidate.dayNumber === dayNumber);
    if (!day?.id) return;
    React.startTransition(() => {
      createNote(day.id!, content, insertAtPosition, crypto.randomUUID());
    });
  }

  function handleUpdateNote(noteId: string, content: string): void {
    React.startTransition(() => {
      updateNote(noteId, content);
    });
  }

  function handleDeleteNote(noteId: string): void {
    React.startTransition(() => {
      deleteNote(noteId);
    });
  }

  function handleAddChecklist(dayNumber: number, insertAtPosition: number, firstItemContent?: string): void {
    const day = days.find((candidate) => candidate.dayNumber === dayNumber);
    if (!day?.id) return;
    if (firstItemContent) {
      React.startTransition(async () => {
        const id = await createChecklistWithItem(day.id!, insertAtPosition, firstItemContent, crypto.randomUUID());
        packingHandlers.setNewlyCreatedChecklistId(id);
        setTimeout(() => packingHandlers.setNewlyCreatedChecklistId(null), 1000);
      });
      return;
    }

    React.startTransition(() => {
      createChecklist(day.id!, insertAtPosition, crypto.randomUUID());
    });
  }

  function handleUpdateChecklistTitle(checklistId: string, title: string | undefined): void {
    React.startTransition(() => {
      updateChecklistTitle(checklistId, title);
    });
  }

  function handleDeleteChecklist(checklistId: string): void {
    React.startTransition(() => {
      deleteChecklist(checklistId);
    });
  }

  function handleAddChecklistItem(checklistId: string, content: string): void {
    React.startTransition(() => {
      createChecklistItem(checklistId, content, crypto.randomUUID());
    });
  }

  function handleUpdateChecklistItem(itemId: string, content: string): void {
    React.startTransition(() => {
      updateChecklistItem(itemId, content);
    });
  }

  function handleDeleteChecklistItem(itemId: string): void {
    React.startTransition(() => {
      deleteChecklistItem(itemId);
    });
  }

  function handleToggleChecklistItem(itemId: string): void {
    React.startTransition(() => {
      toggleChecklistItem(itemId);
    });
  }

  function handleTripSave(
    patch: UpdateTripPatch,
    resolution?: TripDateConflictResolution,
    confirmation?: TripDateChangeConfirmation
  ): Promise<UpdateTripMetadataResult | undefined> {
    return new Promise((resolve) => {
      startSaveTripTransition(async () => {
        try {
          resolve(await updateTripMetadata(trip.id, patch, resolution, confirmation));
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Failed to save trip changes. Please try again.");
          resolve(undefined);
        }
      });
    });
  }

  function handleDeleteTrip(): void {
    startDeleteTripTransition(async () => {
      try {
        await deleteTrip(trip.id);
        router.push("/trips");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to delete trip. Please try again.");
      }
    });
  }

  function handleAddDay(): void {
    startAddDayTransition(async () => {
      try {
        await addDay(trip.id, crypto.randomUUID());
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to add day. Please try again.");
      }
    });
  }

  function handleRemoveLastDay(
    confirmedDestructiveRemoval: boolean,
    onConfirmationRequired: (hasPlannedContent: boolean) => void
  ): void {
    startRemoveDayTransition(async () => {
      try {
        const result = await removeLastDay(trip.id, confirmedDestructiveRemoval);
        if (result.status === "confirmation-required") {
          onConfirmationRequired(result.hasPlannedContent ?? false);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to remove day. Please try again.");
      }
    });
  }

  return {
    ...packingHandlers,
    addingDay,
    removingDay,
    savingTrip,
    isDeleting,
    handleEventUpdate,
    handleEventDelete,
    handleDayItemsReorder,
    handleDayUpdate,
    handleAddEvent,
    handleAddNote,
    handleUpdateNote,
    handleDeleteNote,
    handleAddChecklist,
    handleUpdateChecklistTitle,
    handleDeleteChecklist,
    handleAddChecklistItem,
    handleUpdateChecklistItem,
    handleDeleteChecklistItem,
    handleToggleChecklistItem,
    handleTripSave: (patch) => handleTripSave(patch),
    handleTripSaveResolution: (patch, resolution, confirmation) => handleTripSave(patch, resolution, confirmation),
    handleDeleteTrip,
    handleAddDay,
    handleRemoveLastDay,
  };
}
