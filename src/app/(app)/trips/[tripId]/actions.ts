"use server";

import { requireUser, assertTripAccess } from "@/lib/auth-helpers";
import { db } from "@/db";
import { events, days, documents } from "@/db/schema";
import { eq, and, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type {
  CreateEventInput, UpdateEventPatch, ReorderEventsInput,
  UpdateDayPatch, AddDocumentInput,
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

export async function createEvent(dayId: string, input: CreateEventInput) {
  const user = await requireUser();
  const tripId = await getDayTripId(dayId);
  await assertTripAccess(tripId, user.id!, "editor");
  const [{ maxPos }] = await db
    .select({ maxPos: max(events.position) })
    .from(events)
    .where(eq(events.dayId, dayId));
  await db.insert(events).values({
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
    position: (maxPos ?? -1) + 1,
  });
  revalidatePath(`/trips/${tripId}`);
}

export async function updateEvent(eventId: string, patch: UpdateEventPatch) {
  const user = await requireUser();
  const tripId = await getEventTripId(eventId);
  await assertTripAccess(tripId, user.id!, "editor");
  await db.update(events).set({
    ...patch,
    startAt: patch.startAt ? new Date(patch.startAt) : undefined,
    endAt: patch.endAt ? new Date(patch.endAt) : undefined,
    cost: patch.cost?.toString(),
    updatedAt: new Date(),
  }).where(eq(events.id, eventId));
  revalidatePath(`/trips/${tripId}`);
}

export async function deleteEvent(eventId: string) {
  const user = await requireUser();
  const tripId = await getEventTripId(eventId);
  await assertTripAccess(tripId, user.id!, "editor");
  await db.delete(events).where(eq(events.id, eventId));
  revalidatePath(`/trips/${tripId}`);
}

export async function reorderEvents(input: ReorderEventsInput) {
  const user = await requireUser();
  const tripId = await getDayTripId(input.dayId);
  await assertTripAccess(tripId, user.id!, "editor");
  await db.transaction(async (tx) => {
    for (let i = 0; i < input.orderedEventIds.length; i++) {
      await tx
        .update(events)
        .set({ position: i })
        .where(and(eq(events.id, input.orderedEventIds[i]), eq(events.dayId, input.dayId)));
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

export async function addDocument(input: AddDocumentInput) {
  const user = await requireUser();
  const tripId = input.tripId ?? (input.eventId
    ? (await getEventTripId(input.eventId))
    : null);
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

export async function removeDocument(docId: string) {
  const user = await requireUser();
  const [doc] = await db.select().from(documents).where(eq(documents.id, docId));
  if (!doc) return;
  const tripId = doc.tripId ?? (doc.eventId ? await getEventTripId(doc.eventId) : null);
  if (!tripId) return;
  await assertTripAccess(tripId, user.id!, "editor");
  await db.delete(documents).where(eq(documents.id, docId));
  revalidatePath(`/trips/${tripId}`);
}
