// Profile photos for the dev seed accounts: files go through the storage adapter (same keys an upload would
// use) and `users.image` points at them. Run by src/db/seed.ts around the account wipe and reinsert.
import { eq, inArray } from "drizzle-orm";
import { createUploadStorageName } from "../lib/upload-policy";
import type { StorageAdapter } from "../lib/storage/storage-adapter";
import type { db as liveDb } from "./index";
import { users } from "./schema";

export type SeedAvatarDb = Pick<typeof liveDb, "select" | "update">;
export type SeedAvatarStorage = Pick<StorageAdapter, "put" | "del">;

/** Deletes the avatar files of seed accounts about to be wiped, so re-seeding doesn't orphan them. */
export async function removeSeedAvatars(
  database: SeedAvatarDb,
  storage: SeedAvatarStorage,
  usernames: string[]
): Promise<number> {
  const rows = await database.select({ image: users.image }).from(users).where(inArray(users.username, usernames));

  let removed = 0;
  for (const { image } of rows) {
    if (!image) continue;
    try {
      await storage.del(image);
      removed++;
    } catch (error) {
      console.warn(`Could not remove old seed avatar ${image}`, error);
    }
  }
  return removed;
}

/** Stores each user's avatar and saves its URL. Returns how many accounts got a photo. */
export async function applySeedAvatars(
  database: SeedAvatarDb,
  storage: SeedAvatarStorage,
  avatarsByKey: Record<string, string>,
  seedUsers: { key: string; username: string }[]
): Promise<number> {
  const withAvatar = seedUsers.filter((seedUser) => avatarsByKey[seedUser.key]);
  if (withAvatar.length === 0) return 0;

  const rows = await database
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(
      inArray(
        users.username,
        withAvatar.map((seedUser) => seedUser.username)
      )
    );
  const idsByUsername = new Map(rows.map((row) => [row.username, row.id]));

  let applied = 0;
  for (const seedUser of withAvatar) {
    const userId = idsByUsername.get(seedUser.username);
    if (!userId) continue;

    const bytes = new Uint8Array(Buffer.from(avatarsByKey[seedUser.key], "base64"));
    const url = await storage.put(
      createUploadStorageName("user-avatar", userId, "image/webp"),
      new File([bytes], "avatar.webp", { type: "image/webp" })
    );
    try {
      await database.update(users).set({ image: url }).where(eq(users.id, userId));
    } catch (error) {
      await storage.del(url).catch(() => {});
      throw error;
    }
    applied++;
  }
  return applied;
}
