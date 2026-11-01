"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { assertTripAccess, requireUser } from "@/lib/auth-helpers";
import { getStorageAdapter } from "@/lib/storage/storage-adapter";
import { resolveOwningTripId } from "@/lib/storage/trip-resolution";
import { recordTripUpdated } from "@/lib/trip-activity";
import { publishTripEvent } from "@/lib/trip-events";
import { formatFileSize, inferDocKind } from "@/lib/utils";
import { assertValidDocumentUpload, createUploadStorageName } from "@/lib/upload-policy";
import { LiveSyncEventType } from "@/data/types";

export async function uploadDocument(tripId: string, formData: FormData): Promise<void> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");

  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("No file provided");

  assertValidDocumentUpload(file);

  const name = file.name;
  const kind = inferDocKind(file.type);
  const size = formatFileSize(file.size);
  const storageName = createUploadStorageName("trip-document", tripId, file.type);
  const url = await getStorageAdapter().put(storageName, file);

  await db.insert(documents).values({ tripId, name, kind, size, url });
  recordTripUpdated(user.id!, tripId);
  publishTripEvent(tripId, { type: LiveSyncEventType.ItineraryChanged, tripId });
  revalidatePath(`/trips/${tripId}`);
}

export async function uploadDocumentToEvent(eventId: string, formData: FormData): Promise<void> {
  const user = await requireUser();

  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("No file provided");

  assertValidDocumentUpload(file);

  const name = file.name;
  const kind = inferDocKind(file.type);
  const size = formatFileSize(file.size);
  const storageName = createUploadStorageName("event-document", eventId, file.type);
  const tripId = await resolveOwningTripId(storageName);
  await assertTripAccess(tripId, user.id!, "editor");

  const url = await getStorageAdapter().put(storageName, file);

  await db.insert(documents).values({ tripId, eventId, name, kind, size, url });
  recordTripUpdated(user.id!, tripId);
  publishTripEvent(tripId, { type: LiveSyncEventType.ItineraryChanged, tripId });
  revalidatePath(`/trips/${tripId}`);
}
