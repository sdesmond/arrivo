"use server";

import { requireUser, assertTripAccess } from "@/lib/auth-helpers";
import { db } from "@/db";
import {
  events,
  days,
  documents,
  itineraryNotes,
  notes,
  itineraryChecklists,
  checklistItems,
  trips,
  packingItems,
  tripPackingLists,
  packingTemplates,
  packingTemplateItems,
} from "@/db/schema";
import { eq, and, max, gte, sql, asc, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getStorageAdapter } from "@/lib/storage/storage-adapter";
import { deriveGraphicCover } from "@/lib/utils";
import { lockTripForUpdate, type DbTransaction } from "@/lib/server-action-locks";
import {
  uploadDocument as uploadTripDocumentAction,
  uploadDocumentToEvent as uploadEventDocumentAction,
} from "./document-upload-actions";
import { uploadCoverImage as uploadCoverImageAction } from "./cover-upload-actions";
import type {
  CreateEventInput,
  UpdateEventPatch,
  ReorderDayItemsInput,
  UpdateDayPatch,
  AddDocumentInput,
  RemoveLastDayResult,
  CreateTripNoteInput,
  UpdateTripNoteInput,
  ReorderTripNotesInput,
} from "@/data/types";

const MAX_TRIP_DAYS = 45;
const CONCURRENT_MODIFICATION_ERROR = "CONCURRENT_MODIFICATION";

type PositionExecutor = Pick<DbTransaction, "select" | "update" | "insert">;

function buildDayItemKey(type: "event" | "note" | "checklist", id: string): string {
  return `${type}:${id}`;
}

