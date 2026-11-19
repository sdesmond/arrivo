// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { collaborators, days, invitations, trips, users } from "@/db/schema";
import type { ContributorChange } from "@/data/types";
import type { DbTransaction } from "./server-action-locks";
import {
  acceptInvitationInTransaction,
  acceptInvitationWrite,
  ContributorChangeGuardError,
  createTripWrite,
  declineInvitationInTransaction,
  deleteOwnMembership,
  describeUnmatchedInvitationInTransaction,
  inviteContributorWrite,
  leaveTripWrite,
  NOT_ON_TRIP_MESSAGE,
  readLeavableMembership,
  saveContributorChangesInTransaction,
  saveContributorChangesWrite,
  type MembershipDatabase,
} from "./membership-writes";

function createDatabase(ownerRows: unknown[]) {
  const inserts: Array<{ table: unknown; values: unknown }> = [];
  const transaction = {
    select: () => ({ from: () => ({ where: () => ({ for: async () => ownerRows }) }) }),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        inserts.push({ table, values });
        return table === trips ? { returning: async () => [{ id: "trip-1" }] } : Promise.resolve();
      },
    }),
  };
  const database = {
    transaction: async (run: (tx: typeof transaction) => Promise<unknown>) => run(transaction),
  } as unknown as MembershipDatabase;
  return { database, inserts };
}

const owner = { id: "owner-1", username: "owner", name: null, currency: null, transitMode: null };

describe("createTripWrite", () => {
  it("inserts trip, creator seat and day rows for the locked owner", async () => {
    const { database, inserts } = createDatabase([owner]);

    const result = await createTripWrite(database, "owner-1", (locked) => ({
      tripValues: { name: "Trip" },
      collaboratorName: locked.username,
      buildDayRows: (tripId) => [
        { tripId, dayNumber: 1, label: "Day 1" },
        { tripId, dayNumber: 2, label: "Day 2" },
      ],
    }));

    expect(result).toEqual({ tripId: "trip-1", ownerId: "owner-1", ownerUsername: "owner" });
    expect(inserts.map((insert) => insert.table)).toEqual([trips, collaborators, days]);
    expect(inserts[0].values).toEqual({ name: "Trip", ownerId: "owner-1" });
    expect(inserts[1].values).toMatchObject({ userId: "owner-1", initials: "OW", role: "manager", isCreator: true });
    expect(inserts[2].values).toHaveLength(2);
  });

  it("accepts a single dateless day row", async () => {
    const { database, inserts } = createDatabase([owner]);

    await createTripWrite(database, "owner-1", () => ({
      tripValues: { name: "Trip" },
      collaboratorName: "Owner",
      buildDayRows: (tripId) => ({ tripId, dayNumber: 1, label: "Day 1" }),
    }));

    expect(inserts[2].values).toEqual({ tripId: "trip-1", dayNumber: 1, label: "Day 1" });
  });

  it("fails without inserting when the owner row is gone", async () => {
    const { database, inserts } = createDatabase([]);

    await expect(
      createTripWrite(database, "owner-1", () => {
        throw new Error("prepare must not run");
      })
    ).rejects.toThrow("Signed-in user could not be resolved before trip creation.");
    expect(inserts).toHaveLength(0);
  });
});

