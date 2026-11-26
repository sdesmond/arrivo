import { beforeEach, expect, it, vi } from "vitest";
import { idempotencyKeys, packingItems, tripPackingLists } from "@/db/schema";
import { FIELD_LIMITS } from "@/lib/validation-limits";
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
  recordDeletions: vi.fn(),
  refuseRecentlyDeleted: vi.fn(),
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
vi.mock("./deletion-records", () => ({
  recordDeletions: mocks.recordDeletions,
  refuseRecentlyDeleted: mocks.refuseRecentlyDeleted,
}));
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
let deletedChildren: { id: string }[] = [];
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
  deletedChildren = [];
  mocks.delete.mockReturnValue({
    where: () => Object.assign(Promise.resolve([]), { returning: async () => deletedChildren }),
  });
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

it("replays a compatible client ID without changing order or emitting effects", async () => {
  const { createPackingItem } = await import("./packing");
  await expect(createPackingItem(actor, tripId, { id: itemId, name: "Socks", listId: null })).resolves.toMatchObject({
    id: itemId,
  });
  expect(mocks.execute).toHaveBeenCalled();
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});
it("rejects conflicting client ID content", async () => {
  const { createPackingItem } = await import("./packing");
  await expect(createPackingItem(actor, tripId, { id: itemId, name: "Boots", listId: null })).rejects.toBeInstanceOf(
    ConflictError
  );
  expect(mocks.insert).not.toHaveBeenCalled();
});
it.each(["delete-items", "move-items-to-ungrouped"] as const)("removes a section with %s", async (mode) => {
  const { removePackingSection } = await import("./packing");
  if (row) row.isLabel = true;
  set.mockReturnValue({ where: async () => [] });
  await expect(removePackingSection(actor, itemId, { tripId, mode })).resolves.toBeNull();
  expect(mocks.delete).toHaveBeenCalledWith(packingItems);
  expect(mocks.update).toHaveBeenCalledTimes(mode === "delete-items" ? 0 : 1);
  expect(mocks.afterTripWrite).toHaveBeenCalledOnce();
});

it("inserts before an anchor and shifts only the selected list", async () => {
  const { createPackingItem } = await import("./packing");
  const newId = "123e4567-e89b-12d3-a456-426614174099";
  const queue = [[], [], [stored(first, 2)]];
  mocks.select.mockReturnValue({ from: () => ({ where: async () => queue.shift() ?? [] }) });
  set.mockReturnValue({ where: async () => [] });
  const values = vi.fn(() => ({ returning: async () => [stored(newId, 2, { name: "Boots" })] }));
  mocks.insert.mockReturnValue({ values });
  await expect(
    createPackingItem(actor, tripId, { id: newId, name: "Boots", listId: null, beforeItemId: first })
  ).resolves.toMatchObject({ id: newId });
  expect(values).toHaveBeenCalledWith(expect.objectContaining({ id: newId, position: 2, listId: null }));
  expect(mocks.update).toHaveBeenCalledOnce();
  expect(mocks.afterTripWrite).toHaveBeenCalledOnce();
});
it("rejects an anchor in another list without writes", async () => {
  const { createPackingItem } = await import("./packing");
  const newId = "123e4567-e89b-12d3-a456-426614174099";
  const queue = [[], [], [stored(first, 2, { listId })]];
  mocks.select.mockReturnValue({ from: () => ({ where: async () => queue.shift() ?? [] }) });
  await expect(
    createPackingItem(actor, tripId, { id: newId, name: "Boots", listId: null, afterItemId: first })
  ).rejects.toBeInstanceOf(ValidationFailedError);
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.insert).not.toHaveBeenCalled();
});
it("rejects a label in another list without writes", async () => {
  const { createPackingItem } = await import("./packing");
  const newId = "123e4567-e89b-12d3-a456-426614174099";
  const queue = [[], [], [stored(section, 0, { listId, isLabel: true })]];
  mocks.select.mockReturnValue({ from: () => ({ where: async () => queue.shift() ?? [] }) });
  await expect(
    createPackingItem(actor, tripId, { id: newId, name: "Boots", listId: null, labelId: section })
  ).rejects.toBeInstanceOf(ValidationFailedError);
  expect(mocks.insert).not.toHaveBeenCalled();
});

