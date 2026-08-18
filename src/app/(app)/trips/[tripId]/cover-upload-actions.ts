"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { trips } from "@/db/schema";
import { assertTripAccess, requireUser } from "@/lib/auth-helpers";
import { getStorageAdapter } from "@/lib/storage/storage-adapter";
import { assertValidCoverUpload, createUploadStorageName } from "@/lib/upload-policy";

export async function uploadCoverImage(tripId: string, formData: FormData): Promise<string> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");

  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("No file provided");

  assertValidCoverUpload(file);

  const storageName = createUploadStorageName("trip-cover", tripId, file.type);
  let url: string;
  let uploadedUrl: string | null = null;
  try {
    const existing = await db
      .select({ coverImageUrl: trips.coverImageUrl })
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);
    const previousUrl = existing[0]?.coverImageUrl;

    url = await getStorageAdapter().put(storageName, file);
    uploadedUrl = url;

    await db
      .update(trips)
      .set({ coverImageUrl: url, coverPhotographer: null, coverPhotographerUrl: null })
      .where(eq(trips.id, tripId));

    if (previousUrl) {
      try {
        await getStorageAdapter().del(previousUrl);
      } catch (error) {
        console.warn(`Cleanup failed for ${previousUrl}`, error);
      }
    }
  } catch (error) {
    if (uploadedUrl) {
      await getStorageAdapter()
        .del(uploadedUrl)
        .catch(() => {});
    }

    throw error;
  }

  revalidatePath(`/trips/${tripId}`);
  return url;
}
