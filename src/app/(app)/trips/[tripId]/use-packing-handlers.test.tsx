import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { toast } from "sonner";
import { usePackingHandlers } from "./use-packing-handlers";
import { removePackingItem } from "../actions";
import type { TripDetailPayload } from "@/data/types";

const { mockUseOnlineStatus, mockUseOfflineDb, mockDeletePackingItemLocally } = vi.hoisted(() => ({
  mockUseOnlineStatus: vi.fn(() => true),
  mockUseOfflineDb: vi.fn<() => { userId: string } | null>(() => null),
  mockDeletePackingItemLocally: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/offline/use-online-status", () => ({
  useOnlineStatus: mockUseOnlineStatus,
}));

vi.mock("@/lib/offline/db", () => ({
  deletePackingItemLocally: mockDeletePackingItemLocally,
  useOfflineDb: mockUseOfflineDb,
  writePackingItemLocally: vi.fn(),
}));

vi.mock("../actions", () => ({
  addPackingItem: vi.fn(),
  pullTemplatesOntoTrip: vi.fn(),
  removePackingItem: vi.fn(),
  reorderPackingItems: vi.fn(),
  saveTripListAsTemplate: vi.fn(),
  togglePackingItem: vi.fn(),
  updatePackingItem: vi.fn(),
}));

vi.mock("../packing-actions", () => ({
  createPackingList: vi.fn(),
  deletePackingList: vi.fn(),
  removePackingSection: vi.fn(),
  renamePackingList: vi.fn(),
}));

vi.mock("./actions", () => ({
  addChecklistFromPackingSource: vi.fn(),
}));

const detail: TripDetailPayload = {
  collaborators: [],
  days: [],
  docs: [],
  packingItems: [],
  packingLists: [],
  reservations: [],
  trip: {
    id: "trip-1",
    name: "Tokyo",
    status: "upcoming",
  },
  unscheduledEvents: [],
};

describe("usePackingHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseOnlineStatus.mockReturnValue(true);
    mockUseOfflineDb.mockReturnValue(null);
  });

  it("removes packing items with the server action while online", async () => {
    vi.mocked(removePackingItem).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => usePackingHandlers(detail));

    await expect(result.current.handleRemovePackingItem("pack-1")).resolves.toBeUndefined();

    expect(vi.mocked(removePackingItem)).toHaveBeenCalledWith("pack-1");
    expect(mockDeletePackingItemLocally).not.toHaveBeenCalled();
  });

  it("removes packing items locally instead of calling the server action while offline", async () => {
    mockUseOnlineStatus.mockReturnValue(false);
    mockUseOfflineDb.mockReturnValue({ userId: "user-1" });

    const { result } = renderHook(() => usePackingHandlers(detail));

    await expect(result.current.handleRemovePackingItem("pack-1")).resolves.toBeUndefined();

    expect(mockDeletePackingItemLocally).toHaveBeenCalledWith({ userId: "user-1" }, "pack-1");
    expect(vi.mocked(removePackingItem)).not.toHaveBeenCalled();
  });

  it("rejects and shows toast when offline delete fails", async () => {
    mockUseOnlineStatus.mockReturnValue(false);
    mockUseOfflineDb.mockReturnValue({ userId: "user-1" });
    mockDeletePackingItemLocally.mockRejectedValueOnce(new Error("offline remove failed"));

    const { result } = renderHook(() => usePackingHandlers(detail));

    await expect(result.current.handleRemovePackingItem("pack-1")).rejects.toThrow("offline remove failed");
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("offline remove failed"));
  });
});
