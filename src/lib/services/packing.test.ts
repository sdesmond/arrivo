import { beforeEach, expect, it, vi } from "vitest";
import { idempotencyKeys, packingItems } from "@/db/schema";
const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  transaction: vi.fn(),
  execute: vi.fn(),
  insert: vi.fn(),
  lockTripForUpdate: vi.fn(),
  requireTripRole: vi.fn(),
  afterTripWrite: vi.fn(),
  runTripWrite: vi.fn(),
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
vi.mock("./trip-write", async (original) => {
  const actual = await original<typeof import("./trip-write")>();
  return { ...actual, runTripWrite: mocks.runTripWrite.mockImplementation(actual.runTripWrite) };
});
vi.mock("./trip-write-effects", () => ({ afterTripWrite: mocks.afterTripWrite }));
import { updatePackingItem, deletePackingItem, reorderPackingItems } from "./packing";
import { ConflictError } from "./conflict-error";
import { ValidationFailedError } from "./validation-failed-error";
import { TripNotFoundError } from "./trip-access";
const itemId = "123e4567-e89b-12d3-a456-426614174000";
const tripId = "123e4567-e89b-12d3-a456-426614174001";
const actor = { userId: "user" };
let row:
  | {
      id: string;
      tripId: string;
      name: string;
      done: boolean;
      isLabel: boolean;
      position: number;
      listId: null;
      labelId: null;
    }
  | undefined;
let updated: typeof row;
const set = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  row = { id: itemId, tripId, name: "Socks", done: false, isLabel: false, position: 0, listId: null, labelId: null };
  updated = { ...row, done: true };
  mocks.select.mockReturnValue({
    from: (table: unknown) => ({ where: async () => (table === idempotencyKeys ? [] : row ? [row] : []) }),
  });
  set.mockImplementation(() => ({ where: () => ({ returning: async () => (updated ? [updated] : []) }) }));
  mocks.update.mockReturnValue({ set });
  mocks.delete.mockReturnValue({ where: async () => [] });
  mocks.transaction.mockImplementation(async (callback) => callback(mocks));
});
it("writes absolute packed state and normalized name after a locked role recheck", async () => {
  await updatePackingItem(actor, itemId, { name: " Boots ", isPacked: true });
  expect(set).toHaveBeenCalledWith({ name: "Boots", done: true });
  expect(mocks.lockTripForUpdate).toHaveBeenCalledWith(mocks, tripId);
  expect(mocks.requireTripRole).toHaveBeenLastCalledWith(tripId, actor.userId, "editor", mocks);
  expect(mocks.afterTripWrite).toHaveBeenCalledWith(actor, tripId, ["/trips"]);
});
it("does not write or emit effects for an unchanged patch", async () => {
  await updatePackingItem(actor, itemId, { name: " Socks ", isPacked: false });
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});
it("rechecks access and item ownership after locking", async () => {
  mocks.lockTripForUpdate.mockImplementationOnce(async () => {
    if (row) row.tripId = "other";
  });
  await expect(updatePackingItem(actor, itemId, { isPacked: true })).rejects.toBeInstanceOf(TripNotFoundError);
  expect(mocks.update).not.toHaveBeenCalled();
  mocks.requireTripRole.mockResolvedValueOnce("editor").mockRejectedValueOnce(new Error("revoked"));
  if (row) row.tripId = tripId;
  await expect(updatePackingItem(actor, itemId, { isPacked: true })).rejects.toThrow("revoked");
});
it("authorizes an absent delete and hides an item in another trip", async () => {
  row = undefined;
  await expect(deletePackingItem(actor, itemId, { tripId })).resolves.toBeNull();
  expect(mocks.delete).not.toHaveBeenCalled();
  expect(mocks.requireTripRole).toHaveBeenLastCalledWith(tripId, actor.userId, "editor", mocks);
  row = {
    id: itemId,
    tripId: "other",
    name: "Socks",
    done: false,
    isLabel: false,
    position: 0,
    listId: null,
    labelId: null,
  };
  await expect(deletePackingItem(actor, itemId, { tripId })).rejects.toBeInstanceOf(TripNotFoundError);
  expect(mocks.delete).not.toHaveBeenCalled();
});
it("deletes an existing item and emits effects", async () => {
  await deletePackingItem(actor, itemId, { tripId });
  expect(mocks.delete).toHaveBeenCalledWith(packingItems);
  expect(mocks.afterTripWrite).toHaveBeenCalledWith(actor, tripId, ["/trips"]);
});

