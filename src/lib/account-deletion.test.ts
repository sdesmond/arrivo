// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { collaborators, documents, invitations, trips, users } from "@/db/schema";
import {
  AccountDeletionFailure,
  AdminDeletionFailure,
  CollaboratorRole,
  TripDeletionAction,
  UserRole,
} from "@/data/types";
import type { AdminDeletionPreview, TripDeletionChoice } from "@/data/types";
import {
  deleteAccountAsAdmin,
  deleteOwnAccount,
  pickSuccessor,
  previewAccountDeletionAsAdmin,
  type AccountDeletionDatabase,
} from "./account-deletion";

const dialect = new PgDialect();
const ME = "user-1";

interface Fixture {
  deleter?: { username?: string; role: string; passwordHash: string | null };
  peerAdmin?: boolean;
  appMissing?: boolean;
  userMissing?: boolean;
  accountRowMissing?: boolean;
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
  /** Admin flow: rows the user lookup returns (actor and target). */
  accounts?: { id: string; username: string; role: string; passwordHash: string | null; sessionVersion: number }[];
  /** Admin flow: successive member reads; the last one repeats. */
  memberReads?: NonNullable<Fixture["members"]>[];
  missingUserIds?: string[];
  failWith?: unknown;
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
  const lockedUsers: string[] = [];
  const lockedTrips: string[] = [];
  let memberReadCount = 0;
  const selectResults = new Map<unknown, unknown[]>([
    [
      users,
      fixture.accountRowMissing
        ? []
        : (fixture.accounts ?? [
            { username: "me", ...(fixture.deleter ?? { role: UserRole.Member, passwordHash: "hash" }) },
          ]),
    ],
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
      if (text.includes("app_state")) {
        events.push("lock:app");
        return fixture.appMissing ? [] : [{ id: true }];
      }
      if (text.includes("for update")) {
        const target = text.includes('"trips"') ? "trip" : "user";
        events.push(`lock:${target}`);
        (target === "trip" ? lockedTrips : lockedUsers).push(String(params[0]));
        if (target === "user" && (fixture.userMissing || fixture.missingUserIds?.includes(String(params[0]))))
          return [];
        return [{ id: params[0] }];
      }
      events.push("guard");
      return fixture.peerAdmin ? [{ id: "peer" }] : [];
    },
    select: () => ({
      from: (table: unknown) => ({
        where: async () => {
          if (table === collaborators && fixture.memberReads) {
            return fixture.memberReads[Math.min(memberReadCount++, fixture.memberReads.length - 1)];
          }
          return selectResults.get(table) ?? [];
        },
      }),
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
      if (fixture.failWith) throw fixture.failWith;
      return run(transaction);
    },
  } as unknown as AccountDeletionDatabase;

  return { database, events, writes, lockedUsers, lockedTrips, transactionCount: () => transactions };
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

    expect(events.slice(0, 4)).toEqual(["lock:app", "lock:user", "lock:trip", "lock:trip"]);
    expect(events.findIndex((event) => event.startsWith("update:") || event.startsWith("delete:"))).toBeGreaterThan(3);
  });

  it("lets a member delete without consulting the guard", async () => {
    const { database, events } = createDatabase();

    await expect(deleteOwnAccount(database, ME, [])).resolves.toMatchObject({ ok: true });

    expect(events).not.toContain("guard");
    expect(events.slice(0, 2)).toEqual(["lock:app", "lock:user"]);
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

  it("throws when the app singleton is missing", async () => {
    const { database, writes } = createDatabase({ appMissing: true });

    await expect(deleteOwnAccount(database, ME, [])).rejects.toThrow("App state not found.");
    expect(writes).toEqual([]);
  });

  it("throws when the user row is gone", async () => {
    const { database, writes } = createDatabase({ userMissing: true });

    await expect(deleteOwnAccount(database, ME, [])).rejects.toThrow("User not found.");
    expect(writes).toEqual([]);
  });

  it("throws when the locked account cannot be read back", async () => {
    const { database, writes } = createDatabase({ accountRowMissing: true });

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
        account: { id: ME, username: "me" },
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

const uuid = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
const ADMIN_ID = uuid("a1");
const TARGET_ID = uuid("b1");
const BO_ID = uuid("c1");
const ADA_ID = uuid("c2");
const CY_ID = uuid("c3");
const ACTOR = { id: ADMIN_ID, sessionVersion: 3 };
const FINGERPRINT_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const adminAccount = {
  id: ADMIN_ID,
  username: "root",
  role: UserRole.Admin,
  passwordHash: "hash",
  sessionVersion: 3,
};
const completedTarget = {
  id: TARGET_ID,
  username: "traveler",
  role: UserRole.Member,
  passwordHash: "hash",
  sessionVersion: 1,
};
const pendingTarget = { ...completedTarget, passwordHash: null };

function member(userId: string | null, role: string, addedAt: string | null, tripId = SHARED_TRIP.id) {
  return {
    id: `collab-${userId ?? "seat"}-${tripId}`,
    tripId,
    userId,
    name: userId ?? "Empty seat",
    role,
    addedAt: addedAt ? new Date(addedAt) : null,
  };
}
const targetSeat = member(TARGET_ID, CollaboratorRole.Manager, "2026-01-01T00:00:00.000Z");

function adminFixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    accounts: [adminAccount, completedTarget],
    peerAdmin: true,
    ownedTrips: [SHARED_TRIP],
    members: [targetSeat, member(BO_ID, CollaboratorRole.Editor, "2026-02-01T00:00:00.000Z")],
    ...overrides,
  };
}

async function previewOf(fixture: Fixture, target = TARGET_ID): Promise<AdminDeletionPreview> {
  const { database } = createDatabase(fixture);
  const result = await previewAccountDeletionAsAdmin(database, ACTOR, target);
  if (!result.ok) throw new Error(`preview refused: ${result.reason}`);
  return result.preview;
}

function withAuthSecret() {
  beforeEach(() => {
    process.env.AUTH_SECRET = "test-secret";
  });
  afterEach(() => {
    delete process.env.AUTH_SECRET;
  });
}

describe("pickSuccessor", () => {
  const manager = (userId: string, addedAt: string | null) => member(userId, CollaboratorRole.Manager, addedAt);
  const editor = (userId: string, addedAt: string | null) => member(userId, CollaboratorRole.Editor, addedAt);

  it.each([
    [
      "a manager over an earlier editor",
      [editor(BO_ID, "2026-01-01T00:00:00.000Z"), manager(ADA_ID, "2026-05-01T00:00:00.000Z")],
      ADA_ID,
    ],
    [
      "the earliest added within a tier",
      [editor(ADA_ID, "2026-03-01T00:00:00.000Z"), editor(BO_ID, "2026-02-01T00:00:00.000Z")],
      BO_ID,
    ],
    [
      "the lower user ID on identical timestamps",
      [manager(ADA_ID, "2026-02-01T00:00:00.000Z"), manager(BO_ID, "2026-02-01T00:00:00.000Z")],
      BO_ID,
    ],
    ["a dated member over an undated one", [manager(BO_ID, null), manager(ADA_ID, "2026-02-01T00:00:00.000Z")], ADA_ID],
  ])("picks %s", (_label, members, expected) => {
    expect(pickSuccessor(members, TARGET_ID)).toBe(expected);
  });

  it("ignores the departing user, viewers and seats without an account", () => {
    const members = [
      manager(TARGET_ID, "2026-01-01T00:00:00.000Z"),
      member(BO_ID, CollaboratorRole.Viewer, "2026-01-02T00:00:00.000Z"),
      member(null, CollaboratorRole.Manager, "2026-01-03T00:00:00.000Z"),
    ];
    expect(pickSuccessor(members, TARGET_ID)).toBeNull();
  });
});

describe("previewAccountDeletionAsAdmin", () => {
  withAuthSecret();

  it("reports aggregate counts and an opaque fingerprint, writing nothing", async () => {
    const { database, writes } = createDatabase(adminFixture({ ownedTrips: [SHARED_TRIP, SOLO_TRIP] }));

    const result = await previewAccountDeletionAsAdmin(database, ACTOR, TARGET_ID);

    expect(result).toEqual({
      ok: true,
      preview: {
        userId: TARGET_ID,
        username: "traveler",
        setupComplete: true,
        transferredTripCount: 1,
        deletedTripCount: 1,
        fingerprint: expect.stringMatching(FINGERPRINT_PATTERN),
      },
    });
    expect(writes).toEqual([]);
    const serialized = JSON.stringify(result);
    for (const privateValue of [SHARED_TRIP.id, SHARED_TRIP.name, SOLO_TRIP.name, BO_ID]) {
      expect(serialized).not.toContain(privateValue);
    }
  });

  it("is stable for the same outcomes and bound to the target", async () => {
    const first = await previewOf(adminFixture());
    const second = await previewOf(adminFixture());
    const otherTarget = await previewOf(
      adminFixture({ accounts: [adminAccount, { ...completedTarget, id: CY_ID }], members: [] }),
      CY_ID
    );

    expect(second.fingerprint).toBe(first.fingerprint);
    expect(otherTarget.fingerprint).not.toBe(first.fingerprint);
  });

  it("changes when the successor changes even though the counts do not", async () => {
    const withBo = await previewOf(adminFixture());
    const withAda = await previewOf(
      adminFixture({ members: [targetSeat, member(ADA_ID, CollaboratorRole.Manager, "2026-02-01T00:00:00.000Z")] })
    );

    expect(withAda.transferredTripCount).toBe(withBo.transferredTripCount);
    expect(withAda.fingerprint).not.toBe(withBo.fingerprint);
  });

  it("changes with the secret so a client cannot recompute it", async () => {
    const first = await previewOf(adminFixture());
    process.env.AUTH_SECRET = "another-secret";
    const second = await previewOf(adminFixture());

    expect(second.fingerprint).not.toBe(first.fingerprint);
  });

  it("deletes viewers-only trips and previews a pending account the same way", async () => {
    const viewersOnly = [targetSeat, member(BO_ID, CollaboratorRole.Viewer, "2026-02-01T00:00:00.000Z")];

    const preview = await previewOf(adminFixture({ accounts: [adminAccount, pendingTarget], members: viewersOnly }));

    expect(preview).toMatchObject({ setupComplete: false, transferredTripCount: 0, deletedTripCount: 1 });
  });

  it.each([
    ["not an admin", { ...adminAccount, role: UserRole.Member }],
    ["unfinished", { ...adminAccount, passwordHash: null }],
    ["revoked", { ...adminAccount, sessionVersion: 4 }],
  ])("refuses an actor who is %s", async (_label, actorRow) => {
    const { database } = createDatabase(adminFixture({ accounts: [actorRow, completedTarget] }));

    await expect(previewAccountDeletionAsAdmin(database, ACTOR, TARGET_ID)).resolves.toEqual({
      ok: false,
      reason: AdminDeletionFailure.Forbidden,
    });
  });

  it("refuses without querying when an ID is not a UUID or the session has no version", async () => {
    const { database, events } = createDatabase(adminFixture());

    await expect(previewAccountDeletionAsAdmin(database, ACTOR, "not-a-uuid")).resolves.toEqual({
      ok: false,
      reason: AdminDeletionFailure.Changed,
    });
    await expect(
      previewAccountDeletionAsAdmin(database, { id: "nope", sessionVersion: 3 }, TARGET_ID)
    ).resolves.toEqual({
      ok: false,
      reason: AdminDeletionFailure.Forbidden,
    });
    await expect(
      previewAccountDeletionAsAdmin(database, { id: ADMIN_ID, sessionVersion: undefined }, TARGET_ID)
    ).resolves.toEqual({ ok: false, reason: AdminDeletionFailure.Forbidden });
    expect(events).toEqual([]);
  });

  it.each([
    ["has no row", { accounts: [adminAccount] }],
    ["could not be locked", { missingUserIds: [TARGET_ID] }],
  ])("reports a target that %s as changed, without a preview", async (_label, override) => {
    const { database } = createDatabase(adminFixture(override));

    await expect(previewAccountDeletionAsAdmin(database, ACTOR, TARGET_ID)).resolves.toEqual({
      ok: false,
      reason: AdminDeletionFailure.Changed,
    });
  });

  it("refuses when the app singleton is missing", async () => {
    const { database } = createDatabase(adminFixture({ appMissing: true }));

    await expect(previewAccountDeletionAsAdmin(database, ACTOR, TARGET_ID)).resolves.toEqual({
      ok: false,
      reason: AdminDeletionFailure.AppUnavailable,
    });
  });

  it("refuses the last completed admin as a target before locking any trip", async () => {
    const { database, lockedTrips } = createDatabase(
      adminFixture({ accounts: [adminAccount, { ...completedTarget, role: UserRole.Admin }], peerAdmin: false })
    );

    await expect(previewAccountDeletionAsAdmin(database, ACTOR, TARGET_ID)).resolves.toEqual({
      ok: false,
      reason: AdminDeletionFailure.LastAdmin,
    });
    expect(lockedTrips).toEqual([]);
  });

  it("skips the last-admin guard for a pending admin", async () => {
    const { database } = createDatabase(
      adminFixture({ accounts: [adminAccount, { ...pendingTarget, role: UserRole.Admin }], peerAdmin: false })
    );

    await expect(previewAccountDeletionAsAdmin(database, ACTOR, TARGET_ID)).resolves.toMatchObject({ ok: true });
  });

  it.each(["40P01", "40001"])("maps %s to retry", async (code) => {
    const { database } = createDatabase({ failWith: Object.assign(new Error("lost"), { cause: { code } }) });

    await expect(previewAccountDeletionAsAdmin(database, ACTOR, TARGET_ID)).resolves.toEqual({
      ok: false,
      reason: AdminDeletionFailure.Retry,
    });
  });

  it("rethrows other failures", async () => {
    const { database } = createDatabase({ failWith: new Error("db down") });

    await expect(previewAccountDeletionAsAdmin(database, ACTOR, TARGET_ID)).rejects.toThrow("db down");
  });

  it("throws when AUTH_SECRET is not configured", async () => {
    delete process.env.AUTH_SECRET;
    const { database } = createDatabase(adminFixture());

    await expect(previewAccountDeletionAsAdmin(database, ACTOR, TARGET_ID)).rejects.toThrow(/AUTH_SECRET/);
  });
});

describe("deleteAccountAsAdmin", () => {
  withAuthSecret();

  it("locks the singleton, users in ID order, then trips in ID order, before any write", async () => {
    const fixture = adminFixture({
      ownedTrips: [
        { id: "trip-b", name: "B", coverImageUrl: null },
        { id: "trip-a", name: "A", coverImageUrl: null },
      ],
      members: [
        member(CY_ID, CollaboratorRole.Editor, "2026-02-01T00:00:00.000Z", "trip-a"),
        member(BO_ID, CollaboratorRole.Editor, "2026-02-01T00:00:00.000Z", "trip-b"),
      ],
    });
    const { fingerprint } = await previewOf(fixture);
    const { database, events, lockedUsers, lockedTrips } = createDatabase(fixture);

    await expect(deleteAccountAsAdmin(database, ACTOR, TARGET_ID, fingerprint)).resolves.toMatchObject({ ok: true });

    expect(lockedUsers).toEqual([ADMIN_ID, TARGET_ID, BO_ID, CY_ID]);
    expect(lockedTrips).toEqual(["trip-a", "trip-b"]);
    const firstWrite = events.findIndex((event) => event.startsWith("update:") || event.startsWith("delete:"));
    expect(events.indexOf("lock:app")).toBe(0);
    expect(events.indexOf("lock:user")).toBeLessThan(events.indexOf("lock:trip"));
    expect(events.lastIndexOf("lock:trip")).toBeLessThan(firstWrite);
  });

  it("transfers to the successor as sole creator and manager, then removes the account", async () => {
    const fixture = adminFixture({
      members: [
        targetSeat,
        member(BO_ID, CollaboratorRole.Editor, "2026-01-02T00:00:00.000Z"),
        member(ADA_ID, CollaboratorRole.Manager, "2026-03-01T00:00:00.000Z"),
        member(CY_ID, CollaboratorRole.Viewer, "2026-01-03T00:00:00.000Z"),
      ],
      rescindedInvitations: [{ inviteeId: CY_ID, tripId: SHARED_TRIP.id }],
      departedMemberships: [{ tripId: SHARED_TRIP.id }],
    });
    const { fingerprint } = await previewOf(fixture);
    const { database, writes, events } = createDatabase(fixture);

    const result = await deleteAccountAsAdmin(database, ACTOR, TARGET_ID, fingerprint);

    expect(result).toEqual({
      ok: true,
      setupComplete: true,
      actor: { id: ADMIN_ID, username: "root" },
      summary: {
        rescindedInvitations: [{ inviteeId: CY_ID, tripId: SHARED_TRIP.id }],
        transferredTrips: [[SHARED_TRIP.id, ADA_ID]],
        deletedTripIds: [],
        deletedTripMembers: [],
        remainingTripIds: [SHARED_TRIP.id],
        storageUrls: [],
        account: { id: TARGET_ID, username: "traveler" },
      },
    });
    const creatorWrites = writes.filter(
      (write) => write.table === collaborators && write.set && "isCreator" in (write.set as object)
    );
    expect(creatorWrites.map((write) => write.set)).toEqual([
      { isCreator: false },
      { role: CollaboratorRole.Manager, isCreator: true },
    ]);
    expect(writes).toContainEqual({ op: "update", table: trips, set: { ownerId: ADA_ID } });
    expect(events.indexOf("update:invitations")).toBeLessThan(events.indexOf("update:trips"));
    expect(events.slice(-2)).toEqual(["delete:collaborators", "delete:users"]);
  });

  it("deletes a trip whose other members cannot take over and reports its files and members", async () => {
    const fixture = adminFixture({
      members: [
        targetSeat,
        member(BO_ID, CollaboratorRole.Viewer, "2026-02-01T00:00:00.000Z"),
        member(null, CollaboratorRole.Editor, null),
      ],
      tripDocuments: [{ url: "/api/storage/docs/a.pdf" }],
      ownedTrips: [{ ...SHARED_TRIP, coverImageUrl: "/api/storage/covers/c.jpg" }],
    });
    const { fingerprint } = await previewOf(fixture);
    const { database, writes } = createDatabase(fixture);

    const result = await deleteAccountAsAdmin(database, ACTOR, TARGET_ID, fingerprint);

    expect(result).toMatchObject({
      ok: true,
      summary: {
        transferredTrips: [],
        deletedTripIds: [SHARED_TRIP.id],
        deletedTripMembers: [{ tripId: SHARED_TRIP.id, userId: BO_ID }],
        storageUrls: ["/api/storage/docs/a.pdf", "/api/storage/covers/c.jpg"],
      },
    });
    expect(writes.some((write) => write.op === "delete" && write.table === trips)).toBe(true);
  });

  it("deletes a pending account through the same flow", async () => {
    const fixture = adminFixture({ accounts: [adminAccount, pendingTarget], ownedTrips: [], members: [] });
    const { fingerprint } = await previewOf(fixture);
    const { database, events } = createDatabase(fixture);

    await expect(deleteAccountAsAdmin(database, ACTOR, TARGET_ID, fingerprint)).resolves.toMatchObject({
      ok: true,
      setupComplete: false,
    });
    expect(events.at(-1)).toBe("delete:users");
  });

  it("lets an admin delete themselves under the automatic policy when another admin remains", async () => {
    const fixture = adminFixture({ accounts: [adminAccount], ownedTrips: [], members: [] });
    const { fingerprint } = await previewOf(fixture, ADMIN_ID);
    const { database } = createDatabase(fixture);

    await expect(deleteAccountAsAdmin(database, ACTOR, ADMIN_ID, fingerprint)).resolves.toMatchObject({
      ok: true,
      summary: { account: { id: ADMIN_ID } },
    });
  });

  it("refuses a stale or forged fingerprint with a fresh preview and writes nothing", async () => {
    const reviewed = await previewOf(adminFixture());
    const moved = adminFixture({
      members: [targetSeat, member(ADA_ID, CollaboratorRole.Manager, "2026-02-01T00:00:00.000Z")],
    });
    const current = await previewOf(moved);

    for (const submitted of [reviewed.fingerprint, "forged", ""]) {
      const { database, writes } = createDatabase(moved);
      await expect(deleteAccountAsAdmin(database, ACTOR, TARGET_ID, submitted)).resolves.toEqual({
        ok: false,
        reason: AdminDeletionFailure.Changed,
        preview: current,
      });
      expect(writes).toEqual([]);
    }
  });

  it.each([
    ["the actor lost admin", { accounts: [{ ...adminAccount, role: UserRole.Member }, completedTarget] }, "forbidden"],
    ["the session was revoked", { accounts: [{ ...adminAccount, sessionVersion: 9 }, completedTarget] }, "forbidden"],
    ["the target vanished", { accounts: [adminAccount] }, "changed"],
    [
      "the target became the last admin",
      { accounts: [adminAccount, { ...completedTarget, role: UserRole.Admin }], peerAdmin: false },
      "last-admin",
    ],
  ])("refuses without writes when %s", async (_label, override, reason) => {
    const fixture = adminFixture();
    const { fingerprint } = await previewOf(fixture);
    const { database, writes } = createDatabase({ ...fixture, ...override });

    await expect(deleteAccountAsAdmin(database, ACTOR, TARGET_ID, fingerprint)).resolves.toEqual({
      ok: false,
      reason,
    });
    expect(writes).toEqual([]);
  });

  it("retries in a new transaction when a member outside the locked set appears", async () => {
    const fixture = adminFixture();
    const { fingerprint } = await previewOf(fixture);
    const joined = [...fixture.members!, member(CY_ID, CollaboratorRole.Manager, "2026-01-02T00:00:00.000Z")];
    const { database, writes, transactionCount, lockedUsers } = createDatabase({
      ...fixture,
      memberReads: [fixture.members!, joined, joined, joined],
    });

    const result = await deleteAccountAsAdmin(database, ACTOR, TARGET_ID, fingerprint);

    // The joiner outranks the reviewed successor, so the old confirmation no longer holds.
    expect(result).toMatchObject({ ok: false, reason: AdminDeletionFailure.Changed });
    expect(transactionCount()).toBe(2);
    expect(lockedUsers).toContain(CY_ID);
    expect(writes).toEqual([]);
  });

  it("gives up with retry when the locked set keeps changing", async () => {
    const fixture = adminFixture();
    const { fingerprint } = await previewOf(fixture);
    const reads = [BO_ID, ADA_ID, CY_ID].flatMap((userId) => [
      [targetSeat],
      [targetSeat, member(userId, CollaboratorRole.Editor, "2026-02-01T00:00:00.000Z")],
    ]);
    const { database, writes, transactionCount } = createDatabase({ ...fixture, memberReads: reads });

    await expect(deleteAccountAsAdmin(database, ACTOR, TARGET_ID, fingerprint)).resolves.toEqual({
      ok: false,
      reason: AdminDeletionFailure.Retry,
    });
    expect(transactionCount()).toBe(3);
    expect(writes).toEqual([]);
  });
});