it("appends to a named list after validating it belongs to the trip", async () => {
  const { createPackingItem } = await import("./packing");
  const newId = "123e4567-e89b-12d3-a456-426614174099";
  const queue = [[], [], [{ id: listId }], [{ position: 4 }]];
  mocks.select.mockReturnValue({ from: () => ({ where: async () => queue.shift() ?? [] }) });
  const values = vi.fn(() => ({ returning: async () => [stored(newId, 5, { name: "Boots", listId })] }));
  mocks.insert.mockReturnValue({ values });
  await createPackingItem(actor, tripId, { id: newId, name: "Boots", listId });
  expect(values).toHaveBeenCalledWith(expect.objectContaining({ listId, position: 5 }));
  expect(mocks.update).not.toHaveBeenCalled();
});
it("rejects an invalid named list before writing", async () => {
  const { createPackingItem } = await import("./packing");
  const newId = "123e4567-e89b-12d3-a456-426614174099";
  mocks.select.mockReturnValue({ from: () => ({ where: async () => [] }) });
  await expect(createPackingItem(actor, tripId, { id: newId, name: "Boots", listId })).rejects.toBeInstanceOf(
    ValidationFailedError
  );
  expect(mocks.insert).not.toHaveBeenCalled();
});
it("checks access to a foreign collision before returning a conflict", async () => {
  const { createPackingItem } = await import("./packing");
  if (row) row.tripId = "123e4567-e89b-12d3-a456-426614174098";
  await expect(createPackingItem(actor, tripId, { id: itemId, name: "Socks", listId: null })).rejects.toBeInstanceOf(
    ConflictError
  );
  expect(mocks.requireTripRole).toHaveBeenLastCalledWith(row!.tripId, actor.userId, "viewer", mocks);
  expect(mocks.insert).not.toHaveBeenCalled();
});
it("rechecks removal access and rejects non-sections or foreign sections", async () => {
  const { removePackingSection } = await import("./packing");
  await expect(removePackingSection(actor, itemId, { tripId, mode: "delete-items" })).rejects.toBeInstanceOf(
    TripNotFoundError
  );
  if (row) {
    row.isLabel = true;
    row.tripId = "123e4567-e89b-12d3-a456-426614174098";
  }
  await expect(removePackingSection(actor, itemId, { tripId, mode: "delete-items" })).rejects.toBeInstanceOf(
    TripNotFoundError
  );
  row = undefined;
  await expect(removePackingSection(actor, itemId, { tripId, mode: "delete-items" })).resolves.toBeNull();
  expect(mocks.delete).not.toHaveBeenCalled();
});

it.each(["beforeItemId", "afterItemId"] as const)("rejects a missing %s without writes", async (field) => {
  const { createPackingItem } = await import("./packing");
  const newId = "123e4567-e89b-12d3-a456-426614174099";
  mocks.select.mockReturnValue({ from: () => ({ where: async () => [] }) });
  await expect(
    createPackingItem(actor, tripId, { id: newId, name: "Boots", listId: null, [field]: first })
  ).rejects.toBeInstanceOf(ValidationFailedError);
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});
it.each([
  undefined,
  stored(first, 0),
  stored(first, 0, { isLabel: true, tripId: "123e4567-e89b-12d3-a456-426614174098" }),
])("rejects missing, non-section, and foreign section references", async (label) => {
  const { createPackingItem } = await import("./packing");
  const newId = "123e4567-e89b-12d3-a456-426614174099";
  const queue = [[], [], label ? [label] : []];
  mocks.select.mockReturnValue({ from: () => ({ where: async () => queue.shift() ?? [] }) });
  await expect(
    createPackingItem(actor, tripId, { id: newId, name: "Boots", listId: null, labelId: first })
  ).rejects.toBeInstanceOf(ValidationFailedError);
  expect(mocks.insert).not.toHaveBeenCalled();
});

