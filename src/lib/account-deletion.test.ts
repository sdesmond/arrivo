// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { collaborators, documents, invitations, trips, users } from "@/db/schema";
import { AccountDeletionFailure, CollaboratorRole, TripDeletionAction, UserRole } from "@/data/types";
import type { TripDeletionChoice } from "@/data/types";
import { deleteOwnAccount, type AccountDeletionDatabase } from "./account-deletion";

const dialect = new PgDialect();
const ME = "user-1";

interface Fixture {
  deleter?: { role: string; passwordHash: string | null };
  peerAdmin?: boolean;
  instanceMissing?: boolean;
  userMissing?: boolean;
  ownedTrips?: { id: string; name: string; coverImageUrl: string | null }[];
  members?: {
    id: string;
    tripId: string;
    userId: string | null;
    name: string;
    role: string;
    addedAt: Date | null;
  }[];
  tripDocuments?: { url: string | null }[];
  rescindedInvitations?: { inviteeId: string; tripId: string }[];
  departedMemberships?: { tripId: string }[];
}

interface Write {
  op: "update" | "delete";
  table: unknown;
  set?: unknown;
}

const tableNames = new Map<unknown, string>([
  [users, "users"],
  [trips, "trips"],
  [collaborators, "collaborators"],
  [invitations, "invitations"],
  [documents, "documents"],
]);

// Records lock queries and writes in one ordered log so tests can assert order and that refusals wrote nothing.
function createDatabase(fixture: Fixture = {}) {
  const events: string[] = [];
  const writes: Write[] = [];
  const selectResults = new Map<unknown, unknown[]>([
    [users, [fixture.deleter ?? { role: UserRole.Member, passwordHash: "hash" }]],
    [trips, fixture.ownedTrips ?? []],
    [collaborators, fixture.members ?? []],
    [documents, fixture.tripDocuments ?? []],
  ]);
  const returningResults = new Map<unknown, unknown[]>([
    [invitations, fixture.rescindedInvitations ?? []],
    [collaborators, fixture.departedMemberships ?? []],
  ]);

  function recordWrite(write: Write) {
    events.push(`${write.op}:${tableNames.get(write.table)}`);
    writes.push(write);
    return Object.assign(Promise.resolve(undefined), {
      returning: async () => returningResults.get(write.table) ?? [],
    });
  }

  const transaction = {
    execute: async (query: SQL) => {
      const { sql: text, params } = dialect.sqlToQuery(query);
      if (text.includes("instance_state")) {
        events.push("lock:instance");
        return fixture.instanceMissing ? [] : [{ id: true }];
      }
      if (text.includes("for update")) {
        const target = text.includes('"trips"') ? "trip" : "user";
        events.push(`lock:${target}`);
        return target === "user" && fixture.userMissing ? [] : [{ id: params[0] }];
      }
      events.push("guard");
      return fixture.peerAdmin ? [{ id: "peer" }] : [];
    },
    select: () => ({
      from: (table: unknown) => ({ where: async () => selectResults.get(table) ?? [] }),
    }),
    update: (table: unknown) => ({
      set: (set: unknown) => ({ where: () => recordWrite({ op: "update", table, set }) }),
    }),
    delete: (table: unknown) => ({ where: () => recordWrite({ op: "delete", table }) }),
  };

  let transactions = 0;
  const database = {
    transaction: async (run: (tx: typeof transaction) => Promise<unknown>) => {
      transactions++;
      return run(transaction);
    },
  } as unknown as AccountDeletionDatabase;

  return { database, events, writes, transactionCount: () => transactions };
}

const SOLO_TRIP = { id: "trip-solo", name: "Weekend in Porto", coverImageUrl: "/api/storage/covers/porto.jpg" };
const SHARED_TRIP = { id: "trip-shared", name: "Lisbon Escape", coverImageUrl: null };
const SHARED_TRIP_MEMBERS = [
  {
    id: "collab-me",
    tripId: SHARED_TRIP.id,
    userId: ME,
    name: "Me",
    role: CollaboratorRole.Manager,
    addedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "collab-bo",
    tripId: SHARED_TRIP.id,
    userId: "user-bo",
    name: "Bo",
    role: CollaboratorRole.Editor,
    addedAt: new Date("2026-02-01T00:00:00.000Z"),
  },
  {
    id: "collab-ada",
    tripId: SHARED_TRIP.id,
    userId: "user-ada",
    name: "Ada",
    role: CollaboratorRole.Viewer,
    addedAt: new Date("2026-03-01T00:00:00.000Z"),
  },
];

