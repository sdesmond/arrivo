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
  accept: vi.fn(),
  decline: vi.fn(),
  describe: vi.fn(),
  rescind: vi.fn(),
  dismiss: vi.fn(),
  resend: vi.fn(),
  readLeavable: vi.fn(),
  deleteOwn: vi.fn(),
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
  acceptInvitationInTransaction: mocks.accept,
  declineInvitationInTransaction: mocks.decline,
  rescindInvitationInTransaction: mocks.rescind,
  dismissInvitationInTransaction: mocks.dismiss,
  describeUnmatchedInvitationInTransaction: mocks.describe,
  readLeavableMembership: mocks.readLeavable,
  deleteOwnMembership: mocks.deleteOwn,
}));
vi.mock("@/lib/invitation-resend", () => ({ applyInvitationResend: mocks.resend }));
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
import {
  acceptInvitation,
  createInvitation,
  declineInvitation,
  getCollaborators,
  leaveTrip,
  listInvitableUsers,
  saveContributorChanges,
} from "./sharing";
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
let invitationReads: Record<string, unknown>[][];
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

type DecisionRunner = (
  actor: Parameters<typeof acceptInvitation>[0],
  invitationId: string,
  replay?: Parameters<typeof acceptInvitation>[2]
) => Promise<unknown>;

