import { beforeEach, expect, it, vi } from "vitest";
import { idempotencyKeys } from "@/db/schema";
const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
  lockTripForUpdate: vi.fn(),
  requireTripRole: vi.fn(),
  afterTripWrite: vi.fn(),
}));
vi.mock("@/db", () => ({ db: mocks }));
vi.mock("@/lib/server-action-locks", () => ({
  lockTripForUpdate: mocks.lockTripForUpdate,
  TRIP_NOT_FOUND_MESSAGE: "Trip not found.",
}));
vi.mock("./trip-access", async (original) => ({
  ...(await original<typeof import("./trip-access")>()),
  requireTripRole: mocks.requireTripRole,
}));
vi.mock("./trip-write-effects", () => ({ afterTripWrite: mocks.afterTripWrite }));
import { updateChecklistItem } from "./checklists";
import { fingerprintRequest } from "@/lib/api/idempotency";
const itemId = "123e4567-e89b-12d3-a456-426614174000";
const row = { id: itemId, checklistId: "list", content: "Pack", isChecked: true, createdAt: null };
const replay = { key: "retry-1", method: "PATCH", path: `/api/v1/checklist-items/${itemId}` };
let ancestry: { tripId: string }[];
let returned: (typeof row)[];
let stored: { result: unknown }[];
let calls: string[];
function envelope(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    fingerprint: fingerprintRequest("PATCH", replay.path, { isChecked: true }),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    response: { id: itemId, checklistId: "list", content: "Pack", isChecked: true },
    ...overrides,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  ancestry = [{ tripId: "trip" }];
  returned = [row];
  stored = [];
  calls = [];
  mocks.select.mockReturnValue({
    from: (table: unknown) =>
      table === idempotencyKeys
        ? {
            where: async () => {
              calls.push("lookup");
              return stored;
            },
          }
        : { innerJoin: () => ({ innerJoin: () => ({ where: async () => ancestry }) }) },
  });
  mocks.execute.mockImplementation(async (statement: { queryChunks?: unknown[] }) => {
    if (JSON.stringify(statement.queryChunks).includes("pg_advisory_xact_lock")) calls.push("actor-key-lock");
    return [];
  });
  mocks.lockTripForUpdate.mockImplementation(async () => {
    calls.push("trip-lock");
  });
  mocks.insert.mockReturnValue({
    values: () => ({
      onConflictDoUpdate: async () => {
        calls.push("store");
      },
    }),
  });
  mocks.update.mockReturnValue({ set: vi.fn(() => ({ where: () => ({ returning: async () => returned }) })) });
  mocks.transaction.mockImplementation(async (callback) => callback(mocks));
});
it.each([true, false])("writes absolute value %s after locking and rechecking", async (isChecked) => {
  await expect(updateChecklistItem({ userId: "user" }, itemId, { isChecked })).resolves.toMatchObject({ id: itemId });
  expect(mocks.update().set).toHaveBeenCalledWith({ isChecked });
  expect(mocks.lockTripForUpdate).toHaveBeenCalledWith(mocks, "trip");
  expect(mocks.requireTripRole).toHaveBeenCalledWith("trip", "user", "editor", mocks);
  expect(mocks.afterTripWrite).toHaveBeenCalledWith({ userId: "user" }, "trip");
});
it("rejects invalid input before DB access", async () => {
  await expect(updateChecklistItem({ userId: "user" }, itemId, { isChecked: "yes" })).rejects.toThrow();
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});
it("conceals missing ancestry and skips effects on failure", async () => {
  ancestry = [];
  await expect(updateChecklistItem({ userId: "user" }, itemId, { isChecked: true })).rejects.toThrow();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});