const adminDeleter = { role: UserRole.Admin, passwordHash: "hash" };

describe("deleteOwnAccount — lock order and last-admin guard", () => {
  it("locks the singleton, then the user, then owned trips, before any write", async () => {
    const { database, events } = createDatabase({ ownedTrips: [SOLO_TRIP, SHARED_TRIP] });

    await deleteOwnAccount(database, ME, []);

    expect(events.slice(0, 4)).toEqual(["lock:instance", "lock:user", "lock:trip", "lock:trip"]);
    expect(events.findIndex((event) => event.startsWith("update:") || event.startsWith("delete:"))).toBeGreaterThan(3);
  });

  it("lets a member delete without consulting the guard", async () => {
    const { database, events } = createDatabase();

    await expect(deleteOwnAccount(database, ME, [])).resolves.toMatchObject({ ok: true });

    expect(events).not.toContain("guard");
    expect(events.slice(0, 2)).toEqual(["lock:instance", "lock:user"]);
  });

  it("lets an admin delete when another completed admin remains", async () => {
    const { database, events } = createDatabase({ deleter: adminDeleter, peerAdmin: true });

    await expect(deleteOwnAccount(database, ME, [])).resolves.toMatchObject({ ok: true });

    expect(events).toContain("guard");
    expect(events.indexOf("guard")).toBeLessThan(events.indexOf("delete:users"));
  });

  it("refuses the last completed admin and writes nothing", async () => {
    const { database, writes, events } = createDatabase({
      deleter: adminDeleter,
      peerAdmin: false,
      ownedTrips: [SHARED_TRIP],
      members: SHARED_TRIP_MEMBERS,
    });

    await expect(deleteOwnAccount(database, ME, [{ tripId: SHARED_TRIP.id, action: "delete" }])).resolves.toEqual({
      ok: false,
      reason: AccountDeletionFailure.LastAdmin,
    });

    expect(writes).toEqual([]);
    expect(events).not.toContain("lock:trip");
  });

  it("skips the guard for an unfinished admin, who is not a completed admin", async () => {
    const { database, events } = createDatabase({ deleter: { role: UserRole.Admin, passwordHash: null } });

    await expect(deleteOwnAccount(database, ME, [])).resolves.toMatchObject({ ok: true });

    expect(events).not.toContain("guard");
  });

  it("lowercases the user id before locking and querying", async () => {
    const { database } = createDatabase();

    await expect(deleteOwnAccount(database, "USER-1", [])).resolves.toMatchObject({ ok: true });
  });

  it("throws when the instance singleton is missing", async () => {
    const { database, writes } = createDatabase({ instanceMissing: true });

    await expect(deleteOwnAccount(database, ME, [])).rejects.toThrow("Instance state not found.");
    expect(writes).toEqual([]);
  });

  it("throws when the user row is gone", async () => {
    const { database, writes } = createDatabase({ userMissing: true });

    await expect(deleteOwnAccount(database, ME, [])).rejects.toThrow("User not found.");
    expect(writes).toEqual([]);
  });

  it("propagates a transaction failure", async () => {
    const failing = {
      transaction: async () => {
        throw new Error("db down");
      },
    } as unknown as AccountDeletionDatabase;

    await expect(deleteOwnAccount(failing, ME, [])).rejects.toThrow("db down");
  });
});