it("rejects invalid input and missing items before writing", async () => {
  await expect(updatePackingItem(actor, itemId, { name: " " })).rejects.toThrow();
  await expect(deletePackingItem(actor, itemId, { tripId: "bad" })).rejects.toThrow();
  row = undefined;
  await expect(updatePackingItem(actor, itemId, { isPacked: true })).rejects.toBeInstanceOf(TripNotFoundError);
  expect(mocks.transaction).not.toHaveBeenCalled();
});
it("hides an item removed while acquiring the trip lock", async () => {
  mocks.lockTripForUpdate.mockImplementationOnce(async () => {
    row = undefined;
  });
  await expect(updatePackingItem(actor, itemId, { isPacked: true })).rejects.toBeInstanceOf(TripNotFoundError);
  expect(mocks.update).not.toHaveBeenCalled();
});
it("does not emit effects when an update returns no row or a commit fails", async () => {
  updated = undefined;
  await expect(updatePackingItem(actor, itemId, { isPacked: true })).rejects.toBeInstanceOf(TripNotFoundError);
  updated = row;
  mocks.transaction.mockImplementationOnce(async (callback) => {
    await callback(mocks);
    throw new Error("commit failed");
  });
  await expect(updatePackingItem(actor, itemId, { isPacked: true })).rejects.toThrow("commit failed");
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});
it("maps empty patches and label names without writes or losing label fields", async () => {
  if (row) row.isLabel = true;
  await expect(updatePackingItem(actor, itemId, {})).resolves.toMatchObject({ isLabel: true, name: "Socks" });
  expect(mocks.update).not.toHaveBeenCalled();
});

