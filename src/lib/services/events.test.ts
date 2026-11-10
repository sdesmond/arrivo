import { beforeEach, expect, it, vi } from "vitest";
import { days, documents, events, idempotencyKeys } from "@/db/schema";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
  appendPosition: vi.fn(),
  shiftFromPosition: vi.fn(),
  storageDelete: vi.fn(),
  lockTripForUpdate: vi.fn(),
  requireTripRole: vi.fn(),
  afterTripWrite: vi.fn(),
  now: new Date("2026-06-01T12:00:00.000Z"),
}));
vi.mock("@/db", () => ({ db: mocks }));
vi.mock("@/lib/mock-date", () => ({ getNow: () => mocks.now }));
vi.mock("@/lib/server-action-locks", () => ({
  lockTripForUpdate: mocks.lockTripForUpdate,
  TRIP_NOT_FOUND_MESSAGE: "Trip not found.",
}));
vi.mock("./trip-access", async (original) => ({
  ...(await original<typeof import("./trip-access")>()),
  requireTripRole: mocks.requireTripRole,
}));
vi.mock("./trip-write-effects", () => ({ afterTripWrite: mocks.afterTripWrite }));
vi.mock("./timeline-positions", () => ({
  appendPosition: mocks.appendPosition,
  shiftFromPosition: mocks.shiftFromPosition,
}));
vi.mock("@/lib/storage/storage-adapter", () => ({ getStorageAdapter: () => ({ del: mocks.storageDelete }) }));

import { createEvent, deleteEvent, updateEvent } from "./events";
import { TripNotFoundError } from "./trip-access";
import { ConflictError } from "./conflict-error";
import { fingerprintRequest } from "@/lib/api/idempotency";

const actor = { userId: "user" };
const eventId = "123e4567-e89b-12d3-a456-426614174000";
const tripId = "223e4567-e89b-12d3-a456-426614174000";
const baseRow = {
  id: eventId,
  tripId,
  dayId: "323e4567-e89b-12d3-a456-426614174000" as string | null,
  name: "Dinner",
  note: "Window seat",
  startAt: new Date("2026-06-02T19:00:00.000Z") as Date | null,
  endAt: null as Date | null,
  displacedDate: null,
  locationName: "Bistro" as string | null,
  locationAddress: null,
  locationLat: null,
  locationLng: null,
  confirmationNumber: "ABC",
  position: 2,
  createdAt: null,
  updatedAt: null,
};
const replay = { key: "retry-1", method: "PATCH", path: `/api/v1/events/${eventId}` };

let rows: (typeof baseRow)[];
let eventReads: (typeof baseRow | { position: number })[][];
let dayRows: { tripId: string }[];
let dayReads: { tripId: string }[][];
let docRows: { url: string | null }[];
let inserted: Record<string, unknown>[];
let insertedRow: typeof baseRow;
let returned: (typeof baseRow)[];
let stored: { result: unknown }[];
let calls: string[];
let setSpy: ReturnType<typeof vi.fn>;

