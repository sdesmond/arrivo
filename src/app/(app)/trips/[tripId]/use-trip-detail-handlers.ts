"use client";

import React from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { TripCurrencyChangeMode } from "@/data/types";
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
import { addDay, createNote, deleteNote, removeLastDay, updateDay, updateNote } from "./actions";
import { useApiMutation } from "@/lib/api/use-api-mutation";
import {
  createEvent as createEventEndpoint,
  deleteEvent as deleteEventEndpoint,
  updateEvent as updateEventEndpoint,
} from "@/lib/api/contract/events";
import { reorderDay as reorderDayEndpoint } from "@/lib/api/contract/days";
import { useChecklistHandlers } from "./use-checklist-handlers";
import { usePackingHandlers, type PackingHandlers } from "./use-packing-handlers";

export interface TripDetailHandlers extends PackingHandlers {
  days: DayItinerary[];
  addingDay: boolean;
  removingDay: boolean;
  savingTrip: boolean;
  isDeleting: boolean;
  handleEventUpdate: (updated: TripEvent) => void;
  handleEventDelete: (id: string) => void;
  handleDayItemsReorder: (dayNumber: number, orderedItems: { type: DayItemType; id: string }[]) => void;
  handleDayUpdate: (dayNumber: number, updates: Partial<DayItinerary>) => Promise<void>;
  handleAddEvent: (
    dayNumber: number,
    name: string,
    afterEventId?: string,
    insertAtPosition?: number,
    clientId?: string
  ) => Promise<void>;
  handleAddNote: (dayNumber: number, content: string, insertAtPosition?: number) => Promise<void>;
  handleUpdateNote: (noteId: string, content: string) => void;
  handleDeleteNote: (noteId: string) => void;
  handleAddChecklist: (
    dayNumber: number,
    insertAtPosition: number,
    firstItemContent?: string,
    clientId?: string
  ) => Promise<void>;
  handleUpdateChecklistTitle: (checklistId: string, title: string | undefined) => void;
  handleDeleteChecklist: (checklistId: string) => void;
  handleAddChecklistItem: (checklistId: string, content: string) => void;
  handleUpdateChecklistItem: (itemId: string, content: string) => void;
  handleDeleteChecklistItem: (itemId: string) => void;
  handleToggleChecklistItem: (itemId: string) => void;
  handleTripSave: (
    patch: UpdateTripPatch,
    currencyChangeMode?: TripCurrencyChangeMode
  ) => Promise<UpdateTripMetadataResult | undefined>;
  handleTripSaveResolution: (
    patch: UpdateTripPatch,
    resolution: TripDateConflictResolution,
    confirmation: TripDateChangeConfirmation,
    currencyChangeMode?: TripCurrencyChangeMode
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

  const eventMutation = useApiMutation(updateEventEndpoint);
  const eventCreateMutation = useApiMutation(createEventEndpoint);
  const eventDeleteMutation = useApiMutation(deleteEventEndpoint);
  const dayOrderMutation = useApiMutation(reorderDayEndpoint);
  const packingHandlers = usePackingHandlers(detail);
  const checklistHandlers = useChecklistHandlers(days, {
    tripId: trip.id,
    setNewlyCreatedChecklistId: packingHandlers.setNewlyCreatedChecklistId,
  });

  function handleEventUpdate(updated: TripEvent): void {
    // The editor clears a field by leaving it undefined, and the API only clears on null, so every field is sent.
    // Edits to one event share a queue key so they reach the server in the order they were made.
    void eventMutation.mutate(
      {
        params: { eventId: updated.id },
        body: {
          name: updated.name,
          startAt: updated.startAt ?? null,
          endAt: updated.endAt ?? null,
          locationName: updated.locationName ?? null,
          locationAddress: updated.locationAddress ?? null,
          locationLat: updated.locationLat ?? null,
          locationLng: updated.locationLng ?? null,
          confirmationNumber: updated.confirmationNumber ?? null,
          note: updated.note ?? null,
        },
      },
      { key: `event:${updated.id}` }
    );
  }

  function handleEventDelete(id: string): void {
    // An event the client knows has documents goes through the dialog, which chooses. Here none are known, so keep
    // any the server holds (one attached since the last refresh) rather than destroy them unprompted.
    void eventDeleteMutation.mutate(
      { params: { eventId: id }, body: { tripId: trip.id, keepDocuments: true } },
      { key: `event:${id}` }
    );
  }

  function handleDayItemsReorder(dayNumber: number, orderedItems: { type: DayItemType; id: string }[]): void {
    const day = days.find((candidate) => candidate.dayNumber === dayNumber);
    if (!day?.id) return;
    // Every drag in one day shares a queue key, so rapid drags reach the server in order and the last list wins.
    // The hook toasts the failure (a stale list is a 409 with its own message); the page is refreshed to the stored order.
    void dayOrderMutation.mutate(
      { params: { dayId: day.id }, body: { items: orderedItems } },
      { key: `day-order:${day.id}`, onError: () => router.refresh() }
    );
  }

  function handleDayUpdate(dayNumber: number, updates: Partial<DayItinerary>): Promise<void> {
    const day = days.find((candidate) => candidate.dayNumber === dayNumber);
    if (!day?.id) return Promise.resolve();
    return new Promise((resolve, reject) => {
      React.startTransition(async () => {
        try {
          await updateDay(day.id!, updates);
          resolve();
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to update day. Please try again.";
          toast.error(message);
          reject(error instanceof Error ? error : new Error(message));
        }
      });
    });
  }

  function handleAddEvent(
    dayNumber: number,
    name: string,
    afterEventId?: string,
    insertAtPosition?: number,
    clientId?: string
  ): Promise<void> {
    const day = days.find((candidate) => candidate.dayNumber === dayNumber);
    if (!day?.id) return Promise.resolve();
    let created = false;
    let failure: unknown;
    // The hook toasts a failure; rejecting keeps the draft open, and its retained id makes a retry a replay.
    return eventCreateMutation
      .mutate(
        {
          params: { dayId: day.id },
          body: {
            ...(clientId ? { id: clientId } : {}),
            name,
            ...(afterEventId ? { afterEventId } : {}),
            ...(insertAtPosition !== undefined ? { insertAtPosition } : {}),
          },
        },
        {
          onSuccess: () => {
            created = true;
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
        throw failure instanceof Error ? failure : new Error("Failed to add event. Please try again.");
      });
  }

  function handleAddNote(dayNumber: number, content: string, insertAtPosition?: number): Promise<void> {
    const day = days.find((candidate) => candidate.dayNumber === dayNumber);
    if (!day?.id) return Promise.resolve();
    return new Promise((resolve, reject) => {
      React.startTransition(async () => {
        try {
          await createNote(day.id!, content, insertAtPosition);
          resolve();
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to add note. Please try again.";
          toast.error(message);
          reject(error instanceof Error ? error : new Error(message));
        }
      });
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

  function handleTripSave(
    patch: UpdateTripPatch,
    resolution?: TripDateConflictResolution,
    confirmation?: TripDateChangeConfirmation,
    currencyChangeMode?: TripCurrencyChangeMode
  ): Promise<UpdateTripMetadataResult | undefined> {
    return new Promise((resolve) => {
      startSaveTripTransition(async () => {
        try {
          const result = await updateTripMetadata(
            trip.id,
            patch,
            resolution,
            confirmation,
            currencyChangeMode === TripCurrencyChangeMode.Convert
          );
          resolve(result);
        } catch (error) {
          if (currencyChangeMode) {
            toast.error("Couldn't update currency — try again.");
          } else {
            toast.error(error instanceof Error ? error.message : "Failed to save trip changes. Please try again.");
          }
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
    ...checklistHandlers,
    handleTripSave: (patch, currencyChangeMode) => handleTripSave(patch, undefined, undefined, currencyChangeMode),
    handleTripSaveResolution: (patch, resolution, confirmation, currencyChangeMode) =>
      handleTripSave(patch, resolution, confirmation, currencyChangeMode),
    handleDeleteTrip,
    handleAddDay,
    handleRemoveLastDay,
  };
}