it("rejects ancestry removed during locking", async () => {
  mocks.lockTripForUpdate.mockImplementationOnce(async () => {
    ancestry = [];
  });
  await expect(updateChecklistItem({ userId: "user" }, itemId, { isChecked: true })).rejects.toThrow();
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});
it("skips effects for failed access or deleted result", async () => {
  mocks.requireTripRole.mockRejectedValueOnce(new Error("denied"));
  await expect(updateChecklistItem({ userId: "user" }, itemId, { isChecked: true })).rejects.toThrow("denied");
  returned = [];
  await expect(updateChecklistItem({ userId: "user" }, itemId, { isChecked: false })).rejects.toThrow();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it("maps a trip deleted before lock acquisition to not found", async () => {
  mocks.lockTripForUpdate.mockRejectedValueOnce(new Error("Trip not found."));
  await expect(updateChecklistItem({ userId: "user" }, itemId, { isChecked: true })).rejects.toMatchObject({
    name: "TripNotFoundError",
  });
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});
it("propagates unexpected lock failures without side effects", async () => {
  mocks.lockTripForUpdate.mockRejectedValueOnce(new Error("database unavailable"));
  await expect(updateChecklistItem({ userId: "user" }, itemId, { isChecked: true })).rejects.toThrow(
    "database unavailable"
  );
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});
it("rejects changed ancestry instead of writing another trip", async () => {
  mocks.lockTripForUpdate.mockImplementationOnce(async () => {
    ancestry = [{ tripId: "other" }];
  });
  await expect(updateChecklistItem({ userId: "user" }, itemId, { isChecked: true })).rejects.toMatchObject({
    name: "TripNotFoundError",
  });
  expect(mocks.update).not.toHaveBeenCalled();
});

it.each(["viewer", "stranger"])("denies known %s before transaction or exclusive lock", async () => {
  mocks.requireTripRole.mockRejectedValueOnce(new Error("denied"));
  await expect(updateChecklistItem({ userId: "user" }, itemId, { isChecked: true })).rejects.toThrow("denied");
  expect(mocks.transaction).not.toHaveBeenCalled();
  expect(mocks.lockTripForUpdate).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});
it("rechecks access inside the lock after a successful precheck", async () => {
  mocks.requireTripRole.mockResolvedValueOnce("editor").mockRejectedValueOnce(new Error("revoked"));
  await expect(updateChecklistItem({ userId: "user" }, itemId, { isChecked: true })).rejects.toThrow("revoked");
  expect(mocks.requireTripRole).toHaveBeenNthCalledWith(1, "trip", "user", "editor");
  expect(mocks.requireTripRole).toHaveBeenNthCalledWith(2, "trip", "user", "editor", mocks);
  expect(mocks.update).not.toHaveBeenCalled();
});
it("defers effects until the transaction commit resolves", async () => {
  let commit: () => void = () => {
    throw new Error("commit not ready");
  };
  let signalReady: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    signalReady = resolve;
  });
  mocks.transaction.mockImplementationOnce(async (callback) => {
    const result = await callback(mocks);
    await new Promise<void>((resolve) => {
      commit = resolve;
      signalReady();
    });
    return result;
  });
  const pending = updateChecklistItem({ userId: "user" }, itemId, { isChecked: true });
  await ready;
  expect(mocks.update).toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  commit();
  await pending;
  expect(mocks.afterTripWrite).toHaveBeenCalledOnce();
});
it("skips effects when commit rejects after a successful update", async () => {
  mocks.transaction.mockImplementationOnce(async (callback) => {
    await callback(mocks);
    throw new Error("commit rejected");
  });
  await expect(updateChecklistItem({ userId: "user" }, itemId, { isChecked: true })).rejects.toThrow("commit rejected");
  expect(mocks.update).toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it("does not touch replay storage without a key", async () => {
  await updateChecklistItem({ userId: "user" }, itemId, { isChecked: true });
  expect(mocks.execute).not.toHaveBeenCalled();
  expect(mocks.insert).not.toHaveBeenCalled();
});
it("keyed request serializes actor/key, then trip, rechecks access, looks up, writes and stores in one transaction", async () => {
  mocks.update.mockReturnValue({
    set: vi.fn(() => ({
      where: () => ({
        returning: async () => {
          calls.push("update");
          return returned;
        },
      }),
    })),
  });
  await expect(updateChecklistItem({ userId: "user" }, itemId, { isChecked: true }, replay)).resolves.toMatchObject({
    id: itemId,
  });
  expect(calls).toEqual(["actor-key-lock", "trip-lock", "lookup", "update", "store"]);
  expect(mocks.transaction).toHaveBeenCalledOnce();
  expect(mocks.requireTripRole).toHaveBeenLastCalledWith("trip", "user", "editor", mocks);
  expect(mocks.afterTripWrite).toHaveBeenCalledOnce();
});
it("replays the first result with no write or effects, even after an intervening opposite write", async () => {
  stored = [{ result: envelope() }];
  returned = [{ ...row, isChecked: false }];
  await expect(updateChecklistItem({ userId: "user" }, itemId, { isChecked: true }, replay)).resolves.toEqual({
    id: itemId,
    checklistId: "list",
    content: "Pack",
    isChecked: true,
  });
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});
it("never returns a cached result when access is lost while waiting", async () => {
  stored = [{ result: envelope() }];
  mocks.requireTripRole.mockResolvedValueOnce("editor").mockRejectedValueOnce(new Error("role removed"));
  await expect(updateChecklistItem({ userId: "user" }, itemId, { isChecked: true }, replay)).rejects.toThrow(
    "role removed"
  );
  expect(calls).not.toContain("lookup");
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});
it("never returns a cached result when the item disappears while waiting", async () => {
  stored = [{ result: envelope() }];
  mocks.lockTripForUpdate.mockImplementationOnce(async () => {
    ancestry = [];
  });
  await expect(updateChecklistItem({ userId: "user" }, itemId, { isChecked: true }, replay)).rejects.toMatchObject({
    name: "TripNotFoundError",
  });
  expect(calls).not.toContain("lookup");
});
it("hides role-denied replays before any transaction", async () => {
  stored = [{ result: envelope() }];
  mocks.requireTripRole.mockRejectedValueOnce(new Error("viewer"));
  await expect(updateChecklistItem({ userId: "user" }, itemId, { isChecked: true }, replay)).rejects.toThrow("viewer");
  expect(mocks.transaction).not.toHaveBeenCalled();
});
it("fingerprints the service-validated payload and returns 409 for a conflicting reuse", async () => {
  stored = [{ result: envelope() }];
  await expect(updateChecklistItem({ userId: "user" }, itemId, { isChecked: false }, replay)).rejects.toMatchObject({
    status: 409,
    code: "conflict",
  });
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});
it("skips effects when the replay record cannot be written", async () => {
  mocks.insert.mockReturnValue({
    values: () => ({ onConflictDoUpdate: async () => Promise.reject(new Error("no record")) }),
  });
  await expect(updateChecklistItem({ userId: "user" }, itemId, { isChecked: true }, replay)).rejects.toThrow(
    "no record"
  );
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});
it("skips effects when a keyed commit rejects, then a retry executes and runs them once", async () => {
  mocks.transaction.mockImplementationOnce(async (callback) => {
    await callback(mocks);
    throw new Error("commit rejected");
  });
  await expect(updateChecklistItem({ userId: "user" }, itemId, { isChecked: true }, replay)).rejects.toThrow(
    "commit rejected"
  );
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  await expect(updateChecklistItem({ userId: "user" }, itemId, { isChecked: true }, replay)).resolves.toMatchObject({
    id: itemId,
  });
  expect(mocks.afterTripWrite).toHaveBeenCalledOnce();
});
it("defers keyed effects until the commit resolves", async () => {
  let commit: () => void = () => {
    throw new Error("commit not ready");
  };
  let signalReady: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    signalReady = resolve;
  });
  mocks.transaction.mockImplementationOnce(async (callback) => {
    const result = await callback(mocks);
    await new Promise<void>((resolve) => {
      commit = resolve;
      signalReady();
    });
    return result;
  });
  const pending = updateChecklistItem({ userId: "user" }, itemId, { isChecked: true }, replay);
  await ready;
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  commit();
  await pending;
  expect(mocks.afterTripWrite).toHaveBeenCalledOnce();
});
