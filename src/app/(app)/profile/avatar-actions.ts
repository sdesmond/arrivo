"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth-helpers";
import { AvatarImageError, processAvatarImage } from "@/lib/avatar-image";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getStorageAdapter } from "@/lib/storage/storage-adapter";
import { assertValidAvatarUpload, createUploadStorageName } from "@/lib/upload-policy";

// Expected failures (bad type, too big, unreadable) come back as values: a thrown action error loses its message in production.
export type AvatarActionResult = { ok: true; image: string | null } | { ok: false; error: string };

const UPLOAD_RATE_LIMITED_MESSAGE = "Too many uploads. Try again in a minute.";

// Sets the user's image and returns the one it replaced. The row is locked first, so overlapping swaps queue and each
// one replaces (and later deletes) the file the previous one saved; reading the old URL outside the lock let two
// uploads see the same one and orphan the other's file.
async function swapImage(userId: string, nextUrl: string | null): Promise<string | null> {
  return db.transaction(async (transaction) => {
    const [row] = await transaction
      .select({ image: users.image })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .for("update");
    await transaction.update(users).set({ image: nextUrl }).where(eq(users.id, userId));
    return row?.image ?? null;
  });
}

async function deleteStoredFile(url: string): Promise<void> {
  try {
    await getStorageAdapter().del(url);
  } catch (error) {
    console.warn(`Avatar cleanup failed for ${url}`, error);
  }
}

export async function uploadAvatar(formData: FormData): Promise<AvatarActionResult> {
  const user = await requireUser();
  const userId = user.id!;

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Choose a photo to upload." };

  try {
    assertValidAvatarUpload(file);
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }

  // After validation, so a rejected file costs nothing; before the decode, which is the expensive part.
  if (checkRateLimit("avatarUpload", userId, RATE_LIMITS.avatarUpload).limited) {
    return { ok: false, error: UPLOAD_RATE_LIMITED_MESSAGE };
  }

  let processed: Buffer;
  try {
    processed = await processAvatarImage(Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    if (error instanceof AvatarImageError) return { ok: false, error: error.message };
    throw error;
  }

  const storageName = createUploadStorageName("user-avatar", userId, "image/webp");
  const avatarFile = new File([new Uint8Array(processed)], "avatar.webp", { type: "image/webp" });
  const url = await getStorageAdapter().put(storageName, avatarFile);

  let previousUrl: string | null;
  try {
    previousUrl = await swapImage(userId, url);
  } catch (error) {
    await deleteStoredFile(url);
    throw error;
  }

  if (previousUrl) await deleteStoredFile(previousUrl);

  revalidatePath("/", "layout");
  return { ok: true, image: url };
}

export async function removeAvatar(): Promise<AvatarActionResult> {
  const user = await requireUser();
  const userId = user.id!;

  const previousUrl = await swapImage(userId, null);
  if (previousUrl) await deleteStoredFile(previousUrl);

  revalidatePath("/", "layout");
  return { ok: true, image: null };
}
