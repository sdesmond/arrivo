"use client";

import React from "react";
import type { z } from "zod";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { TripCurrencyChangeMode } from "@/data/types";
import type {
  DayItemType,
  DayItinerary,
  TripDetailPayload,
  EventUpdateIntent,
  TripDateChangeConfirmation,
  TripDateConflictResolution,
  UpdateTripMetadataResult,
  UpdateTripPatch,
} from "@/data/types";
import { deleteTrip, updateTripMetadata } from "../actions";
import { useApiMutation } from "@/lib/api/use-api-mutation";
import {
  createEvent as createEventEndpoint,
  deleteEvent as deleteEventEndpoint,
  updateEvent as updateEventEndpoint,
} from "@/lib/api/contract/events";
import {
  addDay as addDayEndpoint,
  deleteDay as deleteDayEndpoint,
  reorderDay as reorderDayEndpoint,
  updateDay as updateDayEndpoint,
} from "@/lib/api/contract/days";
import { ApiClientError } from "@/lib/api/client";
import { createRandomId } from "@/lib/utils";
import {
  createDayNote as createDayNoteEndpoint,
  deleteDayNote as deleteDayNoteEndpoint,
  updateDayNote as updateDayNoteEndpoint,
} from "@/lib/api/contract/itinerary-notes";
import { useChecklistHandlers } from "./use-checklist-handlers";
import { usePackingHandlers, type PackingHandlers } from "./use-packing-handlers";

