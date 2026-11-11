import { beforeEach, expect, it, vi } from "vitest";
import { days, idempotencyKeys, itineraryNotes } from "@/db/schema";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
  appendPosition: vi.fn(),
  shiftFromPosition: vi.fn(),
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

import { createDayNote, deleteDayNote, updateDayNote } from "./itinerary-notes";
import { TripNotFoundError } from "./trip-access";
import { ConflictError } from "./conflict-error";
import { fingerprintRequest } from "@/lib/api/idempotency";

const actor = { userId: "user" };
const noteId = "123e4567-e89b-12d3-a456-426614174000";
const tripId = "223e4567-e89b-12d3-a456-426614174000";
const dayId = "323e4567-e89b-12d3-a456-426614174000";
const otherTripId = "423e4567-e89b-12d3-a456-426614174000";
const noteRow = {
  id: noteId,
  dayId,
  position: 2,
  content: "Tickets",
  createdAt: null as Date | null,
  updatedAt: null as Date | null,
};
type Joined = { note: typeof noteRow; tripId: string };
const joined: Joined = { note: noteRow, tripId };

let noteRows: Joined[];
let noteReads: Joined[][];
let dayRows: { tripId: string }[];
let dayReads: { tripId: string }[][];
let inserted: Record<string, unknown>[];
let insertedRow: typeof noteRow;
let returned: (typeof noteRow)[];
let stored: { result: unknown }[];
let calls: string[];
let setSpy: ReturnType<typeof vi.fn>;