it("replays a created item even after its original anchor and section disappear and its placement changes", async () => {
  const { createPackingItem } = await import("./packing");
  if (row) row.position = 9;
  const result = await createPackingItem(actor, tripId, {
    id: itemId,
    name: "Socks",
    listId: null,
    labelId: section,
    afterItemId: first,
  });
  expect(result).toMatchObject({ id: itemId, position: 9, labelId: null });
  expect(mocks.select).toHaveBeenCalledTimes(2);
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

const listRow = () => ({ id: listId, tripId, name: "Beach", position: 2, createdAt: new Date(0) });
const otherTrip = "123e4567-e89b-12d3-a456-426614174098";
function listStore(list: ReturnType<typeof listRow> | undefined, extra: unknown[][] = []) {
  const queue = [...extra];
  mocks.select.mockReturnValue({
    from: (table: unknown) => ({
      where: () => {
        const rows = table === tripPackingLists ? (list ? [list] : []) : (queue.shift() ?? []);
        return Object.assign(Promise.resolve(rows), { for: async () => rows });
      },
    }),
  });
}
it("creates a list at the end and replays the same ID and name without effects", async () => {
  const { createPackingList } = await import("./packing");
  const queue: unknown[][] = [[], [], [{ maxPosition: 4 }]];
  mocks.select.mockReturnValue({
    from: (table: unknown) => ({ where: async () => (table === tripPackingLists ? (queue.shift() ?? []) : []) }),
  });
  const values = vi.fn(() => ({ returning: async () => [{ ...listRow(), position: 5 }] }));
  mocks.insert.mockReturnValue({ values });
  await expect(createPackingList(actor, tripId, { id: listId, name: " Beach " })).resolves.toMatchObject({
    id: listId,
    position: 5,
  });
  expect(values).toHaveBeenCalledWith({ id: listId, tripId, name: "Beach", position: 5 });
  expect(mocks.afterTripWrite).toHaveBeenCalledOnce();
  vi.clearAllMocks();
  listStore(listRow());
  await expect(createPackingList(actor, tripId, { id: listId, name: "Beach" })).resolves.toMatchObject({ id: listId });
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});
it("starts the first list at position 0", async () => {
  const { createPackingList } = await import("./packing");
  const queue: unknown[][] = [[], [], [{ maxPosition: null }]];
  mocks.select.mockReturnValue({
    from: (table: unknown) => ({ where: async () => (table === tripPackingLists ? (queue.shift() ?? []) : []) }),
  });
  const values = vi.fn(() => ({ returning: async () => [{ ...listRow(), position: 0 }] }));
  mocks.insert.mockReturnValue({ values });
  await createPackingList(actor, tripId, { id: listId, name: "Beach" });
  expect(values).toHaveBeenCalledWith(expect.objectContaining({ position: 0 }));
});
it("conflicts on a reused ID with another name or trip, after a viewer check on the other trip", async () => {
  const { createPackingList } = await import("./packing");
  listStore(listRow());
  await expect(createPackingList(actor, tripId, { id: listId, name: "Other" })).rejects.toBeInstanceOf(ConflictError);
  listStore({ ...listRow(), tripId: otherTrip });
  await expect(createPackingList(actor, tripId, { id: listId, name: "Beach" })).rejects.toBeInstanceOf(ConflictError);
  expect(mocks.requireTripRole).toHaveBeenCalledWith(otherTrip, actor.userId, "viewer", mocks);
  expect(mocks.insert).not.toHaveBeenCalled();
});
it("rejects blank or over-limit names without writing", async () => {
  const { createPackingList, renamePackingList } = await import("./packing");
  await expect(createPackingList(actor, tripId, { id: listId, name: " " })).rejects.toThrow();
  await expect(
    renamePackingList(actor, listId, { tripId, name: "x".repeat(FIELD_LIMITS.packingListName + 1) })
  ).rejects.toThrow();
  expect(mocks.transaction).not.toHaveBeenCalled();
});
it("renames a list, skips an unchanged name, and hides missing or foreign lists", async () => {
  const { renamePackingList } = await import("./packing");
  listStore(listRow());
  const returning = vi.fn(async () => [{ ...listRow(), name: "Day" }]);
  set.mockImplementation(() => ({ where: () => ({ returning }) }));
  await expect(renamePackingList(actor, listId, { tripId, name: "Day" })).resolves.toMatchObject({ name: "Day" });
  expect(set).toHaveBeenCalledWith({ name: "Day" });
  expect(mocks.afterTripWrite).toHaveBeenCalledOnce();
  vi.clearAllMocks();
  listStore(listRow());
  await renamePackingList(actor, listId, { tripId, name: "Beach" });
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  listStore(undefined);
  await expect(renamePackingList(actor, listId, { tripId, name: "Day" })).rejects.toBeInstanceOf(TripNotFoundError);
  listStore({ ...listRow(), tripId: otherTrip });
  await expect(renamePackingList(actor, listId, { tripId, name: "Day" })).rejects.toBeInstanceOf(TripNotFoundError);
  expect(mocks.update).not.toHaveBeenCalled();
});
it("fails a rename whose update returns no row", async () => {
  const { renamePackingList } = await import("./packing");
  listStore(listRow());
  set.mockImplementation(() => ({ where: () => ({ returning: async () => [] }) }));
  await expect(renamePackingList(actor, listId, { tripId, name: "Day" })).rejects.toBeInstanceOf(TripNotFoundError);
});
it("deletes a list with its items, then emits effects", async () => {
  const { deletePackingList } = await import("./packing");
  listStore(listRow());
  deletedChildren = [{ id: itemId }];
  await expect(deletePackingList(actor, listId, { tripId })).resolves.toBeNull();
  expect(mocks.delete.mock.calls.map((call) => call[0])).toEqual([packingItems, tripPackingLists]);
  expect(mocks.recordDeletions).toHaveBeenCalledWith(mocks, "packing-item", [itemId], actor.userId);
  expect(mocks.requireTripRole).toHaveBeenLastCalledWith(tripId, actor.userId, "editor", mocks);
  expect(mocks.afterTripWrite).toHaveBeenCalledWith(actor, tripId, ["/trips"]);
});
it("treats an absent list as a quiet delete and hides a foreign one", async () => {
  const { deletePackingList } = await import("./packing");
  listStore(undefined);
  await expect(deletePackingList(actor, listId, { tripId })).resolves.toBeNull();
  expect(mocks.delete).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  listStore({ ...listRow(), tripId: otherTrip });
  await expect(deletePackingList(actor, listId, { tripId })).rejects.toBeInstanceOf(TripNotFoundError);
  expect(mocks.delete).not.toHaveBeenCalled();
});
it("denies list writes to a caller without editor access", async () => {
  const { createPackingList, renamePackingList, deletePackingList } = await import("./packing");
  mocks.requireTripRole.mockRejectedValue(new TripNotFoundError());
  await expect(createPackingList(actor, tripId, { id: listId, name: "a" })).rejects.toBeInstanceOf(TripNotFoundError);
  await expect(renamePackingList(actor, listId, { tripId, name: "a" })).rejects.toBeInstanceOf(TripNotFoundError);
  await expect(deletePackingList(actor, listId, { tripId })).rejects.toBeInstanceOf(TripNotFoundError);
  expect(mocks.transaction).not.toHaveBeenCalled();
  mocks.requireTripRole.mockReset();
});

it("authorizes empty template pulls without effects", async () => {
  const { pullTemplatesOntoTrip } = await import("./packing");
  await expect(pullTemplatesOntoTrip(actor, tripId, { templateIds: [] })).resolves.toEqual({ added: 0, skipped: 0 });
  expect(mocks.requireTripRole).toHaveBeenLastCalledWith(tripId, actor.userId, "editor", mocks);
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it("pulls owned templates into the chosen list and maps duplicate sections across templates", async () => {
  const { pullTemplatesOntoTrip } = await import("./packing");
  const templateOne = first;
  const templateTwo = second;
  const foreign = section;
  const queries: unknown[][] = [
    [{ id: listId }],
    [{ id: templateOne }, { id: templateTwo }],
    [{ id: itemId, name: " socks ", isLabel: false, position: 4 }],
    [
      { id: "label-one", text: " Gear ", isLabel: true, labelId: null },
      { id: "item-one", text: "Socks", isLabel: false, labelId: "label-one" },
    ],
    [
      { id: "label-two", text: "gear", isLabel: true, labelId: null },
      { id: "item-two", text: " Boots ", isLabel: false, labelId: "label-two" },
    ],
  ];
  mocks.select.mockReturnValue({
    from: () => ({
      where: () => {
        const rows = queries.shift() ?? [];
        return Object.assign(Promise.resolve(rows), { orderBy: async () => rows });
      },
    }),
  });
  const values = vi.fn().mockImplementation(() => ({
    returning: async () => [{ id: values.mock.calls.length === 1 ? "new-label" : "new-item" }],
  }));
  mocks.insert.mockReturnValue({ values });
  await expect(
    pullTemplatesOntoTrip(actor, tripId, { templateIds: [templateOne, templateOne, foreign, templateTwo], listId })
  ).resolves.toEqual({ added: 2, skipped: 2 });
  expect(values).toHaveBeenNthCalledWith(1, expect.objectContaining({ listId, name: "Gear", position: 5 }));
  expect(values).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ listId, name: "Boots", labelId: "new-label", position: 6 })
  );
  expect(mocks.afterTripWrite).toHaveBeenCalledOnce();
});

it("rejects invalid lists and revoked access without writing", async () => {
  const { pullTemplatesOntoTrip } = await import("./packing");
  mocks.select.mockReturnValue({ from: () => ({ where: async () => [] }) });
  await expect(pullTemplatesOntoTrip(actor, tripId, { templateIds: [first], listId })).rejects.toBeInstanceOf(
    ValidationFailedError
  );
  mocks.requireTripRole.mockResolvedValueOnce("editor").mockRejectedValueOnce(new Error("revoked"));
  await expect(pullTemplatesOntoTrip(actor, tripId, { templateIds: [first] })).rejects.toThrow("revoked");
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it("maps a child that precedes its section without changing item order", async () => {
  const { pullTemplatesOntoTrip } = await import("./packing");
  const queries: unknown[][] = [
    [{ id: first }],
    [],
    [
      { id: "child", text: "Boots", isLabel: false, labelId: "template-label" },
      { id: "template-label", text: "Gear", isLabel: true, labelId: null },
    ],
  ];
  mocks.select.mockReturnValue({
    from: () => ({
      where: () => {
        const rows = queries.shift() ?? [];
        return Object.assign(Promise.resolve(rows), { orderBy: async () => rows });
      },
    }),
  });
  const values = vi.fn().mockImplementation(() => ({
    returning: async () => [{ id: values.mock.calls.length === 1 ? "new-child" : "new-label" }],
  }));
  mocks.insert.mockReturnValue({ values });
  set.mockReturnValue({ where: async () => [] });
  await expect(pullTemplatesOntoTrip(actor, tripId, { templateIds: [first] })).resolves.toEqual({
    added: 2,
    skipped: 0,
  });
  expect(values).toHaveBeenNthCalledWith(1, expect.objectContaining({ name: "Boots", position: 0 }));
  expect(values).toHaveBeenNthCalledWith(2, expect.objectContaining({ name: "Gear", position: 1 }));
  expect(set).toHaveBeenCalledWith({ labelId: "new-label" });
});

it("maps a child onto an existing destination section", async () => {
  const { pullTemplatesOntoTrip } = await import("./packing");
  const queries: unknown[][] = [
    [{ id: first }],
    [{ id: "existing-label", name: " GEAR ", isLabel: true, position: 2 }],
    [
      { id: "label", text: "gear", isLabel: true, labelId: null },
      { id: "child", text: "Boots", isLabel: false, labelId: "label" },
    ],
  ];
  mocks.select.mockReturnValue({
    from: () => ({
      where: () => {
        const rows = queries.shift() ?? [];
        return Object.assign(Promise.resolve(rows), { orderBy: async () => rows });
      },
    }),
  });
  const values = vi.fn(() => ({ returning: async () => [{ id: "new-child" }] }));
  mocks.insert.mockReturnValue({ values });
  await expect(pullTemplatesOntoTrip(actor, tripId, { templateIds: [first] })).resolves.toEqual({
    added: 1,
    skipped: 1,
  });
  expect(values).toHaveBeenCalledWith(expect.objectContaining({ name: "Boots", labelId: "existing-label" }));
  expect(mocks.afterTripWrite).toHaveBeenCalledOnce();
});

it.each([true, false])(
  "keeps a template entry when an existing opposite-kind name collides (label: %s)",
  async (isLabel) => {
    const { pullTemplatesOntoTrip } = await import("./packing");
    const queries: unknown[][] = [
      [{ id: first }],
      [{ id: "existing", name: "Gear", isLabel: !isLabel, position: 0 }],
      [{ id: "entry", text: " gear ", isLabel, labelId: null }],
    ];
    mocks.select.mockReturnValue({
      from: () => ({
        where: () => {
          const rows = queries.shift() ?? [];
          return Object.assign(Promise.resolve(rows), { orderBy: async () => rows });
        },
      }),
    });
    const values = vi.fn(() => ({ returning: async () => [{ id: "new" }] }));
    mocks.insert.mockReturnValue({ values });
    await expect(pullTemplatesOntoTrip(actor, tripId, { templateIds: [first] })).resolves.toEqual({
      added: 1,
      skipped: 0,
    });
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ name: "gear", isLabel }));
  }
);

