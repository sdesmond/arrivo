import { beforeEach, describe, expect, it, vi } from "vitest";
import { idempotencyKeys } from "@/db/schema";
const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
  lockTripForUpdate: vi.fn(),
  requireTripRole: vi.fn(),
  afterTripWrite: vi.fn(),
  applyDayOrder: vi.fn(),
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
vi.mock("./timeline-positions", () => ({ applyDayOrder: mocks.applyDayOrder }));
import { ConflictError } from "./conflict-error";
import { TripNotFoundError } from "./trip-access";
import { fingerprintRequest } from "@/lib/api/idempotency";
import { reorderDay } from "./days";

const actor = { userId: "user" };
const dayId = "123e4567-e89b-12d3-a456-426614174000";
const tripId = "trip";
const body = {
  items: [
    { type: "checklist", id: "223e4567-e89b-12d3-a456-426614174000" },
    { type: "event", id: "323e4567-e89b-12d3-a456-426614174000" },
    { type: "note", id: "423e4567-e89b-12d3-a456-426614174000" },
  ],
};
const replay = { key: "retry-1", method: "PUT", path: `/api/v1/days/${dayId}/order` };
let dayRows: { tripId: string }[];
let stored: { result: unknown }[];
let calls: string[];
beforeEach(() => {
  vi.clearAllMocks();
  dayRows = [{ tripId }];
  stored = [];
  calls = [];
  mocks.select.mockReturnValue({
    from: (table: unknown) => ({
      where: async () => {
        if (table === idempotencyKeys) {
          calls.push("lookup");
          return stored;
        }
        return dayRows;
      },
    }),
  });
  mocks.execute.mockResolvedValue([]);
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
  mocks.applyDayOrder.mockResolvedValue(true);
  mocks.transaction.mockImplementation(async (callback) => callback(mocks));
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
