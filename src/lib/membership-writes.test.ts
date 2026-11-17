// @vitest-environment node
import { describe, expect, it } from "vitest";
import { collaborators, days, invitations, trips } from "@/db/schema";
import {
  createTripWrite,
  inviteContributorWrite,
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
