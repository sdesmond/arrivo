import { beforeEach, describe, expect, it, vi } from "vitest";
import { collaborators, invitations, users, idempotencyKeys } from "@/db/schema";
const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
  access: vi.fn(),
  lock: vi.fn(),
  write: vi.fn(),
  activity: vi.fn(),
  userEvent: vi.fn(),
  tripEvent: vi.fn(),
  revalidate: vi.fn(),
  picker: vi.fn(),
  batch: vi.fn(),
  tripLock: vi.fn(),
  removeSubscribers: vi.fn(),
}));
vi.mock("@/db", () => ({ db: mocks }));
vi.mock("@/lib/auth-helpers", () => ({ assertTripAccess: vi.fn() }));
vi.mock("./trip-access", async (original) => ({
  ...(await original<typeof import("./trip-access")>()),
  requireTripRole: mocks.access,
}));
vi.mock("@/lib/account-lifecycle-locks", () => ({ lockUsersThenTripForUpdate: mocks.lock }));
vi.mock("@/lib/membership-writes", async (original) => ({
  ...(await original<typeof import("@/lib/membership-writes")>()),
  inviteContributorInTransaction: mocks.write,
  saveContributorChangesInTransaction: mocks.batch,
}));
vi.mock("@/lib/server-action-locks", async (original) => ({
  ...(await original<typeof import("@/lib/server-action-locks")>()),
  lockTripForUpdate: mocks.tripLock,
}));
vi.mock("@/lib/trip-activity", () => ({ recordTripInvitation: mocks.activity }));
vi.mock("@/lib/trip-events", () => ({
  publishUserEvent: mocks.userEvent,
  publishTripEvent: mocks.tripEvent,
  removeTripSubscribersForUser: mocks.removeSubscribers,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/invitable-users", () => ({ getInvitableUsers: mocks.picker }));
import { createInvitation, getCollaborators, listInvitableUsers, saveContributorChanges } from "./sharing";
import { ConflictError } from "./conflict-error";
import { ValidationFailedError } from "./validation-failed-error";
import { ContributorChangeGuardError } from "@/lib/membership-writes";
import { TRIP_NOT_FOUND_MESSAGE } from "@/lib/server-action-locks";
import { LiveSyncEventType } from "@/data/types";
import { TripForbiddenError, TripNotFoundError } from "./trip-access";
import { fingerprintRequest } from "@/lib/api/idempotency";
import { getNow } from "@/lib/mock-date";
import { runWithRequestDeadline } from "@/lib/request-deadline";
const tripId = "223e4567-e89b-12d3-a456-426614174000";
const inviteId = "123e4567-e89b-12d3-a456-426614174000";
const actor = { userId: "manager" };
let account: { id: string }[];
let claims: { userId: string; result: unknown }[];
let rows: { id: string; tripId: string; status: string }[];
let stored: { result: unknown }[];
let invitationReads: (typeof rows)[];
let savedValues: Record<string, unknown>[];
beforeEach(() => {
  vi.clearAllMocks();
  account = [{ id: "invitee" }];
  claims = [];
  rows = [];
  stored = [];
  invitationReads = [];
  savedValues = [];
  mocks.select.mockImplementation((fields?: Record<string, unknown>) => ({
    from: (table: unknown) => ({
      where: async () =>
        table === users
          ? account
          : table === idempotencyKeys
            ? fields && "userId" in fields
              ? claims
              : stored
            : table === invitations
              ? (invitationReads.shift() ?? rows)
              : [],
    }),
  }));
  mocks.execute.mockResolvedValue([]);
  mocks.insert.mockReturnValue({
    values: (values: Record<string, unknown>) => {
      savedValues.push(values);
      return { onConflictDoUpdate: async () => undefined };
    },
  });
  mocks.transaction.mockImplementation(async (run) => run(mocks));
  mocks.lock.mockResolvedValue({ locked: true });
  mocks.access.mockResolvedValue("manager");
  mocks.write.mockResolvedValue({ status: "invited" });
  mocks.tripLock.mockResolvedValue(undefined);
  mocks.batch.mockResolvedValue({
    removedUserIds: [],
    roleChangedUserIds: [],
    tripName: "",
    removedByName: "",
    removedByUsername: "",
  });
});
it("locks accounts and trip, rechecks manager authority, then commits before effects", async () => {
  await expect(createInvitation(actor, tripId, { id: inviteId, username: "alice" })).resolves.toEqual({
    status: "invited",
  });
  expect(mocks.lock).toHaveBeenCalledWith(mocks, ["manager", "invitee"], tripId);
  expect(mocks.access).toHaveBeenLastCalledWith(tripId, "manager", "manager", mocks);
  expect(mocks.write).toHaveBeenCalledOnce();
  expect(mocks.userEvent).toHaveBeenCalledOnce();
  expect(mocks.tripEvent).toHaveBeenCalledOnce();
});
it("rejects manager demotion before mutation and effects", async () => {
  mocks.access.mockResolvedValueOnce("manager").mockRejectedValueOnce(new TripForbiddenError("manager"));
  await expect(createInvitation(actor, tripId, { username: "alice" })).rejects.toBeInstanceOf(TripForbiddenError);
  expect(mocks.write).not.toHaveBeenCalled();
  expect(mocks.userEvent).not.toHaveBeenCalled();
});
it("authorizes picker before disclosing account directory", async () => {
  mocks.access.mockRejectedValue(new TripNotFoundError());
  await expect(listInvitableUsers(actor, tripId)).rejects.toBeInstanceOf(TripNotFoundError);
  expect(mocks.picker).not.toHaveBeenCalled();
});
it("returns mapped sharing rows and current collaborator identity", async () => {
  const membership = {
    id: "seat",
    tripId,
    userId: actor.userId,
    name: "Manager",
    initials: "MA",
    role: "manager",
    isCreator: true,
    username: "manager",
    image: null,
  };
  const invitation = {
    id: inviteId,
    tripId,
    inviteeId: "invitee",
    invitedBy: actor.userId,
    role: "viewer",
    status: "pending",
    expiresAt: new Date("2026-12-01"),
    createdAt: null,
    inviteeUsername: "alice",
  };
  mocks.select.mockImplementation(() => ({
    from: (table: unknown) => {
      const query = { where: async () => (table === collaborators ? [membership] : [invitation]) };
      return { leftJoin: () => query, innerJoin: () => query };
    },
  }));
  await expect(getCollaborators(actor, tripId)).resolves.toMatchObject({
    currentCollaboratorId: "seat",
    collaborators: [{ id: "seat", username: "manager", role: "manager" }],
    invitations: [{ id: inviteId, inviteeUsername: "alice", expiresAt: "2026-12-01T00:00:00.000Z" }],
  });
  membership.userId = "other";
  await expect(getCollaborators(actor, tripId)).resolves.toMatchObject({ currentCollaboratorId: null });
});
it("rejects sharing read before querying rows when access is denied", async () => {
  mocks.access.mockRejectedValue(new TripForbiddenError("manager"));
  await expect(getCollaborators(actor, tripId)).rejects.toBeInstanceOf(TripForbiddenError);
  expect(mocks.select).not.toHaveBeenCalled();
});
it.each(["missing", "self"])("returns typed %s account error without writing", async (kind) => {
  account = kind === "missing" ? [] : [{ id: "manager" }];
  await expect(createInvitation(actor, tripId, { username: "alice" })).resolves.toMatchObject({
    status: "error",
    errorCode: kind === "missing" ? "no-account" : "self-invite",
  });
  expect(mocks.write).not.toHaveBeenCalled();
});
it("rolls back without effects when mutation fails", async () => {
  mocks.write.mockRejectedValue(new Error("rollback"));
  await expect(createInvitation(actor, tripId, { username: "alice" })).rejects.toThrow("rollback");
  expect(mocks.userEvent).not.toHaveBeenCalled();
});

const draft = { id: inviteId, username: "alice", role: "viewer" as const };
const path = `/api/v1/trips/${tripId}/invitations`;
function claim(overrides: Record<string, unknown> = {}) {
  return {
    userId: actor.userId,
    result: {
      tripId,
      fingerprint: fingerprintRequest("POST", path, draft),
      invitationId: inviteId,
      result: { status: "invited" },
      ...overrides,
    },
  };
}
it("returns picker result without changing ordering or hasOtherUsers", async () => {
  const picker = { users: [{ id: "invitee", username: "alice" }], hasOtherUsers: true };
  mocks.picker.mockResolvedValue(picker);
  await expect(listInvitableUsers(actor, tripId)).resolves.toBe(picker);
});
it("replays exact UUID intent against pending row without effects", async () => {
  claims = [claim()];
  rows = [{ id: inviteId, tripId, status: "pending" }];
  await expect(createInvitation(actor, tripId, draft)).resolves.toEqual({ status: "invited" });
  expect(mocks.write).not.toHaveBeenCalled();
  expect(mocks.activity).not.toHaveBeenCalled();
  expect(mocks.tripEvent).not.toHaveBeenCalled();
});
it.each(["rescinded", "accepted", "declined", "dismissed"])(
  "rejects retired %s UUID intent even with independent key",
  async () => {
    claims = [claim()];
    await expect(createInvitation(actor, tripId, draft, { key: "new", method: "POST", path })).rejects.toThrow(
      "retired"
    );
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.userEvent).not.toHaveBeenCalled();
  }
);
it.each([{ role: "editor" }, { username: "bob" }])("rejects changed UUID intent %j", async (changed) => {
  claims = [claim()];
  await expect(createInvitation(actor, tripId, { ...draft, ...changed })).rejects.toThrow("different invitation");
});
it("conceals foreign claimed UUID resources", async () => {
  claims = [claim({ tripId: "423e4567-e89b-12d3-a456-426614174000" })];
  mocks.access
    .mockResolvedValueOnce("manager")
    .mockResolvedValueOnce("manager")
    .mockRejectedValueOnce(new TripNotFoundError());
  await expect(createInvitation(actor, tripId, draft)).rejects.toBeInstanceOf(TripNotFoundError);
});
it("conflicts for a visible foreign trip claim or another actor's claim", async () => {
  claims = [claim({ tripId: "423e4567-e89b-12d3-a456-426614174000" })];
  await expect(createInvitation(actor, tripId, draft)).rejects.toThrow("different invitation");
  claims = [{ ...claim(), userId: "another-manager" }];
  await expect(createInvitation(actor, tripId, draft)).rejects.toThrow("different invitation");
});
it("rejects UUID already held by legacy invitation", async () => {
  rows = [{ id: inviteId, tripId, status: "pending" }];
  await expect(createInvitation(actor, tripId, draft)).rejects.toThrow("already used for an invitation");
});
it("conceals legacy invitation belonging to inaccessible trip", async () => {
  rows = [{ id: inviteId, tripId: "423e4567-e89b-12d3-a456-426614174000", status: "pending" }];
  mocks.access
    .mockResolvedValueOnce("manager")
    .mockResolvedValueOnce("manager")
    .mockRejectedValueOnce(new TripNotFoundError());
  await expect(createInvitation(actor, tripId, draft)).rejects.toBeInstanceOf(TripNotFoundError);
});
it("stores alias evidence for resend without activity duplication", async () => {
  mocks.write.mockResolvedValue({ status: "resent" });
  invitationReads = [[], [{ id: "pending-alias", tripId, status: "pending" }]];
  await expect(createInvitation(actor, tripId, draft)).resolves.toEqual({ status: "resent" });
  expect(mocks.insert).toHaveBeenCalledWith(idempotencyKeys);
  expect(savedValues[0].result).toMatchObject({ invitationId: "pending-alias", result: { status: "resent" } });
  expect(mocks.activity).not.toHaveBeenCalled();
});
it("returns membership error without effects", async () => {
  mocks.write.mockResolvedValue({ status: "error", errorCode: "already-collaborator", message: "Already on trip" });
  await expect(createInvitation(actor, tripId, draft)).resolves.toMatchObject({ errorCode: "already-collaborator" });
  expect(mocks.userEvent).not.toHaveBeenCalled();
});
it("authorizes before reading a saved keyed success and suppresses effects", async () => {
  stored = [
    {
      result: {
        version: 1,
        expiresAt: new Date(getNow().getTime() + 60_000).toISOString(),
        fingerprint: fingerprintRequest("POST", path, draft),
        response: { status: "invited" },
      },
    },
  ];
  await expect(createInvitation(actor, tripId, draft, { key: "same", method: "POST", path })).resolves.toEqual({
    status: "invited",
  });
  expect(mocks.access).toHaveBeenLastCalledWith(tripId, actor.userId, "manager", mocks);
  expect(mocks.write).not.toHaveBeenCalled();
  expect(mocks.userEvent).not.toHaveBeenCalled();
});
it("refuses changed keyed payload without writing", async () => {
  stored = [
    {
      result: {
        version: 1,
        expiresAt: new Date(getNow().getTime() + 60_000).toISOString(),
        fingerprint: "different",
        response: { status: "invited" },
      },
    },
  ];
  await expect(createInvitation(actor, tripId, draft, { key: "same", method: "POST", path })).rejects.toThrow(
    "different request"
  );
  expect(mocks.write).not.toHaveBeenCalled();
});
it("returns not found when account/trip lock target disappears", async () => {
  mocks.lock.mockResolvedValue({ locked: false, missing: "trip" });
  await expect(createInvitation(actor, tripId, draft)).rejects.toBeInstanceOf(TripNotFoundError);
});
it("still locks actor and trip when invitee disappears before locking", async () => {
  mocks.lock
    .mockResolvedValueOnce({ locked: false, missing: "user", userId: "invitee" })
    .mockResolvedValueOnce({ locked: true });
  await createInvitation(actor, tripId, draft);
  expect(mocks.lock).toHaveBeenLastCalledWith(mocks, [actor.userId], tripId);
});
it("refuses failed fallback lock", async () => {
  mocks.lock
    .mockResolvedValueOnce({ locked: false, missing: "user", userId: "invitee" })
    .mockResolvedValueOnce({ locked: false, missing: "trip" });
  await expect(createInvitation(actor, tripId, draft)).rejects.toBeInstanceOf(TripNotFoundError);
});
it("deadline rollback emits no invitation effects", async () => {
  await expect(runWithRequestDeadline(-1, () => createInvitation(actor, tripId, draft))).rejects.toThrow(
    "took too long"
  );
  expect(mocks.write).not.toHaveBeenCalled();
  expect(mocks.userEvent).not.toHaveBeenCalled();
});
it("rolls back invitation, UUID evidence and keyed replay when deadline elapses after writes", async () => {
  const clock = vi.spyOn(performance, "now").mockReturnValue(0);
  let committed = false;
  let rolledBack = false;
  mocks.transaction.mockImplementation(async (run) => {
    try {
      const result = await run(mocks);
      committed = true;
      return result;
    } catch (error) {
      rolledBack = true;
      throw error;
    }
  });
  mocks.insert.mockReturnValue({
    values: () => ({
      onConflictDoUpdate: async () => {
        clock.mockReturnValue(2000);
      },
    }),
  });
  await expect(
    runWithRequestDeadline(1000, () => createInvitation(actor, tripId, draft, { key: "atomic", method: "POST", path }))
  ).rejects.toThrow("took too long");
  expect(mocks.write).toHaveBeenCalledOnce();
  expect(mocks.insert).toHaveBeenCalledTimes(2);
  expect(committed).toBe(false);
  expect(rolledBack).toBe(true);
  expect(mocks.userEvent).not.toHaveBeenCalled();
  expect(mocks.activity).not.toHaveBeenCalled();
  clock.mockRestore();
});
it("rejects manager demotion before cached keyed success is read", async () => {
  stored = [
    {
      result: {
        version: 1,
        expiresAt: new Date(getNow().getTime() + 60000).toISOString(),
        fingerprint: fingerprintRequest("POST", path, draft),
        response: { status: "invited" },
      },
    },
  ];
  mocks.access.mockResolvedValueOnce("manager").mockRejectedValueOnce(new TripForbiddenError("manager"));
  await expect(createInvitation(actor, tripId, draft, { key: "cached", method: "POST", path })).rejects.toBeInstanceOf(
    TripForbiddenError
  );
  expect(mocks.write).not.toHaveBeenCalled();
  expect(mocks.userEvent).not.toHaveBeenCalled();
});

it.each([
  null,
  {},
  { status: "success" },
  { tripId, invitationId: inviteId, fingerprint: "hash", result: { status: "error" } },
])("refuses incompatible packing evidence without modifying it: %j", async (result) => {
  const unrelated = { userId: actor.userId, result };
  claims = [unrelated];
  await expect(createInvitation(actor, tripId, draft)).rejects.toThrow("incompatible");
  expect(claims).toEqual([unrelated]);
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.write).not.toHaveBeenCalled();
});

describe("saveContributorChanges", () => {
  const editorSeat = "323e4567-e89b-12d3-a456-426614174000";
  const viewerSeat = "423e4567-e89b-12d3-a456-426614174000";
  const batchPath = `/api/v1/trips/${tripId}/collaborators`;
  const mixed = {
    changes: [
      { type: "role", collaboratorId: editorSeat, fromRole: "editor", toRole: "viewer" },
      { type: "remove", collaboratorId: viewerSeat },
    ],
  };
  const mixedOutcome = {
    removedUserIds: ["user-viewer"],
    roleChangedUserIds: ["user-editor"],
    tripName: "Test Trip",
    removedByName: "Manager Name",
    removedByUsername: "manager",
  };
  function savedEnvelope(payload: unknown, fingerprint = fingerprintRequest("PATCH", batchPath, payload)) {
    return {
      result: {
        version: 1,
        expiresAt: new Date(getNow().getTime() + 60_000).toISOString(),
        fingerprint,
        response: { status: "success" },
      },
    };
  }
  function expectNoEffects() {
    expect(mocks.userEvent).not.toHaveBeenCalled();
    expect(mocks.tripEvent).not.toHaveBeenCalled();
    expect(mocks.removeSubscribers).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  }

  it("applies a mixed batch in one transaction and publishes effects in order after commit", async () => {
    const log: string[] = [];
    let committed = false;
    mocks.transaction.mockImplementation(async (run) => {
      const result = await run(mocks);
      committed = true;
      log.push("commit");
      return result;
    });
    mocks.batch.mockImplementation(async () => {
      log.push("write");
      return mixedOutcome;
    });
    mocks.userEvent.mockImplementation((userId: string, event: { type: string }) => {
      expect(committed).toBe(true);
      log.push(`user:${userId}:${event.type}`);
    });
    mocks.removeSubscribers.mockImplementation((_trip: string, userId: string) => log.push(`unsubscribe:${userId}`));
    mocks.tripEvent.mockImplementation((_trip: string, event: { type: string }) => log.push(`trip:${event.type}`));
    mocks.revalidate.mockImplementation((revalidated: string) => log.push(`revalidate:${revalidated}`));

    await expect(saveContributorChanges(actor, tripId.toUpperCase(), mixed)).resolves.toEqual({ status: "success" });

    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.batch).toHaveBeenCalledWith(mocks, { tripId, actorId: actor.userId, changes: mixed.changes });
    expect(log).toEqual([
      "write",
      "commit",
      `user:user-viewer:${LiveSyncEventType.MembershipRemoved}`,
      "unsubscribe:user-viewer",
      `user:user-editor:${LiveSyncEventType.MembershipChanged}`,
      `trip:${LiveSyncEventType.MembershipChanged}`,
      `revalidate:/trips/${tripId}`,
      "revalidate:/trips",
    ]);
    expect(mocks.userEvent).toHaveBeenCalledWith("user-viewer", {
      type: LiveSyncEventType.MembershipRemoved,
      removedUserId: "user-viewer",
      tripId,
      tripName: "Test Trip",
      removedByName: "Manager Name",
      removedByUsername: "manager",
    });
    expect(mocks.userEvent).toHaveBeenCalledWith("user-editor", { type: LiveSyncEventType.MembershipChanged, tripId });
    expect(mocks.tripEvent).toHaveBeenCalledExactlyOnceWith(tripId, {
      type: LiveSyncEventType.MembershipChanged,
      tripId,
    });
  });

  it("publishes one removal event per removed user and one trip event for a multi-removal batch", async () => {
    mocks.batch.mockResolvedValue({ ...mixedOutcome, removedUserIds: ["user-a", "user-b"], roleChangedUserIds: [] });
    await saveContributorChanges(actor, tripId, {
      changes: [
        { type: "remove", collaboratorId: editorSeat },
        { type: "remove", collaboratorId: viewerSeat },
      ],
    });
    expect(mocks.userEvent.mock.calls.map(([userId, event]) => [userId, event.type])).toEqual([
      ["user-a", LiveSyncEventType.MembershipRemoved],
      ["user-b", LiveSyncEventType.MembershipRemoved],
    ]);
    expect(mocks.removeSubscribers.mock.calls).toEqual([
      [tripId, "user-a"],
      [tripId, "user-b"],
    ]);
    expect(mocks.tripEvent).toHaveBeenCalledOnce();
  });

  it("still publishes the trip event when changed collaborators have no linked accounts", async () => {
    await saveContributorChanges(actor, tripId, { changes: [{ type: "remove", collaboratorId: viewerSeat }] });
    expect(mocks.userEvent).not.toHaveBeenCalled();
    expect(mocks.removeSubscribers).not.toHaveBeenCalled();
    expect(mocks.tripEvent).toHaveBeenCalledOnce();
    expect(mocks.revalidate).toHaveBeenCalledTimes(2);
  });

  it("returns success for an empty batch without writing or publishing", async () => {
    await expect(saveContributorChanges(actor, tripId, { changes: [] })).resolves.toEqual({ status: "success" });
    expect(mocks.batch).not.toHaveBeenCalled();
    expectNoEffects();
  });

  it("locks the trip, rechecks manager authority, then reads saved replay", async () => {
    const log: string[] = [];
    mocks.tripLock.mockImplementation(async () => {
      log.push("lock");
    });
    mocks.access.mockImplementation(async (_trip: string, _user: string, _role: string, executor?: unknown) => {
      log.push(executor ? "recheck" : "precheck");
      return "manager";
    });
    const select = mocks.select.getMockImplementation()!;
    mocks.select.mockImplementation((fields?: Record<string, unknown>) => {
      const query = select(fields);
      return {
        from: (table: unknown) => {
          if (table === idempotencyKeys) log.push("replay");
          return query.from(table);
        },
      };
    });
    mocks.batch.mockImplementation(async () => {
      log.push("write");
      return mixedOutcome;
    });
    await saveContributorChanges(actor, tripId, mixed, { key: "order", method: "PATCH", path: batchPath });
    expect(log).toEqual(["precheck", "lock", "recheck", "replay", "write"]);
    expect(mocks.tripLock).toHaveBeenCalledWith(mocks, tripId);
    expect(mocks.access).toHaveBeenLastCalledWith(tripId, actor.userId, "manager", mocks);
  });

  it.each([
    ["editor or viewer", new TripForbiddenError("manager"), TripForbiddenError],
    ["nonmember", new TripNotFoundError(), TripNotFoundError],
  ])("rejects a %s before opening a transaction", async (_label, failure, expected) => {
    mocks.access.mockRejectedValue(failure);
    await expect(saveContributorChanges(actor, tripId, mixed)).rejects.toBeInstanceOf(expected);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expectNoEffects();
  });

  it("rejects a manager demoted while waiting for the trip lock before replay or writes", async () => {
    stored = [savedEnvelope(mixed)];
    mocks.access.mockResolvedValueOnce("manager").mockRejectedValueOnce(new TripForbiddenError("manager"));
    await expect(
      saveContributorChanges(actor, tripId, mixed, { key: "demoted", method: "PATCH", path: batchPath })
    ).rejects.toBeInstanceOf(TripForbiddenError);
    expect(mocks.batch).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expectNoEffects();
  });

  it("maps a trip deleted under the lock to a conflict without writes", async () => {
    mocks.tripLock.mockRejectedValue(new Error(TRIP_NOT_FOUND_MESSAGE));
    const failure = saveContributorChanges(actor, tripId, mixed);
    await expect(failure).rejects.toBeInstanceOf(ConflictError);
    await expect(failure).rejects.toThrow("One or more contributors are no longer on this trip.");
    expect(mocks.batch).not.toHaveBeenCalled();
    expectNoEffects();
  });

  it("propagates unexpected lock failures", async () => {
    mocks.tripLock.mockRejectedValue(new Error("connection reset"));
    await expect(saveContributorChanges(actor, tripId, mixed)).rejects.toThrow("connection reset");
    expectNoEffects();
  });

  it.each([
    [
      "stale target",
      new ContributorChangeGuardError("One or more contributors are no longer on this trip.", { stale: true }),
      ConflictError,
    ],
    [
      "stale fromRole",
      new ContributorChangeGuardError("A contributor's role changed since you started editing.", { stale: true }),
      ConflictError,
    ],
    [
      "creator seat",
      new ContributorChangeGuardError("The trip creator's seat cannot be changed."),
      ValidationFailedError,
    ],
    ["own seat", new ContributorChangeGuardError("You cannot change your own access."), ValidationFailedError],
  ])("rolls back the whole batch and maps a %s guard", async (_label, guard, expected) => {
    let rolledBack = false;
    mocks.transaction.mockImplementation(async (run) => {
      try {
        return await run(mocks);
      } catch (error) {
        rolledBack = true;
        throw error;
      }
    });
    mocks.batch.mockRejectedValue(guard);
    const failure = saveContributorChanges(actor, tripId, mixed, { key: "guard", method: "PATCH", path: batchPath });
    await expect(failure).rejects.toBeInstanceOf(expected);
    await expect(failure).rejects.toThrow(guard.message);
    expect(rolledBack).toBe(true);
    expect(mocks.insert).not.toHaveBeenCalled();
    expectNoEffects();
  });

  it("puts a validation guard message on the changes field", async () => {
    mocks.batch.mockRejectedValue(new ContributorChangeGuardError("You cannot change your own access."));
    await expect(saveContributorChanges(actor, tripId, mixed)).rejects.toMatchObject({
      fields: { changes: ["You cannot change your own access."] },
    });
  });

  it("propagates unexpected write failures without effects", async () => {
    mocks.batch.mockRejectedValue(new Error("connection reset"));
    await expect(saveContributorChanges(actor, tripId, mixed)).rejects.toThrow("connection reset");
    expectNoEffects();
  });

  it.each([
    ["oversized", { changes: Array.from({ length: 51 }, () => ({ type: "remove", collaboratorId: viewerSeat })) }],
    [
      "duplicate",
      {
        changes: [
          { type: "remove", collaboratorId: viewerSeat },
          { type: "remove", collaboratorId: viewerSeat },
        ],
      },
    ],
    ["invalid type", { changes: [{ type: "archive", collaboratorId: viewerSeat }] }],
    ["invalid role", { changes: [{ type: "role", collaboratorId: viewerSeat, fromRole: "viewer", toRole: "owner" }] }],
    ["invalid UUID", { changes: [{ type: "remove", collaboratorId: "collab-1" }] }],
  ])("rejects an %s batch before access checks or writes", async (_label, body) => {
    await expect(saveContributorChanges(actor, tripId, body)).rejects.toThrow();
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("stores the response with the write and replays it without duplicate writes or effects", async () => {
    mocks.batch.mockResolvedValue(mixedOutcome);
    const replay = { key: "retry", method: "PATCH", path: batchPath };
    await saveContributorChanges(actor, tripId, mixed, replay);
    expect(mocks.insert).toHaveBeenCalledWith(idempotencyKeys);
    expect(savedValues[0].result).toMatchObject({
      fingerprint: fingerprintRequest("PATCH", batchPath, mixed),
      response: { status: "success" },
    });
    vi.clearAllMocks();
    stored = [savedEnvelope(mixed)];
    await expect(saveContributorChanges(actor, tripId, mixed, replay)).resolves.toEqual({ status: "success" });
    expect(mocks.tripLock).toHaveBeenCalledOnce();
    expect(mocks.batch).not.toHaveBeenCalled();
    expectNoEffects();
  });

  it("conflicts when the same key carries a changed batch", async () => {
    stored = [savedEnvelope(mixed)];
    const changed = { changes: [{ type: "remove", collaboratorId: editorSeat }] };
    await expect(
      saveContributorChanges(actor, tripId, changed, { key: "retry", method: "PATCH", path: batchPath })
    ).rejects.toThrow("different request");
    expect(mocks.batch).not.toHaveBeenCalled();
    expectNoEffects();
  });

  it("emits nothing when the deadline has already elapsed", async () => {
    await expect(runWithRequestDeadline(-1, () => saveContributorChanges(actor, tripId, mixed))).rejects.toThrow(
      "took too long"
    );
    expect(mocks.batch).not.toHaveBeenCalled();
    expectNoEffects();
  });

  it("rolls back writes and the replay row together when the deadline elapses after them", async () => {
    const clock = vi.spyOn(performance, "now").mockReturnValue(0);
    let committed = false;
    let rolledBack = false;
    mocks.transaction.mockImplementation(async (run) => {
      try {
        const result = await run(mocks);
        committed = true;
        return result;
      } catch (error) {
        rolledBack = true;
        throw error;
      }
    });
    mocks.batch.mockResolvedValue(mixedOutcome);
    mocks.insert.mockReturnValue({
      values: () => ({
        onConflictDoUpdate: async () => {
          clock.mockReturnValue(2000);
        },
      }),
    });
    await expect(
      runWithRequestDeadline(1000, () =>
        saveContributorChanges(actor, tripId, mixed, { key: "deadline", method: "PATCH", path: batchPath })
      )
    ).rejects.toThrow("took too long");
    expect(mocks.batch).toHaveBeenCalledOnce();
    expect(mocks.insert).toHaveBeenCalledOnce();
    expect(committed).toBe(false);
    expect(rolledBack).toBe(true);
    expectNoEffects();
    clock.mockRestore();
  });
});
