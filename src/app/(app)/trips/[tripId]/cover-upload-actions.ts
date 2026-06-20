"use server";

import { eq } from "drizzle-orm";
import { del, put } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { trips } from "@/db/schema";
import { assertTripAccess, requireUser } from "@/lib/auth-helpers";
import { isBlobUploadUrl, saveLocalUpload } from "@/lib/local-upload";
import { assertValidCoverUpload, createUploadStorageName } from "@/lib/upload-policy";

export async function uploadCoverImage(tripId: string, formData: FormData): Promise<string> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");

  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("No file provided");

  assertValidCoverUpload(file);

  const storageName = createUploadStorageName("trip-cover", tripId, file.type);
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
      url = await saveLocalUpload(file, { storageName });
    } else {
      const result = await put(storageName, file, { access: "public" });
      url = result.url;
      uploadedBlobUrl = result.url;
    }

    await db
      .update(trips)
      .set({ coverImageUrl: url, coverPhotographer: null, coverPhotographerUrl: null })
      .where(eq(trips.id, tripId));

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
