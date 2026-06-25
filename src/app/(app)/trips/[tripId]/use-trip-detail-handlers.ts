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
  const [addingDay, startAddDayTransition] = React.useTransition();
  const [removingDay, startRemoveDayTransition] = React.useTransition();
  const [savingTrip, startSaveTripTransition] = React.useTransition();
  const [isDeleting, startDeleteTripTransition] = React.useTransition();

  const packingHandlers = usePackingHandlers(detail);

  function handleEventUpdate(updated: TripEvent): void {
    React.startTransition(() => {
      updateEvent(updated.id, {
        name: updated.name,
        startAt: updated.startAt,
        endAt: updated.endAt,
        locationName: updated.locationName,
        locationAddress: updated.locationAddress,
        locationLat: updated.locationLat,
        locationLng: updated.locationLng,
        confirmationNumber: updated.confirmationNumber,
        note: updated.note,
      });
    });
  }

  function handleEventDelete(id: string): void {
    React.startTransition(() => {
      deleteEvent(id);
    });
  }

  function handleDayItemsReorder(dayNumber: number, orderedItems: { type: DayItemType; id: string }[]): void {
    const day = days.find((candidate) => candidate.dayNumber === dayNumber);
    if (!day?.id) return;
    React.startTransition(async () => {
      try {
        await reorderDayItems({ dayId: day.id!, orderedItems });
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
    React.startTransition(() => {
      updateDay(day.id!, updates);
    });
  }

  function handleAddEvent(dayNumber: number, name: string, afterEventId?: string, insertAtPosition?: number): void {
    const day = days.find((candidate) => candidate.dayNumber === dayNumber);
    if (!day?.id) return;
    React.startTransition(() => {
      createEvent(day.id!, { name, afterEventId, insertAtPosition });
    });
  }

  function handleAddNote(dayNumber: number, content: string, insertAtPosition?: number): void {
    const day = days.find((candidate) => candidate.dayNumber === dayNumber);
    if (!day?.id) return;
    React.startTransition(() => {
      createNote(day.id!, content, insertAtPosition);
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
        const id = await createChecklistWithItem(day.id!, insertAtPosition, firstItemContent);
        packingHandlers.setNewlyCreatedChecklistId(id);
        setTimeout(() => packingHandlers.setNewlyCreatedChecklistId(null), 1000);
      });
      return;
    }

    React.startTransition(() => {
      createChecklist(day.id!, insertAtPosition);
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
      createChecklistItem(checklistId, content);
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
        await addDay(trip.id);
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