describe("deleteOwnAccount — shared trip handoff", () => {
  it("deletes a trip only the user is on and reports its files", async () => {
    const { database, writes } = createDatabase({
      ownedTrips: [SOLO_TRIP],
      members: [{ ...SHARED_TRIP_MEMBERS[0], tripId: SOLO_TRIP.id }],
      tripDocuments: [{ url: "/api/storage/docs/ticket.pdf" }, { url: null }],
    });

    const result = await deleteOwnAccount(database, ME, []);

    expect(result).toEqual({
      ok: true,
      summary: {
        rescindedInvitations: [],
        transferredTrips: [],
        deletedTripIds: [SOLO_TRIP.id],
        deletedTripMembers: [],
        remainingTripIds: [],
        storageUrls: ["/api/storage/docs/ticket.pdf", SOLO_TRIP.coverImageUrl],
      },
    });
    expect(writes).toContainEqual({ op: "delete", table: trips });
  });

  it("hands a shared trip to the chosen collaborator as manager and creator", async () => {
    const { database, writes } = createDatabase({
      ownedTrips: [SHARED_TRIP],
      members: SHARED_TRIP_MEMBERS,
      departedMemberships: [{ tripId: SHARED_TRIP.id }],
    });
    const choices: TripDeletionChoice[] = [
      { tripId: SHARED_TRIP.id, action: TripDeletionAction.Transfer, newOwnerUserId: "user-ada" },
    ];

    const result = await deleteOwnAccount(database, ME, choices);

    expect(result).toMatchObject({
      ok: true,
      summary: {
        transferredTrips: [[SHARED_TRIP.id, "user-ada"]],
        deletedTripIds: [],
        remainingTripIds: [SHARED_TRIP.id],
        storageUrls: [],
      },
    });
    expect(writes).toContainEqual({ op: "update", table: trips, set: { ownerId: "user-ada" } });
    expect(writes).toContainEqual({
      op: "update",
      table: collaborators,
      set: { role: CollaboratorRole.Manager, isCreator: true },
    });
    expect(writes.some((write) => write.op === "delete" && write.table === trips)).toBe(false);
  });

  it("deletes a shared trip on purpose and lists the other members to notify", async () => {
    const { database } = createDatabase({
      ownedTrips: [SHARED_TRIP],
      members: SHARED_TRIP_MEMBERS,
      tripDocuments: [{ url: "/api/storage/docs/lisbon.pdf" }],
    });

    const result = await deleteOwnAccount(database, ME, [
      { tripId: SHARED_TRIP.id, action: TripDeletionAction.Delete },
    ]);

    expect(result).toMatchObject({
      ok: true,
      summary: {
        deletedTripIds: [SHARED_TRIP.id],
        deletedTripMembers: [
          { tripId: SHARED_TRIP.id, userId: "user-bo" },
          { tripId: SHARED_TRIP.id, userId: "user-ada" },
        ],
        storageUrls: ["/api/storage/docs/lisbon.pdf"],
      },
    });
  });

  it("cancels pending invitations before ownership moves", async () => {
    const { database, events } = createDatabase({
      ownedTrips: [SHARED_TRIP],
      members: SHARED_TRIP_MEMBERS,
      rescindedInvitations: [{ inviteeId: "user-grace", tripId: SHARED_TRIP.id }],
    });

    const result = await deleteOwnAccount(database, ME, [
      { tripId: SHARED_TRIP.id, action: TripDeletionAction.Transfer, newOwnerUserId: "user-bo" },
    ]);

    expect(result).toMatchObject({
      summary: { rescindedInvitations: [{ inviteeId: "user-grace", tripId: SHARED_TRIP.id }] },
    });
    expect(events.indexOf("update:invitations")).toBeGreaterThanOrEqual(0);
    expect(events.indexOf("update:invitations")).toBeLessThan(events.indexOf("update:trips"));
  });

  it("removes the user's collaborator rows and then the user last", async () => {
    const { database, events } = createDatabase();

    await deleteOwnAccount(database, ME, []);

    expect(events.slice(-2)).toEqual(["delete:collaborators", "delete:users"]);
  });

  it.each([
    ["no decision for a shared trip", []],
    [
      "a transfer to someone not on the trip",
      [{ tripId: SHARED_TRIP.id, action: TripDeletionAction.Transfer, newOwnerUserId: "user-stranger" }],
    ],
  ])("returns stale and writes nothing when the choices have %s", async (_label, choices) => {
    const { database, writes } = createDatabase({ ownedTrips: [SHARED_TRIP], members: SHARED_TRIP_MEMBERS });

    await expect(deleteOwnAccount(database, ME, choices as TripDeletionChoice[])).resolves.toEqual({
      ok: false,
      reason: AccountDeletionFailure.Stale,
    });

    expect(writes).toEqual([]);
  });
});
