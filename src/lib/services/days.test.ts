import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  days,
  documents,
  events,
  idempotencyKeys,
  itineraryChecklists,
  itineraryNotes,
  pendingFileDeletions,
  trips,
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
  applyDayOrder: vi.fn(),
  storageDelete: vi.fn(),
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
vi.mock("./timeline-positions", () => ({ applyDayOrder: mocks.applyDayOrder }));
vi.mock("@/lib/storage/storage-adapter", () => ({ getStorageAdapter: () => ({ del: mocks.storageDelete }) }));
import { ConflictError } from "./conflict-error";
import { ConfirmationRequiredError } from "./confirmation-required-error";
import { ValidationFailedError } from "./validation-failed-error";
import { TripNotFoundError } from "./trip-access";
import { fingerprintRequest } from "@/lib/api/idempotency";
import { addDay, deleteDay, reorderDay, updateDay } from "./days";

const actor = { userId: "user" };
const dayId = "123e4567-e89b-12d3-a456-426614174000";
const tripId = "523e4567-e89b-12d3-a456-426614174000";
const otherTripId = "623e4567-e89b-12d3-a456-426614174000";
const clientId = "723e4567-e89b-12d3-a456-426614174000";
const body = {
  items: [
    { type: "checklist", id: "223e4567-e89b-12d3-a456-426614174000" },
    { type: "event", id: "323e4567-e89b-12d3-a456-426614174000" },
    { type: "note", id: "423e4567-e89b-12d3-a456-426614174000" },
  ],
};
const replay = { key: "retry-1", method: "PUT", path: `/api/v1/days/${dayId}/order` };
interface DayRow {
  id: string;
  tripId: string;
  dayNumber: number;
  date: string | null;
  label: string;
  subtitle: string | null;
  weather: string | null;
  travelSummary: string | null;
}
function dayRow(dayNumber: number, overrides: Partial<DayRow> = {}): DayRow {
  return {
    id: dayNumber === 3 ? dayId : `00000000-0000-4000-8000-00000000000${dayNumber}`,
    tripId,
    dayNumber,
    date: `2026-05-0${dayNumber}`,
    label: `Day ${dayNumber}`,
    subtitle: null,
    weather: null,
    travelSummary: null,
    ...overrides,
  };
}
let dayRows: Partial<DayRow>[];
let dayReads: Partial<DayRow>[][];
let allDays: DayRow[];
let tripRows: { startDate: string | null }[];
let eventRows: { id: string }[];
let noteRows: { id: string }[];
let checklistRows: { id: string }[];
let docRows: { url: string | null }[];
let returnedDay: DayRow[];
let insertedDays: Record<string, unknown>[];
let sets: { table: unknown; values: Record<string, unknown> }[];
let stored: { result: unknown }[];
let calls: string[];
beforeEach(() => {
  vi.clearAllMocks();
  dayRows = [dayRow(3)];
  dayReads = [];
  allDays = [dayRow(1), dayRow(2), dayRow(3)];
  tripRows = [{ startDate: "2026-05-01" }];
  eventRows = [];
  noteRows = [];
  checklistRows = [];
  docRows = [];
  returnedDay = [dayRow(3, { label: "Updated" })];
  insertedDays = [];
  sets = [];
  stored = [];
  calls = [];
  function rowsFor(table: unknown) {
    if (table === idempotencyKeys) {
      calls.push("lookup");
      return stored;
    }
    if (table === days) return dayReads.length > 0 ? dayReads.shift()! : dayRows;
    if (table === trips) return tripRows;
    if (table === events) return eventRows;
    if (table === documents) return docRows;
    if (table === itineraryNotes) return noteRows;
    expect(table).toBe(itineraryChecklists);
    return checklistRows;
  }
  mocks.select.mockReturnValue({
    from: (table: unknown) => ({
      where: () => ({
        // Lazy: a read that is never awaited must not consume a queued result.
        then: (resolve: (value: unknown) => void, reject: (reason: unknown) => void) =>
          Promise.resolve(rowsFor(table)).then(resolve, reject),
        orderBy: async () => allDays,
      }),
    }),
  });
  mocks.execute.mockImplementation(async (statement: { queryChunks?: unknown[] }) => {
    const text = JSON.stringify(statement.queryChunks);
    if (text.includes("pg_advisory_xact_lock")) calls.push(text.includes('"day:') ? "id-lock" : "actor-key-lock");
    return [];
  });
  mocks.lockTripForUpdate.mockImplementation(async () => {
    calls.push("trip-lock");
  });
  mocks.insert.mockImplementation((table: unknown) => ({
    values: (values: Record<string, unknown>) => {
      if (table === pendingFileDeletions) {
        return {
          returning: async () => {
            calls.push("queue");
            return (values as unknown as { url: string }[]).map((row, index) => ({ id: `q${index}`, url: row.url }));
          },
        };
      }
      if (table === days) {
        insertedDays.push(values);
        return {
          returning: async () => {
            calls.push("insert");
            return [
              dayRow(values.dayNumber as number, {
                id: (values.id as string | undefined) ?? "created-day",
                date: values.date as string | null,
              }),
            ];
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
  mocks.update.mockImplementation((table: unknown) => ({
    set: (values: Record<string, unknown>) => {
      sets.push({ table, values });
      return {
        where: () =>
          Object.assign(Promise.resolve(), {
            returning: async () => {
              calls.push("update-day");
              return returnedDay;
            },
          }),
      };
    },
  }));
  mocks.delete.mockImplementation((table: unknown) => ({
    where: async () => {
      calls.push(table === days ? "delete-day" : table === pendingFileDeletions ? "clear" : "delete-other");
    },
  }));
  mocks.storageDelete.mockImplementation(async () => {
    calls.push("cleanup");
  });
  mocks.applyDayOrder.mockResolvedValue(true);
  mocks.transaction.mockImplementation(async (callback) => {
    const result = await callback(mocks);
    calls.push("commit");
    return result;
  });
});

describe("reorderDay", () => {
  it("reorders a mixed day under the trip lock and runs the effect once", async () => {
    await expect(reorderDay(actor, dayId, body)).resolves.toEqual({ dayId, items: body.items });
    expect(mocks.requireTripRole).toHaveBeenNthCalledWith(1, tripId, "user", "editor");
    expect(mocks.lockTripForUpdate).toHaveBeenCalledWith(mocks, tripId);
    expect(mocks.requireTripRole).toHaveBeenNthCalledWith(2, tripId, "user", "editor", mocks);
    expect(mocks.applyDayOrder).toHaveBeenCalledWith(mocks, dayId, body.items);
    expect(mocks.afterTripWrite).toHaveBeenCalledExactlyOnceWith(actor, tripId);
  });

  it("normalizes the day id and body before any DB access", async () => {
    await reorderDay(actor, dayId.toUpperCase(), {
      items: [{ type: "event", id: "323E4567-E89B-12D3-A456-426614174000" }],
    });
    expect(mocks.applyDayOrder).toHaveBeenCalledWith(mocks, dayId, [
      { type: "event", id: "323e4567-e89b-12d3-a456-426614174000" },
    ]);
  });

  it.each([
    ["a malformed day id", "bad", body],
    ["a duplicate key", dayId, { items: [body.items[0], body.items[0]] }],
    ["an unknown field", dayId, { items: [], extra: true }],
  ])("rejects %s before DB access", async (_label, id, input) => {
    await expect(reorderDay(actor, id, input)).rejects.toThrow();
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("reports an unchanged list as a success with no activity or live-sync effect", async () => {
    mocks.applyDayOrder.mockResolvedValue(false);
    await expect(reorderDay(actor, dayId, body)).resolves.toEqual({ dayId, items: body.items });
    expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  });

  it.each([
    ["stale", "This day changed since it was loaded."],
    ["foreign", "This day changed since it was loaded."],
  ])("maps a %s list to ConflictError with no effect", async (_label, message) => {
    mocks.applyDayOrder.mockRejectedValue(new ConflictError(message));
    await expect(reorderDay(actor, dayId, body)).rejects.toBeInstanceOf(ConflictError);
    expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  });

  it("conceals a day that does not exist", async () => {
    dayRows = [];
    await expect(reorderDay(actor, dayId, body)).rejects.toBeInstanceOf(TripNotFoundError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("answers 404 when the day is deleted between the pre-check and the lock", async () => {
    mocks.lockTripForUpdate.mockImplementationOnce(async () => {
      dayRows = [];
    });
    await expect(reorderDay(actor, dayId, body)).rejects.toBeInstanceOf(TripNotFoundError);
    expect(mocks.applyDayOrder).not.toHaveBeenCalled();
    expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  });

  it("rejects a day that moved to another trip while waiting for the lock", async () => {
    mocks.lockTripForUpdate.mockImplementationOnce(async () => {
      dayRows = [{ tripId: "other" }];
    });
    await expect(reorderDay(actor, dayId, body)).rejects.toBeInstanceOf(TripNotFoundError);
    expect(mocks.applyDayOrder).not.toHaveBeenCalled();
  });

  it("maps a trip deleted before lock acquisition to not found", async () => {
    mocks.lockTripForUpdate.mockRejectedValueOnce(new Error("Trip not found."));
    await expect(reorderDay(actor, dayId, body)).rejects.toBeInstanceOf(TripNotFoundError);
    expect(mocks.applyDayOrder).not.toHaveBeenCalled();
  });

  it("denies a role below editor before the transaction or lock", async () => {
    mocks.requireTripRole.mockRejectedValueOnce(new TripNotFoundError());
    await expect(reorderDay(actor, dayId, body)).rejects.toBeInstanceOf(TripNotFoundError);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.lockTripForUpdate).not.toHaveBeenCalled();
  });

  it("rechecks access inside the lock before reading the stored response or writing", async () => {
    mocks.requireTripRole.mockResolvedValueOnce("editor").mockRejectedValueOnce(new Error("revoked"));
    await expect(reorderDay(actor, dayId, body, replay)).rejects.toThrow("revoked");
    expect(calls).not.toContain("lookup");
    expect(mocks.applyDayOrder).not.toHaveBeenCalled();
    expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  });

  describe("with an Idempotency-Key", () => {
    function envelope(overrides: Record<string, unknown> = {}) {
      return {
        version: 1,
        fingerprint: fingerprintRequest(replay.method, replay.path, body),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        response: { dayId, items: body.items },
        ...overrides,
      };
    }

    it("stores the response on first use", async () => {
      await reorderDay(actor, dayId, body, replay);
      expect(calls).toContain("store");
    });

    it("replays the stored response without a second write or effect", async () => {
      stored = [{ result: envelope() }];
      await expect(reorderDay(actor, dayId, body, replay)).resolves.toEqual({ dayId, items: body.items });
      expect(mocks.applyDayOrder).not.toHaveBeenCalled();
      expect(mocks.afterTripWrite).not.toHaveBeenCalled();
    });

    it("rejects the same key with a different list", async () => {
      stored = [{ result: envelope({ fingerprint: fingerprintRequest(replay.method, replay.path, { items: [] }) }) }];
      await expect(reorderDay(actor, dayId, body, replay)).rejects.toBeInstanceOf(ConflictError);
      expect(mocks.applyDayOrder).not.toHaveBeenCalled();
    });
  });
});

// ---- updateDay ----

const updateReplay = { key: "update-1", method: "PATCH", path: `/api/v1/days/${dayId}` };

function keyedEnvelope(method: string, path: string, payload: unknown, response: unknown) {
  return {
    version: 1,
    fingerprint: fingerprintRequest(method, path, payload),
    expiresAt: new Date(mocks.now.getTime() + 60_000).toISOString(),
    response,
  };
}

describe("updateDay", () => {
  it("changes only the supplied field under the trip lock and runs the effect once", async () => {
    await expect(updateDay(actor, dayId, { label: "Updated" })).resolves.toMatchObject({
      id: dayId,
      tripId,
      label: "Updated",
    });
    expect(sets).toEqual([{ table: days, values: { label: "Updated" } }]);
    expect(mocks.requireTripRole).toHaveBeenNthCalledWith(1, tripId, "user", "editor");
    expect(mocks.lockTripForUpdate).toHaveBeenCalledWith(mocks, tripId);
    expect(mocks.requireTripRole).toHaveBeenNthCalledWith(2, tripId, "user", "editor", mocks);
    expect(mocks.afterTripWrite).toHaveBeenCalledExactlyOnceWith(actor, tripId);
  });

  it("clears a text field with null and keeps absent fields out of the write", async () => {
    returnedDay = [dayRow(3)];
    await updateDay(actor, dayId, { subtitle: null, weather: null, travelSummary: null });
    expect(sets[0].values).toEqual({ subtitle: null, weather: null, travelSummary: null });
    await updateDay(actor, dayId, { subtitle: "Rome", weather: "Sunny", travelSummary: "Train", label: "A" });
    expect(sets[1].values).toEqual({ subtitle: "Rome", weather: "Sunny", travelSummary: "Train", label: "A" });
  });

  it("returns the stored day for an empty patch with no write or effect", async () => {
    await expect(updateDay(actor, dayId, {})).resolves.toEqual({
      id: dayId,
      tripId,
      dayNumber: 3,
      date: "2026-05-03",
      label: "Day 3",
    });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  });

  it("normalizes the day id", async () => {
    await updateDay(actor, dayId.toUpperCase(), { label: "Updated" });
    expect(mocks.lockTripForUpdate).toHaveBeenCalledWith(mocks, tripId);
  });

  it.each([
    ["a null label", dayId, { label: null }],
    ["an over-length label", dayId, { label: "x".repeat(101) }],
    ["an unknown key", dayId, { dayNumber: 2 }],
    ["a malformed id", "bad", { label: "A" }],
  ])("rejects %s before touching the database", async (_name, id, input) => {
    await expect(updateDay(actor, id, input)).rejects.toThrow();
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("conceals a day that does not exist, before any transaction", async () => {
    dayRows = [];
    await expect(updateDay(actor, dayId, { label: "A" })).rejects.toBeInstanceOf(TripNotFoundError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("answers 404 when the day is removed between the pre-read and the lock", async () => {
    dayReads = [[dayRow(3)], []];
    await expect(updateDay(actor, dayId, { label: "A" })).rejects.toBeInstanceOf(TripNotFoundError);
    expect(mocks.lockTripForUpdate).toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  });

  it("answers 404 when the day moved to another trip while waiting for the lock", async () => {
    dayReads = [[dayRow(3)], [dayRow(3, { tripId: otherTripId })]];
    await expect(updateDay(actor, dayId, { label: "A" })).rejects.toBeInstanceOf(TripNotFoundError);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("answers 404 when the day vanishes after authorization or its update returns nothing", async () => {
    dayReads = [[dayRow(3)], [dayRow(3)], []];
    await expect(updateDay(actor, dayId, { label: "A" })).rejects.toBeInstanceOf(TripNotFoundError);
    returnedDay = [];
    await expect(updateDay(actor, dayId, { label: "A" })).rejects.toBeInstanceOf(TripNotFoundError);
    expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  });

  it.each(["viewer", "stranger"])("denies a %s before the transaction or lock", async () => {
    mocks.requireTripRole.mockRejectedValueOnce(new Error("denied"));
    await expect(updateDay(actor, dayId, { label: "A" })).rejects.toThrow("denied");
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.lockTripForUpdate).not.toHaveBeenCalled();
  });

  it("rechecks access inside the lock before the stored response or any write", async () => {
    mocks.requireTripRole.mockResolvedValueOnce("editor").mockRejectedValueOnce(new Error("revoked"));
    await expect(updateDay(actor, dayId, { label: "A" }, updateReplay)).rejects.toThrow("revoked");
    expect(calls).not.toContain("lookup");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("replays the stored response for a repeated key and rejects the key with another body", async () => {
    stored = [{ result: keyedEnvelope("PATCH", updateReplay.path, { label: "A" }, { id: dayId, label: "Cached" }) }];
    await expect(updateDay(actor, dayId, { label: "A" }, updateReplay)).resolves.toEqual({
      id: dayId,
      label: "Cached",
    });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.afterTripWrite).not.toHaveBeenCalled();
    await expect(updateDay(actor, dayId, { label: "B" }, updateReplay)).rejects.toBeInstanceOf(ConflictError);
  });
});

// ---- addDay ----

const addReplay = { key: "add-1", method: "POST", path: `/api/v1/trips/${tripId}/days` };

describe("addDay", () => {
  it("appends a dated day, moves the trip end date and revalidates the trips list once", async () => {
    allDays = [dayRow(1), dayRow(2, { date: "2026-05-02" })];
    const created = await addDay(actor, tripId, {});
    expect(created).toMatchObject({ tripId, dayNumber: 3, date: "2026-05-03" });
    expect(insertedDays).toEqual([{ tripId, dayNumber: 3, date: "2026-05-03", label: "Day 3" }]);
    expect(sets).toEqual([{ table: trips, values: { endDate: "2026-05-03", updatedAt: mocks.now } }]);
    expect(mocks.requireTripRole).toHaveBeenNthCalledWith(1, tripId, "user", "editor");
    expect(mocks.requireTripRole).toHaveBeenNthCalledWith(2, tripId, "user", "editor", mocks);
    expect(mocks.afterTripWrite).toHaveBeenCalledExactlyOnceWith(actor, tripId, ["/trips"]);
  });

  it("rolls the date over a month end", async () => {
    allDays = [dayRow(1, { date: "2026-05-31" })];
    await addDay(actor, tripId, {});
    expect(insertedDays[0].date).toBe("2026-06-01");
  });

  it("appends a dateless day without touching the trip", async () => {
    tripRows = [{ startDate: null }];
    allDays = [dayRow(1, { date: null }), dayRow(2, { date: null })];
    const created = await addDay(actor, tripId, {});
    expect(insertedDays).toEqual([{ tripId, dayNumber: 3, date: null, label: "Day 3" }]);
    expect(created.date).toBeUndefined();
    expect(sets).toEqual([]);
    expect(mocks.afterTripWrite).toHaveBeenCalledExactlyOnceWith(actor, tripId, ["/trips"]);
  });

  it("claims the client id before the trip lock and stores it as the day id", async () => {
    dayReads = [[], []];
    await addDay(actor, tripId, { id: clientId.toUpperCase() });
    expect(calls.indexOf("id-lock")).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf("id-lock")).toBeLessThan(calls.indexOf("trip-lock"));
    expect(insertedDays[0].id).toBe(clientId);
  });

  it("takes no id lock without a client id", async () => {
    await addDay(actor, tripId, {});
    expect(calls).not.toContain("id-lock");
  });

  it("replays the stored day for the same id and trip with no write or effect", async () => {
    dayReads = [[dayRow(4, { id: clientId })], [dayRow(4, { id: clientId })]];
    await expect(addDay(actor, tripId, { id: clientId })).resolves.toMatchObject({ id: clientId, dayNumber: 4 });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  });

  it("needs viewer access to a trip that already holds the id, then reports the conflict", async () => {
    const foreign = dayRow(4, { id: clientId, tripId: otherTripId });
    dayReads = [[foreign], [foreign]];
    await expect(addDay(actor, tripId, { id: clientId })).rejects.toBeInstanceOf(ConflictError);
    expect(mocks.requireTripRole).toHaveBeenCalledWith(otherTripId, "user", "viewer", mocks);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("conceals an id held by a trip the actor cannot see", async () => {
    const foreign = dayRow(4, { id: clientId, tripId: otherTripId });
    dayReads = [[foreign], [foreign]];
    mocks.requireTripRole
      .mockResolvedValueOnce("editor")
      .mockResolvedValueOnce("editor")
      .mockRejectedValueOnce(new TripNotFoundError());
    await expect(addDay(actor, tripId, { id: clientId })).rejects.toBeInstanceOf(TripNotFoundError);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rejects the 46th day with the cap message and no write", async () => {
    allDays = Array.from({ length: 45 }, (_, index) => dayRow(1, { dayNumber: index + 1, date: "2026-05-01" }));
    const failure = await addDay(actor, tripId, {}).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ValidationFailedError);
    expect((failure as Error).message).toBe("Max trip length is 45 days. Please shorten your date range.");
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  });

  it("allows the 45th day", async () => {
    allDays = Array.from({ length: 44 }, (_, index) => dayRow(1, { dayNumber: index + 1, date: "2026-05-01" }));
    await addDay(actor, tripId, {});
    expect(insertedDays[0].dayNumber).toBe(45);
  });

  it("reports a trip without days or with a broken day order as a conflict", async () => {
    allDays = [];
    await expect(addDay(actor, tripId, {})).rejects.toBeInstanceOf(ConflictError);
    allDays = [dayRow(1), dayRow(3)];
    await expect(addDay(actor, tripId, {})).rejects.toBeInstanceOf(ConflictError);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("answers 404 when the trip is gone from the table", async () => {
    tripRows = [];
    await expect(addDay(actor, tripId, {})).rejects.toBeInstanceOf(TripNotFoundError);
  });

  it("maps a trip deleted before lock acquisition to not found", async () => {
    mocks.lockTripForUpdate.mockRejectedValueOnce(new Error("Trip not found."));
    await expect(addDay(actor, tripId, {})).rejects.toBeInstanceOf(TripNotFoundError);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it.each(["viewer", "stranger"])("denies a %s before the transaction or lock", async () => {
    mocks.requireTripRole.mockRejectedValueOnce(new Error("denied"));
    await expect(addDay(actor, tripId, {})).rejects.toThrow("denied");
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.lockTripForUpdate).not.toHaveBeenCalled();
  });

  it("rechecks access inside the lock", async () => {
    mocks.requireTripRole.mockResolvedValueOnce("editor").mockRejectedValueOnce(new Error("revoked"));
    await expect(addDay(actor, tripId, {})).rejects.toThrow("revoked");
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it.each([
    ["a malformed trip id", "bad", {}],
    ["a malformed client id", tripId, { id: "bad" }],
    ["an unknown key", tripId, { label: "x" }],
  ])("rejects %s before touching the database", async (_name, id, input) => {
    await expect(addDay(actor, id, input)).rejects.toThrow();
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("serializes concurrent creates with one id so only one insert happens", async () => {
    const stored: DayRow[] = [];
    let inserts = 0;
    mocks.select.mockReturnValue({
      from: (table: unknown) => ({
        where: () => ({
          then: (resolve: (value: unknown) => void) =>
            resolve(table === days ? stored : table === trips ? tripRows : []),
          orderBy: async () => allDays,
        }),
      }),
    });
    mocks.insert.mockImplementation(() => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          inserts += 1;
          const row = dayRow(4, { id: values.id as string });
          stored.push(row);
          return [row];
        },
      }),
    }));
    // The id lock is a queue: the second request enters only after the first transaction finished.
    let tail: Promise<void> = Promise.resolve();
    mocks.transaction.mockImplementation(async (callback) => {
      const turn = tail;
      let finish: () => void = () => {};
      tail = new Promise((resolve) => {
        finish = resolve;
      });
      await turn;
      try {
        return await callback(mocks);
      } finally {
        finish();
      }
    });
    const results = await Promise.all([
      addDay(actor, tripId, { id: clientId }),
      addDay(actor, tripId, { id: clientId }),
    ]);
    expect(inserts).toBe(1);
    expect(results.map((result) => result.id)).toEqual([clientId, clientId]);
    expect(mocks.afterTripWrite).toHaveBeenCalledTimes(1);
  });

  it("returns the stored response for a repeated key and rejects the key with another body", async () => {
    stored = [{ result: keyedEnvelope("POST", addReplay.path, { id: clientId }, { id: clientId, label: "Cached" }) }];
    await expect(addDay(actor, tripId, { id: clientId }, addReplay)).resolves.toEqual({
      id: clientId,
      label: "Cached",
    });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.afterTripWrite).not.toHaveBeenCalled();
    await expect(addDay(actor, tripId, {}, addReplay)).rejects.toBeInstanceOf(ConflictError);
  });

  it("runs no effect when the commit rejects", async () => {
    mocks.transaction.mockImplementationOnce(async (callback) => {
      await callback(mocks);
      throw new Error("commit rejected");
    });
    await expect(addDay(actor, tripId, {})).rejects.toThrow("commit rejected");
    expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  });
});

// ---- deleteDay ----

const deleteReplay = { key: "delete-1", method: "DELETE", path: `/api/v1/days/${dayId}` };

describe("deleteDay", () => {
  it("removes an empty last day, ends the trip on the preceding date and revalidates the trips list", async () => {
    await expect(deleteDay(actor, dayId, { tripId })).resolves.toBeNull();
    expect(calls.slice(0, 3)).toEqual(["trip-lock", "delete-day", "commit"]);
    expect(sets).toEqual([{ table: trips, values: { endDate: "2026-05-02", updatedAt: mocks.now } }]);
    expect(mocks.requireTripRole).toHaveBeenNthCalledWith(1, tripId, "user", "editor");
    expect(mocks.requireTripRole).toHaveBeenNthCalledWith(2, tripId, "user", "editor", mocks);
    expect(mocks.afterTripWrite).toHaveBeenCalledExactlyOnceWith(actor, tripId, ["/trips"]);
    expect(mocks.storageDelete).not.toHaveBeenCalled();
  });

  it("leaves the end date alone when the preceding day has no date", async () => {
    allDays = [dayRow(1, { date: null }), dayRow(2, { date: null }), dayRow(3, { date: null })];
    await deleteDay(actor, dayId, { tripId });
    expect(sets).toEqual([]);
    expect(calls).toContain("delete-day");
  });

  it.each([
    ["events", () => (eventRows = [{ id: "event" }])],
    ["notes", () => (noteRows = [{ id: "note" }])],
    ["checklists", () => (checklistRows = [{ id: "list" }])],
  ])("needs confirmation for a day with %s and writes nothing", async (_name, populate) => {
    populate();
    const failure = await deleteDay(actor, dayId, { tripId }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ConfirmationRequiredError);
    expect(calls).not.toContain("delete-day");
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.afterTripWrite).not.toHaveBeenCalled();
    expect(mocks.storageDelete).not.toHaveBeenCalled();
  });

  it("removes a confirmed populated day, queues its files, and deletes them only after the commit", async () => {
    eventRows = [{ id: "event" }];
    noteRows = [{ id: "note" }];
    docRows = [{ url: "/uploads/a.pdf" }, { url: null }, { url: "/uploads/b.pdf" }];
    await expect(deleteDay(actor, dayId, { tripId, confirmDestructive: true })).resolves.toBeNull();
    expect(calls.slice(0, 4)).toEqual(["trip-lock", "queue", "delete-day", "commit"]);
    expect(calls.slice(4).filter((step) => step === "cleanup")).toHaveLength(2);
    expect(calls.slice(4).filter((step) => step === "clear")).toHaveLength(2);
    expect(mocks.storageDelete).toHaveBeenCalledWith("/uploads/a.pdf");
    expect(mocks.storageDelete).toHaveBeenCalledWith("/uploads/b.pdf");
    expect(mocks.afterTripWrite).toHaveBeenCalledOnce();
  });

  it("removes a confirmed day whose content has no files without queueing any", async () => {
    noteRows = [{ id: "note" }];
    await deleteDay(actor, dayId, { tripId, confirmDestructive: true });
    expect(calls).not.toContain("queue");
    expect(calls).toContain("delete-day");
  });

  it("logs a cleanup failure and still succeeds", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    eventRows = [{ id: "event" }];
    docRows = [{ url: "/uploads/a.pdf" }, { url: "/uploads/b.pdf" }];
    mocks.storageDelete.mockRejectedValueOnce(new Error("disk gone"));
    await expect(deleteDay(actor, dayId, { tripId, confirmDestructive: true })).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith("Cleanup failed for /uploads/a.pdf", expect.any(Error));
    expect(calls.filter((step) => step === "clear")).toHaveLength(1);
    warn.mockRestore();
  });

  it("succeeds with no write, cleanup or effect when the day is already gone", async () => {
    dayRows = [];
    docRows = [{ url: "/uploads/a.pdf" }];
    await expect(deleteDay(actor, dayId, { tripId }, deleteReplay)).resolves.toBeNull();
    expect(calls).not.toContain("delete-day");
    expect(mocks.storageDelete).not.toHaveBeenCalled();
    expect(mocks.afterTripWrite).not.toHaveBeenCalled();
    expect(mocks.requireTripRole).toHaveBeenCalledTimes(2);
  });

  it("refuses a day that is not the last, even an empty one", async () => {
    dayRows = [dayRow(2)];
    allDays = [dayRow(1), dayRow(2, { id: dayId }), dayRow(3, { id: "last" })];
    await expect(deleteDay(actor, dayId, { tripId })).rejects.toBeInstanceOf(ConflictError);
    expect(calls).not.toContain("delete-day");
    expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  });

  it("refuses to remove the only day", async () => {
    allDays = [dayRow(3, { id: dayId })];
    await expect(deleteDay(actor, dayId, { tripId, confirmDestructive: true })).rejects.toThrow(
      "Cannot remove the only remaining day."
    );
    expect(calls).not.toContain("delete-day");
  });

  it("conceals a day that belongs to another trip", async () => {
    dayRows = [dayRow(3, { tripId: otherTripId })];
    await expect(deleteDay(actor, dayId, { tripId })).rejects.toBeInstanceOf(TripNotFoundError);
    expect(calls).not.toContain("delete-day");
  });

  it("removes no file when the transaction rolls back after the delete", async () => {
    eventRows = [{ id: "event" }];
    docRows = [{ url: "/uploads/a.pdf" }];
    mocks.transaction.mockImplementationOnce(async (callback) => {
      await callback(mocks);
      throw new Error("commit rejected");
    });
    await expect(deleteDay(actor, dayId, { tripId, confirmDestructive: true })).rejects.toThrow("commit rejected");
    expect(mocks.storageDelete).not.toHaveBeenCalled();
    expect(calls).not.toContain("clear");
    expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  });

  it("returns the stored result for a repeated key with no write, cleanup or effect", async () => {
    stored = [{ result: keyedEnvelope("DELETE", deleteReplay.path, { tripId }, null) }];
    eventRows = [{ id: "event" }];
    docRows = [{ url: "/uploads/a.pdf" }];
    await expect(deleteDay(actor, dayId, { tripId }, deleteReplay)).resolves.toBeNull();
    expect(calls).not.toContain("delete-day");
    expect(mocks.storageDelete).not.toHaveBeenCalled();
    expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  });

  it("normalizes the ids", async () => {
    await deleteDay(actor, dayId.toUpperCase(), { tripId: tripId.toUpperCase() });
    expect(calls).toContain("delete-day");
  });

  it.each(["viewer", "stranger"])("denies a %s before the transaction, lock or write", async () => {
    mocks.requireTripRole.mockRejectedValueOnce(new Error("denied"));
    await expect(deleteDay(actor, dayId, { tripId })).rejects.toThrow("denied");
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.lockTripForUpdate).not.toHaveBeenCalled();
  });

  it("rechecks access inside the lock", async () => {
    mocks.requireTripRole.mockResolvedValueOnce("editor").mockRejectedValueOnce(new Error("revoked"));
    await expect(deleteDay(actor, dayId, { tripId })).rejects.toThrow("revoked");
    expect(calls).not.toContain("delete-day");
  });

  it.each([
    ["a malformed day id", "bad", { tripId }],
    ["no trip", dayId, {}],
    ["a malformed confirmation", dayId, { tripId, confirmDestructive: "yes" }],
    ["an unknown key", dayId, { tripId, force: true }],
  ])("rejects %s before touching the database", async (_name, id, input) => {
    await expect(deleteDay(actor, id, input)).rejects.toThrow();
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