function envelope(payload: unknown, response: unknown = { id: eventId, name: "Cached" }) {
  return {
    version: 1,
    fingerprint: fingerprintRequest("PATCH", replay.path, payload),
    expiresAt: new Date(mocks.now.getTime() + 60_000).toISOString(),
    response,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  rows = [baseRow];
  eventReads = [];
  dayRows = [{ tripId }];
  dayReads = [];
  docRows = [];
  inserted = [];
  insertedRow = { ...baseRow, id: "923e4567-e89b-12d3-a456-426614174000", name: "Created", position: 4 };
  returned = [{ ...baseRow, name: "Updated" }];
  stored = [];
  calls = [];
  setSpy = vi.fn(() => ({
    where: () => ({
      returning: async () => {
        calls.push("update");
        return returned;
      },
    }),
  }));
  mocks.select.mockReturnValue({
    from: (table: unknown) => ({
      where: async () => {
        if (table === idempotencyKeys) {
          calls.push("lookup");
          return stored;
        }
        if (table === days) return dayReads.length > 0 ? dayReads.shift()! : dayRows;
        if (table === documents) return docRows;
        expect(table).toBe(events);
        return eventReads.length > 0 ? eventReads.shift()! : rows;
      },
    }),
  });
  mocks.execute.mockImplementation(async (statement: { queryChunks?: unknown[] }) => {
    const text = JSON.stringify(statement.queryChunks);
    if (text.includes("pg_advisory_xact_lock")) calls.push(text.includes('"event:') ? "id-lock" : "actor-key-lock");
    return [];
  });
  mocks.lockTripForUpdate.mockImplementation(async () => {
    calls.push("trip-lock");
  });
  mocks.insert.mockImplementation((table: unknown) => ({
    values: (values: Record<string, unknown>) => {
      if (table === events) {
        inserted.push(values);
        return {
          returning: async () => {
            calls.push("insert");
            return [insertedRow];
          },
        };
      }
      return {
        onConflictDoUpdate: async () => {
          calls.push("store");
        },
      };
    },
  }));
  mocks.update.mockReturnValue({ set: setSpy });
  mocks.delete.mockImplementation((table: unknown) => ({
    where: async () => {
      calls.push(table === events ? "delete-event" : "delete-documents");
    },
  }));
  mocks.appendPosition.mockResolvedValue(4);
  mocks.shiftFromPosition.mockImplementation(async () => {
    calls.push("shift");
  });
  mocks.storageDelete.mockImplementation(async () => {
    calls.push("cleanup");
  });
  mocks.transaction.mockImplementation(async (callback) => {
    const result = await callback(mocks);
    calls.push("commit");
    return result;
  });
});

it("changes only the supplied field, with an explicit allow-list and the server clock", async () => {
  await expect(updateEvent(actor, eventId, { name: "Updated" })).resolves.toMatchObject({
    id: eventId,
    name: "Updated",
    dayId: baseRow.dayId,
  });
  expect(setSpy).toHaveBeenCalledOnce();
  expect(setSpy).toHaveBeenCalledWith({ name: "Updated", updatedAt: mocks.now });
  expect(mocks.lockTripForUpdate).toHaveBeenCalledWith(mocks, tripId);
  expect(mocks.requireTripRole).toHaveBeenNthCalledWith(1, tripId, "user", "editor");
  expect(mocks.requireTripRole).toHaveBeenNthCalledWith(2, tripId, "user", "editor", mocks);
  expect(mocks.afterTripWrite).toHaveBeenCalledExactlyOnceWith(actor, tripId);
});

it("normalizes the event id before reading", async () => {
  await updateEvent(actor, eventId.toUpperCase(), { name: "Updated" });
  expect(mocks.lockTripForUpdate).toHaveBeenCalledWith(mocks, tripId);
});

it("maps every field to its column, turning times into dates", async () => {
  const patch = {
    name: "New",
    startAt: "2026-06-03T10:00:00.000Z",
    endAt: "2026-06-03T11:00:00.000Z",
    locationName: "Cafe",
    locationAddress: "2 Side St",
    locationLat: 10.5,
    locationLng: -20.25,
    confirmationNumber: "XYZ",
    note: "Bring cash",
  };
  await updateEvent(actor, eventId, patch);
  expect(setSpy).toHaveBeenCalledWith({
    ...patch,
    startAt: new Date(patch.startAt),
    endAt: new Date(patch.endAt),
    updatedAt: mocks.now,
  });
});

it("clears every nullable column when sent null, including the note and confirmation number", async () => {
  await updateEvent(actor, eventId, {
    startAt: null,
    endAt: null,
    locationName: null,
    locationAddress: null,
    locationLat: null,
    locationLng: null,
    confirmationNumber: null,
    note: null,
  });
  expect(setSpy).toHaveBeenCalledWith({
    startAt: null,
    endAt: null,
    locationName: null,
    locationAddress: null,
    locationLat: null,
    locationLng: null,
    confirmationNumber: null,
    note: null,
    updatedAt: mocks.now,
  });
  expect(mocks.afterTripWrite).toHaveBeenCalledOnce();
});