function nextCalendarDate(date: string): string {
  const nextDate = new Date(`${date}T00:00:00Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  return nextDate.toISOString().slice(0, 10);
}

async function getDayTripId(dayId: string): Promise<string> {
  const [day] = await db.select({ tripId: days.tripId }).from(days).where(eq(days.id, dayId));
  if (!day) throw new Error("Day not found");
  return day.tripId;
}

async function assertDayExistsInTrip(transaction: PositionExecutor, tripId: string, dayId: string): Promise<void> {
  const [day] = await transaction
    .select({ id: days.id })
    .from(days)
    .where(and(eq(days.id, dayId), eq(days.tripId, tripId)));

  if (!day) {
    throw new Error("Day not found");
  }
}

async function getEventTripId(eventId: string): Promise<string> {
  const [event] = await db.select({ tripId: events.tripId }).from(events).where(eq(events.id, eventId));
  if (!event) throw new Error("Event not found");
  return event.tripId;
}

async function getAppendPosition(executor: PositionExecutor, dayId: string): Promise<number> {
  const [{ maxEvt }] = await executor
    .select({ maxEvt: max(events.position) })
    .from(events)
    .where(eq(events.dayId, dayId));
  const [{ maxNote }] = await executor
    .select({ maxNote: max(itineraryNotes.position) })
    .from(itineraryNotes)
    .where(eq(itineraryNotes.dayId, dayId));
  const [{ maxCl }] = await executor
    .select({ maxCl: max(itineraryChecklists.position) })
    .from(itineraryChecklists)
    .where(eq(itineraryChecklists.dayId, dayId));
  return Math.max(maxEvt ?? -1, maxNote ?? -1, maxCl ?? -1) + 1;
}

async function shiftItemsAtOrAbove(executor: PositionExecutor, dayId: string, fromPosition: number): Promise<void> {
  await executor
    .update(events)
    .set({ position: sql`${events.position} + 1` })
    .where(and(eq(events.dayId, dayId), gte(events.position, fromPosition)));
  await executor
    .update(itineraryNotes)
    .set({ position: sql`${itineraryNotes.position} + 1` })
    .where(and(eq(itineraryNotes.dayId, dayId), gte(itineraryNotes.position, fromPosition)));
  await executor
    .update(itineraryChecklists)
    .set({ position: sql`${itineraryChecklists.position} + 1` })
    .where(and(eq(itineraryChecklists.dayId, dayId), gte(itineraryChecklists.position, fromPosition)));
}

async function getChecklistDayId(checklistId: string): Promise<string> {
  const [cl] = await db
    .select({ dayId: itineraryChecklists.dayId })
    .from(itineraryChecklists)
    .where(eq(itineraryChecklists.id, checklistId));
  if (!cl) throw new Error("Checklist not found");
  return cl.dayId;
}

async function getChecklistItemIds(itemId: string): Promise<{ checklistId: string; tripId: string }> {
  const [item] = await db
    .select({ checklistId: checklistItems.checklistId })
    .from(checklistItems)
    .where(eq(checklistItems.id, itemId));
  if (!item) throw new Error("Checklist item not found");
  const dayId = await getChecklistDayId(item.checklistId);
  const tripId = await getDayTripId(dayId);
  return { checklistId: item.checklistId, tripId };
}

export async function createEvent(dayId: string, input: CreateEventInput): Promise<void> {
  const user = await requireUser();
  const tripId = await getDayTripId(dayId);
  await assertTripAccess(tripId, user.id!, "editor");

  const values = {
    dayId,
    tripId,
    name: input.name,
    startAt: input.startAt ? new Date(input.startAt) : undefined,
    endAt: input.endAt ? new Date(input.endAt) : undefined,
    locationName: input.locationName,
    locationAddress: input.locationAddress,
    locationLat: input.locationLat,
    locationLng: input.locationLng,
    confirmationNumber: input.confirmationNumber,
    note: input.note,
  };

  await db.transaction(async (transaction) => {
    await lockTripForUpdate(transaction, tripId);
    await assertDayExistsInTrip(transaction, tripId, dayId);

    if (input.afterEventId) {
      const [refEvent] = await transaction
        .select({ position: events.position })
        .from(events)
        .where(and(eq(events.id, input.afterEventId), eq(events.dayId, dayId)));

      if (refEvent) {
        const insertPos = refEvent.position + 1;
        await shiftItemsAtOrAbove(transaction, dayId, insertPos);
        await transaction.insert(events).values({ ...values, position: insertPos });
        return;
      }
    }

    if (input.insertAtPosition !== undefined) {
      await shiftItemsAtOrAbove(transaction, dayId, input.insertAtPosition);
      await transaction.insert(events).values({ ...values, position: input.insertAtPosition });
      return;
    }

    const appendPos = await getAppendPosition(transaction, dayId);
    await transaction.insert(events).values({ ...values, position: appendPos });
  });

  revalidatePath(`/trips/${tripId}`);
}

export async function updateEvent(eventId: string, patch: UpdateEventPatch): Promise<void> {
  const user = await requireUser();
  const tripId = await getEventTripId(eventId);
  await assertTripAccess(tripId, user.id!, "editor");
  await db
    .update(events)
    .set({
      ...patch,
      startAt: patch.startAt ? new Date(patch.startAt) : null,
      endAt: patch.endAt ? new Date(patch.endAt) : null,
      locationName: patch.locationName ?? null,
      locationAddress: patch.locationAddress ?? null,
      locationLat: patch.locationLat ?? null,
      locationLng: patch.locationLng ?? null,
      updatedAt: new Date(),
    })
    .where(eq(events.id, eventId));
  revalidatePath(`/trips/${tripId}`);
}

export async function deleteEvent(eventId: string): Promise<void> {
  const user = await requireUser();
  const tripId = await getEventTripId(eventId);
  await assertTripAccess(tripId, user.id!, "editor");

  const eventDocs = await db.select({ url: documents.url }).from(documents).where(eq(documents.eventId, eventId));

  await db.delete(events).where(eq(events.id, eventId));

  const urlsToCleanup = eventDocs.map((document) => document.url).filter((url): url is string => !!url);
  if (urlsToCleanup.length > 0) {
    await Promise.all(
      urlsToCleanup.map((url) =>
        getStorageAdapter()
          .del(url)
          .catch((error) => console.warn(`Cleanup failed for ${url}`, error))
      )
    );
  }

  revalidatePath(`/trips/${tripId}`);
}

export async function deleteEventWithDocDecision(eventId: string, keepDocs: boolean): Promise<void> {
  const user = await requireUser();
  const tripId = await getEventTripId(eventId);
  await assertTripAccess(tripId, user.id!, "editor");

  let urlsToCleanup: string[] = [];

  await db.transaction(async (tx) => {
    if (keepDocs) {
      await tx.update(documents).set({ eventId: null }).where(eq(documents.eventId, eventId));
    } else {
      const eventDocs = await tx.select().from(documents).where(eq(documents.eventId, eventId));
      urlsToCleanup = eventDocs.map((document) => document.url).filter((url): url is string => !!url);
      await tx.delete(documents).where(eq(documents.eventId, eventId));
    }
    await tx.delete(events).where(eq(events.id, eventId));
  });

  if (urlsToCleanup.length > 0) {
    await Promise.all(
      urlsToCleanup.map((url) =>
        getStorageAdapter()
          .del(url)
          .catch((error) => console.warn(`Cleanup failed for ${url}`, error))
      )
    );
  }

  revalidatePath(`/trips/${tripId}`);
}

export async function reorderDayItems(input: ReorderDayItemsInput): Promise<void> {
  const user = await requireUser();
  const tripId = await getDayTripId(input.dayId);
  await assertTripAccess(tripId, user.id!, "editor");
  await db.transaction(async (tx) => {
    await lockTripForUpdate(tx, tripId);

    const [currentEvents, currentNotes, currentChecklists] = await Promise.all([
      tx.select({ id: events.id }).from(events).where(eq(events.dayId, input.dayId)),
      tx.select({ id: itineraryNotes.id }).from(itineraryNotes).where(eq(itineraryNotes.dayId, input.dayId)),
      tx
        .select({ id: itineraryChecklists.id })
        .from(itineraryChecklists)
        .where(eq(itineraryChecklists.dayId, input.dayId)),
    ]);

    const currentItemKeys = new Set([
      ...currentEvents.map((event) => buildDayItemKey("event", event.id)),
      ...currentNotes.map((note) => buildDayItemKey("note", note.id)),
      ...currentChecklists.map((checklist) => buildDayItemKey("checklist", checklist.id)),
    ]);
    const submittedItemKeys = new Set(input.orderedItems.map((item) => buildDayItemKey(item.type, item.id)));

    if (
      currentItemKeys.size !== submittedItemKeys.size ||
      [...currentItemKeys].some((itemKey) => !submittedItemKeys.has(itemKey))
    ) {
      throw new Error(CONCURRENT_MODIFICATION_ERROR);
    }

    for (let i = 0; i < input.orderedItems.length; i++) {
      const item = input.orderedItems[i];
      if (item.type === "event") {
        await tx
          .update(events)
          .set({ position: i })
          .where(and(eq(events.id, item.id), eq(events.dayId, input.dayId)));
      } else if (item.type === "note") {
        await tx
          .update(itineraryNotes)
          .set({ position: i })
          .where(and(eq(itineraryNotes.id, item.id), eq(itineraryNotes.dayId, input.dayId)));
      } else {
        await tx
          .update(itineraryChecklists)
          .set({ position: i })
          .where(and(eq(itineraryChecklists.id, item.id), eq(itineraryChecklists.dayId, input.dayId)));
      }
    }
  });
  revalidatePath(`/trips/${tripId}`);
}

export async function updateDay(dayId: string, patch: UpdateDayPatch): Promise<void> {
  const user = await requireUser();
  const tripId = await getDayTripId(dayId);
  await assertTripAccess(tripId, user.id!, "editor");
  await db.update(days).set(patch).where(eq(days.id, dayId));
  revalidatePath(`/trips/${tripId}`);
}

export async function addDay(tripId: string): Promise<void> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");

  await db.transaction(async (transaction) => {
    await lockTripForUpdate(transaction, tripId);

    const [trip] = await transaction.select({ startDate: trips.startDate }).from(trips).where(eq(trips.id, tripId));
    if (!trip) {
      throw new Error("Trip not found.");
    }
    const allDays = await transaction.select().from(days).where(eq(days.tripId, tripId)).orderBy(asc(days.dayNumber));
    const lastDay = allDays.at(-1);
    if (!lastDay) {
      throw new Error("Unable to add a day because this trip has no days.");
    }
    if (allDays.length >= MAX_TRIP_DAYS) {
      throw new Error("Max trip length is 45 days. Please shorten your date range.");
    }
    if (allDays.some((day, index) => day.dayNumber !== index + 1)) {
      throw new Error("Unable to add a day because the itinerary day order is inconsistent.");
    }
    const appendedDayNumber = lastDay.dayNumber + 1;
    if (trip?.startDate && lastDay.date) {
      const appendedDate = nextCalendarDate(lastDay.date);
      await transaction.insert(days).values({
        tripId,
        dayNumber: appendedDayNumber,
        date: appendedDate,
        label: `Day ${appendedDayNumber}`,
      });
      await transaction.update(trips).set({ endDate: appendedDate, updatedAt: new Date() }).where(eq(trips.id, tripId));
    } else {
      await transaction.insert(days).values({
        tripId,
        dayNumber: appendedDayNumber,
        date: null,
        label: `Day ${appendedDayNumber}`,
      });
    }
  });

  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/trips");
}

export async function removeLastDay(tripId: string, confirmedDestructiveRemoval = false): Promise<RemoveLastDayResult> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");

  let eventDocuments: { url: string | null }[] = [];
  let result: RemoveLastDayResult = { status: "removed" };
  await db.transaction(async (transaction) => {
    await lockTripForUpdate(transaction, tripId);

    const scheduledDays = await transaction
      .select()
      .from(days)
      .where(eq(days.tripId, tripId))
      .orderBy(asc(days.dayNumber));
    const lastDay = scheduledDays.at(-1);
    if (!lastDay) {
      throw new Error("Unable to remove a day because this itinerary has no scheduled days.");
    }
    const dayEvents = await transaction.select({ id: events.id }).from(events).where(eq(events.dayId, lastDay.id));
    const dayNotes = await transaction
      .select({ id: itineraryNotes.id })
      .from(itineraryNotes)
      .where(eq(itineraryNotes.dayId, lastDay.id));
    const dayChecklists = await transaction
      .select({ id: itineraryChecklists.id })
      .from(itineraryChecklists)
      .where(eq(itineraryChecklists.dayId, lastDay.id));
    eventDocuments =
      dayEvents.length > 0
        ? await transaction
            .select({ url: documents.url })
            .from(documents)
            .where(
              inArray(
                documents.eventId,
                dayEvents.map((event) => event.id)
              )
            )
        : [];
    const hasPlannedContent = dayEvents.length > 0 || dayNotes.length > 0 || dayChecklists.length > 0;
    if (scheduledDays.length === 1) {
      throw new Error("Cannot remove the only remaining day.");
    }
    if (!confirmedDestructiveRemoval && hasPlannedContent) {
      result = { status: "confirmation-required", hasPlannedContent: true };
      return;
    }
    await transaction.delete(days).where(eq(days.id, lastDay.id));
    const precedingDay = scheduledDays.at(-2);
    if (precedingDay?.date) {
      await transaction
        .update(trips)
        .set({ endDate: precedingDay.date, updatedAt: new Date() })
        .where(eq(trips.id, tripId));
    }
  });
  if (result.status === "confirmation-required") return result;

  const urlsToCleanup = eventDocuments.map((document) => document.url).filter((url): url is string => !!url);
  if (urlsToCleanup.length > 0) {
    await Promise.all(
      urlsToCleanup.map((url) =>
        getStorageAdapter()
          .del(url)
          .catch((error) => console.warn(`Cleanup failed for ${url}`, error))
      )
    );
  }

  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/trips");
  return result;
}

export async function setTripCoverWithAttribution(
  tripId: string,
  coverImageUrl: string,
  coverPhotographer?: string | null,
  coverPhotographerUrl?: string | null
): Promise<void> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");
  await db
    .update(trips)
    .set({
      coverImageUrl,
      coverPhotographer: coverPhotographer ?? null,
      coverPhotographerUrl: coverPhotographerUrl ?? null,
    })
    .where(eq(trips.id, tripId));
  revalidatePath(`/trips/${tripId}`);
}

export async function removeTripCover(tripId: string): Promise<void> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");

  await db.transaction(async (transaction) => {
    await lockTripForUpdate(transaction, tripId);

    const [trip] = await transaction.select({ name: trips.name }).from(trips).where(eq(trips.id, tripId)).limit(1);
    if (!trip) throw new Error("Trip not found");

    await transaction
      .update(trips)
      .set({
        coverImageUrl: deriveGraphicCover(trip.name),
        coverPhotographer: null,
        coverPhotographerUrl: null,
      })
      .where(eq(trips.id, tripId));
  });

  revalidatePath(`/trips/${tripId}`);
}

export async function uploadDocument(tripId: string, formData: FormData): Promise<void> {
  return uploadTripDocumentAction(tripId, formData);
}

export async function addDocument(input: AddDocumentInput): Promise<void> {
  const user = await requireUser();
  const tripId = input.tripId ?? (input.eventId ? await getEventTripId(input.eventId) : null);
  if (!tripId) throw new Error("tripId or eventId required");
  await assertTripAccess(tripId, user.id!, "editor");
  await db.insert(documents).values({
    tripId: input.tripId,
    eventId: input.eventId,
    name: input.name,
    kind: input.kind,
    size: input.size,
    url: input.url,
  });
  revalidatePath(`/trips/${tripId}`);
}

export async function createNote(dayId: string, content: string, insertAtPosition?: number): Promise<void> {
  const user = await requireUser();
  const tripId = await getDayTripId(dayId);
  await assertTripAccess(tripId, user.id!, "editor");

  await db.transaction(async (transaction) => {
    await lockTripForUpdate(transaction, tripId);
    await assertDayExistsInTrip(transaction, tripId, dayId);

    if (insertAtPosition !== undefined) {
      await shiftItemsAtOrAbove(transaction, dayId, insertAtPosition);
      await transaction.insert(itineraryNotes).values({ dayId, content, position: insertAtPosition });
      return;
    }

    const appendPos = await getAppendPosition(transaction, dayId);
    await transaction.insert(itineraryNotes).values({ dayId, content, position: appendPos });
  });

  revalidatePath(`/trips/${tripId}`);
}

export async function updateNote(noteId: string, content: string): Promise<void> {
  const user = await requireUser();
  const [note] = await db.select().from(itineraryNotes).where(eq(itineraryNotes.id, noteId));
  if (!note) return;
  const tripId = await getDayTripId(note.dayId);
  await assertTripAccess(tripId, user.id!, "editor");
  await db.update(itineraryNotes).set({ content, updatedAt: new Date() }).where(eq(itineraryNotes.id, noteId));
  revalidatePath(`/trips/${tripId}`);
}

export async function deleteNote(noteId: string): Promise<void> {
  const user = await requireUser();
  const [note] = await db.select().from(itineraryNotes).where(eq(itineraryNotes.id, noteId));
  if (!note) return;
  const tripId = await getDayTripId(note.dayId);
  await assertTripAccess(tripId, user.id!, "editor");
  await db.delete(itineraryNotes).where(eq(itineraryNotes.id, noteId));
  revalidatePath(`/trips/${tripId}`);
}

export async function createTripNote(tripId: string, input: CreateTripNoteInput): Promise<void> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");

  const title = input.title?.trim() || undefined;
  const body = input.body?.trim() || undefined;
  if (!title && !body) {
    throw new Error("Note is blank");
  }

  await db.transaction(async (transaction) => {
    await lockTripForUpdate(transaction, tripId);
    await transaction
      .update(notes)
      .set({ position: sql`${notes.position} + 1` })
      .where(eq(notes.tripId, tripId));
    await transaction.insert(notes).values({ tripId, position: 0, title, body });
  });

  revalidatePath(`/trips/${tripId}`);
}

export async function updateTripNote(noteId: string, input: UpdateTripNoteInput): Promise<void> {
  const user = await requireUser();
  const [note] = await db.select({ tripId: notes.tripId }).from(notes).where(eq(notes.id, noteId));
  if (!note) return;

  const tripId = note.tripId;
  await assertTripAccess(tripId, user.id!, "editor");

  const title = typeof input.title === "string" ? input.title.trim() || null : undefined;
  const body = typeof input.body === "string" ? input.body.trim() || null : undefined;
  if (!title && !body) {
    throw new Error("Note is blank");
  }

  const updateValues: { title?: string | null; body?: string | null; updatedAt: Date } = {
    updatedAt: new Date(),
  };
  if (title !== undefined) updateValues.title = title;
  if (body !== undefined) updateValues.body = body;

  await db.update(notes).set(updateValues).where(eq(notes.id, noteId));
  revalidatePath(`/trips/${tripId}`);
}

export async function deleteTripNote(noteId: string): Promise<void> {
  const user = await requireUser();
  const [note] = await db.select({ tripId: notes.tripId }).from(notes).where(eq(notes.id, noteId));
  if (!note) return;

  await assertTripAccess(note.tripId, user.id!, "editor");
  await db.delete(notes).where(eq(notes.id, noteId));
  revalidatePath(`/trips/${note.tripId}`);
}

export async function reorderTripNotes(input: ReorderTripNotesInput): Promise<void> {
  const user = await requireUser();
  await assertTripAccess(input.tripId, user.id!, "editor");

  await db.transaction(async (tx) => {
    await lockTripForUpdate(tx, input.tripId);

    const currentNotes = await tx.select({ id: notes.id }).from(notes).where(eq(notes.tripId, input.tripId));
    const submittedIds = new Set(input.orderedNoteIds);
    const isValid =
      input.orderedNoteIds.length === currentNotes.length &&
      submittedIds.size === input.orderedNoteIds.length &&
      currentNotes.every((note) => submittedIds.has(note.id));

    if (!isValid) {
      throw new Error(CONCURRENT_MODIFICATION_ERROR);
    }

    for (let index = 0; index < input.orderedNoteIds.length; index++) {
      await tx
        .update(notes)
        .set({ position: index })
        .where(and(eq(notes.id, input.orderedNoteIds[index]), eq(notes.tripId, input.tripId)));
    }
  });

  revalidatePath(`/trips/${input.tripId}`);
}

export async function createChecklist(dayId: string, insertAtPosition: number): Promise<void> {
  const user = await requireUser();
  const tripId = await getDayTripId(dayId);
  await assertTripAccess(tripId, user.id!, "editor");

  await db.transaction(async (transaction) => {
    await lockTripForUpdate(transaction, tripId);
    await assertDayExistsInTrip(transaction, tripId, dayId);
    await shiftItemsAtOrAbove(transaction, dayId, insertAtPosition);
    await transaction.insert(itineraryChecklists).values({ dayId, position: insertAtPosition });
  });

  revalidatePath(`/trips/${tripId}`);
}

export async function createChecklistWithItem(
  dayId: string,
  insertAtPosition: number,
  firstItemContent: string
): Promise<string> {
  const user = await requireUser();
  const tripId = await getDayTripId(dayId);
  await assertTripAccess(tripId, user.id!, "editor");

  const checklistId = await db.transaction(async (transaction) => {
    await lockTripForUpdate(transaction, tripId);
    await assertDayExistsInTrip(transaction, tripId, dayId);
    await shiftItemsAtOrAbove(transaction, dayId, insertAtPosition);

    const [newChecklist] = await transaction
      .insert(itineraryChecklists)
      .values({ dayId, position: insertAtPosition })
      .returning({ id: itineraryChecklists.id });
    await transaction.insert(checklistItems).values({ checklistId: newChecklist.id, content: firstItemContent });

    return newChecklist.id;
  });

  revalidatePath(`/trips/${tripId}`);
  return checklistId;
}

export async function updateChecklistTitle(checklistId: string, title: string | undefined): Promise<void> {
  const user = await requireUser();
  const dayId = await getChecklistDayId(checklistId);
  const tripId = await getDayTripId(dayId);
  await assertTripAccess(tripId, user.id!, "editor");
  await db
    .update(itineraryChecklists)
    .set({ title: title ?? null, updatedAt: new Date() })
    .where(eq(itineraryChecklists.id, checklistId));
  revalidatePath(`/trips/${tripId}`);
}

export async function deleteChecklist(checklistId: string): Promise<void> {
  const user = await requireUser();
  const dayId = await getChecklistDayId(checklistId);
  const tripId = await getDayTripId(dayId);
  await assertTripAccess(tripId, user.id!, "editor");
  await db.delete(itineraryChecklists).where(eq(itineraryChecklists.id, checklistId));
  revalidatePath(`/trips/${tripId}`);
}

export async function createChecklistItem(checklistId: string, content: string): Promise<void> {
  const user = await requireUser();
  const dayId = await getChecklistDayId(checklistId);
  const tripId = await getDayTripId(dayId);
  await assertTripAccess(tripId, user.id!, "editor");
  await db.insert(checklistItems).values({ checklistId, content });
  revalidatePath(`/trips/${tripId}`);
}

export async function updateChecklistItem(itemId: string, content: string): Promise<void> {
  const user = await requireUser();
  const { tripId } = await getChecklistItemIds(itemId);
  await assertTripAccess(tripId, user.id!, "editor");
  await db.update(checklistItems).set({ content }).where(eq(checklistItems.id, itemId));
  revalidatePath(`/trips/${tripId}`);
}

export async function toggleChecklistItem(itemId: string): Promise<void> {
  const user = await requireUser();
  const { tripId } = await getChecklistItemIds(itemId);
  await assertTripAccess(tripId, user.id!, "editor");
  await db
    .update(checklistItems)
    .set({ isChecked: sql`NOT ${checklistItems.isChecked}` })
    .where(eq(checklistItems.id, itemId));
  revalidatePath(`/trips/${tripId}`);
}

export async function deleteChecklistItem(itemId: string): Promise<void> {
  const user = await requireUser();
  const { tripId } = await getChecklistItemIds(itemId);
  await assertTripAccess(tripId, user.id!, "editor");
  await db.delete(checklistItems).where(eq(checklistItems.id, itemId));
  revalidatePath(`/trips/${tripId}`);
}

export async function removeDocument(docId: string): Promise<void> {
  const user = await requireUser();
  const [doc] = await db.select().from(documents).where(eq(documents.id, docId));
  if (!doc) return;
  const tripId = doc.tripId ?? (doc.eventId ? await getEventTripId(doc.eventId) : null);
  if (!tripId) return;
  await assertTripAccess(tripId, user.id!, "editor");
  if (doc.url) {
    await getStorageAdapter()
      .del(doc.url)
      .catch((error) => console.warn(`Cleanup failed for ${doc.url}`, error));
  }
  await db.delete(documents).where(eq(documents.id, docId));
  revalidatePath(`/trips/${tripId}`);
}

export async function renameDocument(docId: string, newName: string): Promise<void> {
  const user = await requireUser();
  const [doc] = await db.select().from(documents).where(eq(documents.id, docId));
  if (!doc) return;
  const tripId = doc.tripId ?? (doc.eventId ? await getEventTripId(doc.eventId) : null);
  if (!tripId) return;
  await assertTripAccess(tripId, user.id!, "editor");
  await db.update(documents).set({ name: newName }).where(eq(documents.id, docId));
  revalidatePath(`/trips/${tripId}`);
}

export async function attachTripDocToEvent(docId: string, eventId: string): Promise<void> {
  const user = await requireUser();
  const tripId = await getEventTripId(eventId);
  await assertTripAccess(tripId, user.id!, "editor");
  await db.update(documents).set({ eventId }).where(eq(documents.id, docId));
  revalidatePath(`/trips/${tripId}`);
}

export async function promoteEventDocToTrip(docId: string): Promise<void> {
  const user = await requireUser();
  const [doc] = await db.select().from(documents).where(eq(documents.id, docId));
  if (!doc) return;
  const tripId = doc.tripId ?? (doc.eventId ? await getEventTripId(doc.eventId) : null);
  if (!tripId) return;
  await assertTripAccess(tripId, user.id!, "editor");
  await db.update(documents).set({ eventId: null }).where(eq(documents.id, docId));
  revalidatePath(`/trips/${tripId}`);
}

export async function addChecklistFromPackingSource(
  tripId: string,
  dayId: string,
  position: number,
  sourceType: "packing-list" | "template",
  sourceId: string
): Promise<string> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");
  const actualTripId = await getDayTripId(dayId);
  if (actualTripId !== tripId) {
    throw new Error("Day does not belong to this trip");
  }

  let sourceName: string;
  let itemTexts: string[];

  if (sourceType === "packing-list") {
    const [list] = await db
      .select({ name: tripPackingLists.name, tripId: tripPackingLists.tripId })
      .from(tripPackingLists)
      .where(eq(tripPackingLists.id, sourceId));
    if (!list || list.tripId !== tripId) throw new Error("Packing list not found");
    sourceName = list.name;

    const items = await db
      .select({ name: packingItems.name })
      .from(packingItems)
      .where(and(eq(packingItems.listId, sourceId), eq(packingItems.isLabel, false)))
      .orderBy(asc(packingItems.position));
    itemTexts = items.map((item) => item.name);
  } else {
    const [template] = await db
      .select({ name: packingTemplates.name, userId: packingTemplates.userId })
      .from(packingTemplates)
      .where(eq(packingTemplates.id, sourceId));
    if (!template || template.userId !== user.id!) throw new Error("Template not found");
    sourceName = template.name;

    const items = await db
      .select({ text: packingTemplateItems.text })
      .from(packingTemplateItems)
      .where(and(eq(packingTemplateItems.templateId, sourceId), eq(packingTemplateItems.isLabel, false)))
      .orderBy(asc(packingTemplateItems.position));
    itemTexts = items.map((item) => item.text);
  }

  const checklistId = await db.transaction(async (tx) => {
    await lockTripForUpdate(tx, tripId);
    await assertDayExistsInTrip(tx, tripId, dayId);
    await shiftItemsAtOrAbove(tx, dayId, position);

    const [newChecklist] = await tx
      .insert(itineraryChecklists)
      .values({ dayId, position, title: sourceName })
      .returning({ id: itineraryChecklists.id });
    if (!newChecklist) throw new Error("Failed to create checklist");

    if (itemTexts.length > 0) {
      await tx.insert(checklistItems).values(itemTexts.map((content) => ({ checklistId: newChecklist.id, content })));
    }

    return newChecklist.id;
  });

  revalidatePath(`/trips/${tripId}`);
  return checklistId;
}

export async function uploadDocumentToEvent(eventId: string, formData: FormData): Promise<void> {
  return uploadEventDocumentAction(eventId, formData);
}

export async function uploadCoverImage(tripId: string, formData: FormData): Promise<string> {
  return uploadCoverImageAction(tripId, formData);
}
