// Validates and materializes the dev seed world (src/db/seed-data/index.ts) into the database. The CLI
// entry point is src/db/seed.ts (`npm run db:seed`); the world itself is documented in
// docs/dev-seed-data.md.
import type { db as liveDb } from "./index";
import { deleteSeedAccounts, insertInvitations, insertShares, insertUsers } from "./seed-inserts-accounts";
import { insertTrip } from "./seed-inserts-trip";
import type { SeedWorld } from "./seed-data/seed-types";

export interface SeedSummary {
  userCount: number;
  tripCount: number;
  shareCount: number;
  invitationCount: number;
}

/** Pure structural validation — throws with a specific message on the first problem found. No DB access. */
export function validateSeedWorld(world: SeedWorld): void {
  const userKeys = new Set(world.users.map((seedUser) => seedUser.key));
  const emails = new Set<string>();
  for (const seedUser of world.users) {
    if (emails.has(seedUser.email)) throw new Error(`Duplicate seed user email: "${seedUser.email}".`);
    emails.add(seedUser.email);
  }

  if (!world.trips.some((trip) => trip.startOffsetDays === null && trip.endOffsetDays === null)) {
    throw new Error(
      "Seed world must include at least one trip with no dates (startOffsetDays/endOffsetDays both null)."
    );
  }

  const tripKeys = new Set<string>();
  for (const trip of world.trips) {
    if (tripKeys.has(trip.key)) throw new Error(`Duplicate trip key: "${trip.key}".`);
    tripKeys.add(trip.key);

    if (!userKeys.has(trip.ownerKey)) {
      throw new Error(`Trip "${trip.key}" has unknown ownerKey "${trip.ownerKey}".`);
    }
    if ((trip.startOffsetDays === null) !== (trip.endOffsetDays === null)) {
      throw new Error(`Trip "${trip.key}" must have both startOffsetDays and endOffsetDays null, or neither.`);
    }

    validateTripDays(trip.key, trip.days ?? []);
    validateTripEvents(trip.key, trip.events ?? [], trip.days ?? []);
    validateTripPackingItems(trip.key, trip.packingItems ?? []);
  }

  for (const share of world.shares) {
    if (!tripKeys.has(share.tripKey)) throw new Error(`Share references unknown trip key "${share.tripKey}".`);
    if (!userKeys.has(share.userKey)) throw new Error(`Share references unknown user key "${share.userKey}".`);
    const trip = world.trips.find((candidate) => candidate.key === share.tripKey)!;
    if (trip.ownerKey === share.userKey) {
      throw new Error(`Trip "${share.tripKey}" cannot be shared with its own owner ("${share.userKey}").`);
    }
  }

  const pendingInvitationKeys = new Set<string>();
  for (const invitation of world.invitations) {
    if (!tripKeys.has(invitation.tripKey))
      throw new Error(`Invitation references unknown trip key "${invitation.tripKey}".`);
    if (!userKeys.has(invitation.invitedByUserKey)) {
      throw new Error(`Invitation references unknown invitedByUserKey "${invitation.invitedByUserKey}".`);
    }
    if (invitation.status === "pending") {
      const dedupeKey = `${invitation.tripKey}:${invitation.email.toLowerCase()}`;
      if (pendingInvitationKeys.has(dedupeKey)) {
        throw new Error(`Duplicate pending invitation for "${invitation.email}" on trip "${invitation.tripKey}".`);
      }
      pendingInvitationKeys.add(dedupeKey);
    }
  }
}

function validateTripDays(tripKey: string, seedDays: { dayNumber: number }[]): void {
  const dayNumbers = new Set<number>();
  for (const day of seedDays) {
    if (dayNumbers.has(day.dayNumber)) {
      throw new Error(`Trip "${tripKey}" has duplicate dayNumber ${day.dayNumber}.`);
    }
    dayNumbers.add(day.dayNumber);
  }
}

function validateTripEvents(
  tripKey: string,
  seedEvents: { dayNumber: number | null; position: number }[],
  seedDays: { dayNumber: number }[]
): void {
  const dayNumbers = new Set(seedDays.map((day) => day.dayNumber));
  const positionsByGroup = new Map<string, Set<number>>();

  for (const event of seedEvents) {
    if (event.dayNumber != null && !dayNumbers.has(event.dayNumber)) {
      throw new Error(`Trip "${tripKey}" has an event on missing day ${event.dayNumber}.`);
    }

    const groupKey = event.dayNumber != null ? String(event.dayNumber) : "unscheduled";
    const positions = positionsByGroup.get(groupKey) ?? new Set<number>();
    if (positions.has(event.position)) {
      throw new Error(`Trip "${tripKey}" has duplicate event position ${event.position} in group "${groupKey}".`);
    }
    positions.add(event.position);
    positionsByGroup.set(groupKey, positions);
  }
}

function validateTripPackingItems(
  tripKey: string,
  packingItems: { name: string; isLabel: boolean; under?: string; listKey?: string }[]
): void {
  const labelNamesByList = new Set(
    packingItems.filter((item) => item.isLabel).map((item) => `${item.listKey ?? ""} ${item.name}`)
  );
  for (const item of packingItems) {
    if (item.under && !labelNamesByList.has(`${item.listKey ?? ""} ${item.under}`)) {
      throw new Error(
        `Trip "${tripKey}" packing item "${item.name}" is under unknown label "${item.under}" in list "${item.listKey ?? ""}".`
      );
    }
  }
}

export async function seedDevDatabase(
  world: SeedWorld,
  database: typeof liveDb,
  now: Date = new Date()
): Promise<SeedSummary> {
  validateSeedWorld(world);

  return database.transaction(async (tx) => {
    await deleteSeedAccounts(
      tx,
      world.users.map((seedUser) => seedUser.email)
    );

    const usersByKey = await insertUsers(tx, world.users);

    const tripIdsByKey = new Map<string, string>();
    for (const trip of world.trips) {
      const owner = usersByKey.get(trip.ownerKey)!;
      const tripId = await insertTrip(tx, trip, owner.id, owner, now);
      tripIdsByKey.set(trip.key, tripId);
    }

    await insertShares(tx, world.shares, tripIdsByKey, usersByKey);
    await insertInvitations(tx, world.invitations, tripIdsByKey, usersByKey, now);

    return {
      userCount: usersByKey.size,
      tripCount: tripIdsByKey.size,
      shareCount: world.shares.length,
      invitationCount: world.invitations.length,
    };
  });
}
