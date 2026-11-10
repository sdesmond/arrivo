import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import {
  idempotencyKeys,
  days,
  itineraryChecklists,
  checklistItems,
  packingItems,
  packingTemplateItems,
  packingTemplates,
  tripPackingLists,
} from "@/db/schema";
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
import { ConflictError } from "./conflict-error";
import {
  createChecklist,
  updateChecklistTitle,
  deleteChecklist,
  updateChecklistItem,
  createChecklistItem,
  deleteChecklistItem,
} from "./checklists";
import { fingerprintRequest } from "@/lib/api/idempotency";
import { TripNotFoundError } from "./trip-access";
const itemId = "123e4567-e89b-12d3-a456-426614174000";
const row = { id: itemId, checklistId: "list", content: "Pack", isChecked: true, createdAt: null };
const replay = { key: "retry-1", method: "PATCH", path: `/api/v1/checklist-items/${itemId}` };
let ancestry: { tripId: string }[];
let returned: (typeof row)[];
let stored: { result: unknown }[];
let current: typeof row;
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
  // The stored item differs from every patch below unless a test says otherwise, so a write is expected.
  current = { ...row, isChecked: false };
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
        : {
            where: async () => [current],
            innerJoin: () => ({ innerJoin: () => ({ where: async () => ancestry }) }),
          },
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
  current = { ...row, isChecked: !isChecked };
  await expect(updateChecklistItem({ userId: "user" }, itemId, { isChecked })).resolves.toMatchObject({ id: itemId });
  expect(mocks.update().set).toHaveBeenCalledWith({ isChecked });
  expect(mocks.lockTripForUpdate).toHaveBeenCalledWith(mocks, "trip");
  expect(mocks.requireTripRole).toHaveBeenCalledWith("trip", "user", "editor", mocks);
  expect(mocks.afterTripWrite).toHaveBeenCalledWith({ userId: "user" }, "trip");
});
it.each([true, false])("skips the write and effects when the checked state is already %s", async (isChecked) => {
  current = { ...row, isChecked };
  await expect(updateChecklistItem({ userId: "user" }, itemId, { isChecked })).resolves.toMatchObject({
    id: itemId,
    isChecked,
  });
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
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
  await expect(updateChecklistItem({ userId: "user" }, itemId, { isChecked: true })).rejects.toThrow();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});