export interface TripDetailHandlers extends PackingHandlers {
  days: DayItinerary[];
  addingDay: boolean;
  removingDay: boolean;
  savingTrip: boolean;
  isDeleting: boolean;
  handleEventUpdate: (updated: EventUpdateIntent) => void;
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
  handleAddNote: (dayNumber: number, content: string, insertAtPosition?: number, clientId?: string) => Promise<void>;
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

const DAY_TEXT_FIELDS = ["subtitle", "weather", "travelSummary"] as const;

const EVENT_OPTIONAL_FIELDS = [
  "startAt",
  "endAt",
  "locationName",
  "locationAddress",
  "locationLat",
  "locationLng",
  "confirmationNumber",
  "note",
] as const;

/** Only explicitly saved fields are writable; present empty values clear stored fields. */
function eventPatchBody(updated: EventUpdateIntent): Record<string, string | number | null> {
  const body: Record<string, string | number | null> = {};
  if (updated.name !== undefined) body.name = updated.name;
  for (const field of EVENT_OPTIONAL_FIELDS) {
    if (field in updated) body[field] = updated[field] ?? null;
  }
  return body;
}

export function useTripDetailHandlers(detail: TripDetailPayload): TripDetailHandlers {
  const { trip, days } = detail;
  const router = useRouter();
  const [savingTrip, startSaveTripTransition] = React.useTransition();
  const [isDeleting, startDeleteTripTransition] = React.useTransition();

  const eventMutation = useApiMutation(updateEventEndpoint);
  const eventCreateMutation = useApiMutation(createEventEndpoint);
  const eventDeleteMutation = useApiMutation(deleteEventEndpoint);
  const dayOrderMutation = useApiMutation(reorderDayEndpoint);
  const dayUpdateMutation = useApiMutation(updateDayEndpoint);
  const dayAddMutation = useApiMutation(addDayEndpoint);
  const dayRemoveMutation = useApiMutation(deleteDayEndpoint);
  // One id per add-day attempt: kept across a failed request so its retry is a replay, dropped once the add is settled.
  const addDayId = React.useRef<string | undefined>(undefined);
  const noteCreateMutation = useApiMutation(createDayNoteEndpoint);
  const noteUpdateMutation = useApiMutation(updateDayNoteEndpoint);
  const noteDeleteMutation = useApiMutation(deleteDayNoteEndpoint);
  const packingHandlers = usePackingHandlers(detail);
  const checklistHandlers = useChecklistHandlers(days, {
    tripId: trip.id,
    setNewlyCreatedChecklistId: packingHandlers.setNewlyCreatedChecklistId,
  });

  function handleEventUpdate(updated: EventUpdateIntent): void {
    const body = eventPatchBody(updated);
    if (Object.keys(body).length === 0) return;
    // Edits to one event share a queue key so they reach the server in the order they were made.
    void eventMutation.mutate({ params: { eventId: updated.id }, body }, { key: `event:${updated.id}` });
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
    // The editor clears a text field by leaving it undefined; the API clears only on null. The label cannot be cleared.
    const body: z.input<typeof updateDayEndpoint.body> = {};
    if (updates.label !== undefined) body.label = updates.label;
    for (const field of DAY_TEXT_FIELDS) {
      if (field in updates) body[field] = updates[field] ?? null;
    }
    if (Object.keys(body).length === 0) return Promise.resolve();
    let saved = false;
    let failure: unknown;
    // The hook toasts a failure; rejecting tells the editor to stay open.
    return dayUpdateMutation
      .mutate(
        { params: { dayId: day.id }, body },
        {
          key: `day:${day.id}`,
          onSuccess: () => {
            saved = true;
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
        if (saved) return;
        throw failure instanceof Error ? failure : new Error("Failed to update day. Please try again.");
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

  function handleAddNote(
    dayNumber: number,
    content: string,
    insertAtPosition?: number,
    clientId?: string
  ): Promise<void> {
    const day = days.find((candidate) => candidate.dayNumber === dayNumber);
    if (!day?.id) return Promise.resolve();
    let created = false;
    let failure: unknown;
    // The hook toasts a failure; rejecting keeps the draft open, and its retained id makes a retry a replay.
    return noteCreateMutation
      .mutate(
        {
          params: { dayId: day.id },
          body: {
            ...(clientId ? { id: clientId } : {}),
            content,
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
        throw failure instanceof Error ? failure : new Error("Failed to add note. Please try again.");
      });
  }

  function handleUpdateNote(noteId: string, content: string): void {
    // Edits to one note share a queue key so they reach the server in the order they were made.
    void noteUpdateMutation.mutate({ params: { noteId }, body: { content } }, { key: `note:${noteId}` });
  }

  function handleDeleteNote(noteId: string): void {
    void noteDeleteMutation.mutate({ params: { noteId }, body: { tripId: trip.id } }, { key: `note:${noteId}` });
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
    const id = (addDayId.current ??= createRandomId());
    void dayAddMutation.mutate(
      { params: { tripId: trip.id }, body: { id } },
      {
        onSuccess: () => {
          addDayId.current = undefined;
        },
        onError: (error) => {
          // A 409 means the id is taken by something else, so the next click needs a new one.
          if (error instanceof ApiClientError && error.status === 409) addDayId.current = undefined;
        },
      }
    );
  }

  function handleRemoveLastDay(
    confirmedDestructiveRemoval: boolean,
    onConfirmationRequired: (hasPlannedContent: boolean) => void
  ): void {
    const lastDay = days.reduce<DayItinerary | undefined>(
      (last, candidate) => (!last || candidate.dayNumber > last.dayNumber ? candidate : last),
      undefined
    );
    if (!lastDay?.id) return;
    void dayRemoveMutation.mutate(
      {
        params: { dayId: lastDay.id },
        body: { tripId: trip.id, ...(confirmedDestructiveRemoval ? { confirmDestructive: true } : {}) },
      },
      {
        // The server asks for confirmation when the day holds content; the dialog handles that, not a toast.
        expectedCodes: ["confirmation_required"],
        onError: (error) => {
          if (error instanceof ApiClientError && error.code === "confirmation_required") onConfirmationRequired(true);
        },
      }
    );
  }

  return {
    ...packingHandlers,
    addingDay: dayAddMutation.isPending,
    removingDay: dayRemoveMutation.isPending,
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
