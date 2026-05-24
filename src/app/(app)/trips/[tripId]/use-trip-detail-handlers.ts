"use client";

import React, { useState } from "react";
import {
  type DayItemType,
  type DayItinerary,
  type TripDetailPayload,
  type TripEvent,
  type UpdateTripPatch,
} from "@/data/types";
import { updateTripMetadata } from "../actions";
import {
  createChecklist,
  createChecklistItem,
  createChecklistWithItem,
  createEvent,
  createNote,
  deleteChecklist,
  deleteChecklistItem,
  deleteEvent,
  deleteNote,
  reorderDayItems,
  toggleChecklistItem,
  updateChecklistItem,
  updateChecklistTitle,
  updateDay,
  updateEvent,
  updateNote,
} from "./actions";

export function useTripDetailHandlers(detail: TripDetailPayload) {
  const { trip, days } = detail;
  const [newlyCreatedChecklistId, setNewlyCreatedChecklistId] = useState<string | null>(null);

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
        cost: updated.cost,
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
    React.startTransition(() => {
      reorderDayItems({ dayId: day.id!, orderedItems });
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
        setNewlyCreatedChecklistId(id);
        setTimeout(() => setNewlyCreatedChecklistId(null), 1000);
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

  function handleTripSave(patch: UpdateTripPatch): void {
    React.startTransition(() => {
      updateTripMetadata(trip.id, patch);
    });
  }

  return {
    newlyCreatedChecklistId,
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
    handleTripSave,
  };
}
