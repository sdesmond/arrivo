"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth-helpers";
import { AvatarImageError, processAvatarImage } from "@/lib/avatar-image";
import { getStorageAdapter } from "@/lib/storage/storage-adapter";
import { assertValidAvatarUpload, createUploadStorageName } from "@/lib/upload-policy";

// Expected failures (bad type, too big, unreadable) come back as values: a thrown action error loses its message in production.
export type AvatarActionResult = { ok: true; image: string | null } | { ok: false; error: string };

async function readCurrentImage(userId: string): Promise<string | null> {
  const [row] = await db.select({ image: users.image }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.image ?? null;
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

  let processed: Buffer;
  try {
    processed = await processAvatarImage(Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    if (error instanceof AvatarImageError) return { ok: false, error: error.message };
    throw error;
  }

  const previousUrl = await readCurrentImage(userId);
  const storageName = createUploadStorageName("user-avatar", userId, "image/webp");
  const avatarFile = new File([new Uint8Array(processed)], "avatar.webp", { type: "image/webp" });
  const url = await getStorageAdapter().put(storageName, avatarFile);

  try {
    await db.update(users).set({ image: url }).where(eq(users.id, userId));
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

  const previousUrl = await readCurrentImage(userId);
  await db.update(users).set({ image: null }).where(eq(users.id, userId));
  if (previousUrl) await deleteStoredFile(previousUrl);

  revalidatePath("/", "layout");
  return { ok: true, image: null };
}