it("treats an empty time as no time", async () => {
  await updateEvent(actor, eventId, { startAt: "", endAt: "" });
  expect(setSpy).toHaveBeenCalledWith({ startAt: null, endAt: null, updatedAt: mocks.now });
});

it("returns the current event for an empty patch with no write and no effects", async () => {
  await expect(updateEvent(actor, eventId, {}, replay)).resolves.toMatchObject({ id: eventId, name: "Dinner" });
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it("edits a day-less event", async () => {
  rows = [{ ...baseRow, dayId: null }];
  returned = [{ ...baseRow, dayId: null, name: "Floating" }];
  const result = await updateEvent(actor, eventId, { name: "Floating" });
  expect(result).toMatchObject({ name: "Floating" });
  expect(result.dayId).toBeUndefined();
  expect(mocks.afterTripWrite).toHaveBeenCalledOnce();
});

it("rejects a linked id and any other non-UUID before touching the database", async () => {
  await expect(updateEvent(actor, `linked-${eventId}`, { name: "x" })).rejects.toThrow();
  await expect(updateEvent(actor, "bad", { name: "x" })).rejects.toThrow();
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it.each([
  ["a blank name", { name: "  " }],
  ["an unknown key", { position: 1 }],
  ["latitude 91", { locationLat: 91 }],
  ["a null name", { name: null }],
])("rejects %s before touching the database", async (_name, body) => {
  await expect(updateEvent(actor, eventId, body)).rejects.toThrow();
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it("conceals a missing event", async () => {
  rows = [];
  await expect(updateEvent(actor, eventId, { name: "x" })).rejects.toMatchObject({ name: "TripNotFoundError" });
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it.each(["viewer", "stranger"])("denies a %s before the transaction, lock or write", async () => {
  mocks.requireTripRole.mockRejectedValueOnce(new Error("denied"));
  await expect(updateEvent(actor, eventId, { name: "x" })).rejects.toThrow("denied");
  expect(mocks.transaction).not.toHaveBeenCalled();
  expect(mocks.lockTripForUpdate).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
});

it("rechecks access inside the lock", async () => {
  mocks.requireTripRole.mockResolvedValueOnce("editor").mockRejectedValueOnce(new Error("revoked"));
  await expect(updateEvent(actor, eventId, { name: "x" })).rejects.toThrow("revoked");
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it("rejects an event deleted while waiting for the trip lock", async () => {
  mocks.lockTripForUpdate.mockImplementationOnce(async () => {
    rows = [];
  });
  await expect(updateEvent(actor, eventId, { name: "x" })).rejects.toMatchObject({ name: "TripNotFoundError" });
  expect(mocks.update).not.toHaveBeenCalled();
});

it("rejects an event moved to another trip during the lock instead of writing it", async () => {
  mocks.lockTripForUpdate.mockImplementationOnce(async () => {
    rows = [{ ...baseRow, tripId: "423e4567-e89b-12d3-a456-426614174000" }];
  });
  await expect(updateEvent(actor, eventId, { name: "x" })).rejects.toMatchObject({ name: "TripNotFoundError" });
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it("reports a row that vanished between the check and the write as not found", async () => {
  returned = [];
  await expect(updateEvent(actor, eventId, { name: "x" })).rejects.toMatchObject({ name: "TripNotFoundError" });
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it("reports an event deleted before the mutate read as not found", async () => {
  mocks.lockTripForUpdate.mockImplementationOnce(async () => {
    calls.push("trip-lock");
  });
  let reads = 0;
  mocks.select.mockReturnValue({
    from: () => ({
      where: async () => {
        reads += 1;
        return reads <= 2 ? rows : [];
      },
    }),
  });
  await expect(updateEvent(actor, eventId, { name: "x" })).rejects.toMatchObject({ name: "TripNotFoundError" });
  expect(mocks.update).not.toHaveBeenCalled();
});

it("maps a trip deleted before lock acquisition to not found and propagates other lock failures", async () => {
  mocks.lockTripForUpdate.mockRejectedValueOnce(new Error("Trip not found."));
  await expect(updateEvent(actor, eventId, { name: "x" })).rejects.toMatchObject({ name: "TripNotFoundError" });
  mocks.lockTripForUpdate.mockRejectedValueOnce(new Error("database unavailable"));
  await expect(updateEvent(actor, eventId, { name: "x" })).rejects.toThrow("database unavailable");
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it("defers effects until the commit resolves and skips them when it rejects", async () => {
  mocks.transaction.mockImplementationOnce(async (callback) => {
    await callback(mocks);
    throw new Error("commit rejected");
  });
  await expect(updateEvent(actor, eventId, { name: "x" })).rejects.toThrow("commit rejected");
  expect(mocks.update).toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it("does not touch replay storage without a key", async () => {
  await updateEvent(actor, eventId, { name: "x" });
  expect(mocks.execute).not.toHaveBeenCalled();
  expect(mocks.insert).not.toHaveBeenCalled();
});

it("keyed request locks the key, then the trip, looks up, writes and stores in one transaction", async () => {
  await expect(updateEvent(actor, eventId, { name: "Updated" }, replay)).resolves.toMatchObject({ name: "Updated" });
  expect(calls).toEqual(["actor-key-lock", "trip-lock", "lookup", "update", "store", "commit"]);
  expect(mocks.transaction).toHaveBeenCalledOnce();
  expect(mocks.afterTripWrite).toHaveBeenCalledOnce();
});

it("replays the stored response with one write total and no second effect", async () => {
  stored = [{ result: envelope({ name: "Updated" }) }];
  await expect(updateEvent(actor, eventId, { name: "Updated" }, replay)).resolves.toEqual({
    id: eventId,
    name: "Cached",
  });
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it("returns a 409-mapped conflict when a key is reused with a different body", async () => {
  stored = [{ result: envelope({ name: "Updated" }) }];
  await expect(updateEvent(actor, eventId, { name: "Different" }, replay)).rejects.toBeInstanceOf(ConflictError);
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it("never replays a stored result once access is lost", async () => {
  stored = [{ result: envelope({ name: "Updated" }) }];
  mocks.requireTripRole.mockResolvedValueOnce("editor").mockRejectedValueOnce(new Error("role removed"));
  await expect(updateEvent(actor, eventId, { name: "Updated" }, replay)).rejects.toThrow("role removed");
  expect(calls).not.toContain("lookup");
});

// ---- createEvent ----

const dayId = "323e4567-e89b-12d3-a456-426614174000";
const clientId = "823e4567-e89b-12d3-a456-426614174000";
const afterId = "723e4567-e89b-12d3-a456-426614174000";
const otherTripId = "423e4567-e89b-12d3-a456-426614174000";
const createReplay = { key: "create-1", method: "POST", path: `/api/v1/days/${dayId}/events` };
const storedEvent = {
  ...baseRow,
  id: clientId,
  name: "Dinner",
  note: null,
  startAt: null,
  endAt: null,
  locationName: null,
  confirmationNumber: null,
  position: 9,
};

function createEnvelope(payload: unknown, response: unknown) {
  return {
    version: 1,
    fingerprint: fingerprintRequest("POST", createReplay.path, payload),
    expiresAt: new Date(mocks.now.getTime() + 60_000).toISOString(),
    response,
  };
}

it("appends when no placement is given, with no shift", async () => {
  await expect(createEvent(actor, dayId, { name: "Dinner" })).resolves.toMatchObject({ id: insertedRow.id });
  expect(mocks.appendPosition).toHaveBeenCalledWith(mocks, dayId);
  expect(mocks.shiftFromPosition).not.toHaveBeenCalled();
  expect(inserted).toEqual([
    expect.objectContaining({ dayId, tripId, name: "Dinner", position: 4, createdAt: mocks.now, updatedAt: mocks.now }),
  ]);
  expect(mocks.requireTripRole).toHaveBeenNthCalledWith(1, tripId, "user", "editor");
  expect(mocks.requireTripRole).toHaveBeenNthCalledWith(2, tripId, "user", "editor", mocks);
  expect(mocks.afterTripWrite).toHaveBeenCalledExactlyOnceWith(actor, tripId);
});

it("inserts after a reference event on the day and shifts later items first", async () => {
  eventReads = [[{ position: 2 }]];
  await createEvent(actor, dayId, { name: "Dinner", afterEventId: afterId, insertAtPosition: 0 });
  expect(mocks.shiftFromPosition).toHaveBeenCalledWith(mocks, dayId, 3);
  expect(inserted[0]).toMatchObject({ position: 3 });
  expect(calls.indexOf("shift")).toBeLessThan(calls.indexOf("insert"));
});

it("falls back to the position when the reference event is not on the day", async () => {
  eventReads = [[]];
  await createEvent(actor, dayId, { name: "Dinner", afterEventId: afterId, insertAtPosition: 1 });
  expect(mocks.shiftFromPosition).toHaveBeenCalledWith(mocks, dayId, 1);
  expect(inserted[0]).toMatchObject({ position: 1 });
});

it("appends when the reference event is missing and no position is given", async () => {
  eventReads = [[]];
  await createEvent(actor, dayId, { name: "Dinner", afterEventId: afterId });
  expect(mocks.shiftFromPosition).not.toHaveBeenCalled();
  expect(inserted[0]).toMatchObject({ position: 4 });
});

it("inserts at a position, shifting items at or above it", async () => {
  await createEvent(actor, dayId, { name: "Dinner", insertAtPosition: 1 });
  expect(mocks.shiftFromPosition).toHaveBeenCalledWith(mocks, dayId, 1);
  expect(inserted[0]).toMatchObject({ position: 1 });
});

it("maps every field to its column, turning times into dates and an empty time into none", async () => {
  eventReads = [[], []];
  await createEvent(actor, dayId, {
    id: clientId,
    name: "Dinner",
    startAt: "2026-06-03T10:00:00.000Z",
    endAt: "",
    locationName: "Cafe",
    locationAddress: "2 Side St",
    locationLat: 10.5,
    locationLng: -20.25,
    confirmationNumber: "XYZ",
    note: "Bring cash",
  });
  expect(inserted[0]).toEqual({
    id: clientId,
    dayId,
    tripId,
    name: "Dinner",
    startAt: new Date("2026-06-03T10:00:00.000Z"),
    endAt: null,
    locationName: "Cafe",
    locationAddress: "2 Side St",
    locationLat: 10.5,
    locationLng: -20.25,
    confirmationNumber: "XYZ",
    note: "Bring cash",
    position: 4,
    createdAt: mocks.now,
    updatedAt: mocks.now,
  });
});

it("leaves the id to the database when none is sent", async () => {
  await createEvent(actor, dayId, { name: "Dinner" });
  expect(inserted[0]).not.toHaveProperty("id");
});

it("normalizes the day id before reading", async () => {
  await createEvent(actor, dayId.toUpperCase(), { name: "Dinner" });
  expect(inserted[0]).toMatchObject({ dayId });
});

it("claims the client id, then the trip lock, then checks the day", async () => {
  eventReads = [[], []];
  await createEvent(actor, dayId, { id: clientId, name: "Dinner" }, createReplay);
  expect(calls).toEqual(["actor-key-lock", "id-lock", "trip-lock", "lookup", "insert", "store", "commit"]);
});

it("takes no id lock without a client id", async () => {
  await createEvent(actor, dayId, { name: "Dinner" });
  expect(calls).not.toContain("id-lock");
});

it("replays a stored row when the id, trip, day and content match, whatever its position now is", async () => {
  eventReads = [[storedEvent], [storedEvent]];
  await expect(createEvent(actor, dayId, { id: clientId, name: "Dinner" })).resolves.toMatchObject({
    id: clientId,
    position: 9,
  });
  expect(inserted).toEqual([]);
  expect(mocks.shiftFromPosition).not.toHaveBeenCalled();
  expect(mocks.appendPosition).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it("replays when stored times and an empty time describe the same instants", async () => {
  const existing = { ...storedEvent, startAt: new Date("2026-06-03T10:00:00.000Z"), note: "Window" };
  eventReads = [[existing], [existing]];
  await expect(
    createEvent(actor, dayId, {
      id: clientId,
      name: "Dinner",
      startAt: "2026-06-03T10:00:00.000Z",
      endAt: "",
      note: "Window",
    })
  ).resolves.toMatchObject({ id: clientId });
  expect(inserted).toEqual([]);
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it.each([
  ["a different name", { name: "Lunch" }, {}],
  ["a different note", { name: "Dinner", note: "New" }, {}],
  ["a different start time", { name: "Dinner", startAt: "2026-06-03T10:00:00.000Z" }, {}],
  ["a missing end time", { name: "Dinner", endAt: "2026-06-03T10:00:00.000Z" }, {}],
  ["a different location name", { name: "Dinner", locationName: "Cafe" }, {}],
  ["a different address", { name: "Dinner", locationAddress: "2 Side St" }, {}],
  ["a different latitude", { name: "Dinner", locationLat: 1 }, {}],
  ["a different longitude", { name: "Dinner", locationLng: 1 }, {}],
  ["a different confirmation number", { name: "Dinner", confirmationNumber: "ZZZ" }, {}],
  ["another day", { name: "Dinner" }, { dayId: "623e4567-e89b-12d3-a456-426614174000" }],
  ["no day", { name: "Dinner" }, { dayId: null }],
  ["a stored start time", { name: "Dinner" }, { startAt: new Date("2026-06-03T10:00:00.000Z") }],
])("rejects the id reused with %s as a conflict, writing nothing", async (_name, body, override) => {
  const existing = { ...storedEvent, ...override };
  eventReads = [[existing], [existing]];
  await expect(createEvent(actor, dayId, { id: clientId, ...body })).rejects.toBeInstanceOf(ConflictError);
  expect(inserted).toEqual([]);
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it("needs viewer access to a trip that already holds the id, then reports the conflict", async () => {
  const foreign = { ...storedEvent, tripId: otherTripId };
  eventReads = [[foreign], [foreign]];
  await expect(createEvent(actor, dayId, { id: clientId, name: "Dinner" })).rejects.toBeInstanceOf(ConflictError);
  expect(mocks.requireTripRole).toHaveBeenCalledWith(otherTripId, "user", "viewer", mocks);
  expect(inserted).toEqual([]);
});

it("conceals an id held by a trip the actor cannot see", async () => {
  const foreign = { ...storedEvent, tripId: otherTripId };
  eventReads = [[foreign], [foreign]];
  mocks.requireTripRole
    .mockResolvedValueOnce("editor")
    .mockResolvedValueOnce("editor")
    .mockRejectedValueOnce(new TripNotFoundError());
  await expect(createEvent(actor, dayId, { id: clientId, name: "Dinner" })).rejects.toBeInstanceOf(TripNotFoundError);
  expect(inserted).toEqual([]);
});

it("reports a day removed between the pre-read and the trip lock as a conflict", async () => {
  dayReads = [[{ tripId }], []];
  await expect(createEvent(actor, dayId, { name: "Dinner" })).rejects.toBeInstanceOf(ConflictError);
  expect(mocks.lockTripForUpdate).toHaveBeenCalled();
  expect(inserted).toEqual([]);
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it("reports a day that is already gone as not found, before any transaction", async () => {
  dayRows = [];
  await expect(createEvent(actor, dayId, { name: "Dinner" })).rejects.toBeInstanceOf(TripNotFoundError);
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it.each(["viewer", "stranger"])("denies a %s on create before the transaction, lock or write", async () => {
  mocks.requireTripRole.mockRejectedValueOnce(new Error("denied"));
  await expect(createEvent(actor, dayId, { name: "Dinner" })).rejects.toThrow("denied");
  expect(mocks.transaction).not.toHaveBeenCalled();
  expect(mocks.lockTripForUpdate).not.toHaveBeenCalled();
  expect(inserted).toEqual([]);
});

it("rechecks access inside the lock on create", async () => {
  mocks.requireTripRole.mockResolvedValueOnce("editor").mockRejectedValueOnce(new Error("revoked"));
  await expect(createEvent(actor, dayId, { name: "Dinner" })).rejects.toThrow("revoked");
  expect(inserted).toEqual([]);
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it.each([
  ["a linked day id", `linked-${dayId}`, { name: "Dinner" }],
  ["a non-UUID day id", "bad", { name: "Dinner" }],
  ["a blank name", dayId, { name: "  " }],
  ["a linked event id", dayId, { id: `linked-${clientId}`, name: "Dinner" }],
  ["an unknown key", dayId, { name: "Dinner", position: 1 }],
])("rejects %s on create before touching the database", async (_name, day, body) => {
  await expect(createEvent(actor, day, body)).rejects.toThrow();
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it("runs no effect when the commit rejects", async () => {
  mocks.transaction.mockImplementationOnce(async (callback) => {
    await callback(mocks);
    throw new Error("commit rejected");
  });
  await expect(createEvent(actor, dayId, { name: "Dinner" })).rejects.toThrow("commit rejected");
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it("returns the stored response for a repeated key with no write or effect", async () => {
  const payload = { id: clientId, name: "Dinner" };
  stored = [{ result: createEnvelope(payload, { id: clientId, name: "Cached" }) }];
  await expect(createEvent(actor, dayId, payload, createReplay)).resolves.toEqual({ id: clientId, name: "Cached" });
  expect(inserted).toEqual([]);
  expect(mocks.shiftFromPosition).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it("rejects a key reused with another body", async () => {
  stored = [{ result: createEnvelope({ name: "Dinner" }, { id: clientId }) }];
  await expect(createEvent(actor, dayId, { name: "Lunch" }, createReplay)).rejects.toBeInstanceOf(ConflictError);
  expect(inserted).toEqual([]);
});

// ---- deleteEvent ----

const deleteReplay = { key: "delete-1", method: "DELETE", path: `/api/v1/events/${eventId}` };

function deleteEnvelope(payload: unknown) {
  return {
    version: 1,
    fingerprint: fingerprintRequest("DELETE", deleteReplay.path, payload),
    expiresAt: new Date(mocks.now.getTime() + 60_000).toISOString(),
    response: null,
  };
}

it("deletes the event and its documents, then removes the files only after the commit", async () => {
  docRows = [{ url: "/uploads/a.pdf" }, { url: null }, { url: "/uploads/b.pdf" }];
  await expect(deleteEvent(actor, eventId, { tripId })).resolves.toBeNull();
  expect(calls).toEqual(["trip-lock", "delete-documents", "delete-event", "commit", "cleanup", "cleanup"]);
  expect(mocks.storageDelete).toHaveBeenCalledTimes(2);
  expect(mocks.storageDelete).toHaveBeenCalledWith("/uploads/a.pdf");
  expect(mocks.storageDelete).toHaveBeenCalledWith("/uploads/b.pdf");
  expect(setSpy).not.toHaveBeenCalled();
  expect(mocks.requireTripRole).toHaveBeenNthCalledWith(1, tripId, "user", "editor");
  expect(mocks.requireTripRole).toHaveBeenNthCalledWith(2, tripId, "user", "editor", mocks);
  expect(mocks.afterTripWrite).toHaveBeenCalledExactlyOnceWith(actor, tripId);
});

it("discards documents when keepDocuments is false", async () => {
  docRows = [{ url: "/uploads/a.pdf" }];
  await deleteEvent(actor, eventId, { tripId, keepDocuments: false });
  expect(calls).toContain("delete-documents");
  expect(mocks.storageDelete).toHaveBeenCalledOnce();
});

it("keeps documents as trip documents and deletes no file", async () => {
  docRows = [{ url: "/uploads/a.pdf" }];
  await deleteEvent(actor, eventId, { tripId, keepDocuments: true });
  expect(setSpy).toHaveBeenCalledExactlyOnceWith({ eventId: null, tripId });
  expect(calls).not.toContain("delete-documents");
  expect(calls).toContain("delete-event");
  expect(mocks.storageDelete).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).toHaveBeenCalledOnce();
});

it("logs a cleanup failure and still succeeds", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  docRows = [{ url: "/uploads/a.pdf" }, { url: "/uploads/b.pdf" }];
  mocks.storageDelete.mockRejectedValueOnce(new Error("disk gone"));
  await expect(deleteEvent(actor, eventId, { tripId })).resolves.toBeNull();
  expect(warn).toHaveBeenCalledWith("Cleanup failed for /uploads/a.pdf", expect.any(Error));
  expect(mocks.storageDelete).toHaveBeenCalledTimes(2);
  expect(mocks.afterTripWrite).toHaveBeenCalledOnce();
  warn.mockRestore();
});

it("deletes a day-less event", async () => {
  rows = [{ ...baseRow, dayId: null }];
  await expect(deleteEvent(actor, eventId, { tripId })).resolves.toBeNull();
  expect(calls).toContain("delete-event");
  expect(mocks.afterTripWrite).toHaveBeenCalledOnce();
});

it("succeeds for a row that is already gone, with no write, cleanup or effect", async () => {
  rows = [];
  docRows = [{ url: "/uploads/a.pdf" }];
  await expect(deleteEvent(actor, eventId, { tripId }, deleteReplay)).resolves.toBeNull();
  expect(calls).not.toContain("delete-event");
  expect(calls).not.toContain("delete-documents");
  expect(mocks.storageDelete).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  expect(mocks.requireTripRole).toHaveBeenCalledTimes(2);
});

it("conceals an event that belongs to another trip", async () => {
  rows = [{ ...baseRow, tripId: otherTripId }];
  await expect(deleteEvent(actor, eventId, { tripId })).rejects.toBeInstanceOf(TripNotFoundError);
  expect(calls).not.toContain("delete-event");
  expect(mocks.storageDelete).not.toHaveBeenCalled();
});

it("removes no file when the transaction rolls back after the delete", async () => {
  docRows = [{ url: "/uploads/a.pdf" }];
  mocks.transaction.mockImplementationOnce(async (callback) => {
    await callback(mocks);
    throw new Error("commit rejected");
  });
  await expect(deleteEvent(actor, eventId, { tripId })).rejects.toThrow("commit rejected");
  expect(mocks.storageDelete).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it("returns the stored result for a repeated key with no write, cleanup or effect", async () => {
  const payload = { tripId };
  stored = [{ result: deleteEnvelope(payload) }];
  docRows = [{ url: "/uploads/a.pdf" }];
  await expect(deleteEvent(actor, eventId, payload, deleteReplay)).resolves.toBeNull();
  expect(calls).not.toContain("delete-event");
  expect(mocks.storageDelete).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it("normalizes the event id on delete", async () => {
  await deleteEvent(actor, eventId.toUpperCase(), { tripId });
  expect(calls).toContain("delete-event");
});

it.each(["viewer", "stranger"])("denies a %s on delete before the transaction, lock or write", async () => {
  mocks.requireTripRole.mockRejectedValueOnce(new Error("denied"));
  await expect(deleteEvent(actor, eventId, { tripId })).rejects.toThrow("denied");
  expect(mocks.transaction).not.toHaveBeenCalled();
  expect(mocks.lockTripForUpdate).not.toHaveBeenCalled();
  expect(mocks.storageDelete).not.toHaveBeenCalled();
});

it("rechecks access inside the lock on delete", async () => {
  mocks.requireTripRole.mockResolvedValueOnce("editor").mockRejectedValueOnce(new Error("revoked"));
  await expect(deleteEvent(actor, eventId, { tripId })).rejects.toThrow("revoked");
  expect(calls).not.toContain("delete-event");
  expect(mocks.storageDelete).not.toHaveBeenCalled();
});

it.each([
  ["a linked id", `linked-${eventId}`, { tripId }],
  ["a non-UUID id", "bad", { tripId }],
  ["no trip", eventId, {}],
  ["an unknown key", eventId, { tripId, force: true }],
])("rejects %s on delete before touching the database", async (_name, id, body) => {
  await expect(deleteEvent(actor, id, body)).rejects.toThrow();
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.transaction).not.toHaveBeenCalled();
});
