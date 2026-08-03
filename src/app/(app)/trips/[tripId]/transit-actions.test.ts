// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAssertTripAccess, mockDbUpdate, mockRequireUser, mockRevalidatePath, schemaTokens } = vi.hoisted(() => {
  const mockAssertTripAccess = vi.fn();
  const mockDbUpdate = vi.fn();
  const mockRequireUser = vi.fn();
  const mockRevalidatePath = vi.fn();
  const schemaTokens: Record<string, unknown> = { trips: {} };

  return { mockAssertTripAccess, mockDbUpdate, mockRequireUser, mockRevalidatePath, schemaTokens };
});

vi.mock("@/lib/auth-helpers", () => ({
  assertTripAccess: mockAssertTripAccess,
  requireUser: mockRequireUser,
}));

vi.mock("@/db", () => ({
  db: {
    update: mockDbUpdate,
  },
}));

vi.mock("@/db/schema", () => schemaTokens);

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

import { updateTripTransitMode } from "./transit-actions";
import { TransitMode } from "@/data/types";
import { trips } from "@/db/schema";

describe("updateTripTransitMode", () => {
  const mockWhere = vi.fn();
  const mockSet = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockAssertTripAccess.mockResolvedValue(undefined);
    mockWhere.mockResolvedValue(undefined);
    mockSet.mockReturnValue({ where: mockWhere });
    mockDbUpdate.mockReturnValue({ set: mockSet });
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
  });

  it("returns an error and does not persist when the transit mode is invalid", async () => {
    const result = await updateTripTransitMode("trip-1", "flying" as TransitMode);

    expect(result).toEqual({ error: "Invalid transit mode." });
    expect(mockDbUpdate).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("rejects when the user is not authenticated", async () => {
    mockRequireUser.mockRejectedValue(new Error("Unauthenticated"));

    await expect(updateTripTransitMode("trip-1", TransitMode.Walk)).rejects.toThrow("Unauthenticated");
    expect(mockAssertTripAccess).not.toHaveBeenCalled();
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it("rejects when the user does not have editor access", async () => {
    mockAssertTripAccess.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(updateTripTransitMode("trip-1", TransitMode.Walk)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });
});