const first = "123e4567-e89b-12d3-a456-426614174010";
const second = "123e4567-e89b-12d3-a456-426614174011";
const section = "123e4567-e89b-12d3-a456-426614174012";
const listId = "123e4567-e89b-12d3-a456-426614174013";
function stored(id: string, position: number, extra: Record<string, unknown> = {}) {
  return { id, tripId, name: id, done: false, isLabel: false, position, listId: null, labelId: null, ...extra };
}
function storeRows(rows: unknown[]) {
  mocks.select.mockReturnValue({
    from: (table: unknown) => ({ where: async () => (table === idempotencyKeys ? [] : rows) }),
  });
}
it("writes only the rows whose position or section changed, after a locked role recheck", async () => {
  storeRows([stored(first, 0), stored(second, 1), stored(section, 2, { isLabel: true })]);
  const order = {
    listId: null,
    items: [
      { id: section, labelId: null },
      { id: second, labelId: section },
      { id: first, labelId: section },
    ],
  };
  await expect(reorderPackingItems(actor, tripId, order)).resolves.toEqual(order);
  expect(set.mock.calls).toEqual([
    [{ position: 0, labelId: null }],
    [{ position: 1, labelId: section }],
    [{ position: 2, labelId: section }],
  ]);
  expect(mocks.lockTripForUpdate).toHaveBeenCalledWith(mocks, tripId);
  expect(mocks.requireTripRole).toHaveBeenLastCalledWith(tripId, actor.userId, "editor", mocks);
  expect(mocks.afterTripWrite).toHaveBeenCalledWith(actor, tripId, ["/trips"]);
});
it("reorders a named list", async () => {
  storeRows([stored(first, 0, { listId }), stored(second, 1, { listId })]);
  await reorderPackingItems(actor, tripId, {
    listId,
    items: [
      { id: second, labelId: null },
      { id: first, labelId: null },
    ],
  });
  expect(set).toHaveBeenCalledTimes(2);
});
it("neither writes nor emits effects for the stored order", async () => {
  storeRows([stored(first, 0), stored(second, 1)]);
  await reorderPackingItems(actor, tripId, {
    listId: null,
    items: [
      { id: first, labelId: null },
      { id: second, labelId: null },
    ],
  });
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});
it.each([
  ["partial", [{ id: first, labelId: null }]],
  [
    "extra",
    [
      { id: first, labelId: null },
      { id: second, labelId: null },
      { id: section, labelId: null },
    ],
  ],
  [
    "foreign",
    [
      { id: first, labelId: null },
      { id: section, labelId: null },
    ],
  ],
])("rejects a %s list with a conflict and no writes", async (_name, items) => {
  storeRows([stored(first, 0), stored(second, 1)]);
  await expect(reorderPackingItems(actor, tripId, { listId: null, items })).rejects.toBeInstanceOf(ConflictError);
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});
it("rejects a labelId that is not a section of the list, or a section placed in a section", async () => {
  storeRows([stored(first, 0), stored(second, 1), stored(section, 2, { isLabel: true })]);
  const base = [
    { id: first, labelId: null as string | null },
    { id: second, labelId: null as string | null },
    { id: section, labelId: null as string | null },
  ];
  const foreignLabel = "123e4567-e89b-12d3-a456-426614174099";
  for (const items of [
    base.map((item) => (item.id === first ? { ...item, labelId: second } : item)),
    base.map((item) => (item.id === first ? { ...item, labelId: foreignLabel } : item)),
    base.map((item) => (item.id === section ? { ...item, labelId: section } : item)),
  ])
    await expect(reorderPackingItems(actor, tripId, { listId: null, items })).rejects.toBeInstanceOf(
      ValidationFailedError
    );
  expect(mocks.update).not.toHaveBeenCalled();
});
it("rejects invalid input before touching the database", async () => {
  await expect(reorderPackingItems(actor, "bad", { listId: null, items: [] })).rejects.toThrow();
  await expect(
    reorderPackingItems(actor, tripId, {
      listId: null,
      items: [
        { id: first, labelId: null },
        { id: first, labelId: null },
      ],
    })
  ).rejects.toThrow();
  expect(mocks.transaction).not.toHaveBeenCalled();
});
it("denies a caller without editor access before and inside the lock", async () => {
  mocks.requireTripRole.mockRejectedValueOnce(new TripNotFoundError());
  await expect(reorderPackingItems(actor, tripId, { listId: null, items: [] })).rejects.toBeInstanceOf(
    TripNotFoundError
  );
  expect(mocks.transaction).not.toHaveBeenCalled();
  storeRows([stored(first, 0)]);
  mocks.requireTripRole.mockResolvedValueOnce("editor").mockRejectedValueOnce(new Error("revoked"));
  await expect(
    reorderPackingItems(actor, tripId, { listId: null, items: [{ id: first, labelId: null }] })
  ).rejects.toThrow("revoked");
  expect(mocks.update).not.toHaveBeenCalled();
});
it("hands the replay request and the validated payload to the trip write", async () => {
  storeRows([stored(first, 0), stored(second, 1)]);
  mocks.insert.mockReturnValue({ values: () => ({ onConflictDoUpdate: async () => undefined }) });
  const replay = { key: "retry-key", method: "PUT", path: `/api/v1/trips/${tripId}/packing/order` };
  const body = {
    listId: null,
    items: [
      { id: first, labelId: null },
      { id: second, labelId: null },
    ],
  };
  await reorderPackingItems(actor, tripId, body, replay);
  expect(mocks.runTripWrite).toHaveBeenCalledWith(
    actor,
    tripId,
    expect.objectContaining({ replay, payload: body }),
    expect.any(Function)
  );
});
