"use server";

import { requireUser, assertTripAccess } from "@/lib/auth-helpers";
import { db } from "@/db";
import { events, days, documents, itineraryNotes, itineraryChecklists, checklistItems } from "@/db/schema";
import { eq, and, max, gte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { inferDocKind, formatFileSize } from "@/lib/utils";
import type {
  CreateEventInput,
  UpdateEventPatch,
  ReorderDayItemsInput,
  UpdateDayPatch,
  AddDocumentInput,
} from "@/data/types";

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

export async function createEvent(dayId: string, input: CreateEventInput) {
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

export async function updateEvent(eventId: string, patch: UpdateEventPatch) {
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

export async function deleteEvent(eventId: string) {
  const user = await requireUser();
  const tripId = await getEventTripId(eventId);
  await assertTripAccess(tripId, user.id!, "editor");
  await db.delete(events).where(eq(events.id, eventId));
  revalidatePath(`/trips/${tripId}`);
}

export async function reorderDayItems(input: ReorderDayItemsInput) {
  const user = await requireUser();
  const tripId = await getDayTripId(input.dayId);
  await assertTripAccess(tripId, user.id!, "editor");
  await db.transaction(async (tx) => {
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

export async function updateDay(dayId: string, patch: UpdateDayPatch) {
  const user = await requireUser();
  const tripId = await getDayTripId(dayId);
  await assertTripAccess(tripId, user.id!, "editor");
  await db.update(days).set(patch).where(eq(days.id, dayId));
  revalidatePath(`/trips/${tripId}`);
}

export async function uploadDocument(tripId: string, formData: FormData) {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");

  const file = formData.get("file") as File;
  if (!(file instanceof File)) throw new Error("No file provided");

  const name = file.name;
  const kind = inferDocKind(file.type);
  const size = formatFileSize(file.size);

  let url: string;
  if (process.env.UPLOAD_STUB === "true") {
    url = "https://example.com/stub-upload.pdf";
  } else {
    const { put } = await import("@vercel/blob");
    const result = await put(name, file, { access: "public" });
    url = result.url;
  }

  await db.insert(documents).values({ tripId, name, kind, size, url });
  revalidatePath(`/trips/${tripId}`);
}

export async function addDocument(input: AddDocumentInput) {
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

export async function createNote(dayId: string, content: string, insertAtPosition?: number) {
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

export async function updateNote(noteId: string, content: string) {
  const user = await requireUser();
  const [note] = await db.select().from(itineraryNotes).where(eq(itineraryNotes.id, noteId));
  if (!note) return;
  const tripId = await getDayTripId(note.dayId);
  await assertTripAccess(tripId, user.id!, "editor");
  await db.update(itineraryNotes).set({ content, updatedAt: new Date() }).where(eq(itineraryNotes.id, noteId));
  revalidatePath(`/trips/${tripId}`);
}

export async function deleteNote(noteId: string) {
  const user = await requireUser();
  const [note] = await db.select().from(itineraryNotes).where(eq(itineraryNotes.id, noteId));
  if (!note) return;
  const tripId = await getDayTripId(note.dayId);
  await assertTripAccess(tripId, user.id!, "editor");
  await db.delete(itineraryNotes).where(eq(itineraryNotes.id, noteId));
  revalidatePath(`/trips/${tripId}`);
}

export async function createChecklist(dayId: string, insertAtPosition: number) {
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

export async function updateChecklistTitle(checklistId: string, title: string | undefined) {
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

export async function deleteChecklist(checklistId: string) {
  const user = await requireUser();
  const dayId = await getChecklistDayId(checklistId);
  const tripId = await getDayTripId(dayId);
  await assertTripAccess(tripId, user.id!, "editor");
  await db.delete(itineraryChecklists).where(eq(itineraryChecklists.id, checklistId));
  revalidatePath(`/trips/${tripId}`);
}

export async function createChecklistItem(checklistId: string, content: string) {
  const user = await requireUser();
  const dayId = await getChecklistDayId(checklistId);
  const tripId = await getDayTripId(dayId);
  await assertTripAccess(tripId, user.id!, "editor");
  await db.insert(checklistItems).values({ checklistId, content });
  revalidatePath(`/trips/${tripId}`);
}

export async function updateChecklistItem(itemId: string, content: string) {
  const user = await requireUser();
  const { tripId } = await getChecklistItemIds(itemId);
  await assertTripAccess(tripId, user.id!, "editor");
  await db.update(checklistItems).set({ content }).where(eq(checklistItems.id, itemId));
  revalidatePath(`/trips/${tripId}`);
}

export async function toggleChecklistItem(itemId: string) {
  const user = await requireUser();
  const { tripId } = await getChecklistItemIds(itemId);
  await assertTripAccess(tripId, user.id!, "editor");
  await db
    .update(checklistItems)
    .set({ isChecked: sql`NOT ${checklistItems.isChecked}` })
    .where(eq(checklistItems.id, itemId));
  revalidatePath(`/trips/${tripId}`);
}

export async function deleteChecklistItem(itemId: string) {
  const user = await requireUser();
  const { tripId } = await getChecklistItemIds(itemId);
  await assertTripAccess(tripId, user.id!, "editor");
  await db.delete(checklistItems).where(eq(checklistItems.id, itemId));
  revalidatePath(`/trips/${tripId}`);
}

export async function removeDocument(docId: string) {
  const user = await requireUser();
  const [doc] = await db.select().from(documents).where(eq(documents.id, docId));
  if (!doc) return;
  const tripId = doc.tripId ?? (doc.eventId ? await getEventTripId(doc.eventId) : null);
  if (!tripId) return;
  await assertTripAccess(tripId, user.id!, "editor");
  if (doc.url && process.env.UPLOAD_STUB !== "true") {
    try {
      const { del } = await import("@vercel/blob");
      await del(doc.url);
    } catch (err) {
      console.warn(`Blob cleanup failed for doc ${docId} (${doc.url}); continuing with DB delete`, err);
    }
  }
  await db.delete(documents).where(eq(documents.id, docId));
  revalidatePath(`/trips/${tripId}`);
}

export async function renameDocument(docId: string, newName: string) {
  const user = await requireUser();
  const [doc] = await db.select().from(documents).where(eq(documents.id, docId));
  if (!doc) return;
  const tripId = doc.tripId ?? (doc.eventId ? await getEventTripId(doc.eventId) : null);
  if (!tripId) return;
  await assertTripAccess(tripId, user.id!, "editor");
  await db.update(documents).set({ name: newName }).where(eq(documents.id, docId));
  revalidatePath(`/trips/${tripId}`);
}