function envelope(method: string, path: string, payload: unknown, response: unknown) {
  return {
    version: 1,
    fingerprint: fingerprintRequest(method, path, payload),
    expiresAt: new Date(mocks.now.getTime() + 60_000).toISOString(),
    response,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  noteRows = [joined];
  noteReads = [];
  dayRows = [{ tripId }];
  dayReads = [];
  inserted = [];
  insertedRow = { ...noteRow, id: "923e4567-e89b-12d3-a456-426614174000", content: "Created", position: 4 };
  returned = [{ ...noteRow, content: "Updated" }];
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
        expect(table).toBe(days);
        return dayReads.length > 0 ? dayReads.shift()! : dayRows;
      },
      innerJoin: () => ({
        where: async () => {
          expect(table).toBe(itineraryNotes);
          return noteReads.length > 0 ? noteReads.shift()! : noteRows;
        },
      }),
    }),
  });
  mocks.execute.mockImplementation(async (statement: { queryChunks?: unknown[] }) => {
    const text = JSON.stringify(statement.queryChunks);
    if (text.includes("pg_advisory_xact_lock")) {
      calls.push(text.includes('"itinerary-note:') ? "id-lock" : "actor-key-lock");
    }
    return [];
  });
  mocks.lockTripForUpdate.mockImplementation(async () => {
    calls.push("trip-lock");
  });
  mocks.insert.mockImplementation((table: unknown) => ({
    values: (values: Record<string, unknown>) => {
      if (table === itineraryNotes) {
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
  mocks.delete.mockImplementation(() => ({
    where: async () => {
      calls.push("delete-note");
    },
  }));
  mocks.appendPosition.mockResolvedValue(4);
  mocks.shiftFromPosition.mockImplementation(async () => {
    calls.push("shift");
  });
  mocks.transaction.mockImplementation(async (callback) => {
    const result = await callback(mocks);
    calls.push("commit");
    return result;
  });
});

// ---- createDayNote ----

const createReplay = { key: "create-1", method: "POST", path: `/api/v1/days/${dayId}/notes` };
const storedNote = { ...noteRow, position: 9 };

it("appends when no position is given, with no shift", async () => {
  await expect(createDayNote(actor, dayId, { content: "Created" })).resolves.toMatchObject({
    id: insertedRow.id,
    content: "Created",
    tripDayId: dayId,
  });
  expect(mocks.appendPosition).toHaveBeenCalledWith(mocks, dayId);
  expect(mocks.shiftFromPosition).not.toHaveBeenCalled();
  expect(inserted).toEqual([{ dayId, content: "Created", position: 4, createdAt: mocks.now, updatedAt: mocks.now }]);
  expect(mocks.requireTripRole).toHaveBeenNthCalledWith(1, tripId, "user", "editor");
  expect(mocks.requireTripRole).toHaveBeenNthCalledWith(2, tripId, "user", "editor", mocks);
  expect(mocks.afterTripWrite).toHaveBeenCalledExactlyOnceWith(actor, tripId);
});

it("inserts at a position, shifting items at or above it before the write", async () => {
  await createDayNote(actor, dayId, { content: "Created", insertAtPosition: 1 });
  expect(mocks.shiftFromPosition).toHaveBeenCalledWith(mocks, dayId, 1);
  expect(mocks.appendPosition).not.toHaveBeenCalled();
  expect(inserted[0]).toMatchObject({ position: 1 });
  expect(calls.indexOf("shift")).toBeLessThan(calls.indexOf("insert"));
});

it("inserts at position 0", async () => {
  await createDayNote(actor, dayId, { content: "First", insertAtPosition: 0 });
  expect(mocks.shiftFromPosition).toHaveBeenCalledWith(mocks, dayId, 0);
  expect(inserted[0]).toMatchObject({ position: 0 });
});

it("stores the client id and leaves it to the database otherwise", async () => {
  noteReads = [[], []];
  await createDayNote(actor, dayId, { id: noteId, content: "Created" });
  expect(inserted[0]).toMatchObject({ id: noteId });
  await createDayNote(actor, dayId, { content: "Created" });
  expect(inserted[1]).not.toHaveProperty("id");
});

it("normalizes the day id before reading", async () => {
  await createDayNote(actor, dayId.toUpperCase(), { content: "Created" });
  expect(inserted[0]).toMatchObject({ dayId });
});

it("claims the client id, then the trip lock, then checks the day", async () => {
  noteReads = [[], []];
  await createDayNote(actor, dayId, { id: noteId, content: "Created" }, createReplay);
  expect(calls).toEqual(["actor-key-lock", "id-lock", "trip-lock", "lookup", "insert", "store", "commit"]);
});

it("takes no id lock without a client id", async () => {
  await createDayNote(actor, dayId, { content: "Created" });
  expect(calls).not.toContain("id-lock");
});

it("replays a stored row when the id, trip, day and content match, whatever its position now is", async () => {
  noteReads = [[{ note: storedNote, tripId }], [{ note: storedNote, tripId }]];
  await expect(
    createDayNote(actor, dayId, { id: noteId, content: "Tickets", insertAtPosition: 0 })
  ).resolves.toMatchObject({ id: noteId, position: 9 });
  expect(inserted).toEqual([]);
  expect(mocks.shiftFromPosition).not.toHaveBeenCalled();
  expect(mocks.appendPosition).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it.each([
  ["different content", { content: "Other" }, {}],
  ["another day", { content: "Tickets" }, { dayId: "623e4567-e89b-12d3-a456-426614174000" }],
])("rejects the id reused with %s as a conflict, writing nothing", async (_name, body, override) => {
  const existing = { note: { ...storedNote, ...override }, tripId };
  noteReads = [[existing], [existing]];
  await expect(createDayNote(actor, dayId, { id: noteId, ...body })).rejects.toBeInstanceOf(ConflictError);
  expect(inserted).toEqual([]);
  expect(mocks.shiftFromPosition).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it("needs viewer access to a trip that already holds the id, then reports the conflict", async () => {
  const foreign = { note: storedNote, tripId: otherTripId };
  noteReads = [[foreign], [foreign]];
  await expect(createDayNote(actor, dayId, { id: noteId, content: "Tickets" })).rejects.toBeInstanceOf(ConflictError);
  expect(mocks.requireTripRole).toHaveBeenCalledWith(otherTripId, "user", "viewer", mocks);
  expect(inserted).toEqual([]);
});

it("conceals an id held by a trip the actor cannot see", async () => {
  const foreign = { note: storedNote, tripId: otherTripId };
  noteReads = [[foreign], [foreign]];
  mocks.requireTripRole
    .mockResolvedValueOnce("editor")
    .mockResolvedValueOnce("editor")
    .mockRejectedValueOnce(new TripNotFoundError());
  await expect(createDayNote(actor, dayId, { id: noteId, content: "Tickets" })).rejects.toBeInstanceOf(
    TripNotFoundError
  );
  expect(inserted).toEqual([]);
});

it("reports a day removed between the pre-read and the trip lock as a conflict", async () => {
  dayReads = [[{ tripId }], []];
  await expect(createDayNote(actor, dayId, { content: "Created" })).rejects.toBeInstanceOf(ConflictError);
  expect(mocks.lockTripForUpdate).toHaveBeenCalled();
  expect(inserted).toEqual([]);
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it("reports a day that is already gone as not found, before any transaction", async () => {
  dayRows = [];
  await expect(createDayNote(actor, dayId, { content: "Created" })).rejects.toBeInstanceOf(TripNotFoundError);
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it.each(["viewer", "stranger"])("denies a %s on create before the transaction, lock or write", async () => {
  mocks.requireTripRole.mockRejectedValueOnce(new Error("denied"));
  await expect(createDayNote(actor, dayId, { content: "Created" })).rejects.toThrow("denied");
  expect(mocks.transaction).not.toHaveBeenCalled();
  expect(mocks.lockTripForUpdate).not.toHaveBeenCalled();
  expect(inserted).toEqual([]);
});

it("rechecks access inside the lock on create", async () => {
  mocks.requireTripRole.mockResolvedValueOnce("editor").mockRejectedValueOnce(new Error("revoked"));
  await expect(createDayNote(actor, dayId, { content: "Created" })).rejects.toThrow("revoked");
  expect(inserted).toEqual([]);
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it.each([
  ["a linked day id", `linked-${dayId}`, { content: "x" }],
  ["a non-UUID day id", "bad", { content: "x" }],
  ["over-long content", dayId, { content: "x".repeat(5001) }],
  ["a non-UUID note id", dayId, { id: "bad", content: "x" }],
  ["a linked note id", dayId, { id: `linked-${noteId}`, content: "x" }],
  ["an unknown key", dayId, { content: "x", position: 1 }],
  ["a negative position", dayId, { content: "x", insertAtPosition: -1 }],
])("rejects %s on create before touching the database", async (_name, day, body) => {
  await expect(createDayNote(actor, day, body)).rejects.toThrow();
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it("runs no effect when the commit rejects", async () => {
  mocks.transaction.mockImplementationOnce(async (callback) => {
    await callback(mocks);
    throw new Error("commit rejected");
  });
  await expect(createDayNote(actor, dayId, { content: "Created" })).rejects.toThrow("commit rejected");
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it("returns the stored response for a repeated key with no write or effect", async () => {
  const payload = { id: noteId, content: "Tickets" };
  stored = [{ result: envelope("POST", createReplay.path, payload, { id: noteId, content: "Cached" }) }];
  await expect(createDayNote(actor, dayId, payload, createReplay)).resolves.toEqual({ id: noteId, content: "Cached" });
  expect(inserted).toEqual([]);
  expect(mocks.shiftFromPosition).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it("rejects a key reused with another body", async () => {
  stored = [{ result: envelope("POST", createReplay.path, { content: "Tickets" }, { id: noteId }) }];
  await expect(createDayNote(actor, dayId, { content: "Other" }, createReplay)).rejects.toBeInstanceOf(ConflictError);
  expect(inserted).toEqual([]);
});

// ---- updateDayNote ----

const updateReplay = { key: "update-1", method: "PATCH", path: `/api/v1/itinerary-notes/${noteId}` };

it("changes the content with the server clock and publishes one effect", async () => {
  await expect(updateDayNote(actor, noteId, { content: "Updated" })).resolves.toMatchObject({
    id: noteId,
    content: "Updated",
    tripDayId: dayId,
  });
  expect(setSpy).toHaveBeenCalledExactlyOnceWith({ content: "Updated", updatedAt: mocks.now });
  expect(mocks.lockTripForUpdate).toHaveBeenCalledWith(mocks, tripId);
  expect(mocks.requireTripRole).toHaveBeenNthCalledWith(1, tripId, "user", "editor");
  expect(mocks.requireTripRole).toHaveBeenNthCalledWith(2, tripId, "user", "editor", mocks);
  expect(mocks.afterTripWrite).toHaveBeenCalledExactlyOnceWith(actor, tripId);
});

it("normalizes the note id before reading", async () => {
  await updateDayNote(actor, noteId.toUpperCase(), { content: "Updated" });
  expect(mocks.lockTripForUpdate).toHaveBeenCalledWith(mocks, tripId);
});

it("writes nothing and publishes no effect when the content is unchanged", async () => {
  await expect(updateDayNote(actor, noteId, { content: "Tickets" }, updateReplay)).resolves.toMatchObject({
    id: noteId,
    content: "Tickets",
  });
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it("accepts an empty content as a change", async () => {
  returned = [{ ...noteRow, content: "" }];
  await updateDayNote(actor, noteId, { content: "" });
  expect(setSpy).toHaveBeenCalledWith({ content: "", updatedAt: mocks.now });
});

it("conceals a missing note", async () => {
  noteRows = [];
  await expect(updateDayNote(actor, noteId, { content: "x" })).rejects.toBeInstanceOf(TripNotFoundError);
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it.each(["viewer", "stranger"])("denies a %s on update before the transaction, lock or write", async () => {
  mocks.requireTripRole.mockRejectedValueOnce(new Error("denied"));
  await expect(updateDayNote(actor, noteId, { content: "x" })).rejects.toThrow("denied");
  expect(mocks.transaction).not.toHaveBeenCalled();
  expect(mocks.lockTripForUpdate).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
});

it("rechecks access inside the lock on update", async () => {
  mocks.requireTripRole.mockResolvedValueOnce("editor").mockRejectedValueOnce(new Error("revoked"));
  await expect(updateDayNote(actor, noteId, { content: "x" })).rejects.toThrow("revoked");
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it("rejects a note deleted while waiting for the trip lock", async () => {
  mocks.lockTripForUpdate.mockImplementationOnce(async () => {
    noteRows = [];
  });
  await expect(updateDayNote(actor, noteId, { content: "x" })).rejects.toBeInstanceOf(TripNotFoundError);
  expect(mocks.update).not.toHaveBeenCalled();
});

it("rejects a note moved to another trip during the lock instead of writing it", async () => {
  mocks.lockTripForUpdate.mockImplementationOnce(async () => {
    noteRows = [{ note: noteRow, tripId: otherTripId }];
  });
  await expect(updateDayNote(actor, noteId, { content: "x" })).rejects.toBeInstanceOf(TripNotFoundError);
  expect(mocks.update).not.toHaveBeenCalled();
});

it("reports a note deleted before the mutate read as not found", async () => {
  noteReads = [[joined], [joined], []];
  await expect(updateDayNote(actor, noteId, { content: "x" })).rejects.toBeInstanceOf(TripNotFoundError);
  expect(mocks.update).not.toHaveBeenCalled();
});

it("reports a row that vanished between the read and the write as not found", async () => {
  returned = [];
  await expect(updateDayNote(actor, noteId, { content: "x" })).rejects.toBeInstanceOf(TripNotFoundError);
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it.each([
  ["a linked id", `linked-${noteId}`, { content: "x" }],
  ["a non-UUID id", "bad", { content: "x" }],
  ["no content", noteId, {}],
  ["over-long content", noteId, { content: "x".repeat(5001) }],
  ["an unknown key", noteId, { content: "x", position: 1 }],
])("rejects %s on update before touching the database", async (_name, id, body) => {
  await expect(updateDayNote(actor, id, body)).rejects.toThrow();
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it("keyed update locks the key, then the trip, looks up, writes and stores in one transaction", async () => {
  await updateDayNote(actor, noteId, { content: "Updated" }, updateReplay);
  expect(calls).toEqual(["actor-key-lock", "trip-lock", "lookup", "update", "store", "commit"]);
});

it("replays the stored update response with no write and no effect", async () => {
  stored = [
    { result: envelope("PATCH", updateReplay.path, { content: "Updated" }, { id: noteId, content: "Cached" }) },
  ];
  await expect(updateDayNote(actor, noteId, { content: "Updated" }, updateReplay)).resolves.toEqual({
    id: noteId,
    content: "Cached",
  });
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it("never replays a stored update once access is lost", async () => {
  stored = [{ result: envelope("PATCH", updateReplay.path, { content: "Updated" }, { id: noteId }) }];
  mocks.requireTripRole.mockResolvedValueOnce("editor").mockRejectedValueOnce(new Error("role removed"));
  await expect(updateDayNote(actor, noteId, { content: "Updated" }, updateReplay)).rejects.toThrow("role removed");
  expect(calls).not.toContain("lookup");
});

// ---- deleteDayNote ----

const deleteReplay = { key: "delete-1", method: "DELETE", path: `/api/v1/itinerary-notes/${noteId}` };

it("deletes the note and publishes one effect", async () => {
  await expect(deleteDayNote(actor, noteId, { tripId })).resolves.toBeNull();
  expect(calls).toEqual(["trip-lock", "delete-note", "commit"]);
  expect(mocks.requireTripRole).toHaveBeenNthCalledWith(1, tripId, "user", "editor");
  expect(mocks.requireTripRole).toHaveBeenNthCalledWith(2, tripId, "user", "editor", mocks);
  expect(mocks.afterTripWrite).toHaveBeenCalledExactlyOnceWith(actor, tripId);
});

it("normalizes the note id on delete", async () => {
  await deleteDayNote(actor, noteId.toUpperCase(), { tripId });
  expect(calls).toContain("delete-note");
});

it("succeeds for a row that is already gone, with no write or effect", async () => {
  noteRows = [];
  await expect(deleteDayNote(actor, noteId, { tripId }, deleteReplay)).resolves.toBeNull();
  expect(calls).not.toContain("delete-note");
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  expect(mocks.requireTripRole).toHaveBeenCalledTimes(2);
});

it("conceals a note that belongs to another trip", async () => {
  noteRows = [{ note: noteRow, tripId: otherTripId }];
  await expect(deleteDayNote(actor, noteId, { tripId })).rejects.toBeInstanceOf(TripNotFoundError);
  expect(calls).not.toContain("delete-note");
});

it("returns the stored result for a repeated key with no write or effect", async () => {
  const payload = { tripId };
  stored = [{ result: envelope("DELETE", deleteReplay.path, payload, null) }];
  await expect(deleteDayNote(actor, noteId, payload, deleteReplay)).resolves.toBeNull();
  expect(calls).not.toContain("delete-note");
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it.each(["viewer", "stranger"])("denies a %s on delete before the transaction, lock or write", async () => {
  mocks.requireTripRole.mockRejectedValueOnce(new Error("denied"));
  await expect(deleteDayNote(actor, noteId, { tripId })).rejects.toThrow("denied");
  expect(mocks.transaction).not.toHaveBeenCalled();
  expect(mocks.lockTripForUpdate).not.toHaveBeenCalled();
});

it("rechecks access inside the lock on delete", async () => {
  mocks.requireTripRole.mockResolvedValueOnce("editor").mockRejectedValueOnce(new Error("revoked"));
  await expect(deleteDayNote(actor, noteId, { tripId })).rejects.toThrow("revoked");
  expect(calls).not.toContain("delete-note");
});

it("runs no effect when the delete commit rejects", async () => {
  mocks.transaction.mockImplementationOnce(async (callback) => {
    await callback(mocks);
    throw new Error("commit rejected");
  });
  await expect(deleteDayNote(actor, noteId, { tripId })).rejects.toThrow("commit rejected");
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it.each([
  ["a linked id", `linked-${noteId}`, { tripId }],
  ["a non-UUID id", "bad", { tripId }],
  ["no trip", noteId, {}],
  ["an unknown key", noteId, { tripId, force: true }],
])("rejects %s on delete before touching the database", async (_name, id, body) => {
  await expect(deleteDayNote(actor, id, body)).rejects.toThrow();
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.transaction).not.toHaveBeenCalled();
});
