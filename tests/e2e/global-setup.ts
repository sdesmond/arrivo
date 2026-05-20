import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { users, trips, days, collaborators, userLoyaltyNumbers, userCompanions, documents } from "../../src/db/schema";
import { E2E_USER, E2E_TRIP, E2E_DAYS, E2E_LOYALTY_NUMBER, E2E_COMPANION, E2E_DOCUMENT } from "./e2e-seed-data";

export default async function globalSetup() {
  const client = postgres(process.env.E2E_DATABASE_URL!);
  const db = drizzle(client);

  // Wipe all tables — CASCADE handles FK chain from users → trips → days/events/etc.
  await db.execute(sql`
    TRUNCATE users, accounts, sessions, verification_tokens,
             trips, days, events, documents, collaborators, packing_items
    CASCADE
  `);

  // Create dedicated E2E user
  const passwordHash = await bcrypt.hash(process.env.E2E_PASSWORD!, 10);
  const [user] = await db
    .insert(users)
    .values({ email: E2E_USER.email, name: E2E_USER.name, passwordHash, dateFormat: "MM/DD/YYYY" })
    .returning();

  // Insert seed trip
  const [trip] = await db
    .insert(trips)
    .values({ ownerId: user.id, ...E2E_TRIP })
    .returning();

  // Collaborator record required by listTripsForUser query (filters by collaborators join)
  await db.insert(collaborators).values({
    tripId: trip.id,
    userId: user.id,
    email: E2E_USER.email,
    name: E2E_USER.name,
    initials: E2E_USER.initials,
    role: "owner",
  });

  // Insert days (no events — tests create and clean up their own)
  for (const day of E2E_DAYS) {
    await db.insert(days).values({ tripId: trip.id, ...day });
  }

  // Seed a trip-level document for E2E document tab tests
  await db.insert(documents).values({
    tripId: trip.id,
    ...E2E_DOCUMENT,
  });

  // Insert a loyalty number so Traveler section tests have data to work with
  await db.insert(userLoyaltyNumbers).values({ userId: user.id, ...E2E_LOYALTY_NUMBER });

  // Insert a companion so Companions section tests have data to work with
  await db.insert(userCompanions).values({ userId: user.id, ...E2E_COMPANION });

  await client.end();
}
