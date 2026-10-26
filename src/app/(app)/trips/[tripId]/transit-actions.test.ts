// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockAfter, mockDbSelect, mockMerge } = vi.hoisted(() => ({
  mockAfter: vi.fn(),
  mockDbSelect: vi.fn(),
  mockMerge: vi.fn(),
}));
vi.mock("next/server", () => ({ after: mockAfter }));
vi.mock("@/lib/activity-batches", () => ({
  BATCHED_TYPES: new Set(["trip_updated"]),
  mergeActivityInterval: mockMerge,
}));

const { recordTripUpdated } = vi.hoisted(() => ({ recordTripUpdated: vi.fn() }));
vi.mock("@/lib/trip-activity", () => ({ recordTripUpdated }));

const { mockAssertTripAccess, mockDbUpdate, mockRequireUser, mockRevalidatePath, schemaTokens } = vi.hoisted(() => {
  const mockAssertTripAccess = vi.fn();
  const mockDbUpdate = vi.fn();
  const mockRequireUser = vi.fn();
  const mockRevalidatePath = vi.fn();
  const schemaTokens: Record<string, unknown> = { trips: {}, users: { id: "user-id", username: "username" } };

  return { mockAssertTripAccess, mockDbUpdate, mockRequireUser, mockRevalidatePath, schemaTokens };
});

vi.mock("@/lib/auth-helpers", () => ({
  assertTripAccess: mockAssertTripAccess,
  requireUser: mockRequireUser,
}));

vi.mock("@/db", () => ({
  db: {
    update: mockDbUpdate,
    select: mockDbSelect,
  },
}));

vi.mock("@/db/schema", () => schemaTokens);

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

import { updateTripTransitMode } from "./transit-actions";
import { TransitMode } from "@/data/types";
import { trips } from "@/db/schema";
const actualTripActivity = await vi.importActual<typeof import("@/lib/trip-activity")>("@/lib/trip-activity");

describe("updateTripTransitMode", () => {
  const mockWhere = vi.fn();
  const mockSet = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    recordTripUpdated.mockReset();
    mockAfter.mockReset();
    mockDbSelect.mockReset();
    mockMerge.mockReset();
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockAssertTripAccess.mockResolvedValue(undefined);
    mockWhere.mockResolvedValue(undefined);
    mockSet.mockReturnValue({ where: mockWhere });
    mockDbUpdate.mockReturnValue({ set: mockSet });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does not await Activity work on the mutation response path", async () => {
    recordTripUpdated.mockReturnValueOnce(new Promise(() => undefined));
    await expect(updateTripTransitMode("trip-1", TransitMode.Walk)).resolves.toEqual({ success: true });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  }, 300);

  it("preserves the mutation result when post-response scheduling fails", async () => {
    recordTripUpdated.mockImplementation(actualTripActivity.recordTripUpdated);
    mockAfter.mockImplementation(() => {
      throw new Error("schedule failed");
    });
    await expect(updateTripTransitMode("trip-1", TransitMode.Walk)).resolves.toEqual({ success: true });
    expect(mockDbSelect).not.toHaveBeenCalled();
    expect(mockMerge).not.toHaveBeenCalled();
    expect(mockRevalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("preserves the mutation result when the username lookup rejects", async () => {
    recordTripUpdated.mockImplementation(actualTripActivity.recordTripUpdated);
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: async () => {
          throw new Error("lookup failed");
        },
      }),
    });
    const result = await updateTripTransitMode("trip-1", TransitMode.Walk);
    expect(result).toEqual({ success: true });
    const callback = mockAfter.mock.calls[0][0] as () => Promise<void>;
    await expect(callback()).resolves.toBeUndefined();
    expect(mockMerge).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });

  it("returns the mutation result before a hung username lookup times out", async () => {
    vi.useFakeTimers();
    recordTripUpdated.mockImplementation(actualTripActivity.recordTripUpdated);
    mockDbSelect.mockReturnValue({ from: () => ({ where: () => new Promise(() => undefined) }) });
    const result = await updateTripTransitMode("trip-1", TransitMode.Walk);
    expect(result).toEqual({ success: true });
    expect(mockDbSelect).not.toHaveBeenCalled();
    const callback = mockAfter.mock.calls[0][0] as () => Promise<void>;
    const pending = callback();
    await vi.advanceTimersByTimeAsync(actualTripActivity.TRIP_ACTIVITY_LOOKUP_TIMEOUT_MS);
    await expect(pending).resolves.toBeUndefined();
    expect(mockMerge).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });

  it("preserves the mutation result when the Activity write rejects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    recordTripUpdated.mockImplementation(actualTripActivity.recordTripUpdated);
    mockDbSelect.mockReturnValue({ from: () => ({ where: async () => [{ username: "alice" }] }) });
    mockMerge.mockRejectedValueOnce(new Error("write failed"));
    const result = await updateTripTransitMode("trip-1", TransitMode.Walk);
    expect(result).toEqual({ success: true });
    const lookup = mockAfter.mock.calls[0][0] as () => Promise<void>;
    await lookup();
    const write = mockAfter.mock.calls[1][0] as () => Promise<void>;
    await expect(write()).resolves.toBeUndefined();
    expect(mockMerge).toHaveBeenCalledOnce();
    expect(result).toEqual({ success: true });
  });

  it("requires the user before checking trip access", async () => {
    await updateTripTransitMode("trip-1", TransitMode.Transit);

    expect(mockRequireUser).toHaveBeenCalledOnce();
    expect(mockAssertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
  });

  it("persists a valid transit mode and revalidates the trip page", async () => {
    const result = await updateTripTransitMode("trip-1", TransitMode.Transit);

    expect(mockDbUpdate).toHaveBeenCalledWith(trips);
    expect(mockSet).toHaveBeenCalledWith({ transitMode: TransitMode.Transit });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/trips/trip-1");
    expect(result).toEqual({ success: true });
    expect(recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user-1", "trip-1");
  });

  it("returns an error and does not persist when the transit mode is invalid", async () => {
    const result = await updateTripTransitMode("trip-1", "flying" as TransitMode);

    expect(result).toEqual({ error: "Invalid transit mode." });
    expect(mockDbUpdate).not.toHaveBeenCalled();
    expect(recordTripUpdated).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("does not record a failed database write", async () => {
    mockWhere.mockRejectedValueOnce(new Error("write"));
    await expect(updateTripTransitMode("trip-1", TransitMode.Walk)).rejects.toThrow("write");
    expect(recordTripUpdated).not.toHaveBeenCalled();
  });

  it("rejects when the user is not authenticated", async () => {
    mockRequireUser.mockRejectedValue(new Error("Unauthenticated"));

    await expect(updateTripTransitMode("trip-1", TransitMode.Walk)).rejects.toThrow("Unauthenticated");
    expect(mockAssertTripAccess).not.toHaveBeenCalled();
    expect(mockDbUpdate).not.toHaveBeenCalled();
    expect(recordTripUpdated).not.toHaveBeenCalled();
  });

  it("rejects when the user does not have editor access", async () => {
    mockAssertTripAccess.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(updateTripTransitMode("trip-1", TransitMode.Walk)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockDbUpdate).not.toHaveBeenCalled();
    expect(recordTripUpdated).not.toHaveBeenCalled();
  });
});