it("conceals an item deleted before the locked read", async () => {
  mocks.select.mockReturnValue({
    from: (table: unknown) =>
      table === idempotencyKeys
        ? { where: async () => stored }
        : {
            where: async () => [],
            innerJoin: () => ({ innerJoin: () => ({ where: async () => ancestry }) }),
          },
  });
  await expect(updateChecklistItem({ userId: "user" }, itemId, { isChecked: true })).rejects.toBeInstanceOf(
    TripNotFoundError
  );
  expect(mocks.update).not.toHaveBeenCalled();
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
  await expect(updateChecklistItem({ userId: "user" }, itemId, { isChecked: false }, replay)).rejects.toBeInstanceOf(
    ConflictError
  );
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
  let itemGone: boolean;
  const orderItems = vi.fn();
  beforeEach(() => {
    existing = [];
    items = [];
    foundTrip = tripId;
    checklistTrip = tripId;
    itemTrip = tripId;
    failItem = false;
    // A client first-item id is free unless a test says otherwise; item-lifecycle tests start with the item stored.
    itemGone = true;
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
                ? itemGone
                  ? []
                  : [{ tripId: itemTrip }]
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
      itemGone = false;
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
      await expect(pending).rejects.toBeInstanceOf(ConflictError);
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
  it("rejects a blank first item before any lock or write", async () => {
    await expect(createChecklist(actor, tripId, { ...input, firstItem: { content: "   " } })).rejects.toThrow();
    expect(mocks.lockTripForUpdate).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  });
  it("returns matching UUID retries without shifts or effects", async () => {
    existing = [checklistRow];
    items = [firstItem];
    await expect(createChecklist(actor, tripId, input)).resolves.toMatchObject({ id: checklistId });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  });
  it("replays a UUID retry whose position drifted, without shifts, writes or effects", async () => {
    existing = [{ ...checklistRow, position: 4 }];
    items = [firstItem];
    await expect(createChecklist(actor, tripId, input)).resolves.toMatchObject({ id: checklistId, position: 4 });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  });
  it.each(["title", "day", "item"])("rejects UUID collision in %s", async (field) => {
    existing = [
      {
        ...checklistRow,
        ...(field === "title" ? { title: "Different" } : field === "day" ? { dayId: tripId } : {}),
      },
    ];
    items = [{ ...firstItem, ...(field === "item" ? { content: "Different" } : {}) }];
    await expect(createChecklist(actor, tripId, input)).rejects.toBeInstanceOf(ConflictError);
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
    await expect(createChecklist(actor, tripId, input)).rejects.toBeInstanceOf(ConflictError);
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
  it("claims first-item and checklist UUID locks in sorted order before the trip lock", async () => {
    await createChecklist(actor, tripId, input);
    const resources = mocks.execute.mock.calls
      .map(([statement]) => JSON.stringify(statement.queryChunks))
      .filter((text) => text.includes("pg_advisory_xact_lock"));
    expect(resources).toHaveLength(2);
    expect(resources[0]).toContain(`checklist-item:${firstItemId}`);
    expect(resources[1]).toContain(`checklist:${checklistId}`);
    expect(calls).toEqual(["actor-key-lock", "actor-key-lock", "trip-lock"]);
  });
  it("reports a first-item UUID owned by a readable foreign trip only as a conflict", async () => {
    items = [firstItem];
    itemTrip = "foreign";
    itemGone = false;
    await expect(createChecklist(actor, tripId, input)).rejects.toBeInstanceOf(ConflictError);
    expect(mocks.requireTripRole).toHaveBeenLastCalledWith("foreign", actor.userId, "viewer", mocks);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  });
  it("rejects a first-item UUID already used by an authorized checklist", async () => {
    items = [firstItem];
    itemGone = false;
    await expect(createChecklist(actor, tripId, input)).rejects.toBeInstanceOf(ConflictError);
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

  describe("packing source", () => {
    const sourceId = "123e4567-e89b-12d3-a456-426614174006";
    const source = { type: "template" as const, id: sourceId };
    const dialect = new PgDialect();
    let header: { name: string }[];
    let contents: string[];
    let sourceReads: { table: unknown; where: unknown }[];
    let itemInserts: Record<string, unknown>[][];
    let checklistInserts: Record<string, unknown>[];
    let failItems: boolean;
    function render(condition: unknown) {
      return dialect.sqlToQuery(condition as SQL);
    }
    function stamps(): string[] {
      return itemInserts[0].map((values) => render(values.createdAt).sql);
    }
    function lockedResources(): string[] {
      return mocks.execute.mock.calls
        .map(([statement]) => JSON.stringify(statement.queryChunks))
        .filter((text) => text.includes("pg_advisory_xact_lock"));
    }
    beforeEach(() => {
      header = [{ name: "Beach" }];
      contents = ["Sunscreen", "Towel"];
      sourceReads = [];
      itemInserts = [];
      checklistInserts = [];
      failItems = false;
      existing = [];
      const lifecycleSelect = mocks.select.getMockImplementation()!;
      mocks.select.mockImplementation((columns?: { tripId?: unknown }) => ({
        from: (table: unknown) => {
          if (table === packingTemplates || table === tripPackingLists)
            return {
              where: async (condition: unknown) => {
                calls.push("source");
                sourceReads.push({ table, where: condition });
                return header;
              },
            };
          if (table === packingTemplateItems || table === packingItems)
            return {
              where: (condition: unknown) => {
                sourceReads.push({ table, where: condition });
                return {
                  orderBy: async () =>
                    contents.map((content) => (table === packingItems ? { name: content } : { text: content })),
                };
              },
            };
          return lifecycleSelect(columns).from(table);
        },
      }));
      mocks.insert.mockImplementation((table: unknown) => ({
        values: (values: Record<string, unknown> | Record<string, unknown>[]) => ({
          returning: async () => {
            if (table === checklistItems) {
              if (failItems) throw new Error("item failed");
              const batch = Array.isArray(values) ? values : [values];
              itemInserts.push(batch);
              return batch.map((entry, index) => ({ ...firstItem, id: `item-${index}`, content: entry.content }));
            }
            checklistInserts.push(values as Record<string, unknown>);
            existing = [{ ...checklistRow, ...(values as object) }];
            return existing;
          },
          onConflictDoUpdate: async () => {
            calls.push("store");
          },
        }),
      }));
    });
    const input = (overrides: Record<string, unknown> = {}) => ({ dayId, position: 2, source, ...overrides });

    it.each([
      ["template", "user_id"],
      ["packing-list", "trip_id"],
    ] as const)("copies a %s's title and ordered unchecked non-label items", async (type, scope) => {
      const result = await createChecklist(actor, tripId, input({ source: { type, id: sourceId.toUpperCase() } }));
      expect(result).toMatchObject({ title: "Beach", position: 2, tripDayId: dayId });
      expect(result.items.map((item) => [item.content, item.isChecked])).toEqual([
        ["Sunscreen", false],
        ["Towel", false],
      ]);
      expect(checklistInserts[0]).toMatchObject({ dayId, position: 2, title: "Beach" });
      const [headerRead, itemRead] = sourceReads;
      expect(headerRead.table).toBe(type === "template" ? packingTemplates : tripPackingLists);
      expect(render(headerRead.where).sql).toContain(scope);
      expect(render(headerRead.where).params).toEqual(
        expect.arrayContaining([sourceId, scope === "user_id" ? actor.userId : tripId])
      );
      expect(itemRead.table).toBe(type === "template" ? packingTemplateItems : packingItems);
      expect(render(itemRead.where).sql).toContain("is_label");
      expect(render(itemRead.where).params).toEqual(expect.arrayContaining([sourceId, false]));
      expect(mocks.update).toHaveBeenCalledTimes(3);
      expect(mocks.afterTripWrite).toHaveBeenCalledOnce();
    });
    it("inserts the items as one batch with strictly increasing creation stamps ending at the clock", async () => {
      contents = ["A", "B", "C"];
      await createChecklist(actor, tripId, input());
      expect(itemInserts).toHaveLength(1);
      expect(itemInserts[0].map((values) => values.content)).toEqual(["A", "B", "C"]);
      expect(stamps()).toEqual([
        "clock_timestamp() - (2 * interval '1 microsecond')",
        "clock_timestamp() - (1 * interval '1 microsecond')",
        "clock_timestamp()",
      ]);
    });
    it("stores source text verbatim without new caps or trimming", async () => {
      const longName = "N".repeat(500);
      const longItem = `  ${"x".repeat(1000)}  `;
      header = [{ name: longName }];
      contents = [longItem];
      const result = await createChecklist(actor, tripId, input());
      expect(result.title).toBe(longName);
      expect(itemInserts[0][0].content).toBe(longItem);
    });
    it("creates a titled empty checklist, shifting the mixed timeline, when the source has no usable items", async () => {
      contents = [];
      const result = await createChecklist(actor, tripId, input());
      expect(result).toMatchObject({ title: "Beach", items: [] });
      expect(itemInserts).toEqual([]);
      expect(mocks.update).toHaveBeenCalledTimes(3);
      expect(mocks.afterTripWrite).toHaveBeenCalledOnce();
    });
    it("reads the source under the trip lock and role recheck, before any stored result", async () => {
      const request = { key: "src", method: "POST", path: "/lifecycle" };
      await createChecklist(actor, tripId, input(), request);
      expect(calls).toEqual(["actor-key-lock", "trip-lock", "source", "lookup", "store"]);
      expect(mocks.requireTripRole).toHaveBeenLastCalledWith(tripId, actor.userId, "editor", mocks);
      expect(mocks.afterTripWrite).toHaveBeenCalledOnce();
    });
    it.each(["template", "packing-list"] as const)(
      "conceals a foreign or missing %s without reading items or writing",
      async (type) => {
        header = [];
        await expect(createChecklist(actor, tripId, input({ source: { type, id: sourceId } }))).rejects.toBeInstanceOf(
          TripNotFoundError
        );
        expect(sourceReads).toHaveLength(1);
        expect(mocks.update).not.toHaveBeenCalled();
        expect(mocks.insert).not.toHaveBeenCalled();
        expect(mocks.afterTripWrite).not.toHaveBeenCalled();
      }
    );
    it("rejects a day from another trip before reading the source", async () => {
      foundTrip = "other";
      await expect(createChecklist(actor, tripId, input())).rejects.toBeInstanceOf(TripNotFoundError);
      expect(sourceReads).toEqual([]);
      expect(mocks.update).not.toHaveBeenCalled();
    });
    it("denies a viewer before any transaction", async () => {
      mocks.requireTripRole.mockRejectedValueOnce(new Error("viewer"));
      await expect(createChecklist(actor, tripId, input())).rejects.toThrow("viewer");
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(sourceReads).toEqual([]);
    });
    it("reauthorizes the source before replaying a stored result", async () => {
      const request = { key: "src-replay", method: "POST", path: "/lifecycle" };
      stored = [
        {
          result: envelope({
            fingerprint: fingerprintRequest(request.method, request.path, input()),
            response: { id: checklistId, title: "Secret cached title" },
          }),
        },
      ];
      header = [];
      await expect(createChecklist(actor, tripId, input(), request)).rejects.toBeInstanceOf(TripNotFoundError);
      expect(calls).not.toContain("lookup");
      expect(mocks.afterTripWrite).not.toHaveBeenCalled();
    });
    it("replays the original keyed result even after the source changed, without writes or effects", async () => {
      const request = { key: "src-replay", method: "POST", path: "/lifecycle" };
      const original = { id: checklistId, title: "Original", position: 2, tripDayId: dayId, items: [] };
      stored = [
        { result: envelope({ fingerprint: fingerprintRequest("POST", "/lifecycle", input()), response: original }) },
      ];
      await expect(createChecklist(actor, tripId, input(), request)).resolves.toEqual(original);
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.insert).not.toHaveBeenCalled();
      expect(mocks.afterTripWrite).not.toHaveBeenCalled();
    });
    it("rejects a key reused with a different source without writing", async () => {
      const request = { key: "src-conflict", method: "POST", path: "/lifecycle" };
      stored = [
        {
          result: envelope({
            fingerprint: fingerprintRequest(
              "POST",
              "/lifecycle",
              input({ source: { ...source, type: "packing-list" } })
            ),
          }),
        },
      ];
      await expect(createChecklist(actor, tripId, input(), request)).rejects.toBeInstanceOf(ConflictError);
      expect(mocks.insert).not.toHaveBeenCalled();
      expect(mocks.afterTripWrite).not.toHaveBeenCalled();
    });
    describe("client UUID", () => {
      beforeEach(() => {
        existing = [{ ...checklistRow, position: 2, title: "Beach" }];
        items = [
          { ...firstItem, id: "a", content: "Sunscreen" },
          { ...firstItem, id: "b", content: "Towel" },
        ];
      });
      it("returns the stored row for a matching retry without writes or effects", async () => {
        await expect(createChecklist(actor, tripId, input({ id: checklistId }))).resolves.toMatchObject({
          id: checklistId,
          title: "Beach",
        });
        expect(mocks.update).not.toHaveBeenCalled();
        expect(mocks.insert).not.toHaveBeenCalled();
        expect(mocks.afterTripWrite).not.toHaveBeenCalled();
      });
      it("replays a matching retry whose position drifted, without writes or effects", async () => {
        existing = [{ ...existing[0], position: 5 }];
        await expect(createChecklist(actor, tripId, input({ id: checklistId }))).resolves.toMatchObject({
          id: checklistId,
          position: 5,
        });
        expect(mocks.update).not.toHaveBeenCalled();
        expect(mocks.insert).not.toHaveBeenCalled();
        expect(mocks.afterTripWrite).not.toHaveBeenCalled();
      });
      it("claims only the checklist UUID lock before the trip lock", async () => {
        await createChecklist(actor, tripId, input({ id: checklistId }));
        expect(lockedResources()).toHaveLength(1);
        expect(lockedResources()[0]).toContain(`checklist:${checklistId}`);
      });
      it.each([
        ["title", () => (header = [{ name: "Renamed" }])],
        ["item text", () => (contents = ["Sunscreen", "Hat"])],
        ["item count", () => (contents = ["Sunscreen"])],
        ["item order", () => (contents = ["Towel", "Sunscreen"])],
        ["checked state", () => (items = items.map((item) => ({ ...item, isChecked: true })))],
      ])("rejects a UUID whose stored %s differs from the source", async (_name, change) => {
        change();
        await expect(createChecklist(actor, tripId, input({ id: checklistId }))).rejects.toBeInstanceOf(ConflictError);
        expect(mocks.update).not.toHaveBeenCalled();
        expect(mocks.insert).not.toHaveBeenCalled();
        expect(mocks.afterTripWrite).not.toHaveBeenCalled();
      });
      it("conceals a collision with an inaccessible foreign checklist, after authorizing the source", async () => {
        checklistTrip = "foreign";
        mocks.requireTripRole
          .mockResolvedValueOnce("editor")
          .mockResolvedValueOnce("editor")
          .mockRejectedValueOnce(new TripNotFoundError());
        await expect(createChecklist(actor, tripId, input({ id: checklistId }))).rejects.toBeInstanceOf(
          TripNotFoundError
        );
        expect(sourceReads.length).toBeGreaterThan(0);
        expect(mocks.insert).not.toHaveBeenCalled();
        expect(mocks.afterTripWrite).not.toHaveBeenCalled();
      });
    });
    it("rolls back when the item insert fails, with no effects", async () => {
      failItems = true;
      await expect(createChecklist(actor, tripId, input())).rejects.toThrow("item failed");
      expect(mocks.afterTripWrite).not.toHaveBeenCalled();
      expect(calls).not.toContain("store");
    });
    it("rolls back when the replay record or commit fails, with no effects", async () => {
      const request = { key: "src-fail", method: "POST", path: "/lifecycle" };
      const original = mocks.insert.getMockImplementation()!;
      mocks.insert.mockImplementation((table: unknown) =>
        table === idempotencyKeys
          ? { values: () => ({ onConflictDoUpdate: async () => Promise.reject(new Error("no record")) }) }
          : original(table)
      );
      await expect(createChecklist(actor, tripId, input(), request)).rejects.toThrow("no record");
      mocks.insert.mockImplementation(original);
      mocks.transaction.mockImplementationOnce(async (callback) => {
        await callback(mocks);
        throw new Error("commit rejected");
      });
      await expect(createChecklist(actor, tripId, input())).rejects.toThrow("commit rejected");
      expect(mocks.afterTripWrite).not.toHaveBeenCalled();
    });
    it("rejects an invalid or mixed source before any database access", async () => {
      mocks.select.mockClear();
      for (const body of [
        { dayId, position: 0, source: { type: "event", id: sourceId } },
        { dayId, position: 0, source: { type: "template", id: "bad" } },
        input({ title: "Mixed" }),
        input({ firstItem: { content: "Mixed" } }),
      ])
        await expect(createChecklist(actor, tripId, body)).rejects.toThrow();
      expect(mocks.select).not.toHaveBeenCalled();
      expect(mocks.transaction).not.toHaveBeenCalled();
    });
  });

  describe("item lifecycle", () => {
    const itemRowId = "123e4567-e89b-12d3-a456-426614174005";
    const storedItem = { ...firstItem, id: itemRowId };
    let inserted: Record<string, unknown>[];
    function lockedResources(): string[] {
      return mocks.execute.mock.calls
        .map(([statement]) => JSON.stringify(statement.queryChunks))
        .filter((text) => text.includes("pg_advisory_xact_lock"));
    }
    beforeEach(() => {
      existing = [checklistRow];
      items = [];
      itemGone = false;
      inserted = [];
      mocks.insert.mockImplementation((table: unknown) => ({
        values: (values: Record<string, unknown>) => ({
          returning: async () => {
            if (table === checklistItems) {
              inserted.push(values);
              return [{ ...storedItem, ...(values.id ? { id: values.id } : {}), content: values.content }];
            }
            return [{ ...checklistRow, ...values }];
          },
          onConflictDoUpdate: async () => {
            calls.push("store");
          },
        }),
      }));
    });
    it("creates a trimmed item after locking the trip and rechecking the role, then runs effects once", async () => {
      await expect(
        createChecklistItem(actor, checklistId.toUpperCase(), { content: "  Socks  " })
      ).resolves.toMatchObject({ checklistId, content: "Socks", isChecked: false });
      expect(inserted).toEqual([{ checklistId, content: "Socks", createdAt: expect.anything() }]);
      expect(lockedResources()).toEqual([]);
      expect(mocks.lockTripForUpdate).toHaveBeenCalledWith(mocks, tripId);
      expect(mocks.requireTripRole).toHaveBeenNthCalledWith(1, tripId, actor.userId, "editor");
      expect(mocks.requireTripRole).toHaveBeenLastCalledWith(tripId, actor.userId, "editor", mocks);
      expect(mocks.afterTripWrite).toHaveBeenCalledOnce();
    });
    it("stamps creation time from the database clock so insertion order follows lock order", async () => {
      await createChecklistItem(actor, checklistId, { content: "First" });
      expect(JSON.stringify((inserted[0].createdAt as { queryChunks: unknown[] }).queryChunks)).toContain(
        "clock_timestamp()"
      );
    });
    it("claims a client UUID in the shared item namespace before the trip lock", async () => {
      await createChecklistItem(actor, checklistId, { id: itemRowId.toUpperCase(), content: "Socks" });
      expect(inserted[0]).toMatchObject({ id: itemRowId });
      expect(lockedResources()).toHaveLength(1);
      expect(lockedResources()[0]).toContain(`checklist-item:${itemRowId}`);
      expect(calls).toEqual(["actor-key-lock", "trip-lock"]);
    });
    it("serializes item creation and first-item creation on the same lock resource", async () => {
      existing = [];
      itemGone = true;
      await createChecklist(actor, tripId, { dayId, position: 0, firstItem: { id: itemRowId, content: "Socks" } });
      const firstItemLocks = lockedResources();
      vi.clearAllMocks();
      existing = [checklistRow];
      await createChecklistItem(actor, checklistId, { id: itemRowId, content: "Socks" });
      expect(lockedResources()).toEqual(firstItemLocks);
    });
    it("returns a matching UUID retry without writing or running effects", async () => {
      items = [{ ...storedItem, isChecked: true }];
      await expect(createChecklistItem(actor, checklistId, { id: itemRowId, content: "Shoes" })).resolves.toMatchObject(
        { id: itemRowId, content: "Shoes", isChecked: true }
      );
      expect(mocks.insert).not.toHaveBeenCalled();
      expect(mocks.afterTripWrite).not.toHaveBeenCalled();
    });
    it.each(["content", "checklist"])("rejects a UUID already used with different %s", async (field) => {
      items = [{ ...storedItem, ...(field === "content" ? { content: "Other" } : { checklistId: tripId }) }];
      await expect(createChecklistItem(actor, checklistId, { id: itemRowId, content: "Shoes" })).rejects.toBeInstanceOf(
        ConflictError
      );
      expect(mocks.insert).not.toHaveBeenCalled();
      expect(mocks.afterTripWrite).not.toHaveBeenCalled();
    });
    it("reports a collision with a readable foreign item only as a conflict", async () => {
      items = [{ ...storedItem, checklistId: "foreign-list" }];
      itemTrip = "foreign";
      await expect(createChecklistItem(actor, checklistId, { id: itemRowId, content: "Shoes" })).rejects.toBeInstanceOf(
        ConflictError
      );
      expect(mocks.requireTripRole).toHaveBeenLastCalledWith("foreign", actor.userId, "viewer", mocks);
      expect(mocks.insert).not.toHaveBeenCalled();
    });
    it("conceals a collision with an inaccessible foreign item", async () => {
      items = [{ ...storedItem, checklistId: "foreign-list" }];
      itemTrip = "foreign";
      mocks.requireTripRole
        .mockResolvedValueOnce("editor")
        .mockResolvedValueOnce("editor")
        .mockRejectedValueOnce(new TripNotFoundError());
      await expect(createChecklistItem(actor, checklistId, { id: itemRowId, content: "Shoes" })).rejects.toBeInstanceOf(
        TripNotFoundError
      );
      expect(mocks.insert).not.toHaveBeenCalled();
      expect(mocks.afterTripWrite).not.toHaveBeenCalled();
    });
    it("conceals a missing parent checklist", async () => {
      existing = [];
      await expect(createChecklistItem(actor, checklistId, { content: "Socks" })).rejects.toBeInstanceOf(
        TripNotFoundError
      );
      expect(mocks.transaction).not.toHaveBeenCalled();
    });
    it("rejects a parent that moves trips or disappears while waiting for the lock", async () => {
      mocks.lockTripForUpdate.mockImplementationOnce(async () => {
        existing = [];
      });
      await expect(createChecklistItem(actor, checklistId, { content: "Socks" })).rejects.toBeInstanceOf(
        TripNotFoundError
      );
      existing = [checklistRow];
      mocks.lockTripForUpdate.mockImplementationOnce(async () => {
        existing = [checklistRow];
        checklistTrip = "other";
      });
      await expect(createChecklistItem(actor, checklistId, { content: "Socks" })).rejects.toBeInstanceOf(
        TripNotFoundError
      );
      expect(mocks.insert).not.toHaveBeenCalled();
      expect(mocks.afterTripWrite).not.toHaveBeenCalled();
    });
    it("denies a role before any transaction", async () => {
      mocks.requireTripRole.mockRejectedValueOnce(new Error("denied"));
      await expect(createChecklistItem(actor, checklistId, { content: "Socks" })).rejects.toThrow("denied");
      expect(mocks.transaction).not.toHaveBeenCalled();
    });
    it("rechecks access under lock before any replay lookup", async () => {
      stored = [{ result: envelope({ response: storedItem }) }];
      mocks.requireTripRole.mockResolvedValueOnce("editor").mockRejectedValueOnce(new Error("revoked"));
      await expect(
        createChecklistItem(actor, checklistId, { content: "Shoes" }, { ...replay, method: "POST" })
      ).rejects.toThrow("revoked");
      expect(calls).not.toContain("lookup");
      expect(mocks.afterTripWrite).not.toHaveBeenCalled();
    });
    it("replays the original item with no write or effects", async () => {
      const request = { key: "item-retry", method: "POST", path: `/api/v1/checklists/${checklistId}/items` };
      stored = [
        {
          result: envelope({
            fingerprint: fingerprintRequest("POST", request.path, { content: "Shoes" }),
            response: { ...storedItem },
          }),
        },
      ];
      await expect(createChecklistItem(actor, checklistId, { content: "Shoes" }, request)).resolves.toMatchObject({
        id: itemRowId,
      });
      expect(mocks.insert).not.toHaveBeenCalled();
      expect(mocks.afterTripWrite).not.toHaveBeenCalled();
    });
    it("rejects a key reused with a different body without writing", async () => {
      const request = { key: "item-conflict", method: "POST", path: `/api/v1/checklists/${checklistId}/items` };
      stored = [
        { result: envelope({ fingerprint: fingerprintRequest("POST", request.path, { content: "Previous" }) }) },
      ];
      await expect(createChecklistItem(actor, checklistId, { content: "Shoes" }, request)).rejects.toBeInstanceOf(
        ConflictError
      );
      expect(mocks.insert).not.toHaveBeenCalled();
      expect(mocks.afterTripWrite).not.toHaveBeenCalled();
    });
    it("stores a keyed create with its replay record in one transaction", async () => {
      const request = { key: "item-new", method: "POST", path: `/api/v1/checklists/${checklistId}/items` };
      await createChecklistItem(actor, checklistId, { content: "Shoes" }, request);
      expect(calls).toEqual(["actor-key-lock", "trip-lock", "lookup", "store"]);
      expect(mocks.transaction).toHaveBeenCalledOnce();
      expect(mocks.afterTripWrite).toHaveBeenCalledOnce();
    });
    it("rolls back a failed insert and a rejected commit without effects", async () => {
      mocks.insert.mockImplementationOnce(() => ({
        values: () => ({
          returning: async () => {
            throw new Error("insert failed");
          },
        }),
      }));
      await expect(createChecklistItem(actor, checklistId, { content: "Shoes" })).rejects.toThrow("insert failed");
      mocks.transaction.mockImplementationOnce(async (callback) => {
        await callback(mocks);
        throw new Error("commit rejected");
      });
      await expect(createChecklistItem(actor, checklistId, { content: "Shoes" })).rejects.toThrow("commit rejected");
      expect(mocks.afterTripWrite).not.toHaveBeenCalled();
    });
    it("rejects invalid input before any database access", async () => {
      mocks.select.mockClear();
      await expect(createChecklistItem(actor, checklistId, { content: "  " })).rejects.toThrow();
      await expect(createChecklistItem(actor, "bad", { content: "Shoes" })).rejects.toThrow();
      expect(mocks.select).not.toHaveBeenCalled();
    });

    function updateReturning(row: Record<string, unknown>) {
      const set = vi.fn(() => ({ where: () => ({ returning: async () => [row] }) }));
      mocks.update.mockReturnValue({ set });
      return set;
    }
    it("writes only the supplied content and keeps the checked state", async () => {
      items = [{ ...storedItem, isChecked: true }];
      const set = updateReturning({ ...storedItem, content: "Boots", isChecked: true });
      await expect(updateChecklistItem(actor, itemRowId.toUpperCase(), { content: " Boots " })).resolves.toMatchObject({
        content: "Boots",
        isChecked: true,
      });
      expect(set).toHaveBeenCalledWith({ content: "Boots" });
      expect(mocks.afterTripWrite).toHaveBeenCalledOnce();
    });
    it("writes content and absolute checked state together", async () => {
      items = [{ ...storedItem, isChecked: true }];
      const set = updateReturning({ ...storedItem, content: "Boots", isChecked: false });
      await updateChecklistItem(actor, itemRowId, { content: "Boots", isChecked: false });
      expect(set).toHaveBeenCalledWith({ content: "Boots", isChecked: false });
      expect(mocks.afterTripWrite).toHaveBeenCalledOnce();
    });
    it("writes both supplied fields when only one differs from the stored item", async () => {
      items = [{ ...storedItem, isChecked: true }];
      const set = updateReturning({ ...storedItem, content: "Boots", isChecked: true });
      await updateChecklistItem(actor, itemRowId, { content: "Boots", isChecked: true });
      expect(set).toHaveBeenCalledWith({ content: "Boots", isChecked: true });
      expect(mocks.afterTripWrite).toHaveBeenCalledOnce();
    });
    it.each([
      ["same content", { content: "Shoes" }],
      ["same checked state", { isChecked: false }],
      ["same content and checked state", { content: " Shoes ", isChecked: false }],
    ])("skips the write and effects for %s", async (_label, patch) => {
      items = [storedItem];
      await expect(updateChecklistItem(actor, itemRowId, patch)).resolves.toMatchObject({
        id: itemRowId,
        content: "Shoes",
        isChecked: false,
      });
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.afterTripWrite).not.toHaveBeenCalled();
    });
    it("treats an empty patch as a no-op that returns the stored item without effects", async () => {
      items = [{ ...storedItem, isChecked: true }];
      await expect(updateChecklistItem(actor, itemRowId, {})).resolves.toMatchObject({
        id: itemRowId,
        content: "Shoes",
        isChecked: true,
      });
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.afterTripWrite).not.toHaveBeenCalled();
    });
    it("conceals an item that vanished before an empty patch read", async () => {
      items = [];
      await expect(updateChecklistItem(actor, itemRowId, {})).rejects.toBeInstanceOf(TripNotFoundError);
    });
    it("rejects blank content and unknown fields before database access", async () => {
      mocks.select.mockClear();
      await expect(updateChecklistItem(actor, itemRowId, { content: "   " })).rejects.toThrow();
      await expect(updateChecklistItem(actor, itemRowId, { position: 1 })).rejects.toThrow();
      expect(mocks.select).not.toHaveBeenCalled();
    });
    it("replays a content edit without writing", async () => {
      items = [storedItem];
      const request = { key: "edit", method: "PATCH", path: `/api/v1/checklist-items/${itemRowId}` };
      stored = [
        {
          result: envelope({
            fingerprint: fingerprintRequest("PATCH", request.path, { content: "Boots" }),
            response: { ...storedItem, content: "Boots" },
          }),
        },
      ];
      await expect(updateChecklistItem(actor, itemRowId, { content: "Boots" }, request)).resolves.toMatchObject({
        content: "Boots",
      });
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.afterTripWrite).not.toHaveBeenCalled();
    });

    it("deletes an existing item and runs effects once", async () => {
      await expect(deleteChecklistItem(actor, itemRowId.toUpperCase(), { tripId })).resolves.toBeNull();
      expect(mocks.delete).toHaveBeenCalledWith(checklistItems);
      expect(mocks.lockTripForUpdate).toHaveBeenCalledWith(mocks, tripId);
      expect(mocks.requireTripRole).toHaveBeenLastCalledWith(tripId, actor.userId, "editor", mocks);
      expect(mocks.afterTripWrite).toHaveBeenCalledOnce();
    });
    it("succeeds for an authorized duplicate delete without effects", async () => {
      itemGone = true;
      await expect(deleteChecklistItem(actor, itemRowId, { tripId })).resolves.toBeNull();
      expect(mocks.requireTripRole).toHaveBeenLastCalledWith(tripId, actor.userId, "editor", mocks);
      expect(mocks.delete).not.toHaveBeenCalled();
      expect(mocks.afterTripWrite).not.toHaveBeenCalled();
    });
    it("conceals an item that belongs to another trip", async () => {
      itemTrip = "other";
      await expect(deleteChecklistItem(actor, itemRowId, { tripId })).rejects.toBeInstanceOf(TripNotFoundError);
      expect(mocks.delete).not.toHaveBeenCalled();
      expect(mocks.afterTripWrite).not.toHaveBeenCalled();
    });
    it("denies a role before any transaction and never leaks a cached result after revocation", async () => {
      mocks.requireTripRole.mockRejectedValueOnce(new Error("denied"));
      await expect(deleteChecklistItem(actor, itemRowId, { tripId })).rejects.toThrow("denied");
      expect(mocks.transaction).not.toHaveBeenCalled();
      const request = { key: "gone", method: "DELETE", path: `/api/v1/checklist-items/${itemRowId}` };
      stored = [{ result: envelope({ fingerprint: fingerprintRequest("DELETE", request.path, { tripId }) }) }];
      mocks.requireTripRole.mockResolvedValueOnce("editor").mockRejectedValueOnce(new TripNotFoundError());
      await expect(deleteChecklistItem(actor, itemRowId, { tripId }, request)).rejects.toBeInstanceOf(
        TripNotFoundError
      );
      expect(calls).not.toContain("lookup");
      expect(mocks.delete).not.toHaveBeenCalled();
    });
    it("replays a keyed delete and rejects a changed trip context for the same key", async () => {
      const request = { key: "del", method: "DELETE", path: `/api/v1/checklist-items/${itemRowId}` };
      stored = [
        {
          result: envelope({
            fingerprint: fingerprintRequest("DELETE", request.path, { tripId }),
            response: null,
          }),
        },
      ];
      await expect(deleteChecklistItem(actor, itemRowId, { tripId }, request)).resolves.toBeNull();
      expect(mocks.delete).not.toHaveBeenCalled();
      expect(mocks.afterTripWrite).not.toHaveBeenCalled();
      itemGone = true;
      await expect(deleteChecklistItem(actor, itemRowId, { tripId: dayId }, request)).rejects.toBeInstanceOf(
        ConflictError
      );
    });
    it("skips effects when a delete commit rejects", async () => {
      mocks.transaction.mockImplementationOnce(async (callback) => {
        await callback(mocks);
        throw new Error("commit rejected");
      });
      await expect(deleteChecklistItem(actor, itemRowId, { tripId })).rejects.toThrow("commit rejected");
      expect(mocks.afterTripWrite).not.toHaveBeenCalled();
    });
    it("rejects a malformed trip context before database access", async () => {
      mocks.select.mockClear();
      await expect(deleteChecklistItem(actor, itemRowId, { tripId: "bad" })).rejects.toThrow();
      expect(mocks.select).not.toHaveBeenCalled();
    });
  });
});
