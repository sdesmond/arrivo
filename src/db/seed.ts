import "dotenv/config";
import { db } from "./index";
import { DEV_SEED } from "./seed-data";
import { SEED_PASSWORD } from "./seed-inserts-accounts";
import { seedDevDatabase } from "./seed-runner";

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to run the dev seed with NODE_ENV=production — it wipes and reseeds the seed accounts.");
    process.exit(1);
  }

  console.log("Seeding...");
  const summary = await seedDevDatabase(DEV_SEED, db);

  console.log(
    `Done. ${summary.userCount} users, ${summary.tripCount} trips, ${summary.shareCount} shares, ${summary.invitationCount} invitations.`
  );
  console.log(`All accounts share the password: ${SEED_PASSWORD}`);
  for (const seedUser of DEV_SEED.users) {
    console.log(`  ${seedUser.email}`);
  }
  console.log("See docs/dev-seed-data.md for what each account and trip is for.");
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
