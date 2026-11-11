"use server";

import { recordTripUpdated } from "@/lib/trip-activity";
import { requireUser, assertTripAccess } from "@/lib/auth-helpers";
import { db } from "@/db";
import { events, documents, trips } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getStorageAdapter } from "@/lib/storage/storage-adapter";
import { getContributorsAndInvitations } from "@/lib/queries";
import { resendInvitation } from "@/lib/invitations";
import { deriveGraphicCover } from "@/lib/utils";
import { assertValidCoverImageUrl, assertValidDocumentUrl, assertValidPhotographerUrl } from "@/lib/url-policy";
import { addDocumentSchema, documentNameSchema, parseInput } from "@/lib/validation-schemas";
import { lockTripForUpdate } from "@/lib/server-action-locks";
import { publishTripEvent } from "@/lib/trip-events";
import { LiveSyncEventType } from "@/data/types";
import {
  dismissInvitation,
  rescindInvitation,
  saveContributorChanges as saveContributorChangesAction,
} from "../actions";
import {
  uploadDocument as uploadTripDocumentAction,
  uploadDocumentToEvent as uploadEventDocumentAction,
} from "./document-upload-actions";
import { uploadCoverImage as uploadCoverImageAction } from "./cover-upload-actions";
import type { AddDocumentInput, ContributorChange } from "@/data/types";

export async function getShareDialogData(tripId: string) {
  const user = await requireUser();
  return getContributorsAndInvitations(tripId, user.id!);
}

export async function resendShareInvitation(tripId: string, invitationId: string) {
  const user = await requireUser();
  const result = await resendInvitation(invitationId, tripId, user.id!);
  if (result.status === "success") {
    revalidatePath(`/trips/${tripId}`);
  }
  return result;
}

export async function rescindShareInvitation(tripId: string, invitationId: string) {
  const result = await rescindInvitation(tripId, invitationId);
  if (result.status === "success") {
    revalidatePath(`/trips/${tripId}`);
  }
  return result;
}

export async function dismissShareInvitation(tripId: string, invitationId: string) {
  const result = await dismissInvitation(tripId, invitationId);
  if (result.status === "success") {
    revalidatePath(`/trips/${tripId}`);
  }
  return result;
}

export async function saveContributorChanges(tripId: string, changes: ContributorChange[]) {
  const result = await saveContributorChangesAction(tripId, changes);
  if (result.status === "success") {
    revalidatePath(`/trips/${tripId}`);
  }
  return result;
}

function publishItineraryChanged(tripId: string): void {
  publishTripEvent(tripId, { type: LiveSyncEventType.ItineraryChanged, tripId });
}

async function getEventTripId(eventId: string): Promise<string> {
  const [event] = await db.select({ tripId: events.tripId }).from(events).where(eq(events.id, eventId));
  if (!event) throw new Error("Event not found");
  return event.tripId;
}

export async function setTripCoverWithAttribution(
  tripId: string,
  coverImageUrl: string,
  coverPhotographer?: string | null,
  coverPhotographerUrl?: string | null
): Promise<void> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");
  assertValidCoverImageUrl(coverImageUrl, tripId);
  if (coverPhotographerUrl) assertValidPhotographerUrl(coverPhotographerUrl);
  await db
    .update(trips)
    .set({
      coverImageUrl,
      coverPhotographer: coverPhotographer ?? null,
      coverPhotographerUrl: coverPhotographerUrl ?? null,
    })
    .where(eq(trips.id, tripId));
  recordTripUpdated(user.id!, tripId);
  publishItineraryChanged(tripId);
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

  recordTripUpdated(user.id!, tripId);
  publishItineraryChanged(tripId);
  revalidatePath(`/trips/${tripId}`);
}

export async function uploadDocument(tripId: string, formData: FormData): Promise<void> {
  return uploadTripDocumentAction(tripId, formData);
}

export async function addDocument(rawInput: AddDocumentInput): Promise<void> {
  const user = await requireUser();
  const input = parseInput(addDocumentSchema, rawInput);
  // The event's own trip is authoritative: a caller must not pass access for one trip and attach to another's event.
  const eventTripId = input.eventId ? await getEventTripId(input.eventId) : null;
  if (input.tripId && eventTripId && input.tripId !== eventTripId) {
    throw new Error("Event does not belong to this trip.");
  }
  const tripId = eventTripId ?? input.tripId;
  if (!tripId) throw new Error("tripId or eventId required");
  await assertTripAccess(tripId, user.id!, "editor");
  if (input.url !== undefined) assertValidDocumentUrl(input.url, { tripId, eventId: input.eventId });
  await db.insert(documents).values({
    tripId: input.tripId,
    eventId: input.eventId,
    name: input.name,
    kind: input.kind,
    size: input.size,
    url: input.url,
  });
  recordTripUpdated(user.id!, tripId);
  publishItineraryChanged(tripId);
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
  recordTripUpdated(user.id!, tripId);
  publishItineraryChanged(tripId);
  revalidatePath(`/trips/${tripId}`);
}

export async function renameDocument(docId: string, rawName: string): Promise<void> {
  const user = await requireUser();
  const newName = parseInput(documentNameSchema, rawName);
  const [doc] = await db.select().from(documents).where(eq(documents.id, docId));
  if (!doc) return;
  const tripId = doc.tripId ?? (doc.eventId ? await getEventTripId(doc.eventId) : null);
  if (!tripId) return;
  await assertTripAccess(tripId, user.id!, "editor");
  await db.update(documents).set({ name: newName }).where(eq(documents.id, docId));
  recordTripUpdated(user.id!, tripId);
  publishItineraryChanged(tripId);
  revalidatePath(`/trips/${tripId}`);
}

export async function attachTripDocToEvent(docId: string, eventId: string): Promise<void> {
  const user = await requireUser();
  const tripId = await getEventTripId(eventId);
  await assertTripAccess(tripId, user.id!, "editor");
  // Scope the doc to the event's trip: an editor on one trip must not re-point another trip's document.
  const attached = await db
    .update(documents)
    .set({ eventId })
    .where(and(eq(documents.id, docId), eq(documents.tripId, tripId)))
    .returning({ id: documents.id });
  if (attached.length === 0) throw new Error("Document not found.");
  recordTripUpdated(user.id!, tripId);
  publishItineraryChanged(tripId);
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
  recordTripUpdated(user.id!, tripId);
  publishItineraryChanged(tripId);
  revalidatePath(`/trips/${tripId}`);
}

export async function uploadDocumentToEvent(eventId: string, formData: FormData): Promise<void> {
  return uploadEventDocumentAction(eventId, formData);
}

export async function uploadCoverImage(tripId: string, formData: FormData): Promise<string> {
  return uploadCoverImageAction(tripId, formData);
}
