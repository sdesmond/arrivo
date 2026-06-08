"use server";

import { requireUser, assertTripAccess } from "@/lib/auth-helpers";
import { db } from "@/db";
import { events, days, documents, itineraryNotes, itineraryChecklists, checklistItems, trips } from "@/db/schema";
import { eq, and, max, gte, sql, isNull, asc, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { del, put } from "@vercel/blob";
import { saveLocalUpload, isBlobUploadUrl } from "@/lib/local-upload";
import { inferDocKind, formatFileSize, MAX_COVER_IMAGE_UPLOAD_BYTES, MAX_UPLOAD_BYTES } from "@/lib/utils";
import type {
  CreateEventInput,
  UpdateEventPatch,
  ReorderDayItemsInput,
  UpdateDayPatch,
  AddDocumentInput,
  RemoveLastDayResult,
} from "@/data/types";

const MAX_TRIP_DAYS = 45;
const CONCURRENT_MODIFICATION_ERROR = "CONCURRENT_MODIFICATION";

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

async function getEventTripId(eventId: string): Promise<string> {
  const [event] = await db.select({ tripId: events.tripId }).from(events).where(eq(events.id, eventId));
  if (!event) throw new Error("Event not found");
  return event.tripId;
}

async function getAppendPosition(dayId: string): Promise<number> {
  const [{ maxEvt }] = await db
    .select({ maxEvt: max(events.position) })
    .from(events)
    .where(eq(events.dayId, dayId));
  const [{ maxNote }] = await db
    .select({ maxNote: max(itineraryNotes.position) })
    .from(itineraryNotes)
    .where(eq(itineraryNotes.dayId, dayId));
  const [{ maxCl }] = await db
    .select({ maxCl: max(itineraryChecklists.position) })
    .from(itineraryChecklists)
    .where(eq(itineraryChecklists.dayId, dayId));
  return Math.max(maxEvt ?? -1, maxNote ?? -1, maxCl ?? -1) + 1;
}

async function shiftItemsAtOrAbove(dayId: string, fromPosition: number): Promise<void> {
  await db
    .update(events)
    .set({ position: sql`${events.position} + 1` })
    .where(and(eq(events.dayId, dayId), gte(events.position, fromPosition)));
  await db
    .update(itineraryNotes)
    .set({ position: sql`${itineraryNotes.position} + 1` })
    .where(and(eq(itineraryNotes.dayId, dayId), gte(itineraryNotes.position, fromPosition)));
  await db
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
    cost: input.cost?.toString(),
    confirmationNumber: input.confirmationNumber,
    note: input.note,
  };

  if (input.afterEventId) {
    const [refEvent] = await db
      .select({ position: events.position })
      .from(events)
      .where(and(eq(events.id, input.afterEventId), eq(events.dayId, dayId)));

    if (refEvent) {
      const insertPos = refEvent.position + 1;
      await shiftItemsAtOrAbove(dayId, insertPos);
      await db.insert(events).values({ ...values, position: insertPos });
      revalidatePath(`/trips/${tripId}`);
      return;
    }
  }

  if (input.insertAtPosition !== undefined) {
    await shiftItemsAtOrAbove(dayId, input.insertAtPosition);
    await db.insert(events).values({ ...values, position: input.insertAtPosition });
    revalidatePath(`/trips/${tripId}`);
    return;
  }

  const appendPos = await getAppendPosition(dayId);
  await db.insert(events).values({ ...values, position: appendPos });
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
      cost: patch.cost !== undefined ? patch.cost.toString() : null,
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
  if (urlsToCleanup.length > 0 && process.env.UPLOAD_STUB !== "true") {
    await Promise.all(
      urlsToCleanup.map((url) => del(url).catch((err) => console.warn(`Blob cleanup failed for ${url}`, err)))
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

  if (urlsToCleanup.length > 0 && process.env.UPLOAD_STUB !== "true") {
    await Promise.all(
      urlsToCleanup.map((url) => del(url).catch((err) => console.warn(`Blob cleanup failed for ${url}`, err)))
    );
  }

  revalidatePath(`/trips/${tripId}`);
}

export async function reorderDayItems(input: ReorderDayItemsInput): Promise<void> {
  const user = await requireUser();
  const tripId = await getDayTripId(input.dayId);
  await assertTripAccess(tripId, user.id!, "editor");
  await db.transaction(async (tx) => {
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
    const [trip] = await transaction.select({ startDate: trips.startDate }).from(trips).where(eq(trips.id, tripId));
    const scheduledDays = await transaction
      .select()
      .from(days)
      .where(eq(days.tripId, tripId))
      .orderBy(asc(days.dayNumber));
    const lastDay = scheduledDays.at(-1);
    if (!trip?.startDate || !lastDay?.date) {
      throw new Error("Unable to add a day because this itinerary is not scheduled correctly.");
    }
    if (scheduledDays.length >= MAX_TRIP_DAYS) {
      throw new Error("Max trip length is 45 days. Please shorten your date range.");
    }
    if (scheduledDays.some((day, index) => day.dayNumber !== index + 1)) {
      throw new Error("Unable to add a day because the itinerary day order is inconsistent.");
    }
    const appendedDate = nextCalendarDate(lastDay.date);
    const appendedDayNumber = lastDay.dayNumber + 1;
    await transaction.insert(days).values({
      tripId,
      dayNumber: appendedDayNumber,
      date: appendedDate,
      label: `Day ${appendedDayNumber}`,
    });
    await transaction.update(trips).set({ endDate: appendedDate, updatedAt: new Date() }).where(eq(trips.id, tripId));
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
    const removesOnlyDay = scheduledDays.length === 1;
    if (!confirmedDestructiveRemoval && (removesOnlyDay || hasPlannedContent)) {
      result = { status: "confirmation-required", hasPlannedContent, removesOnlyDay };
      return;
    }
    const precedingDay = scheduledDays.at(-2);
    if (!removesOnlyDay && !precedingDay?.date) {
      throw new Error("Unable to remove a day because the itinerary dates are inconsistent.");
    }
    await transaction.delete(days).where(eq(days.id, lastDay.id));
    const dateUpdates = removesOnlyDay
      ? { startDate: null, endDate: null, updatedAt: new Date() }
      : { endDate: precedingDay!.date!, updatedAt: new Date() };
    await transaction.update(trips).set(dateUpdates).where(eq(trips.id, tripId));
  });
  if (result.status === "confirmation-required") return result;

  const urlsToCleanup = eventDocuments.map((document) => document.url).filter((url): url is string => !!url);
  if (urlsToCleanup.length > 0 && process.env.UPLOAD_STUB !== "true") {
    await Promise.all(
      urlsToCleanup.map((url) => del(url).catch((error) => console.warn(`Blob cleanup failed for ${url}`, error)))
    );
  }

  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/trips");
  return result;
}

export async function uploadDocument(tripId: string, formData: FormData): Promise<void> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");

  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("No file provided");

  const name = file.name;
  const kind = inferDocKind(file.type);
  const size = formatFileSize(file.size);

  if (file.size > MAX_UPLOAD_BYTES) throw new Error("File exceeds 25 MB limit");

  let url: string;
  if (process.env.UPLOAD_STUB === "true") {
    url = await saveLocalUpload(file);
  } else {
    const result = await put(name, file, { access: "public" });
    url = result.url;
  }

  await db.insert(documents).values({ tripId, name, kind, size, url });
  revalidatePath(`/trips/${tripId}`);
}

export async function uploadCoverImage(tripId: string, formData: FormData): Promise<string> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");

  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("No file provided");
  if (!file.type.startsWith("image/")) throw new Error("Cover image must be an image");
  if (file.size > MAX_COVER_IMAGE_UPLOAD_BYTES) throw new Error("Cover image exceeds 12 MB limit");

  let url: string;
  let uploadedBlobUrl: string | null = null;
  try {
    const existing = await db
      .select({ coverImageUrl: trips.coverImageUrl })
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);
    const previousUrl = existing[0]?.coverImageUrl;

    if (process.env.UPLOAD_STUB === "true") {
      url = await saveLocalUpload(file);
    } else {
      const result = await put(file.name, file, { access: "public" });
      url = result.url;
      uploadedBlobUrl = result.url;
    }

    await db.update(trips).set({ coverImageUrl: url }).where(eq(trips.id, tripId));

    if (previousUrl && isBlobUploadUrl(previousUrl)) {
      await del(previousUrl).catch((cleanupError) =>
        console.warn(`Blob cleanup failed for previous cover image ${previousUrl}`, cleanupError)
      );
    }
  } catch (error) {
    if (uploadedBlobUrl) {
      await del(uploadedBlobUrl).catch((cleanupError) =>
        console.warn(`Blob cleanup failed for cover image ${uploadedBlobUrl}`, cleanupError)
      );
    }

    throw error;
  }

  revalidatePath(`/trips/${tripId}`);
  return url;
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
    offline: input.offline,
    url: input.url,
  });
  revalidatePath(`/trips/${tripId}`);
}

