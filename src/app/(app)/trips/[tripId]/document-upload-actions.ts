"use server";

import { eq } from "drizzle-orm";
import { put } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { documents, events } from "@/db/schema";
import { assertTripAccess, requireUser } from "@/lib/auth-helpers";
import { saveLocalUpload } from "@/lib/local-upload";
import { assertClientId, formatFileSize, inferDocKind } from "@/lib/utils";
import { assertValidDocumentUpload, createUploadStorageName } from "@/lib/upload-policy";

async function getEventTripId(eventId: string): Promise<string> {
  const [event] = await db.select({ tripId: events.tripId }).from(events).where(eq(events.id, eventId));
  if (!event) throw new Error("Event not found");
  return event.tripId;
}

export async function uploadDocument(tripId: string, formData: FormData, id?: string): Promise<void> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");

  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("No file provided");

  assertValidDocumentUpload(file);

  const name = file.name;
  const kind = inferDocKind(file.type);
  const size = formatFileSize(file.size);
  const storageName = createUploadStorageName("trip-document", tripId, file.type);

  let url: string;
  if (process.env.UPLOAD_STUB === "true") {
    url = await saveLocalUpload(file, { storageName });
  } else {
    const result = await put(storageName, file, { access: "public" });
    url = result.url;
  }

  await db.insert(documents).values({ ...assertClientId(id), tripId, name, kind, size, url });
  revalidatePath(`/trips/${tripId}`);
}

export async function uploadDocumentToEvent(eventId: string, formData: FormData, id?: string): Promise<void> {
  const user = await requireUser();
  const tripId = await getEventTripId(eventId);
  await assertTripAccess(tripId, user.id!, "editor");

  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("No file provided");

  assertValidDocumentUpload(file);

  const name = file.name;
  const kind = inferDocKind(file.type);
  const size = formatFileSize(file.size);
  const storageName = createUploadStorageName("event-document", eventId, file.type);

  let url: string;
  if (process.env.UPLOAD_STUB === "true") {
    url = await saveLocalUpload(file, { storageName });
  } else {
    const result = await put(storageName, file, { access: "public" });
    url = result.url;
  }

  await db.insert(documents).values({ ...assertClientId(id), tripId, eventId, name, kind, size, url });
  revalidatePath(`/trips/${tripId}`);
}