describe.each([
  {
    name: "accept",
    run: acceptInvitation as DecisionRunner,
    mutation: mocks.accept,
    value: { status: "accepted", tripId },
    activity: true,
  },
  {
    name: "decline",
    run: declineInvitation as DecisionRunner,
    mutation: mocks.decline,
    value: { status: "declined" },
    activity: false,
  },
])("$name invitation", ({ name, run, mutation, value, activity }) => {
  const invitationId = "523e4567-e89b-12d3-a456-426614174000";
  const invitee = { userId: "invitee" };
  const path = `/api/v1/invitations/${invitationId}/${name}`;
  const replay = { key: "retry", method: "POST", path };
  const decided = { id: invitationId, tripId, inviteeId: "invitee", role: "editor" };
  function envelope() {
    return {
      result: {
        version: 1,
        fingerprint: fingerprintRequest("POST", path, {}),
        expiresAt: "2999-01-01T00:00:00.000Z",
        response: value,
      },
    };
  }
  function expectNoDecisionEffects() {
    expect(mocks.activity).not.toHaveBeenCalled();
    expect(mocks.tripEvent).not.toHaveBeenCalled();
    expect(mocks.userEvent).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  }
  beforeEach(() => {
    // Pre-lookup finds the lock target; the locked recheck confirms the row is still addressed to the actor.
    invitationReads = [[{ tripId }], [{ id: invitationId }]];
    mutation.mockResolvedValue(decided);
    mocks.describe.mockResolvedValue("This invitation is no longer pending.");
  });

  it("locks user then trip, rechecks the recipient, mutates, then publishes in order after commit", async () => {
    await expect(run(invitee, invitationId)).resolves.toEqual(value);
    expect(mocks.lock).toHaveBeenCalledExactlyOnceWith(mocks, ["invitee"], tripId);
    expect(mutation).toHaveBeenCalledExactlyOnceWith(
      mocks,
      expect.objectContaining({ userId: "invitee", invitationId })
    );
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(mutation.mock.invocationCallOrder[0]);
    if (activity) expect(mocks.activity).toHaveBeenCalledExactlyOnceWith("invitation_accepted", "invitee", tripId);
    else expect(mocks.activity).not.toHaveBeenCalled();
    expect(mocks.tripEvent).toHaveBeenCalledExactlyOnceWith(tripId, {
      type: LiveSyncEventType.MembershipChanged,
      tripId,
    });
    expect(mocks.userEvent.mock.calls).toEqual([
      ["invitee", { type: LiveSyncEventType.MembershipChanged, tripId }],
      ["invitee", { type: LiveSyncEventType.InvitationChanged, tripId }],
    ]);
    expect(mocks.revalidate.mock.calls).toEqual([["/trips"], [`/trips/${tripId}`]]);
  });

  it.each([
    ["foreign or missing invitation", [[]]],
    ["row re-addressed under the lock", [[{ tripId }], []]],
  ])("conceals a %s as not found without writes or effects", async (_label, reads) => {
    invitationReads = reads;
    await expect(run(invitee, invitationId)).rejects.toBeInstanceOf(TripNotFoundError);
    expect(mutation).not.toHaveBeenCalled();
    expectNoDecisionEffects();
  });

  it.each([
    ["account", { locked: false, missing: "user", userId: "invitee" }],
    ["trip", { locked: false, missing: "trip" }],
  ])("is not found when the %s is gone before the lock", async (_label, lock) => {
    mocks.lock.mockResolvedValue(lock);
    await expect(run(invitee, invitationId)).rejects.toBeInstanceOf(TripNotFoundError);
    expect(mutation).not.toHaveBeenCalled();
    expectNoDecisionEffects();
  });

  it("refuses before replay when the recipient recheck fails, even with a saved result", async () => {
    invitationReads = [[{ tripId }], []];
    stored = [envelope()];
    await expect(run(invitee, invitationId, replay)).rejects.toBeInstanceOf(TripNotFoundError);
    expectNoDecisionEffects();
  });

  it("maps a refused mutation to a conflict carrying the refusal message and publishes nothing", async () => {
    mutation.mockResolvedValue(null);
    mocks.describe.mockResolvedValue("This invitation has expired.");
    const failure = run(invitee, invitationId, replay);
    await expect(failure).rejects.toBeInstanceOf(ConflictError);
    await expect(failure).rejects.toThrow("This invitation has expired.");
    expect(mocks.describe).toHaveBeenCalledWith(mocks, invitationId, "invitee");
    expect(mocks.insert).not.toHaveBeenCalled();
    expectNoDecisionEffects();
  });

  it("rejects a malformed invitation id before any lookup", async () => {
    await expect(run(invitee, "invite-1")).rejects.toThrow();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("stores the result with the write and replays it without a second mutation or effects", async () => {
    await run(invitee, invitationId, replay);
    expect(mocks.insert).toHaveBeenCalledWith(idempotencyKeys);
    expect(savedValues[0].result).toMatchObject({
      fingerprint: fingerprintRequest("POST", path, {}),
      response: value,
    });
    vi.clearAllMocks();
    invitationReads = [[{ tripId }], [{ id: invitationId }]];
    stored = [envelope()];
    await expect(run(invitee, invitationId, replay)).resolves.toEqual(value);
    expect(mocks.lock).toHaveBeenCalledOnce();
    expect(mutation).not.toHaveBeenCalled();
    expectNoDecisionEffects();
  });

  it("conflicts when the same key was saved for a different path", async () => {
    stored = [envelope()];
    const other = { ...replay, path: "/api/v1/invitations/other/accept" };
    await expect(run(invitee, invitationId, other)).rejects.toThrow("different request");
    expect(mutation).not.toHaveBeenCalled();
    expectNoDecisionEffects();
  });

  it("propagates unexpected write failures without effects", async () => {
    mutation.mockRejectedValue(new Error("connection reset"));
    await expect(run(invitee, invitationId)).rejects.toThrow("connection reset");
    expectNoDecisionEffects();
  });

  it("emits nothing when the deadline has already elapsed", async () => {
    await expect(runWithRequestDeadline(-1, () => run(invitee, invitationId))).rejects.toThrow("took too long");
    expect(mutation).not.toHaveBeenCalled();
    expectNoDecisionEffects();
  });

  it("rolls back the decision and the replay row together when the deadline elapses after them", async () => {
    const clock = vi.spyOn(performance, "now").mockReturnValue(0);
    let committed = false;
    let rolledBack = false;
    mocks.transaction.mockImplementation(async (runner) => {
      try {
        const result = await runner(mocks);
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
    await expect(runWithRequestDeadline(1000, () => run(invitee, invitationId, replay))).rejects.toThrow(
      "took too long"
    );
    expect(mutation).toHaveBeenCalledOnce();
    expect(committed).toBe(false);
    expect(rolledBack).toBe(true);
    expectNoDecisionEffects();
    clock.mockRestore();
  });
});

describe.each(["resend", "rescind", "dismiss"] as const)("manager %s invitation", (operation) => {
  it("locks and authorizes before mutation and publishes after commit", async () => {
    const service = await import("./sharing");
    const mutation = mocks[operation];
    mutation.mockResolvedValue(
      operation === "resend"
        ? { status: "success", expiresAt: "2030-01-01T00:00:00.000Z", inviteeId: "invitee" }
        : { id: inviteId, inviteeId: "invitee" }
    );
    await service[(operation + "Invitation") as "resendInvitation"](actor, tripId, inviteId);
    expect(mocks.lock).toHaveBeenCalledWith(mocks, [actor.userId], tripId);
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(mocks.access.mock.invocationCallOrder.at(-1)!);
    expect(mocks.access.mock.invocationCallOrder.at(-1)!).toBeLessThan(mutation.mock.invocationCallOrder[0]);
    expect(mocks.tripEvent).toHaveBeenCalledOnce();
    expect(mocks.revalidate.mock.calls).toEqual(
      operation === "resend" ? [[`/trips/${tripId}`]] : [["/trips"], [`/trips/${tripId}`]]
    );
  });
});

describe.each(["resend", "rescind", "dismiss"] as const)("manager %s replay and refusals", (operation) => {
  const path =
    operation === "rescind"
      ? `/api/v1/trips/${tripId}/invitations/${inviteId}`
      : `/api/v1/invitations/${inviteId}/${operation}`;
  const method = operation === "rescind" ? "DELETE" : "POST";
  const replay = { key: "retry", method, path };
  const payload = operation === "rescind" ? {} : { tripId };
  const value =
    operation === "resend" ? { status: "success", expiresAt: "2030-01-01T00:00:00.000Z" } : { status: "success" };
  async function run() {
    const service = await import("./sharing");
    return service[(operation + "Invitation") as "resendInvitation"](actor, tripId, inviteId, replay);
  }
  function noEffects() {
    expect(mocks.activity).not.toHaveBeenCalled();
    expect(mocks.tripEvent).not.toHaveBeenCalled();
    expect(mocks.userEvent).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  }
  it("replays after locked manager recheck without reading or mutating the invitation", async () => {
    stored = [
      {
        result: {
          version: 1,
          fingerprint: fingerprintRequest(method, path, payload),
          expiresAt: "2999-01-01T00:00:00.000Z",
          response: value,
        },
      },
    ];
    await expect(run()).resolves.toEqual(value);
    expect(mocks.lock).toHaveBeenCalledOnce();
    expect(mocks.access).toHaveBeenCalledWith(tripId, actor.userId, "manager", mocks);
    expect(mocks[operation]).not.toHaveBeenCalled();
    noEffects();
  });
  it("does not read replay or mutate after loss of manager access", async () => {
    mocks.access.mockRejectedValue(new TripForbiddenError("manager"));
    await expect(run()).rejects.toBeInstanceOf(TripForbiddenError);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks[operation]).not.toHaveBeenCalled();
    noEffects();
  });
  it("rejects a key saved for another request before mutation", async () => {
    stored = [
      {
        result: {
          version: 1,
          fingerprint: fingerprintRequest(method, path + "/other", payload),
          expiresAt: "2999-01-01T00:00:00.000Z",
          response: value,
        },
      },
    ];
    await expect(run()).rejects.toThrow("different request");
    expect(mocks[operation]).not.toHaveBeenCalled();
    noEffects();
  });
  it("rolls back mutation and replay when the deadline elapses", async () => {
    const clock = vi.spyOn(performance, "now").mockReturnValue(0);
    let committed = false;
    mocks.transaction.mockImplementation(async (runner) => {
      const result = await runner(mocks);
      committed = true;
      return result;
    });
    mocks[operation].mockResolvedValue(
      operation === "resend" ? { ...value, inviteeId: "invitee" } : { id: inviteId, inviteeId: "invitee" }
    );
    mocks.insert.mockReturnValue({
      values: () => ({
        onConflictDoUpdate: async () => {
          clock.mockReturnValue(2000);
        },
      }),
    });
    await expect(runWithRequestDeadline(1000, run)).rejects.toThrow("took too long");
    expect(committed).toBe(false);
    noEffects();
    clock.mockRestore();
  });
  it("conceals missing or foreign invitations", async () => {
    if (operation === "resend") mocks.resend.mockResolvedValue({ status: "error", message: "Invitation not found." });
    else mocks[operation].mockResolvedValue(null);
    await expect(run()).rejects.toBeInstanceOf(TripNotFoundError);
    noEffects();
  });
  it("returns a state conflict without effects", async () => {
    if (operation === "resend")
      mocks.resend.mockResolvedValue({ status: "error", message: "Invitation is no longer pending." });
    else {
      mocks[operation].mockResolvedValue(null);
      invitationReads = [[{ id: inviteId }]];
    }
    await expect(run()).rejects.toThrow(
      operation === "dismiss" ? "Invitation is still pending." : "Invitation is no longer pending."
    );
    noEffects();
  });
});

describe("leaveTrip", () => {
  const member = { userId: "member" };
  const path = `/api/v1/trips/${tripId}/collaborators/me`;
  const replay = { key: "leave-1", method: "DELETE", path };
  function envelope() {
    return {
      result: {
        version: 1,
        fingerprint: fingerprintRequest("DELETE", path, {}),
        expiresAt: "2999-01-01T00:00:00.000Z",
        response: null,
      },
    };
  }
  function expectNoLeaveEffects() {
    expect(mocks.userEvent).not.toHaveBeenCalled();
    expect(mocks.removeSubscribers).not.toHaveBeenCalled();
    expect(mocks.tripEvent).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  }
  beforeEach(() => {
    mocks.readLeavable.mockResolvedValue({ id: "seat" });
    mocks.deleteOwn.mockResolvedValue(undefined);
  });

  it("locks the trip, rechecks membership, deletes only that seat, then publishes in order after commit", async () => {
    await expect(leaveTrip(member, tripId.toUpperCase())).resolves.toBeNull();
    expect(mocks.tripLock).toHaveBeenCalledExactlyOnceWith(mocks, tripId);
    expect(mocks.readLeavable).toHaveBeenCalledExactlyOnceWith(mocks, { tripId, userId: "member" });
    expect(mocks.deleteOwn).toHaveBeenCalledExactlyOnceWith(mocks, { membershipId: "seat", userId: "member" });
    expect(mocks.tripLock.mock.invocationCallOrder[0]).toBeLessThan(mocks.readLeavable.mock.invocationCallOrder[0]);
    expect(mocks.readLeavable.mock.invocationCallOrder[0]).toBeLessThan(mocks.deleteOwn.mock.invocationCallOrder[0]);
    expect(mocks.userEvent).toHaveBeenCalledExactlyOnceWith("member", {
      type: LiveSyncEventType.MembershipLeft,
      tripId,
    });
    expect(mocks.removeSubscribers).toHaveBeenCalledExactlyOnceWith(tripId, "member");
    expect(mocks.tripEvent).toHaveBeenCalledExactlyOnceWith(tripId, {
      type: LiveSyncEventType.MembershipChanged,
      tripId,
    });
    expect(mocks.deleteOwn.mock.invocationCallOrder[0]).toBeLessThan(mocks.userEvent.mock.invocationCallOrder[0]);
    expect(mocks.userEvent.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.removeSubscribers.mock.invocationCallOrder[0]
    );
    expect(mocks.removeSubscribers.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.tripEvent.mock.invocationCallOrder[0]
    );
    expect(mocks.revalidate.mock.calls).toEqual([[`/trips/${tripId}`], ["/trips"]]);
    expect(mocks.activity).not.toHaveBeenCalled();
  });

  it.each([
    ["without a key", undefined],
    ["with a key, even one that has a saved result", replay],
  ])("answers an absent membership %s with success, no replay access and no effects", async (_label, request) => {
    stored = [envelope()];
    mocks.readLeavable.mockRejectedValue(
      new ContributorChangeGuardError("You're no longer on this trip.", { stale: true })
    );
    await expect(leaveTrip(member, tripId, request)).resolves.toBeNull();
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.deleteOwn).not.toHaveBeenCalled();
    expectNoLeaveEffects();
  });

  it("answers a trip missing under the lock with the same success", async () => {
    mocks.tripLock.mockRejectedValue(new Error(TRIP_NOT_FOUND_MESSAGE));
    await expect(leaveTrip(member, tripId, replay)).resolves.toBeNull();
    expect(mocks.readLeavable).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expectNoLeaveEffects();
  });

  it("propagates unexpected lock failures", async () => {
    mocks.tripLock.mockRejectedValue(new Error("connection reset"));
    await expect(leaveTrip(member, tripId)).rejects.toThrow("connection reset");
    expectNoLeaveEffects();
  });

  it.each(["The trip creator can't leave this trip.", "Managers can't leave a trip."])(
    "refuses a protected membership (%s) as a validation error without writes or effects",
    async (message) => {
      mocks.readLeavable.mockRejectedValue(new ContributorChangeGuardError(message));
      const failure = leaveTrip(member, tripId, replay);
      await expect(failure).rejects.toBeInstanceOf(ValidationFailedError);
      await expect(failure).rejects.toThrow(message);
      expect(mocks.deleteOwn).not.toHaveBeenCalled();
      expect(mocks.insert).not.toHaveBeenCalled();
      expectNoLeaveEffects();
    }
  );

  it("rejects a malformed trip id before any transaction", async () => {
    await expect(leaveTrip(member, "trip-1")).rejects.toThrow();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("stores the response with the write and replays it without a second delete or effects", async () => {
    await leaveTrip(member, tripId, replay);
    expect(mocks.insert).toHaveBeenCalledWith(idempotencyKeys);
    expect(savedValues[0].result).toMatchObject({
      fingerprint: fingerprintRequest("DELETE", path, {}),
      response: null,
    });
    vi.clearAllMocks();
    mocks.readLeavable.mockResolvedValue({ id: "seat" });
    stored = [envelope()];
    await expect(leaveTrip(member, tripId, replay)).resolves.toBeNull();
    // A member who rejoined and reuses the old key: membership is rechecked, but nothing is removed again.
    expect(mocks.readLeavable).toHaveBeenCalledOnce();
    expect(mocks.deleteOwn).not.toHaveBeenCalled();
    expectNoLeaveEffects();
  });

  it("conflicts when the key was saved for a different request while membership exists", async () => {
    stored = [envelope()];
    const other = { ...replay, path: "/api/v1/trips/other/collaborators/me" };
    await expect(leaveTrip(member, tripId, other)).rejects.toBeInstanceOf(ConflictError);
    expect(mocks.deleteOwn).not.toHaveBeenCalled();
    expectNoLeaveEffects();
  });

  it("propagates unexpected write failures without effects", async () => {
    mocks.deleteOwn.mockRejectedValue(new Error("connection reset"));
    await expect(leaveTrip(member, tripId)).rejects.toThrow("connection reset");
    expectNoLeaveEffects();
  });

  it("emits nothing when the deadline has already elapsed", async () => {
    await expect(runWithRequestDeadline(-1, () => leaveTrip(member, tripId))).rejects.toThrow("took too long");
    expect(mocks.deleteOwn).not.toHaveBeenCalled();
    expectNoLeaveEffects();
  });

  it("rolls back the departure and the replay row together when the deadline elapses after them", async () => {
    const clock = vi.spyOn(performance, "now").mockReturnValue(0);
    let committed = false;
    let rolledBack = false;
    mocks.transaction.mockImplementation(async (runner) => {
      try {
        const result = await runner(mocks);
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
    await expect(runWithRequestDeadline(1000, () => leaveTrip(member, tripId, replay))).rejects.toThrow(
      "took too long"
    );
    expect(mocks.deleteOwn).toHaveBeenCalledOnce();
    expect(committed).toBe(false);
    expect(rolledBack).toBe(true);
    expectNoLeaveEffects();
    clock.mockRestore();
  });
});