export async function createNote(dayId: string, content: string, insertAtPosition?: number): Promise<void> {
  const user = await requireUser();
  const tripId = await getDayTripId(dayId);
  await assertTripAccess(tripId, user.id!, "editor");

  if (insertAtPosition !== undefined) {
    await shiftItemsAtOrAbove(dayId, insertAtPosition);
    await db.insert(itineraryNotes).values({ dayId, content, position: insertAtPosition });
  } else {
    const appendPos = await getAppendPosition(dayId);
    await db.insert(itineraryNotes).values({ dayId, content, position: appendPos });
  }
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

export async function createChecklist(dayId: string, insertAtPosition: number): Promise<void> {
  const user = await requireUser();
  const tripId = await getDayTripId(dayId);
  await assertTripAccess(tripId, user.id!, "editor");
  await shiftItemsAtOrAbove(dayId, insertAtPosition);
  await db.insert(itineraryChecklists).values({ dayId, position: insertAtPosition });
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
  await shiftItemsAtOrAbove(dayId, insertAtPosition);
  const [newChecklist] = await db
    .insert(itineraryChecklists)
    .values({ dayId, position: insertAtPosition })
    .returning({ id: itineraryChecklists.id });
  await db.insert(checklistItems).values({ checklistId: newChecklist.id, content: firstItemContent });
  revalidatePath(`/trips/${tripId}`);
  return newChecklist.id;
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
  if (doc.url && process.env.UPLOAD_STUB !== "true") {
    try {
      await del(doc.url);
    } catch (err) {
      console.warn(`Blob cleanup failed for doc ${docId} (${doc.url}); continuing with DB delete`, err);
    }
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

export async function markAllDocsOffline(tripId: string): Promise<void> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");
  await db
    .update(documents)
    .set({ offline: true })
    .where(and(eq(documents.tripId, tripId), isNull(documents.eventId)));
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

export async function uploadDocumentToEvent(eventId: string, formData: FormData): Promise<void> {
  const user = await requireUser();
  const tripId = await getEventTripId(eventId);
  await assertTripAccess(tripId, user.id!, "editor");

  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("No file provided");

  const name = file.name;
  const kind = inferDocKind(file.type);
  const size = formatFileSize(file.size);

  if (file.size > MAX_UPLOAD_BYTES) throw new Error("File exceeds 25 MB limit");

  let url: string;
  if (process.env.UPLOAD_STUB === "true") {
    url = await saveLocalUpload(file);
  } else {
    const result = await put(name, file, { access: "public" });
    url = result.url;
  }

  await db.insert(documents).values({ tripId, eventId, name, kind, size, url });
  revalidatePath(`/trips/${tripId}`);
}