describe("saveContributorChangesWrite locked authority", () => {
  it.each([null, "editor", "viewer"])("refuses absent or demoted actor %s before writes", async (role) => {
    const writes: string[] = [];
    const transaction = {
      execute: async () => [{ id: "trip-1" }],
      select: () => ({
        from: () => ({
          where: async () => [
            ...(role ? [{ id: "actor", userId: "actor", tripId: "trip-1", role, isCreator: false }] : []),
            { id: "target", userId: "target", tripId: "trip-1", role: "viewer", isCreator: false },
          ],
        }),
      }),
      delete: () => ({
        where: async () => {
          writes.push("delete");
        },
      }),
    };
    const database = {
      transaction: async (run: (value: typeof transaction) => Promise<unknown>) => run(transaction),
    } as unknown as MembershipDatabase;
    await expect(
      saveContributorChangesWrite(database, {
        tripId: "trip-1",
        actorId: "actor",
        changes: [{ type: "remove", collaboratorId: "target" }],
      })
    ).rejects.toThrow("You no longer have permission to manage contributors.");
    expect(writes).toEqual([]);
  });

  it("reports a trip deleted before the lock as stale without writing", async () => {
    const transaction = {
      execute: async () => [],
      select: () => {
        throw new Error("must not read collaborators without the trip lock");
      },
    };
    const database = {
      transaction: async (run: (value: typeof transaction) => Promise<unknown>) => run(transaction),
    } as unknown as MembershipDatabase;
    const failure = saveContributorChangesWrite(database, {
      tripId: "trip-1",
      actorId: "actor",
      changes: [{ type: "remove", collaboratorId: "target" }],
    });
    await expect(failure).rejects.toBeInstanceOf(ContributorChangeGuardError);
    await expect(failure).rejects.toMatchObject({
      message: "One or more contributors are no longer on this trip.",
      stale: true,
    });
  });

  it("propagates unexpected lock failures", async () => {
    const transaction = {
      execute: async () => {
        throw new Error("connection reset");
      },
    };
    const database = {
      transaction: async (run: (value: typeof transaction) => Promise<unknown>) => run(transaction),
    } as unknown as MembershipDatabase;
    await expect(
      saveContributorChangesWrite(database, { tripId: "trip-1", actorId: "actor", changes: [] })
    ).rejects.toThrow("connection reset");
  });

  it("applies the batch through the in-transaction writer after locking", async () => {
    const { transaction, operations } = contributorTransaction();
    const database = {
      transaction: async (run: (value: typeof transaction) => Promise<unknown>) => run(transaction),
    } as unknown as MembershipDatabase;
    await expect(
      saveContributorChangesWrite(database, {
        tripId: "trip-1",
        actorId: "manager-1",
        changes: [{ type: "remove", collaboratorId: "collab-editor" }],
      })
    ).resolves.toEqual({
      removedUserIds: ["user-peer"],
      roleChangedUserIds: [],
      tripName: "Test Trip",
      removedByName: "Manager Name",
      removedByUsername: "manager",
    });
    expect(operations.locks).toBe(1);
    expect(operations.deletes).toHaveLength(1);
  });
});

interface ContributorRowFixture {
  id: string;
  tripId: string;
  userId: string | null;
  role: string;
  isCreator: boolean | null;
}

