import "dotenv/config";
import { db } from "./index";
import { DEV_SEED } from "./seed-data";
import { SEED_AVATARS } from "./seed-data/avatars";
import { applySeedAvatars, removeSeedAvatars } from "./seed-avatars";
import { getStorageAdapter } from "../lib/storage/storage-adapter";
import type { StorageAdapter } from "../lib/storage/storage-adapter";
import { SEED_PASSWORD } from "./seed-inserts-accounts";
import { seedDevDatabase } from "./seed-runner";

// Profile photos need the storage folder; without STORAGE_* configured the seed still runs, with initials only.
function getAvatarStorage(): StorageAdapter | null {
  try {
    return getStorageAdapter();
  } catch (error) {
    console.warn(`Skipping seed profile photos: ${(error as Error).message}`);
    return null;
  }
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to run the dev seed with NODE_ENV=production — it wipes and reseeds the seed accounts.");
    process.exit(1);
  }

  console.log("Seeding...");
  const avatarStorage = getAvatarStorage();
  const usernames = DEV_SEED.users.map((seedUser) => seedUser.username);
  if (avatarStorage) await removeSeedAvatars(db, avatarStorage, usernames);
  const summary = await seedDevDatabase(DEV_SEED, db);
  const avatarCount = avatarStorage ? await applySeedAvatars(db, avatarStorage, SEED_AVATARS, DEV_SEED.users) : 0;

  console.log(
    `Done. ${summary.userCount} users, ${summary.tripCount} trips, ${summary.shareCount} shares, ${summary.invitationCount} invitations.`
  );
  if (avatarCount > 0) console.log(`${avatarCount} accounts have a profile photo.`);
  console.log(`All accounts share the password: ${SEED_PASSWORD}`);
  for (const seedUser of DEV_SEED.users) {
    console.log(`  ${seedUser.username}`);
  }
  console.log("See docs/dev-seed-data.md for what each account and trip is for.");
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
