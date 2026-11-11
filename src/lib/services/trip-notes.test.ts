import { beforeEach, expect, it, vi } from "vitest";
import { idempotencyKeys, notes } from "@/db/schema";

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

import { createTripNote, deleteTripNote, reorderTripNotes, updateTripNote } from "./trip-notes";
import { TripNotFoundError } from "./trip-access";
import { ConflictError } from "./conflict-error";
import { fingerprintRequest } from "@/lib/api/idempotency";

const actor = { userId: "user" };
const noteId = "123e4567-e89b-12d3-a456-426614174000";
const secondId = "133e4567-e89b-12d3-a456-426614174000";
const thirdId = "143e4567-e89b-12d3-a456-426614174000";
const tripId = "223e4567-e89b-12d3-a456-426614174000";
const otherTripId = "423e4567-e89b-12d3-a456-426614174000";
type NoteRow = {
  id: string;
  tripId: string;
  position: number;
  title: string | null;
  body: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};
const noteRow: NoteRow = {
  id: noteId,
  tripId,
  position: 2,
  title: "Packing",
  body: "Sunscreen",
  createdAt: null,
  updatedAt: null,
};

let noteRows: NoteRow[];
let noteReads: NoteRow[][];
let tripNoteRows: { id: string; position: number }[];
let inserted: Record<string, unknown>[];
let insertedRow: NoteRow;
let returned: NoteRow[];
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
  noteRows = [noteRow];
  noteReads = [];
  tripNoteRows = [];
  inserted = [];
  insertedRow = { ...noteRow, id: "923e4567-e89b-12d3-a456-426614174000", position: 0, title: "Created", body: null };
  returned = [{ ...noteRow, title: "Updated" }];
  stored = [];
  calls = [];
  setSpy = vi.fn((values: Record<string, unknown>) => ({
    where: () => {
      const pending = {
        returning: async () => {
          calls.push("update");
          return returned;
        },
        then: (resolve: (value: unknown) => void) => {
          if (typeof values.position === "number") {
            calls.push("position-write");
          } else {
            calls.push("shift");
          }
          resolve(undefined);
        },
      };
      return pending;
    },
  }));
  mocks.select.mockImplementation((fields?: Record<string, unknown>) => ({
    from: (table: unknown) => ({
      where: async () => {
        if (table === idempotencyKeys) {
          calls.push("lookup");
          return stored;
        }
        expect(table).toBe(notes);
        if (fields && "position" in fields && !("title" in fields)) return tripNoteRows;
        return noteReads.length > 0 ? noteReads.shift()! : noteRows;
      },
    }),
  }));
  mocks.execute.mockImplementation(async (statement: { queryChunks?: unknown[] }) => {
    const text = JSON.stringify(statement.queryChunks);
    if (text.includes("pg_advisory_xact_lock")) {
      calls.push(text.includes('"trip-note:') ? "id-lock" : "actor-key-lock");
    }
    return [];
  });
  mocks.lockTripForUpdate.mockImplementation(async () => {
    calls.push("trip-lock");
  });
  mocks.insert.mockImplementation((table: unknown) => ({
    values: (values: Record<string, unknown>) => {
      if (table === notes) {
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
  mocks.transaction.mockImplementation(async (callback) => {
    const result = await callback(mocks);
    calls.push("commit");
    return result;
  });
});

// ---- createTripNote ----

const createReplay = { key: "create-1", method: "POST", path: `/api/v1/trips/${tripId}/notes` };
const storedNote = { ...noteRow, position: 9 };

it("prepends: shifts every trip note down, then inserts at position 0 and publishes one effect", async () => {
  await expect(createTripNote(actor, tripId, { title: "Created" })).resolves.toMatchObject({
    id: insertedRow.id,
    tripId,
    title: "Created",
    position: 0,
  });
  expect(calls.indexOf("shift")).toBeGreaterThanOrEqual(0);
  expect(calls.indexOf("shift")).toBeLessThan(calls.indexOf("insert"));
  expect(inserted).toEqual([
    { tripId, position: 0, title: "Created", body: null, createdAt: mocks.now, updatedAt: mocks.now },
  ]);
  expect(mocks.requireTripRole).toHaveBeenNthCalledWith(1, tripId, "user", "editor");
  expect(mocks.requireTripRole).toHaveBeenNthCalledWith(2, tripId, "user", "editor", mocks);
  expect(mocks.afterTripWrite).toHaveBeenCalledExactlyOnceWith(actor, tripId);
});

it("trims title and body and stores a blank one as null", async () => {
  await createTripNote(actor, tripId, { title: "  Packing  ", body: "   " });
  expect(inserted[0]).toMatchObject({ title: "Packing", body: null });
  await createTripNote(actor, tripId, { title: "", body: " Sunscreen " });
  expect(inserted[1]).toMatchObject({ title: null, body: "Sunscreen" });
});

it("stores the client id and leaves it to the database otherwise", async () => {
  noteReads = [[], []];
  await createTripNote(actor, tripId, { id: noteId, title: "Created" });
  expect(inserted[0]).toMatchObject({ id: noteId });
  await createTripNote(actor, tripId, { title: "Created" });
  expect(inserted[1]).not.toHaveProperty("id");
});

it("normalizes the trip id before reading", async () => {
  await createTripNote(actor, tripId.toUpperCase(), { title: "Created" });
  expect(inserted[0]).toMatchObject({ tripId });
});

it("claims the client id, then the trip lock, then looks the key up", async () => {
  noteReads = [[], []];
  await createTripNote(actor, tripId, { id: noteId, title: "Created" }, createReplay);
  expect(calls).toEqual(["actor-key-lock", "id-lock", "trip-lock", "lookup", "shift", "insert", "store", "commit"]);
});

it("takes no id lock without a client id", async () => {
  await createTripNote(actor, tripId, { title: "Created" });
  expect(calls).not.toContain("id-lock");
});

it("replays the stored row when id, trip, title and body match, whatever its position now is", async () => {
  noteReads = [[storedNote], [storedNote]];
  await expect(
    createTripNote(actor, tripId, { id: noteId, title: " Packing ", body: "Sunscreen" })
  ).resolves.toMatchObject({ id: noteId, position: 9 });
  expect(inserted).toEqual([]);
  expect(calls).not.toContain("shift");
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it("replays a row whose blank field was stored as null", async () => {
  const existing = { ...storedNote, body: null };
  noteReads = [[existing], [existing]];
  await expect(createTripNote(actor, tripId, { id: noteId, title: "Packing", body: "  " })).resolves.toMatchObject({
    id: noteId,
  });
  expect(inserted).toEqual([]);
});

it.each([
  ["a different title", { title: "Other", body: "Sunscreen" }, {}],
  ["a different body", { title: "Packing", body: "Hat" }, {}],
  ["a body where there was none", { title: "Packing", body: "Hat" }, { body: null }],
  ["another trip", { title: "Packing", body: "Sunscreen" }, { tripId: otherTripId }],
])("rejects the id reused with %s as a conflict, writing nothing", async (_name, body, override) => {
  const existing = { ...storedNote, ...override };
  noteReads = [[existing], [existing]];
  await expect(createTripNote(actor, tripId, { id: noteId, ...body })).rejects.toBeInstanceOf(ConflictError);
  expect(inserted).toEqual([]);
  expect(calls).not.toContain("shift");
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it("needs viewer access to a trip that already holds the id, then reports the conflict", async () => {
  const foreign = { ...storedNote, tripId: otherTripId };
  noteReads = [[foreign], [foreign]];
  await expect(createTripNote(actor, tripId, { id: noteId, title: "Packing" })).rejects.toBeInstanceOf(ConflictError);
  expect(mocks.requireTripRole).toHaveBeenCalledWith(otherTripId, "user", "viewer", mocks);
  expect(inserted).toEqual([]);
});

it("conceals an id held by a trip the actor cannot see", async () => {
  const foreign = { ...storedNote, tripId: otherTripId };
  noteReads = [[foreign], [foreign]];
  mocks.requireTripRole
    .mockResolvedValueOnce("editor")
    .mockResolvedValueOnce("editor")
    .mockRejectedValueOnce(new TripNotFoundError());
  await expect(createTripNote(actor, tripId, { id: noteId, title: "Packing" })).rejects.toBeInstanceOf(
    TripNotFoundError
  );
  expect(inserted).toEqual([]);
});

it.each(["viewer", "stranger"])("denies a %s on create before the transaction, lock or write", async () => {
  mocks.requireTripRole.mockRejectedValueOnce(new Error("denied"));
  await expect(createTripNote(actor, tripId, { title: "Created" })).rejects.toThrow("denied");
  expect(mocks.transaction).not.toHaveBeenCalled();
  expect(mocks.lockTripForUpdate).not.toHaveBeenCalled();
  expect(inserted).toEqual([]);
});

it("rechecks access inside the lock on create", async () => {
  mocks.requireTripRole.mockResolvedValueOnce("editor").mockRejectedValueOnce(new Error("revoked"));
  await expect(createTripNote(actor, tripId, { title: "Created" })).rejects.toThrow("revoked");
  expect(inserted).toEqual([]);
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it.each([
  ["a linked trip id", `linked-${tripId}`, { title: "x" }],
  ["a non-UUID trip id", "bad", { title: "x" }],
  ["no text at all", tripId, {}],
  ["only whitespace", tripId, { title: " ", body: "\n" }],
  ["an over-long title", tripId, { title: "x".repeat(201) }],
  ["an over-long body", tripId, { body: "x".repeat(10001) }],
  ["a non-UUID note id", tripId, { id: "bad", title: "x" }],
  ["an unknown key", tripId, { title: "x", position: 1 }],
])("rejects %s on create before touching the database", async (_name, trip, body) => {
  await expect(createTripNote(actor, trip, body)).rejects.toThrow();
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it("runs no effect when the create commit rejects", async () => {
  mocks.transaction.mockImplementationOnce(async (callback) => {
    await callback(mocks);
    throw new Error("commit rejected");
  });
  await expect(createTripNote(actor, tripId, { title: "Created" })).rejects.toThrow("commit rejected");
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it("returns the stored response for a repeated key with no write or effect", async () => {
  const payload = { id: noteId, title: "Packing" };
  stored = [{ result: envelope("POST", createReplay.path, payload, { id: noteId, title: "Cached" }) }];
  await expect(createTripNote(actor, tripId, payload, createReplay)).resolves.toEqual({ id: noteId, title: "Cached" });
  expect(inserted).toEqual([]);
  expect(calls).not.toContain("shift");
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it("rejects a key reused with another body", async () => {
  stored = [{ result: envelope("POST", createReplay.path, { title: "Packing" }, { id: noteId }) }];
  await expect(createTripNote(actor, tripId, { title: "Other" }, createReplay)).rejects.toBeInstanceOf(ConflictError);
  expect(inserted).toEqual([]);
});

// ---- updateTripNote ----

const updateReplay = { key: "update-1", method: "PATCH", path: `/api/v1/notes/${noteId}` };

it("changes the sent field with the server clock, keeps the other and publishes one effect", async () => {
  await expect(updateTripNote(actor, noteId, { title: "Updated" })).resolves.toMatchObject({
    id: noteId,
    tripId,
    title: "Updated",
  });
  expect(setSpy).toHaveBeenCalledExactlyOnceWith({ title: "Updated", body: "Sunscreen", updatedAt: mocks.now });
  expect(mocks.lockTripForUpdate).toHaveBeenCalledWith(mocks, tripId);
  expect(mocks.requireTripRole).toHaveBeenNthCalledWith(1, tripId, "user", "editor");
  expect(mocks.requireTripRole).toHaveBeenNthCalledWith(2, tripId, "user", "editor", mocks);
  expect(mocks.afterTripWrite).toHaveBeenCalledExactlyOnceWith(actor, tripId);
});

it("trims the sent field", async () => {
  await updateTripNote(actor, noteId, { body: "  Hat  " });
  expect(setSpy).toHaveBeenCalledWith({ title: "Packing", body: "Hat", updatedAt: mocks.now });
});

it.each([
  ["a null body", { body: null }],
  ["a blank body", { body: "   " }],
])("clears a field with %s while the other remains", async (_name, patch) => {
  returned = [{ ...noteRow, body: null }];
  await expect(updateTripNote(actor, noteId, patch)).resolves.toMatchObject({ title: "Packing" });
  expect(setSpy).toHaveBeenCalledWith({ title: "Packing", body: null, updatedAt: mocks.now });
});

it("rejects an edit that would leave the note blank as a validation error, writing nothing", async () => {
  noteRows = [{ ...noteRow, body: null }];
  await expect(updateTripNote(actor, noteId, { title: null })).rejects.toThrow("A note needs a title or a body.");
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it("can set the only remaining field while clearing the other", async () => {
  noteRows = [{ ...noteRow, body: null }];
  returned = [{ ...noteRow, title: null, body: "Hat" }];
  await updateTripNote(actor, noteId, { title: "", body: "Hat" });
  expect(setSpy).toHaveBeenCalledWith({ title: null, body: "Hat", updatedAt: mocks.now });
});

it("writes nothing and publishes no effect when the edit changes nothing", async () => {
  await expect(updateTripNote(actor, noteId, { title: " Packing ", body: "Sunscreen" })).resolves.toMatchObject({
    id: noteId,
    title: "Packing",
    body: "Sunscreen",
  });
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it("treats clearing an already-empty field as no change", async () => {
  noteRows = [{ ...noteRow, body: null }];
  await updateTripNote(actor, noteId, { body: null });
  expect(mocks.update).not.toHaveBeenCalled();
});

it("normalizes the note id before reading", async () => {
  await updateTripNote(actor, noteId.toUpperCase(), { title: "Updated" });
  expect(mocks.lockTripForUpdate).toHaveBeenCalledWith(mocks, tripId);
});

it("conceals a missing note before any transaction", async () => {
  noteRows = [];
  await expect(updateTripNote(actor, noteId, { title: "x" })).rejects.toBeInstanceOf(TripNotFoundError);
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it.each(["viewer", "stranger"])("denies a %s on update before the transaction, lock or write", async () => {
  mocks.requireTripRole.mockRejectedValueOnce(new Error("denied"));
  await expect(updateTripNote(actor, noteId, { title: "x" })).rejects.toThrow("denied");
  expect(mocks.transaction).not.toHaveBeenCalled();
  expect(mocks.lockTripForUpdate).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
});

it("rechecks access inside the lock on update", async () => {
  mocks.requireTripRole.mockResolvedValueOnce("editor").mockRejectedValueOnce(new Error("revoked"));
  await expect(updateTripNote(actor, noteId, { title: "x" })).rejects.toThrow("revoked");
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it("rejects a note deleted while waiting for the trip lock", async () => {
  mocks.lockTripForUpdate.mockImplementationOnce(async () => {
    noteRows = [];
  });
  await expect(updateTripNote(actor, noteId, { title: "x" })).rejects.toBeInstanceOf(TripNotFoundError);
  expect(mocks.update).not.toHaveBeenCalled();
});

it("rejects a note moved to another trip during the lock instead of writing it", async () => {
  mocks.lockTripForUpdate.mockImplementationOnce(async () => {
    noteRows = [{ ...noteRow, tripId: otherTripId }];
  });
  await expect(updateTripNote(actor, noteId, { title: "x" })).rejects.toBeInstanceOf(TripNotFoundError);
  expect(mocks.update).not.toHaveBeenCalled();
});

it("reports a note deleted before the mutate read as not found", async () => {
  noteReads = [[noteRow], [noteRow], []];
  await expect(updateTripNote(actor, noteId, { title: "x" })).rejects.toBeInstanceOf(TripNotFoundError);
  expect(mocks.update).not.toHaveBeenCalled();
});

it("reports a row that vanished between the read and the write as not found", async () => {
  returned = [];
  await expect(updateTripNote(actor, noteId, { title: "x" })).rejects.toBeInstanceOf(TripNotFoundError);
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it.each([
  ["a linked id", `linked-${noteId}`, { title: "x" }],
  ["a non-UUID id", "bad", { title: "x" }],
  ["no field", noteId, {}],
  ["an over-long title", noteId, { title: "x".repeat(201) }],
  ["an unknown key", noteId, { title: "x", position: 1 }],
])("rejects %s on update before touching the database", async (_name, id, body) => {
  await expect(updateTripNote(actor, id, body)).rejects.toThrow();
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it("keyed update locks the key, then the trip, looks up, writes and stores in one transaction", async () => {
  await updateTripNote(actor, noteId, { title: "Updated" }, updateReplay);
  expect(calls).toEqual(["actor-key-lock", "trip-lock", "lookup", "update", "store", "commit"]);
});

it("replays the stored update response with no write and no effect", async () => {
  stored = [{ result: envelope("PATCH", updateReplay.path, { title: "Updated" }, { id: noteId, title: "Cached" }) }];
  await expect(updateTripNote(actor, noteId, { title: "Updated" }, updateReplay)).resolves.toEqual({
    id: noteId,
    title: "Cached",
  });
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it("never replays a stored update once access is lost", async () => {
  stored = [{ result: envelope("PATCH", updateReplay.path, { title: "Updated" }, { id: noteId }) }];
  mocks.requireTripRole.mockResolvedValueOnce("editor").mockRejectedValueOnce(new Error("role removed"));
  await expect(updateTripNote(actor, noteId, { title: "Updated" }, updateReplay)).rejects.toThrow("role removed");
  expect(calls).not.toContain("lookup");
});

// ---- deleteTripNote ----

const deleteReplay = { key: "delete-1", method: "DELETE", path: `/api/v1/notes/${noteId}` };

it("deletes the note and publishes one effect", async () => {
  await expect(deleteTripNote(actor, noteId, { tripId })).resolves.toBeNull();
  expect(calls).toEqual(["trip-lock", "delete-note", "commit"]);
  expect(mocks.requireTripRole).toHaveBeenNthCalledWith(1, tripId, "user", "editor");
  expect(mocks.requireTripRole).toHaveBeenNthCalledWith(2, tripId, "user", "editor", mocks);
  expect(mocks.afterTripWrite).toHaveBeenCalledExactlyOnceWith(actor, tripId);
});

it("normalizes the note id on delete", async () => {
  await deleteTripNote(actor, noteId.toUpperCase(), { tripId });
  expect(calls).toContain("delete-note");
});

it("succeeds for a row that is already gone, with no write or effect", async () => {
  noteRows = [];
  await expect(deleteTripNote(actor, noteId, { tripId }, deleteReplay)).resolves.toBeNull();
  expect(calls).not.toContain("delete-note");
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  expect(mocks.requireTripRole).toHaveBeenCalledTimes(2);
});

it("conceals a note that belongs to another trip", async () => {
  noteRows = [{ ...noteRow, tripId: otherTripId }];
  await expect(deleteTripNote(actor, noteId, { tripId })).rejects.toBeInstanceOf(TripNotFoundError);
  expect(calls).not.toContain("delete-note");
});

it("returns the stored result for a repeated key with no write or effect", async () => {
  const payload = { tripId };
  stored = [{ result: envelope("DELETE", deleteReplay.path, payload, null) }];
  await expect(deleteTripNote(actor, noteId, payload, deleteReplay)).resolves.toBeNull();
  expect(calls).not.toContain("delete-note");
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it.each(["viewer", "stranger"])("denies a %s on delete before the transaction, lock or write", async () => {
  mocks.requireTripRole.mockRejectedValueOnce(new Error("denied"));
  await expect(deleteTripNote(actor, noteId, { tripId })).rejects.toThrow("denied");
  expect(mocks.transaction).not.toHaveBeenCalled();
  expect(mocks.lockTripForUpdate).not.toHaveBeenCalled();
});

it("rechecks access inside the lock on delete", async () => {
  mocks.requireTripRole.mockResolvedValueOnce("editor").mockRejectedValueOnce(new Error("revoked"));
  await expect(deleteTripNote(actor, noteId, { tripId })).rejects.toThrow("revoked");
  expect(calls).not.toContain("delete-note");
});

it("runs no effect when the delete commit rejects", async () => {
  mocks.transaction.mockImplementationOnce(async (callback) => {
    await callback(mocks);
    throw new Error("commit rejected");
  });
  await expect(deleteTripNote(actor, noteId, { tripId })).rejects.toThrow("commit rejected");
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it.each([
  ["a linked id", `linked-${noteId}`, { tripId }],
  ["a non-UUID id", "bad", { tripId }],
  ["no trip", noteId, {}],
  ["an unknown key", noteId, { tripId, force: true }],
])("rejects %s on delete before touching the database", async (_name, id, body) => {
  await expect(deleteTripNote(actor, id, body)).rejects.toThrow();
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.transaction).not.toHaveBeenCalled();
});

// ---- reorderTripNotes ----

const reorderReplay = { key: "order-1", method: "PUT", path: `/api/v1/trips/${tripId}/notes/order` };

it("writes the new positions 0..n-1 for the notes that moved and publishes one effect", async () => {
  tripNoteRows = [
    { id: noteId, position: 0 },
    { id: secondId, position: 1 },
    { id: thirdId, position: 2 },
  ];
  await expect(reorderTripNotes(actor, tripId, { noteIds: [thirdId, noteId, secondId] })).resolves.toEqual({
    tripId,
    noteIds: [thirdId, noteId, secondId],
  });
  expect(setSpy.mock.calls.map(([values]) => values)).toEqual([{ position: 0 }, { position: 1 }, { position: 2 }]);
  expect(mocks.lockTripForUpdate).toHaveBeenCalledWith(mocks, tripId);
  expect(mocks.requireTripRole).toHaveBeenNthCalledWith(1, tripId, "user", "editor");
  expect(mocks.requireTripRole).toHaveBeenNthCalledWith(2, tripId, "user", "editor", mocks);
  expect(mocks.afterTripWrite).toHaveBeenCalledExactlyOnceWith(actor, tripId);
});

it("skips notes already in place and writes nothing for an unchanged order", async () => {
  tripNoteRows = [
    { id: noteId, position: 0 },
    { id: secondId, position: 1 },
  ];
  await expect(reorderTripNotes(actor, tripId, { noteIds: [noteId, secondId] })).resolves.toEqual({
    tripId,
    noteIds: [noteId, secondId],
  });
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it("repairs stored positions that are not 0..n-1 even when the relative order is unchanged", async () => {
  tripNoteRows = [
    { id: noteId, position: 4 },
    { id: secondId, position: 7 },
  ];
  await reorderTripNotes(actor, tripId, { noteIds: [noteId, secondId] });
  expect(setSpy.mock.calls.map(([values]) => values)).toEqual([{ position: 0 }, { position: 1 }]);
  expect(mocks.afterTripWrite).toHaveBeenCalledOnce();
});

it("accepts an empty list for a trip with no notes, writing nothing", async () => {
  await expect(reorderTripNotes(actor, tripId, { noteIds: [] })).resolves.toEqual({ tripId, noteIds: [] });
  expect(mocks.update).not.toHaveBeenCalled();
});

it.each([
  ["a note added since load", [noteId]],
  ["a note deleted since load", [noteId, secondId, thirdId]],
  ["a foreign note", [noteId, thirdId]],
])("rejects a stale list with %s as a conflict, writing nothing", async (_name, noteIds) => {
  tripNoteRows = [
    { id: noteId, position: 0 },
    { id: secondId, position: 1 },
  ];
  await expect(reorderTripNotes(actor, tripId, { noteIds })).rejects.toBeInstanceOf(ConflictError);
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it("normalizes the trip id on reorder", async () => {
  await reorderTripNotes(actor, tripId.toUpperCase(), { noteIds: [] });
  expect(mocks.lockTripForUpdate).toHaveBeenCalledWith(mocks, tripId);
});

it.each(["viewer", "stranger"])("denies a %s on reorder before the transaction, lock or write", async () => {
  mocks.requireTripRole.mockRejectedValueOnce(new Error("denied"));
  await expect(reorderTripNotes(actor, tripId, { noteIds: [] })).rejects.toThrow("denied");
  expect(mocks.transaction).not.toHaveBeenCalled();
  expect(mocks.lockTripForUpdate).not.toHaveBeenCalled();
});

it("rechecks access inside the lock on reorder", async () => {
  mocks.requireTripRole.mockResolvedValueOnce("editor").mockRejectedValueOnce(new Error("revoked"));
  await expect(reorderTripNotes(actor, tripId, { noteIds: [] })).rejects.toThrow("revoked");
  expect(mocks.update).not.toHaveBeenCalled();
});

it.each([
  ["a linked trip id", `linked-${tripId}`, { noteIds: [] }],
  ["a non-UUID trip id", "bad", { noteIds: [] }],
  ["a duplicated id", tripId, { noteIds: [noteId, noteId] }],
  ["a non-UUID id", tripId, { noteIds: ["bad"] }],
  ["no list", tripId, {}],
  ["an unknown key", tripId, { noteIds: [], extra: 1 }],
])("rejects %s on reorder before touching the database", async (_name, trip, body) => {
  await expect(reorderTripNotes(actor, trip, body)).rejects.toThrow();
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it("returns the stored order for a repeated key with no write or effect", async () => {
  const payload = { noteIds: [noteId] };
  stored = [{ result: envelope("PUT", reorderReplay.path, payload, { tripId, noteIds: [noteId] }) }];
  await expect(reorderTripNotes(actor, tripId, payload, reorderReplay)).resolves.toEqual({
    tripId,
    noteIds: [noteId],
  });
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it("runs no effect when the reorder commit rejects", async () => {
  tripNoteRows = [
    { id: noteId, position: 1 },
    { id: secondId, position: 0 },
  ];
  mocks.transaction.mockImplementationOnce(async (callback) => {
    await callback(mocks);
    throw new Error("commit rejected");
  });
  await expect(reorderTripNotes(actor, tripId, { noteIds: [noteId, secondId] })).rejects.toThrow("commit rejected");
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});
