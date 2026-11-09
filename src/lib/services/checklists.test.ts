import { beforeEach, describe, expect, it, vi } from "vitest";
import { idempotencyKeys, days, itineraryChecklists, checklistItems } from "@/db/schema";
const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
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
import { createChecklist, updateChecklistTitle, deleteChecklist, updateChecklistItem } from "./checklists";
import { fingerprintRequest } from "@/lib/api/idempotency";
import { TripNotFoundError } from "./trip-access";
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

describe("checklist lifecycle", () => {
  const tripId = "123e4567-e89b-12d3-a456-426614174001";
  const dayId = "123e4567-e89b-12d3-a456-426614174002";
  const checklistId = "123e4567-e89b-12d3-a456-426614174003";
  const firstItemId = "123e4567-e89b-12d3-a456-426614174004";
  const actor = { userId: "user" };
  const input = {
    dayId,
    id: checklistId,
    position: 1,
    title: "Pack",
    firstItem: { id: firstItemId, content: "Shoes" },
  };
  const checklistRow = {
    id: checklistId,
    dayId,
    position: 1,
    title: "Pack" as string | null,
    createdAt: null,
    updatedAt: null,
  };
  const firstItem = {
    id: firstItemId,
    checklistId,
    content: "Shoes",
    isChecked: false,
    createdAt: null as Date | null,
  };
  let existing: (typeof checklistRow)[];
  let items: (typeof firstItem)[];
  let foundTrip: string;
  let checklistTrip: string;
  let itemTrip: string;
  let failItem: boolean;
  const orderItems = vi.fn();
  beforeEach(() => {
    existing = [];
    items = [];
    foundTrip = tripId;
    checklistTrip = tripId;
    itemTrip = tripId;
    failItem = false;
    orderItems.mockImplementation(async () =>
      [...items].sort((left, right) => (left.createdAt?.getTime() ?? 0) - (right.createdAt?.getTime() ?? 0))
    );
    mocks.select.mockImplementation((columns?: { tripId?: unknown }) => ({
      from: (table: unknown) => {
        const result = () => {
          if (table === idempotencyKeys) {
            calls.push("lookup");
            return stored;
          }
          return table === days
            ? [{ tripId: foundTrip }]
            : table === itineraryChecklists
              ? existing.map((entry) => ({ checklist: entry, tripId: checklistTrip }))
              : columns?.tripId
                ? [{ tripId: itemTrip }]
                : items;
        };
        const chain = {
          innerJoin: () => chain,
          where: () => Object.assign(Promise.resolve(result()), { orderBy: orderItems }),
        };
        return chain;
      },
    }));
    mocks.insert.mockImplementation((table: unknown) => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          if (table === checklistItems) {
            if (failItem) throw new Error("item failed");
            items = [firstItem];
            return items;
          }
          existing = [{ ...checklistRow, ...values }];
          return existing;
        },
        onConflictDoUpdate: async () => {
          calls.push("store");
        },
      }),
    }));
    mocks.update.mockReturnValue({
      set: vi.fn(() => ({
        where: () => ({ then: (resolve: (value: unknown[]) => void) => resolve([]), returning: async () => existing }),
      })),
    });
    mocks.delete.mockReturnValue({ where: () => ({ returning: async () => existing }) });
  });
  it("maps checklist items in canonical creation order", async () => {
    existing = [checklistRow];
    items = [
      { ...firstItem, id: "later", createdAt: new Date("2026-01-02") },
      { ...firstItem, id: "earlier", createdAt: new Date("2026-01-01") },
    ];
    const result = await updateChecklistTitle(actor, checklistId, {});
    expect(orderItems).toHaveBeenCalledWith(checklistItems.createdAt);
    expect(result.items.map((item) => item.id)).toEqual(["earlier", "later"]);
  });
  it.each(["title", "delete"])("denies locked %s access with and without a cached response", async (operation) => {
    for (const cached of [false, true]) {
      vi.clearAllMocks();
      calls = [];
      existing = [checklistRow];
      const body = operation === "title" ? { title: null } : { tripId };
      const request = { key: "denied", method: operation === "title" ? "PATCH" : "DELETE", path: "/lifecycle" };
      stored = cached
        ? [
            {
              result: envelope({
                fingerprint: fingerprintRequest(request.method, request.path, body),
                response: { title: "Secret cached title" },
              }),
            },
          ]
        : [];
      mocks.requireTripRole.mockResolvedValueOnce("editor").mockRejectedValueOnce(new TripNotFoundError());
      const pending =
        operation === "title"
          ? updateChecklistTitle(actor, checklistId, body, cached ? request : undefined)
          : deleteChecklist(actor, checklistId, body, cached ? request : undefined);
      await expect(pending).rejects.toBeInstanceOf(TripNotFoundError);
      expect(mocks.requireTripRole).toHaveBeenNthCalledWith(1, tripId, actor.userId, "editor");
      expect(mocks.requireTripRole).toHaveBeenNthCalledWith(2, tripId, actor.userId, "editor", mocks);
      expect(calls).not.toContain("lookup");
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.delete).not.toHaveBeenCalled();
      expect(mocks.insert).not.toHaveBeenCalled();
      expect(mocks.afterTripWrite).not.toHaveBeenCalled();
    }
  });
  it.each(["checklist", "first-item"])("conceals inaccessible foreign %s UUID collisions", async (resource) => {
    if (resource === "checklist") {
      existing = [checklistRow];
      checklistTrip = "foreign";
    } else {
      items = [firstItem];
      itemTrip = "foreign";
    }
    mocks.requireTripRole
      .mockResolvedValueOnce("editor")
      .mockResolvedValueOnce("editor")
      .mockRejectedValueOnce(new TripNotFoundError());
    await expect(createChecklist(actor, tripId, input)).rejects.toBeInstanceOf(TripNotFoundError);
    expect(mocks.requireTripRole).toHaveBeenLastCalledWith("foreign", actor.userId, "viewer", mocks);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
    expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  });
  it.each(["create", "title", "delete"])(
    "rejects changed-payload keyed %s conflicts without writes",
    async (operation) => {
      existing = operation === "create" ? [] : [checklistRow];
      const body = operation === "create" ? input : operation === "title" ? { title: null } : { tripId };
      const request = {
        key: "conflict",
        method: operation === "create" ? "POST" : operation === "title" ? "PATCH" : "DELETE",
        path: "/lifecycle",
      };
      const previousBody =
        operation === "create"
          ? { ...input, title: "Previous" }
          : operation === "title"
            ? { title: "Previous" }
            : { tripId: dayId };
      stored = [{ result: envelope({ fingerprint: fingerprintRequest(request.method, request.path, previousBody) }) }];
      const pending =
        operation === "create"
          ? createChecklist(actor, tripId, body, request)
          : operation === "title"
            ? updateChecklistTitle(actor, checklistId, body, request)
            : deleteChecklist(actor, checklistId, body, request);
      await expect(pending).rejects.toMatchObject({ status: 409 });
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.insert).not.toHaveBeenCalled();
      expect(mocks.delete).not.toHaveBeenCalled();
      expect(mocks.afterTripWrite).not.toHaveBeenCalled();
    }
  );
  it("replays original title result after an intervening stored title change", async () => {
    existing = [{ ...checklistRow, title: "Later stored title" }];
    const request = { key: "title-retry", method: "PATCH", path: `/api/v1/checklists/${checklistId}` };
    const original = { id: checklistId, tripDayId: dayId, title: "Original title", position: 1, items: [] };
    stored = [
      {
        result: envelope({
          fingerprint: fingerprintRequest(request.method, request.path, { title: "Original title" }),
          response: original,
        }),
      },
    ];
    await expect(updateChecklistTitle(actor, checklistId, { title: "Original title" }, request)).resolves.toEqual(
      original
    );
    expect(existing[0].title).toBe("Later stored title");
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  });
  it("creates mapped checklist and item atomically, shifting all three timeline tables", async () => {
    const result = await createChecklist(actor, tripId, input);
    expect(result).toMatchObject({ id: checklistId, tripDayId: dayId, items: [{ id: firstItemId, content: "Shoes" }] });
    expect(mocks.update).toHaveBeenCalledTimes(3);
    expect(mocks.lockTripForUpdate).toHaveBeenCalledWith(mocks, tripId);
    expect(mocks.requireTripRole).toHaveBeenLastCalledWith(tripId, actor.userId, "editor", mocks);
    expect(mocks.afterTripWrite).toHaveBeenCalledOnce();
  });
  it("returns matching UUID retries without shifts or effects", async () => {
    existing = [checklistRow];
    items = [firstItem];
    await expect(createChecklist(actor, tripId, input)).resolves.toMatchObject({ id: checklistId });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  });
  it.each(["title", "day", "item", "position"])("rejects UUID collision in %s", async (field) => {
    existing = [
      {
        ...checklistRow,
        ...(field === "title"
          ? { title: "Different" }
          : field === "day"
            ? { dayId: tripId }
            : field === "position"
              ? { position: 4 }
              : {}),
      },
    ];
    items = [{ ...firstItem, ...(field === "item" ? { content: "Different" } : {}) }];
    await expect(createChecklist(actor, tripId, input)).rejects.toMatchObject({ status: 409 });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  });
  it("rejects foreign days before shifting", async () => {
    foundTrip = "other";
    await expect(createChecklist(actor, tripId, input)).rejects.toMatchObject({ name: "TripNotFoundError" });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("keeps failed first item and commit free of effects", async () => {
    failItem = true;
    await expect(createChecklist(actor, tripId, input)).rejects.toThrow("item failed");
    expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  });
  it("rechecks roles under lock before replay lookup", async () => {
    mocks.requireTripRole.mockResolvedValueOnce("editor").mockRejectedValueOnce(new Error("revoked"));
    await expect(createChecklist(actor, tripId, input, { ...replay, method: "POST" })).rejects.toThrow("revoked");
    expect(calls).not.toContain("lookup");
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("preserves omitted or unchanged titles without writes or effects", async () => {
    existing = [checklistRow];
    await updateChecklistTitle(actor, checklistId, {});
    await updateChecklistTitle(actor, checklistId, { title: "Pack" });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  });
  it("clears title with null and returns canonical checklist", async () => {
    existing = [checklistRow];
    await updateChecklistTitle(actor, checklistId, { title: null });
    expect(mocks.update().set).toHaveBeenCalledWith({ title: null, updatedAt: expect.any(Date) });
    expect(mocks.afterTripWrite).toHaveBeenCalledOnce();
  });
  it("requires existing ancestry for rename", async () => {
    await expect(updateChecklistTitle(actor, checklistId, {})).rejects.toMatchObject({ name: "TripNotFoundError" });
  });
  it("deletes existing rows and returns a serializable empty result", async () => {
    existing = [checklistRow];
    await expect(deleteChecklist(actor, checklistId, { tripId })).resolves.toBeNull();
    expect(mocks.delete).toHaveBeenCalledWith(itineraryChecklists);
    expect(mocks.afterTripWrite).toHaveBeenCalledOnce();
  });
  it("authorizes missing-row deletes without effects", async () => {
    await expect(deleteChecklist(actor, checklistId, { tripId })).resolves.toBeNull();
    expect(mocks.requireTripRole).toHaveBeenLastCalledWith(tripId, actor.userId, "editor", mocks);
    expect(mocks.delete).not.toHaveBeenCalled();
    expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  });
  it("conceals mismatched delete ancestry", async () => {
    existing = [checklistRow];
    checklistTrip = "other";
    await expect(deleteChecklist(actor, checklistId, { tripId })).rejects.toMatchObject({ name: "TripNotFoundError" });
    expect(mocks.delete).not.toHaveBeenCalled();
  });
  it("checks visibility of a foreign UUID before returning conflict", async () => {
    existing = [checklistRow];
    checklistTrip = "other";
    await expect(createChecklist(actor, tripId, input)).rejects.toMatchObject({ status: 409 });
    expect(mocks.requireTripRole).toHaveBeenLastCalledWith("other", actor.userId, "viewer", mocks);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("normalizes UUID case before locks and ancestry comparisons", async () => {
    existing = [checklistRow];
    items = [firstItem];
    await expect(
      createChecklist(actor, tripId.toUpperCase(), {
        ...input,
        dayId: dayId.toUpperCase(),
        id: checklistId.toUpperCase(),
        firstItem: { ...input.firstItem, id: firstItemId.toUpperCase() },
      })
    ).resolves.toMatchObject({ id: checklistId });
    expect(mocks.lockTripForUpdate).toHaveBeenCalledWith(mocks, tripId);
    expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  });
  it("creates an empty checklist without client UUIDs", async () => {
    await expect(createChecklist(actor, tripId, { dayId, position: 0 })).resolves.toMatchObject({ items: [] });
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });
  it("returns an empty checklist UUID retry", async () => {
    existing = [{ ...checklistRow, title: null }];
    await expect(createChecklist(actor, tripId, { dayId, id: checklistId, position: 1 })).resolves.toMatchObject({
      items: [],
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("rejects a first-item UUID already used by an authorized checklist", async () => {
    items = [firstItem];
    await expect(createChecklist(actor, tripId, input)).rejects.toMatchObject({ status: 409 });
    expect(mocks.requireTripRole).toHaveBeenLastCalledWith(tripId, actor.userId, "viewer", mocks);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each(["create", "title", "delete"])("denies %s roles before opening a transaction", async (operation) => {
    existing = [checklistRow];
    mocks.requireTripRole.mockRejectedValueOnce(new Error("denied"));
    const pending =
      operation === "create"
        ? createChecklist(actor, tripId, input)
        : operation === "title"
          ? updateChecklistTitle(actor, checklistId, { title: null })
          : deleteChecklist(actor, checklistId, { tripId });
    await expect(pending).rejects.toThrow("denied");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it.each(["create", "title", "delete"])("skips %s effects when the transaction commit rejects", async (operation) => {
    existing = operation === "create" ? [] : [checklistRow];
    mocks.transaction.mockImplementationOnce(async (callback) => {
      await callback(mocks);
      throw new Error("commit rejected");
    });
    const pending =
      operation === "create"
        ? createChecklist(actor, tripId, input)
        : operation === "title"
          ? updateChecklistTitle(actor, checklistId, { title: null })
          : deleteChecklist(actor, checklistId, { tripId });
    await expect(pending).rejects.toThrow("commit rejected");
    expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  });
  it.each(["create", "title", "delete"])("replays %s without mutation or effects", async (operation) => {
    existing = operation === "create" ? [] : [checklistRow];
    const body = operation === "create" ? input : operation === "title" ? { title: null } : { tripId };
    const request = {
      key: "lifecycle",
      method: operation === "create" ? "POST" : operation === "title" ? "PATCH" : "DELETE",
      path: "/lifecycle",
    };
    stored = [
      {
        result: envelope({
          fingerprint: fingerprintRequest(request.method, request.path, body),
          response: operation === "delete" ? null : { id: checklistId },
        }),
      },
    ];
    const value =
      operation === "create"
        ? await createChecklist(actor, tripId, body, request)
        : operation === "title"
          ? await updateChecklistTitle(actor, checklistId, body, request)
          : await deleteChecklist(actor, checklistId, body, request);
    expect(value).toEqual(operation === "delete" ? null : { id: checklistId });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
    expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  });
});
