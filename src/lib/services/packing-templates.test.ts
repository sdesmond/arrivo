import { beforeEach, expect, it, vi } from "vitest";
import { packingTemplateItems, packingTemplates } from "@/db/schema";
const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  idempotent: vi.fn(),
  lockIds: vi.fn(),
  list: vi.fn(),
  revalidate: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  requireTripRole: vi.fn(),
  lockTripForUpdate: vi.fn(),
  afterTripWrite: vi.fn(),
}));
vi.mock("./trip-access", async (original) => ({
  ...(await original<typeof import("./trip-access")>()),
  requireTripRole: mocks.requireTripRole,
}));
vi.mock("@/lib/server-action-locks", () => ({
  lockTripForUpdate: mocks.lockTripForUpdate,
  TRIP_NOT_FOUND_MESSAGE: "Trip not found.",
}));
vi.mock("./trip-write-effects", () => ({ afterTripWrite: mocks.afterTripWrite }));
vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/lib/api/idempotency", () => ({ withIdempotency: mocks.idempotent }));
vi.mock("@/lib/request-deadline", () => ({
  guardTransactionDeadline: (_transaction: unknown, work: () => Promise<unknown>) => work(),
}));
vi.mock("./client-ids", () => ({ lockClientIds: mocks.lockIds }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/queries", () => ({ listTemplatesForUser: mocks.list }));
import { ConflictError } from "./conflict-error";
import { TripNotFoundError } from "./trip-access";
import { ValidationFailedError } from "./validation-failed-error";
import { createPackingTemplate, listPackingTemplates, savePackingListAsTemplate } from "./packing-templates";
const id = "123e4567-e89b-12d3-a456-426614174000";
const actor = { userId: "user" };
const stored = { id, userId: "user", name: "Beach", createdAt: new Date("2026-01-01T00:00:00.000Z") };
let selectResults: unknown[][];
let replayed = false;
beforeEach(() => {
  vi.clearAllMocks();
  selectResults = [];
  replayed = false;
  const transaction = {
    select: () => ({
      from: () => ({
        where: () => {
          const rows = Promise.resolve(selectResults.shift() ?? []);
          return Object.assign(rows, { orderBy: () => rows });
        },
      }),
    }),
    insert: mocks.insert,
  };
  mocks.insert.mockReturnValue({ values: mocks.values });
  mocks.values.mockReturnValue({ returning: async () => [stored] });
  mocks.transaction.mockImplementation(async (work: (tx: unknown) => unknown) => work(transaction));
  mocks.idempotent.mockImplementation(
    async (
      _tx: unknown,
      _input: unknown,
      steps: { authorize: () => Promise<void>; mutate: () => Promise<unknown> }
    ) => {
      await steps.authorize();
      return { value: await steps.mutate(), replayed };
    }
  );
});
it("lists only the caller's templates", async () => {
  mocks.list.mockResolvedValue([{ id, name: "Beach" }]);
  await expect(listPackingTemplates(actor)).resolves.toEqual({ templates: [{ id, name: "Beach" }] });
  expect(mocks.list).toHaveBeenCalledWith("user");
  await expect(listPackingTemplates(actor, { extra: 1 })).rejects.toThrow();
});
it("creates an owned template with a trimmed name and revalidates", async () => {
  selectResults = [[], []];
  const result = await createPackingTemplate(actor, { id: id.toUpperCase(), name: "  Beach " });
  expect(result).toEqual({ id, name: "Beach", createdAt: "2026-01-01T00:00:00.000Z" });
  expect(mocks.insert).toHaveBeenCalledWith(packingTemplates);
  expect(mocks.values).toHaveBeenCalledWith({ id, userId: "user", name: "Beach" });
  expect(mocks.lockIds).toHaveBeenCalledWith(expect.anything(), [`packing-template:${id}`]);
  expect(mocks.revalidate).toHaveBeenCalledWith("/packing");
});
it("returns the current row without writing on a same-id retry", async () => {
  selectResults = [[{ userId: "user" }], [stored]];
  await expect(createPackingTemplate(actor, { id, name: "Beach" })).resolves.toMatchObject({ id, name: "Beach" });
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
it("conflicts when the id holds a different name", async () => {
  selectResults = [[{ userId: "user" }], [stored]];
  await expect(createPackingTemplate(actor, { id, name: "Other" })).rejects.toBeInstanceOf(ConflictError);
  expect(mocks.insert).not.toHaveBeenCalled();
});
it("answers another user's id as not found", async () => {
  selectResults = [[{ userId: "someone" }]];
  await expect(createPackingTemplate(actor, { id, name: "Beach" })).rejects.toBeInstanceOf(TripNotFoundError);
  expect(mocks.insert).not.toHaveBeenCalled();
});
it("rejects invalid names before any write and skips revalidation on a keyed replay", async () => {
  await expect(createPackingTemplate(actor, { id, name: "  " })).rejects.toThrow();
  expect(mocks.transaction).not.toHaveBeenCalled();
  selectResults = [[], []];
  replayed = true;
  await createPackingTemplate(
    actor,
    { id, name: "Beach" },
    { key: "k", method: "POST", path: "/api/v1/packing-templates" }
  );
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
const listId = "123e4567-e89b-12d3-a456-426614174001";
const tripId = "123e4567-e89b-12d3-a456-426614174002";
const saveBody = { tripId, id, name: " Beach " };
const listRow = { id: listId, tripId };
type Copy = { text: string; position: number; labelId: string | null };
function item(itemId: string, over: Record<string, unknown>) {
  return { id: itemId, tripId, listId, name: itemId, done: true, isLabel: false, position: 0, labelId: null, ...over };
}
it("copies only the selected list's ordered items with remapped sections, unchecked", async () => {
  // list, foreign-id check, existing row, then the list's items (the query itself is scoped to the list)
  selectResults = [
    [listRow],
    [],
    [],
    [
      item("gear", { name: "Gear", isLabel: true, position: 3 }),
      item("socks", { name: "Socks", position: 5, labelId: "gear" }),
      item("loose", { name: "Passport", position: 9 }),
      item("orphan", { name: "Hat", position: 10, labelId: "gone" }),
    ],
  ];
  const result = await savePackingListAsTemplate(actor, listId.toUpperCase(), saveBody);
  expect(result).toMatchObject({ id, name: "Beach" });
  expect(mocks.requireTripRole).toHaveBeenLastCalledWith(tripId, "user", "editor", expect.anything());
  expect(mocks.lockIds).toHaveBeenCalledWith(expect.anything(), [`packing-template:${id}`]);
  expect(mocks.insert.mock.calls.map((call) => call[0])).toEqual([
    packingTemplates,
    packingTemplateItems,
    packingTemplateItems,
  ]);
  const [, sections, entries] = mocks.values.mock.calls.map((call) => call[0]);
  expect(sections).toEqual([
    expect.objectContaining({ templateId: id, text: "Gear", isLabel: true, position: 0, labelId: null }),
  ]);
  expect(entries.map((entry: Copy) => [entry.text, entry.position])).toEqual([
    ["Socks", 1],
    ["Passport", 2],
    ["Hat", 3],
  ]);
  expect(entries[0].labelId).toBe(sections[0].id);
  expect(entries[1].labelId).toBeNull();
  expect(entries[2].labelId).toBeNull();
  expect(entries.every((entry: Record<string, unknown>) => !("done" in entry))).toBe(true);
  // A template write is not a trip change: pages revalidate, but no activity or live event is recorded.
  expect(mocks.revalidate).toHaveBeenCalledWith("/packing");
  expect(mocks.revalidate).toHaveBeenCalledWith(`/trips/${tripId}`);
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});
it("skips the section insert when the list has no sections", async () => {
  selectResults = [[listRow], [], [], [item("a", { name: "Socks" })]];
  await savePackingListAsTemplate(actor, listId, saveBody);
  expect(mocks.insert).toHaveBeenCalledTimes(2);
});
it("returns the current template without copying on a same-id retry", async () => {
  selectResults = [[listRow], [{ userId: "user" }], [stored]];
  await expect(savePackingListAsTemplate(actor, listId, { ...saveBody, name: "Beach" })).resolves.toMatchObject({ id });
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.revalidate).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});
it("conflicts when the id holds a different name", async () => {
  selectResults = [[listRow], [{ userId: "user" }], [stored]];
  await expect(savePackingListAsTemplate(actor, listId, { ...saveBody, name: "Other" })).rejects.toBeInstanceOf(
    ConflictError
  );
  expect(mocks.insert).not.toHaveBeenCalled();
});
it("answers another user's template id as not found", async () => {
  selectResults = [[listRow], [{ userId: "someone" }]];
  await expect(savePackingListAsTemplate(actor, listId, saveBody)).rejects.toBeInstanceOf(TripNotFoundError);
  expect(mocks.insert).not.toHaveBeenCalled();
});
it("rejects an empty list without writing", async () => {
  selectResults = [[listRow], [], [], []];
  await expect(savePackingListAsTemplate(actor, listId, saveBody)).rejects.toBeInstanceOf(ValidationFailedError);
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});
it("hides a missing list and a list of another trip", async () => {
  selectResults = [[]];
  await expect(savePackingListAsTemplate(actor, listId, saveBody)).rejects.toBeInstanceOf(TripNotFoundError);
  selectResults = [[{ id: listId, tripId: "other-trip" }]];
  await expect(savePackingListAsTemplate(actor, listId, saveBody)).rejects.toBeInstanceOf(TripNotFoundError);
  expect(mocks.insert).not.toHaveBeenCalled();
});
it("denies a caller below editor before and inside the transaction", async () => {
  mocks.requireTripRole.mockRejectedValueOnce(new TripNotFoundError());
  await expect(savePackingListAsTemplate(actor, listId, saveBody)).rejects.toBeInstanceOf(TripNotFoundError);
  expect(mocks.transaction).not.toHaveBeenCalled();
  mocks.requireTripRole.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new TripNotFoundError());
  await expect(savePackingListAsTemplate(actor, listId, saveBody)).rejects.toBeInstanceOf(TripNotFoundError);
  expect(mocks.insert).not.toHaveBeenCalled();
});
it("rejects bad input before any lookup", async () => {
  await expect(savePackingListAsTemplate(actor, listId, { ...saveBody, name: " " })).rejects.toThrow();
  await expect(savePackingListAsTemplate(actor, "bad", saveBody)).rejects.toThrow();
  expect(mocks.requireTripRole).not.toHaveBeenCalled();
});
it("maps a lock on a missing trip to not found", async () => {
  mocks.lockTripForUpdate.mockRejectedValueOnce(new Error("Trip not found."));
  await expect(savePackingListAsTemplate(actor, listId, saveBody)).rejects.toBeInstanceOf(TripNotFoundError);
});
it("passes the keyed request to the idempotency layer and skips effects on replay", async () => {
  selectResults = [[listRow], [], [], [item("a", { name: "Socks" })]];
  replayed = true;
  const replay = { key: "k", method: "POST", path: "/x" };
  await savePackingListAsTemplate(actor, listId, saveBody, replay);
  expect(mocks.idempotent).toHaveBeenCalledWith(
    expect.anything(),
    { actor, request: replay, payload: { tripId, id, name: "Beach" } },
    expect.anything()
  );
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});
