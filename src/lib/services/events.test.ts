import { beforeEach, expect, it, vi } from "vitest";
import { events, idempotencyKeys } from "@/db/schema";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
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

import { updateEvent } from "./events";
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
        expect(table).toBe(events);
        return rows;
      },
    }),
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
  mocks.update.mockReturnValue({ set: setSpy });
  mocks.transaction.mockImplementation(async (callback) => callback(mocks));
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
  expect(calls).toEqual(["actor-key-lock", "trip-lock", "lookup", "update", "store"]);
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
