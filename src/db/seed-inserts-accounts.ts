// Account-level insert helpers for the dev seed: users + their profile sub-rows, plus the sharing graph
// (collaborator shares and invitations) laid on top of already-inserted trips. Orchestrated by
// src/db/seed-runner.ts. Trip/day/event insert logic lives in src/db/seed-inserts-trip.ts.
import { inArray } from "drizzle-orm";
import bcrypt from "bcryptjs";
import type { db as liveDb } from "./index";
import {
  collaborators,
  invitations,
  userCompanions,
  userLoyaltyNumbers,
  users,
  userWishlistDestinations,
} from "./schema";
import type { SeedInvitation, SeedShare, SeedUser } from "./seed-data/seed-types";

// Structural, not `typeof liveDb` — a `db.transaction(async (tx) => ...)` callback's `tx` is a
// `PgTransaction`, which lacks `liveDb`'s `$client` property and so isn't assignable to `typeof liveDb`.
// Every insert helper here only calls `.insert()`/`.delete()`, both of which `tx` and `liveDb` implement
// identically, so this picks just what's used and accepts either.
export type SeedDb = Pick<typeof liveDb, "insert" | "delete">;

export interface SeedUserRecord {
  id: string;
  email: string;
  name: string;
  initials: string;
  currency: string;
}

export const SEED_PASSWORD = "demo1234";

export async function deleteSeedAccounts(database: SeedDb, emails: string[]): Promise<void> {
  // Cascades: owned trips → days/events/documents/reservations/expenses/packing/notes/collaborators, and
  // any invitation this account sent (invitedBy → users, onDelete cascade). A collaborator/invitation row
  // keyed by a seed email on a *surviving* trip (owned by an account outside this list) is left alone —
  // our world never shares between a seed account and a non-seed one, so this can't orphan a share.
  await database.delete(users).where(inArray(users.email, emails));
}

export async function insertUsers(database: SeedDb, seedUsers: SeedUser[]): Promise<Map<string, SeedUserRecord>> {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  const recordsByKey = new Map<string, SeedUserRecord>();

  for (const seedUser of seedUsers) {
    const [row] = await database
      .insert(users)
      .values({
        email: seedUser.email,
        name: seedUser.name,
        passwordHash,
        currency: seedUser.currency,
        dateFormat: seedUser.dateFormat,
        defaultCoverType: seedUser.defaultCoverType ?? null,
        warningThreshold: seedUser.warningThreshold ?? 80,
        dangerThreshold: seedUser.dangerThreshold ?? 90,
        passportNumber: seedUser.passportNumber ?? null,
        passportNationality: seedUser.passportNationality ?? null,
        knownTravelerNumber: seedUser.knownTravelerNumber ?? null,
      })
      .returning({ id: users.id, email: users.email, name: users.name });

    if (seedUser.loyaltyNumbers?.length) {
      await database
        .insert(userLoyaltyNumbers)
        .values(seedUser.loyaltyNumbers.map((loyaltyNumber) => ({ userId: row.id, ...loyaltyNumber })));
    }
    if (seedUser.wishlistDestinations?.length) {
      await database
        .insert(userWishlistDestinations)
        .values(seedUser.wishlistDestinations.map((destination) => ({ userId: row.id, ...destination })));
    }
    if (seedUser.companions?.length) {
      await database
        .insert(userCompanions)
        .values(seedUser.companions.map((companion) => ({ userId: row.id, ...companion })));
    }

    recordsByKey.set(seedUser.key, {
      id: row.id,
      email: row.email!,
      name: row.name!,
      initials: seedUser.initials,
      currency: seedUser.currency,
    });
  }

  return recordsByKey;
}

export async function insertShares(
  database: SeedDb,
  shares: SeedShare[],
  tripIdsByKey: Map<string, string>,
  usersByKey: Map<string, SeedUserRecord>
): Promise<void> {
  for (const share of shares) {
    const tripId = tripIdsByKey.get(share.tripKey)!;
    const user = usersByKey.get(share.userKey)!;
    await database.insert(collaborators).values({
      tripId,
      userId: user.id,
      email: user.email,
      name: user.name,
      initials: user.initials,
      role: share.role,
      isCreator: false,
    });
  }
}

export async function insertInvitations(
  database: SeedDb,
  invitationSeeds: SeedInvitation[],
  tripIdsByKey: Map<string, string>,
  usersByKey: Map<string, SeedUserRecord>,
  now: Date
): Promise<void> {
  for (const invitation of invitationSeeds) {
    const tripId = tripIdsByKey.get(invitation.tripKey)!;
    const invitedBy = usersByKey.get(invitation.invitedByUserKey)!;
    const expiresAt = new Date(now.getTime() + invitation.expiresInHours * 60 * 60 * 1000);
    await database.insert(invitations).values({
      tripId,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt,
      invitedBy: invitedBy.id,
    });
  }
}