it("does not write or emit effects for a duplicate-only pull", async () => {
  const { pullTemplatesOntoTrip } = await import("./packing");
  const queries: unknown[][] = [
    [{ id: first }],
    [{ id: "existing", name: "boots", isLabel: false, position: 0 }],
    [{ id: "child", text: " Boots ", isLabel: false, labelId: null }],
  ];
  mocks.select.mockReturnValue({
    from: () => ({
      where: () => {
        const rows = queries.shift() ?? [];
        return Object.assign(Promise.resolve(rows), { orderBy: async () => rows });
      },
    }),
  });
  await expect(pullTemplatesOntoTrip(actor, tripId, { templateIds: [first] })).resolves.toEqual({
    added: 0,
    skipped: 1,
  });
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

// Packing rows take client UUIDs, so a delete leaves a record that stops a late create retry from bringing it back.
it("records a deleted item in the deleting transaction, and nothing for an absent one", async () => {
  await deletePackingItem(actor, itemId, { tripId });
  expect(mocks.recordDeletions).toHaveBeenCalledWith(mocks, "packing-item", [itemId], actor.userId);
  vi.clearAllMocks();
  row = undefined;
  await deletePackingItem(actor, itemId, { tripId });
  expect(mocks.recordDeletions).not.toHaveBeenCalled();
});
it("records the section and, in delete-items mode only, the items it removed", async () => {
  const { removePackingSection } = await import("./packing");
  const child = "123e4567-e89b-12d3-a456-426614174055";
  if (row) row.isLabel = true;
  deletedChildren = [{ id: child }];
  await removePackingSection(actor, itemId, { tripId, mode: "delete-items" });
  expect(mocks.recordDeletions).toHaveBeenCalledWith(mocks, "packing-item", [child, itemId], actor.userId);
  vi.clearAllMocks();
  set.mockReturnValue({ where: async () => [] });
  await removePackingSection(actor, itemId, { tripId, mode: "move-items-to-ungrouped" });
  expect(mocks.recordDeletions).toHaveBeenCalledWith(mocks, "packing-item", [itemId], actor.userId);
});
it("records a deleted list", async () => {
  const { deletePackingList } = await import("./packing");
  listStore(listRow());
  await deletePackingList(actor, listId, { tripId });
  expect(mocks.recordDeletions).toHaveBeenCalledWith(mocks, "packing-list", [listId], actor.userId);
});
it("refuses a recently deleted id on a new item or section, but not on a replay of a live row", async () => {
  const { createPackingItem } = await import("./packing");
  const newId = "123e4567-e89b-12d3-a456-426614174099";
  mocks.refuseRecentlyDeleted.mockRejectedValueOnce(new ConflictError("This packing item was deleted."));
  mocks.select.mockReturnValue({ from: () => ({ where: async () => [] }) });
  await expect(createPackingItem(actor, tripId, { id: newId, name: "Boots", listId: null })).rejects.toBeInstanceOf(
    ConflictError
  );
  expect(mocks.refuseRecentlyDeleted).toHaveBeenCalledWith(mocks, "packing-item", newId);
  expect(mocks.insert).not.toHaveBeenCalled();
  vi.clearAllMocks();
  mocks.select.mockReturnValue({
    from: (table: unknown) => ({ where: async () => (table === idempotencyKeys ? [] : row ? [row] : []) }),
  });
  await createPackingItem(actor, tripId, { id: itemId, name: "Socks", listId: null });
  expect(mocks.refuseRecentlyDeleted).not.toHaveBeenCalled();
});
it("refuses a recently deleted id on a new list", async () => {
  const { createPackingList } = await import("./packing");
  mocks.refuseRecentlyDeleted.mockRejectedValueOnce(new ConflictError("This packing list was deleted."));
  listStore(undefined);
  await expect(createPackingList(actor, tripId, { id: listId, name: "Beach" })).rejects.toBeInstanceOf(ConflictError);
  expect(mocks.refuseRecentlyDeleted).toHaveBeenCalledWith(mocks, "packing-list", listId);
  expect(mocks.insert).not.toHaveBeenCalled();
});