function contributorTransaction({
  collaboratorRows = [{ id: "collab-editor", tripId: "trip-1", userId: "user-peer", role: "editor", isCreator: false }],
  actorRole = "manager",
  remover = { username: "manager", name: "Manager Name" as string | null },
}: {
  collaboratorRows?: ContributorRowFixture[];
  actorRole?: string | null;
  remover?: { username: string; name: string | null };
} = {}) {
  const operations = {
    locks: 0,
    deletes: [] as Array<{ table: unknown }>,
    updates: [] as Array<{ table: unknown; values: unknown }>,
    reads: [] as unknown[],
  };
  const transaction = {
    execute: async () => {
      operations.locks += 1;
      return [{ id: "trip-1" }];
    },
    select: () => ({
      from: (table: unknown) => ({
        where: async () => {
          operations.reads.push(table);
          if (table === collaborators)
            return [
              ...(actorRole && !collaboratorRows.some((row) => row.userId === "manager-1")
                ? [{ id: "manager-seat", tripId: "trip-1", userId: "manager-1", role: actorRole, isCreator: false }]
                : []),
              ...collaboratorRows,
            ];
          if (table === trips) return [{ name: "Test Trip" }];
          if (table === users) return [remover];
          throw new Error("Unexpected table read in contributor fixture.");
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: async () => {
        operations.deletes.push({ table });
      },
    }),
    update: (table: unknown) => ({
      set: (values: unknown) => ({
        where: async () => {
          operations.updates.push({ table, values });
        },
      }),
    }),
  };
  return { transaction, operations };
}

describe("saveContributorChangesInTransaction", () => {
  function run(fixture: Parameters<typeof contributorTransaction>[0], changes: ContributorChange[]) {
    const { transaction, operations } = contributorTransaction(fixture);
    const result = saveContributorChangesInTransaction(transaction as unknown as DbTransaction, {
      tripId: "trip-1",
      actorId: "manager-1",
      changes,
    });
    return { result, operations };
  }

  it("applies a role change and a removal and reports both users for postcommit effects", async () => {
    const { result, operations } = run(
      {
        collaboratorRows: [
          { id: "collab-editor", tripId: "trip-1", userId: "user-peer", role: "editor", isCreator: false },
          { id: "collab-viewer", tripId: "trip-1", userId: "user-viewer", role: "viewer", isCreator: false },
        ],
      },
      [
        { type: "role", collaboratorId: "collab-editor", fromRole: "editor", toRole: "manager" },
        { type: "remove", collaboratorId: "collab-viewer" },
      ]
    );
    await expect(result).resolves.toEqual({
      removedUserIds: ["user-viewer"],
      roleChangedUserIds: ["user-peer"],
      tripName: "Test Trip",
      removedByName: "Manager Name",
      removedByUsername: "manager",
    });
    expect(operations.locks).toBe(0);
    expect(operations.updates).toEqual([{ table: collaborators, values: { role: "manager" } }]);
    expect(operations.deletes).toEqual([{ table: collaborators }]);
  });

  it("reports every removed user in batch order", async () => {
    const { result, operations } = run(
      {
        collaboratorRows: [
          { id: "collab-a", tripId: "trip-1", userId: "user-a", role: "editor", isCreator: false },
          { id: "collab-b", tripId: "trip-1", userId: "user-b", role: "viewer", isCreator: false },
        ],
      },
      [
        { type: "remove", collaboratorId: "collab-a" },
        { type: "remove", collaboratorId: "collab-b" },
      ]
    );
    await expect(result).resolves.toMatchObject({ removedUserIds: ["user-a", "user-b"], roleChangedUserIds: [] });
    expect(operations.deletes).toHaveLength(2);
  });

  it("skips trip and remover lookups for a role-only batch", async () => {
    const { result, operations } = run({}, [
      { type: "role", collaboratorId: "collab-editor", fromRole: "editor", toRole: "viewer" },
    ]);
    await expect(result).resolves.toEqual({
      removedUserIds: [],
      roleChangedUserIds: ["user-peer"],
      tripName: "",
      removedByName: "",
      removedByUsername: "",
    });
    expect(operations.reads).toEqual([collaborators]);
  });

  it("falls back to the remover username when the account has no display name", async () => {
    const { result } = run({ remover: { username: "manager", name: null } }, [
      { type: "remove", collaboratorId: "collab-editor" },
    ]);
    await expect(result).resolves.toMatchObject({ removedByName: "manager", removedByUsername: "manager" });
  });

  it.each([
    ["removal", { type: "remove", collaboratorId: "collab-orphan" } as ContributorChange],
    [
      "role change",
      { type: "role", collaboratorId: "collab-orphan", fromRole: "viewer", toRole: "editor" } as ContributorChange,
    ],
  ])("writes but reports no user for a %s on a collaborator without an account", async (_label, change) => {
    const { result, operations } = run(
      { collaboratorRows: [{ id: "collab-orphan", tripId: "trip-1", userId: null, role: "viewer", isCreator: false }] },
      [change]
    );
    await expect(result).resolves.toMatchObject({ removedUserIds: [], roleChangedUserIds: [] });
    expect(operations.deletes.length + operations.updates.length).toBe(1);
  });

  it.each([null, "editor", "viewer"])("refuses a caller whose locked role is %s before writing", async (actorRole) => {
    const { result, operations } = run({ actorRole }, [{ type: "remove", collaboratorId: "collab-editor" }]);
    await expect(result).rejects.toMatchObject({
      message: "You no longer have permission to manage contributors.",
      stale: true,
    });
    expect(operations.deletes).toEqual([]);
  });

  it.each([
    [
      "creator seat",
      {
        collaboratorRows: [
          { id: "collab-creator", tripId: "trip-1", userId: "creator", role: "manager", isCreator: true },
        ],
      },
      { type: "role", collaboratorId: "collab-creator", fromRole: "manager", toRole: "editor" } as ContributorChange,
      { message: "The trip creator's seat cannot be changed.", stale: false },
    ],
    [
      "caller's own seat",
      {
        collaboratorRows: [
          { id: "collab-self", tripId: "trip-1", userId: "manager-1", role: "manager", isCreator: false },
        ],
      },
      { type: "remove", collaboratorId: "collab-self" } as ContributorChange,
      { message: "You cannot change your own access.", stale: false },
    ],
    [
      "collaborator on another trip",
      {
        collaboratorRows: [{ id: "collab-other", tripId: "trip-2", userId: "other", role: "viewer", isCreator: false }],
      },
      { type: "remove", collaboratorId: "collab-other" } as ContributorChange,
      { message: "One or more contributors are no longer on this trip.", stale: true },
    ],
    [
      "missing collaborator",
      { collaboratorRows: [] },
      { type: "remove", collaboratorId: "collab-gone" } as ContributorChange,
      { message: "One or more contributors are no longer on this trip.", stale: true },
    ],
    [
      "stale fromRole",
      {
        collaboratorRows: [
          { id: "collab-editor", tripId: "trip-1", userId: "user-peer", role: "manager", isCreator: false },
        ],
      },
      { type: "role", collaboratorId: "collab-editor", fromRole: "editor", toRole: "viewer" } as ContributorChange,
      { message: "A contributor's role changed since you started editing.", stale: true },
    ],
  ])("rejects a %s with a typed guard error and no writes", async (_label, fixture, change, expected) => {
    const { result, operations } = run(fixture, [change]);
    await expect(result).rejects.toBeInstanceOf(ContributorChangeGuardError);
    await expect(result).rejects.toMatchObject(expected);
    expect(operations.updates).toEqual([]);
    expect(operations.deletes).toEqual([]);
  });

  it("rejects duplicate targets before any write as defense behind the contract", async () => {
    const { result, operations } = run({}, [
      { type: "role", collaboratorId: "collab-editor", fromRole: "editor", toRole: "manager" },
      { type: "remove", collaboratorId: "collab-editor" },
    ]);
    await expect(result).rejects.toMatchObject({ message: "Duplicate change for the same contributor", stale: false });
    expect(operations.reads).toEqual([]);
    expect(operations.updates).toEqual([]);
  });

  it("throws on a later guard so the caller's transaction rolls back earlier writes", async () => {
    const { result, operations } = run({}, [
      { type: "role", collaboratorId: "collab-editor", fromRole: "editor", toRole: "viewer" },
      { type: "remove", collaboratorId: "collab-gone" },
    ]);
    await expect(result).rejects.toMatchObject({ stale: true });
    // The caller owns the transaction; throwing is what discards the first update.
    expect(operations.updates).toHaveLength(1);
  });
});

describe("inviteContributorInTransaction", () => {
  function invitationDatabase(
    options: {
      collaborator?: boolean;
      invitationStatus?: string;
      lockRows?: unknown[][];
      insertError?: Error;
      resendMissing?: boolean;
    } = {}
  ) {
    const writes: Array<{ table: unknown; values?: unknown }> = [];
    const reads = [
      [{ role: "manager" }],
      options.collaborator ? [{ id: "member" }] : [],
      options.invitationStatus ? [{ id: "existing", status: options.invitationStatus }] : [],
    ];
    const lockRows = [...(options.lockRows ?? [])];
    const transaction = {
      execute: async () => lockRows.shift() ?? [{ id: "locked" }],
      select: () => ({ from: () => ({ where: async () => reads.shift() ?? [] }) }),
      insert: (table: unknown) => ({
        values: async (values: unknown) => {
          if (options.insertError) throw options.insertError;
          writes.push({ table, values });
        },
      }),
      delete: (table: unknown) => ({
        where: async () => {
          writes.push({ table });
        },
      }),
      update: (table: unknown) => ({
        set: (values: unknown) => ({
          where: () => ({
            returning: async () => {
              writes.push({ table, values });
              return options.resendMissing ? [] : [{ id: "existing", inviteeId: "invitee" }];
            },
          }),
        }),
      }),
    };
    return {
      database: {
        transaction: async (run: (value: typeof transaction) => Promise<unknown>) => run(transaction),
      } as unknown as MembershipDatabase,
      writes,
    };
  }
  const input = {
    tripId: "trip",
    inviterId: "manager",
    inviteeId: "invitee",
    role: "editor" as const,
    expiresAt: new Date("2026-12-01"),
  };
  it("wrapper creates pending invitation after locked authorization", async () => {
    const { database, writes } = invitationDatabase();
    await expect(inviteContributorWrite(database, input)).resolves.toEqual({ status: "invited" });
    expect(writes).toEqual([
      {
        table: invitations,
        values: {
          tripId: "trip",
          inviteeId: "invitee",
          role: "editor",
          status: "pending",
          expiresAt: input.expiresAt,
          invitedBy: "manager",
        },
      },
    ]);
  });
  it("refreshes pending identity, role and expiry without inserting", async () => {
    const { database, writes } = invitationDatabase({ invitationStatus: "pending" });
    await expect(inviteContributorWrite(database, input)).resolves.toEqual({ status: "resent" });
    expect(writes).toEqual([{ table: invitations, values: { role: "editor", expiresAt: input.expiresAt } }]);
  });
  it("replaces declined row with fresh pending intent", async () => {
    const { database, writes } = invitationDatabase({ invitationStatus: "declined" });
    await expect(inviteContributorWrite(database, input)).resolves.toEqual({ status: "invited" });
    expect(writes).toHaveLength(2);
    expect(writes[0]).toEqual({ table: invitations });
  });
  it("rejects existing membership without mutation", async () => {
    const { database, writes } = invitationDatabase({ collaborator: true });
    await expect(inviteContributorWrite(database, input)).resolves.toMatchObject({ errorCode: "already-collaborator" });
    expect(writes).toEqual([]);
  });
  it("returns typed conflict for unique violation and propagates unexpected insert failure", async () => {
    const conflict = Object.assign(new Error("duplicate"), { code: "23505" });
    await expect(
      inviteContributorWrite(invitationDatabase({ insertError: conflict }).database, input)
    ).resolves.toMatchObject({ errorCode: "invite-conflict" });
    await expect(
      inviteContributorWrite(invitationDatabase({ insertError: new Error("rollback") }).database, input)
    ).rejects.toThrow("rollback");
  });
  it("handles missing invitee, inviter and trip locks without mutation", async () => {
    await expect(inviteContributorWrite(invitationDatabase({ lockRows: [[]] }).database, input)).resolves.toMatchObject(
      { errorCode: "no-account" }
    );
    await expect(
      inviteContributorWrite(invitationDatabase({ lockRows: [[{ id: "invitee" }], []] }).database, input)
    ).resolves.toEqual({ status: "gone" });
    await expect(
      inviteContributorWrite(
        invitationDatabase({ lockRows: [[{ id: "invitee" }], [{ id: "manager" }], []] }).database,
        input
      )
    ).resolves.toEqual({ status: "gone" });
  });
  it.each([null, "editor", "viewer"])("wrapper rechecks locked manager role %s", async (role) => {
    let writes = 0;
    const transaction = {
      execute: async () => [{ id: "locked" }],
      select: () => ({ from: () => ({ where: async () => (role ? [{ role }] : []) }) }),
      insert: () => {
        writes += 1;
      },
    };
    const database = {
      transaction: async (run: (value: typeof transaction) => Promise<unknown>) => run(transaction),
    } as unknown as MembershipDatabase;
    await expect(
      inviteContributorWrite(database, {
        tripId: "trip",
        inviterId: "manager",
        inviteeId: "invitee",
        role: "viewer",
        expiresAt: new Date(),
      })
    ).rejects.toThrow("permission");
    expect(writes).toBe(0);
  });
  it("reports resend race instead of successful effects against retired invitation", async () => {
    const { inviteContributorInTransaction } = await import("./membership-writes");
    const responses = [[], [{ id: "pending", status: "pending" }], [{ id: "pending", tripId: "trip" }]];
    const transaction = {
      select: () => ({ from: () => ({ where: async () => responses.shift() }) }),
      update: () => ({ set: () => ({ where: () => ({ returning: async () => [] }) }) }),
    };
    await expect(
      inviteContributorInTransaction(transaction as unknown as import("./server-action-locks").DbTransaction, {
        tripId: "trip",
        inviterId: "manager",
        inviteeId: "invitee",
        role: "viewer",
        expiresAt: new Date(),
      })
    ).resolves.toMatchObject({ status: "error", errorCode: "invite-conflict" });
  });
  it("uses supplied identity for new invitation", async () => {
    const { inviteContributorInTransaction } = await import("./membership-writes");
    const inserted: unknown[] = [];
    const transaction = {
      select: () => ({ from: () => ({ where: async () => [] }) }),
      insert: () => ({
        values: async (values: unknown) => {
          inserted.push(values);
        },
      }),
    };
    await expect(
      inviteContributorInTransaction(transaction as unknown as import("./server-action-locks").DbTransaction, {
        tripId: "trip",
        inviterId: "manager",
        inviteeId: "invitee",
        role: "viewer",
        expiresAt: new Date(),
        id: "client-id",
      })
    ).resolves.toEqual({ status: "invited" });
    expect(inserted[0]).toMatchObject({ id: "client-id", tripId: "trip", inviteeId: "invitee" });
  });
});

describe("invitation decisions", () => {
  const acceptedRow = {
    id: "invite-1",
    tripId: "trip-1",
    inviteeId: "user-1",
    role: "editor",
    status: "accepted",
    expiresAt: new Date("2030-01-01"),
  };
  function decisionTransaction(
    options: {
      updated?: unknown[];
      account?: { name: string | null; username: string } | null;
      candidate?: unknown[];
      lockRows?: unknown[][];
      invitation?: unknown[];
    } = {}
  ) {
    const writes: Array<{ table: unknown; values: unknown; conflict?: unknown }> = [];
    const reads: string[] = [];
    const lockRows = [...(options.lockRows ?? [])];
    let locks = 0;
    const transaction = {
      execute: async () => {
        locks += 1;
        return lockRows.shift() ?? [{ id: "locked" }];
      },
      select: () => ({
        from: (table: unknown) => ({
          where: async () => {
            if (table === users) {
              reads.push("account");
              return options.account === null
                ? []
                : [options.account ?? { name: "Invitee Person", username: "invitee" }];
            }
            reads.push("invitation");
            return options.candidate ?? options.invitation ?? [{ tripId: "trip-1" }];
          },
        }),
      }),
      update: (table: unknown) => ({
        set: (values: unknown) => ({
          where: () => ({
            returning: async () => {
              writes.push({ table, values });
              return options.updated ?? [acceptedRow];
            },
          }),
        }),
      }),
      insert: (table: unknown) => ({
        values: (values: unknown) => ({
          onConflictDoNothing: async (conflict: unknown) => {
            writes.push({ table, values, conflict });
          },
        }),
      }),
    };
    return {
      transaction: transaction as unknown as DbTransaction,
      database: {
        transaction: async (run: (value: typeof transaction) => Promise<unknown>) => run(transaction),
      } as unknown as MembershipDatabase,
      writes,
      reads,
      locks: () => locks,
    };
  }
  const acceptInput = { userId: "user-1", fallbackName: "Fallback", invitationId: "invite-1" };

  it("accepts and inserts the invited role without changing an existing creator or manager", async () => {
    const { transaction, writes } = decisionTransaction();
    await expect(acceptInvitationInTransaction(transaction, acceptInput)).resolves.toEqual(acceptedRow);
    expect(writes).toEqual([
      { table: invitations, values: { status: "accepted" } },
      {
        table: collaborators,
        values: {
          tripId: "trip-1",
          userId: "user-1",
          name: "Invitee Person",
          initials: "IN",
          role: "editor",
          isCreator: false,
        },
        conflict: { target: [collaborators.tripId, collaborators.userId] },
      },
    ]);
  });

  it.each([
    [{ name: null, username: "invitee" }, "invitee"],
    [null, "Fallback"],
  ])("names the collaborator from %j", async (account, name) => {
    const { transaction, writes } = decisionTransaction({ account });
    await acceptInvitationInTransaction(transaction, acceptInput);
    expect(writes[1].values).toMatchObject({ name });
  });

  it("returns null without a collaborator write when the guarded accept matches nothing", async () => {
    const { transaction, writes } = decisionTransaction({ updated: [] });
    await expect(acceptInvitationInTransaction(transaction, acceptInput)).resolves.toBeNull();
    expect(writes).toHaveLength(1);
  });

  it("declines through one guarded update and writes no membership", async () => {
    const { transaction, writes } = decisionTransaction({ updated: [{ ...acceptedRow, status: "declined" }] });
    await expect(
      declineInvitationInTransaction(transaction, { userId: "user-1", invitationId: "invite-1" })
    ).resolves.toMatchObject({ tripId: "trip-1" });
    expect(writes).toEqual([{ table: invitations, values: { status: "declined" } }]);
  });

  it("returns null when the guarded decline matches nothing", async () => {
    const { transaction } = decisionTransaction({ updated: [] });
    await expect(
      declineInvitationInTransaction(transaction, { userId: "user-1", invitationId: "invite-1" })
    ).resolves.toBeNull();
  });

  it("wrapper locks before accepting and keeps its signature", async () => {
    const { database, writes, locks } = decisionTransaction();
    await expect(acceptInvitationWrite(database, acceptInput)).resolves.toEqual(acceptedRow);
    expect(locks()).toBe(2);
    expect(writes).toHaveLength(2);
  });

  it("wrapper takes no lock for an invitation not addressed to the user", async () => {
    const { database, writes, locks } = decisionTransaction({ candidate: [] });
    await expect(acceptInvitationWrite(database, acceptInput)).resolves.toBeNull();
    expect(locks()).toBe(0);
    expect(writes).toEqual([]);
  });

  it.each([
    ["account", [[]]],
    ["trip", [[{ id: "locked" }], []]],
  ])("wrapper writes nothing when the %s is gone", async (_label, lockRows) => {
    const { database, writes } = decisionTransaction({ lockRows });
    await expect(acceptInvitationWrite(database, acceptInput)).resolves.toBeNull();
    expect(writes).toEqual([]);
  });

  it.each([
    ["missing", [], "Invitation not found."],
    [
      "foreign",
      [{ inviteeId: "user-2", status: "pending", expiresAt: new Date("2030-01-01") }],
      "This invitation is not addressed to your account.",
    ],
    [
      "rescinded",
      [{ inviteeId: "user-1", status: "rescinded", expiresAt: new Date("2030-01-01") }],
      "This invitation was rescinded by the trip owner.",
    ],
    [
      "resolved",
      [{ inviteeId: "user-1", status: "declined", expiresAt: new Date("2030-01-01") }],
      "This invitation is no longer pending.",
    ],
    [
      "expired",
      [{ inviteeId: "user-1", status: "pending", expiresAt: new Date("2020-01-01") }],
      "This invitation has expired.",
    ],
    [
      "still pending",
      [{ inviteeId: "user-1", status: "pending", expiresAt: new Date("2030-01-01") }],
      "This invitation is no longer pending.",
    ],
  ])("explains a %s refusal", async (_label, invitation, message) => {
    const { transaction } = decisionTransaction({ invitation });
    await expect(describeUnmatchedInvitationInTransaction(transaction, "invite-1", "user-1")).resolves.toBe(message);
  });
});

describe.each(["rescind", "dismiss"] as const)("%s invitation writer", (operation) => {
  it("returns the guarded row when it matches", async () => {
    const writers = await import("./membership-writes");
    const row = { id: "invite", tripId: "trip", inviteeId: "invitee" };
    const returning = vi.fn().mockResolvedValue([row]);
    const where = vi.fn().mockReturnValue({ returning });
    const transaction = { update: () => ({ set: () => ({ where }) }), delete: () => ({ where }) };
    const writer =
      operation === "rescind" ? writers.rescindInvitationInTransaction : writers.dismissInvitationInTransaction;
    await expect(writer(transaction as never, { tripId: "trip", invitationId: "invite" })).resolves.toEqual(row);
    const query = new PgDialect().sqlToQuery(where.mock.calls[0][0]);
    expect(query.sql).toMatch(/"invitations"\."id" = \$1/);
    expect(query.sql).toMatch(/"invitations"\."trip_id" = \$2/);
    expect(query.sql).toMatch(
      operation === "rescind" ? /"invitations"\."status" = \$3/ : /"invitations"\."status" <> \$3/
    );
    expect(query.params).toEqual(["invite", "trip", "pending"]);
  });
});

describe("self-departure writers", () => {
  const input = { tripId: "trip-1", userId: "user-1" };

  function leaveTransaction(options: { lockRows?: unknown[]; membership?: unknown[]; lockError?: Error } = {}) {
    const deletes: unknown[] = [];
    const selects: unknown[] = [];
    const order: string[] = [];
    const transaction = {
      execute: async () => {
        order.push("lock");
        if (options.lockError) throw options.lockError;
        return options.lockRows ?? [{ id: "trip-1" }];
      },
      select: () => ({
        from: () => ({
          where: async (condition: unknown) => {
            order.push("read");
            selects.push(condition);
            return options.membership ?? [{ id: "seat-1", role: "editor", isCreator: false }];
          },
        }),
      }),
      delete: () => ({
        where: async (condition: unknown) => {
          order.push("delete");
          deletes.push(condition);
        },
      }),
    };
    const database = {
      transaction: async (run: (value: typeof transaction) => Promise<unknown>) => run(transaction),
    } as unknown as MembershipDatabase;
    return { transaction: transaction as unknown as DbTransaction, database, deletes, selects, order };
  }

  it("reads only the caller's own membership and returns it", async () => {
    const { transaction, selects } = leaveTransaction();
    await expect(readLeavableMembership(transaction, input)).resolves.toEqual({ id: "seat-1" });
    const query = new PgDialect().sqlToQuery(selects[0] as never);
    expect(query.params).toEqual(["trip-1", "user-1"]);
  });

  it("reports an absent membership as a stale guard error", async () => {
    const { transaction } = leaveTransaction({ membership: [] });
    const failure = readLeavableMembership(transaction, input);
    await expect(failure).rejects.toBeInstanceOf(ContributorChangeGuardError);
    await expect(failure).rejects.toMatchObject({ stale: true, message: NOT_ON_TRIP_MESSAGE });
  });

  it.each([
    ["creator", { id: "seat-1", role: "manager", isCreator: true }, "The trip creator can't leave this trip."],
    ["manager", { id: "seat-1", role: "manager", isCreator: false }, "Managers can't leave a trip."],
  ])("refuses a %s without the stale flag", async (_label, membership, message) => {
    const { transaction } = leaveTransaction({ membership: [membership] });
    const failure = readLeavableMembership(transaction, input);
    await expect(failure).rejects.toMatchObject({ stale: false, message });
  });

  it("allows a viewer", async () => {
    const { transaction } = leaveTransaction({ membership: [{ id: "seat-2", role: "viewer", isCreator: false }] });
    await expect(readLeavableMembership(transaction, input)).resolves.toEqual({ id: "seat-2" });
  });

  it("deletes only the guarded membership row", async () => {
    const { transaction, deletes } = leaveTransaction();
    await deleteOwnMembership(transaction, { membershipId: "seat-1", userId: "user-1" });
    const query = new PgDialect().sqlToQuery(deletes[0] as never);
    expect(query.params).toEqual(["seat-1", "user-1"]);
  });

  it("wrapper locks the trip, rechecks, then deletes in one transaction", async () => {
    const { database, order } = leaveTransaction();
    await expect(leaveTripWrite(database, input)).resolves.toBeUndefined();
    expect(order).toEqual(["lock", "read", "delete"]);
  });

  it("wrapper maps a trip deleted before the lock to a stale guard error", async () => {
    const { database, order } = leaveTransaction({ lockRows: [] });
    await expect(leaveTripWrite(database, input)).rejects.toMatchObject({ stale: true, message: NOT_ON_TRIP_MESSAGE });
    expect(order).toEqual(["lock"]);
  });

  it("wrapper propagates unexpected lock failures", async () => {
    const { database } = leaveTransaction({ lockError: new Error("connection reset") });
    await expect(leaveTripWrite(database, input)).rejects.toThrow("connection reset");
  });

  it("wrapper refuses protected roles without deleting", async () => {
    const { database, order } = leaveTransaction({ membership: [{ id: "seat-1", role: "manager", isCreator: false }] });
    await expect(leaveTripWrite(database, input)).rejects.toThrow("Managers can't leave a trip.");
    expect(order).toEqual(["lock", "read"]);
  });
});
