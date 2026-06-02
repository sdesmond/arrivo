import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql, eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import {
  users,
  trips,
  days,
  events,
  collaborators,
  userLoyaltyNumbers,
  userCompanions,
  documents,
} from "../../src/db/schema";
import {
  E2E_USER,
  E2E_TEMPLATE_USER,
  E2E_TRIP,
  E2E_DAYS,
  E2E_LOYALTY_NUMBER,
  E2E_COMPANION,
  E2E_DOCUMENT,
  E2E_PICK_DOC,
  E2E_EVENT,
  E2E_EVENT_KEEP,
  E2E_EVENT_ERASE,
  E2E_KEEP_DOC,
  E2E_ERASE_DOC,
  E2E_EVENT_MANAGE,
  E2E_MANAGE_DOC,
  E2E_EVENT_DELETE,
} from "./e2e-seed-data";

export default async function globalSetup() {
  const client = postgres(process.env.E2E_DATABASE_URL!);
  const db = drizzle(client);

  // Wipe all tables — CASCADE handles FK chain from users → trips → days/events/etc.
  await db.execute(sql`
    TRUNCATE users, accounts, sessions, verification_tokens,
             trips, days, events, documents, collaborators, packing_items, packing_templates, packing_template_items
    CASCADE
  `);

  // Create dedicated E2E user
  const passwordHash = await bcrypt.hash(process.env.E2E_PASSWORD!, 10);
  const [user] = await db
    .insert(users)
    .values({ email: E2E_USER.email, name: E2E_USER.name, passwordHash, dateFormat: "MM/DD/YYYY" })
    .returning();

  await db.insert(users).values({
    email: E2E_TEMPLATE_USER.email,
    name: E2E_TEMPLATE_USER.name,
    passwordHash,
    dateFormat: "MM/DD/YYYY",
  });

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

  // Seed dedicated pick-list document — isolated from E2E_DOCUMENT so
  // pick-list scenarios can attach/reset it without affecting Documents-tab tests.
  await db.insert(documents).values({
    tripId: trip.id,
    ...E2E_PICK_DOC,
  });

  // Seed an event on Day 1 for event-doc integration tests
  const [day1] = await db
    .select({ id: days.id })
    .from(days)
    .where(and(eq(days.tripId, trip.id), eq(days.dayNumber, 1)));
  await db.insert(events).values({
    dayId: day1.id,
    tripId: trip.id,
    name: E2E_EVENT.name,
    position: E2E_EVENT.position,
  });

  // Seed two pre-configured events for Story 3.2 delete-with-docs tests
  const [eKeep] = await db
    .insert(events)
    .values({ dayId: day1.id, tripId: trip.id, name: E2E_EVENT_KEEP.name, position: E2E_EVENT_KEEP.position })
    .returning({ id: events.id });

  const [eErase] = await db
    .insert(events)
    .values({ dayId: day1.id, tripId: trip.id, name: E2E_EVENT_ERASE.name, position: E2E_EVENT_ERASE.position })
    .returning({ id: events.id });

  await db.insert(documents).values({ tripId: trip.id, eventId: eKeep.id, ...E2E_KEEP_DOC });
  await db.insert(documents).values({ tripId: trip.id, eventId: eErase.id, ...E2E_ERASE_DOC });

  // Seed event + doc for event-doc management tests (view, rename, promote)
  const [eManage] = await db
    .insert(events)
    .values({ dayId: day1.id, tripId: trip.id, name: E2E_EVENT_MANAGE.name, position: E2E_EVENT_MANAGE.position })
    .returning({ id: events.id });
  await db.insert(documents).values({ tripId: trip.id, eventId: eManage.id, ...E2E_MANAGE_DOC });

  // Seed event for the day-planning "User deletes an event" scenario — reseeded
  // before the test via @reseed-day-delete so it never depends on createEvent first.
  await db.insert(events).values({ dayId: day1.id, tripId: trip.id, ...E2E_EVENT_DELETE });

  // Insert a loyalty number so Traveler section tests have data to work with
  await db.insert(userLoyaltyNumbers).values({ userId: user.id, ...E2E_LOYALTY_NUMBER });

  // Insert a companion so Companions section tests have data to work with
  await db.insert(userCompanions).values({ userId: user.id, ...E2E_COMPANION });

  await client.end();
}
