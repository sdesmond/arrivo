import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import type { DayItinerary, TripDetailPayload } from "@/data/types";
import { createChecklist } from "@/lib/api/contract/checklists";
import { usePackingHandlers } from "./use-packing-handlers";

const { api, push, refresh } = vi.hoisted(() => ({ api: vi.fn(), push: vi.fn(), refresh: vi.fn() }));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/lib/api/client", async (original) => ({ ...(await original<typeof import("@/lib/api/client")>()), api }));
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
  removePackingSection: vi.fn(),
  createPackingList: vi.fn(),
  renamePackingList: vi.fn(),
  deletePackingList: vi.fn(),
}));

import { ApiClientError } from "@/lib/api/client";

const tripId = "11111111-1111-4111-8111-111111111111";
const dayId = "22222222-2222-4222-8222-222222222222";
const checklistId = "33333333-3333-4333-8333-333333333333";
const sourceId = "44444444-4444-4444-8444-444444444444";

function payload(days: DayItinerary[]): TripDetailPayload {
  return {
    accessRole: "manager",
    collaborators: [],
    days,
    docs: [],
    packingItems: [],
    packingLists: [],
    reservations: [],
    expenses: [],
    notes: [],
    trip: { id: tripId, name: "Tokyo", status: "upcoming" },
    unscheduledEvents: [],
  };
}
const day: DayItinerary = { dayNumber: 1, date: "2026-08-01", events: [], id: dayId, label: "Day 1", checklists: [] };
const detail = payload([day]);
function withChecklist(id: string): TripDetailPayload {
  return payload([{ ...day, checklists: [{ id, tripDayId: dayId, position: 0, items: [] }] }]);
}

beforeEach(() => {
  vi.clearAllMocks();
  api.mockReset();
  api.mockResolvedValue({ id: checklistId });
  vi.spyOn(crypto, "randomUUID").mockReturnValue(checklistId);
});

describe("handleInsertFromPackingSource", () => {
  it.each(["packing-list", "template"] as const)("creates from a %s through the checklist API", async (type) => {
    const { result } = renderHook(() => usePackingHandlers(detail));

    await act(async () => {
      await result.current.handleInsertFromPackingSource(1, 3, type, sourceId);
    });

    expect(api).toHaveBeenCalledOnce();
    expect(api).toHaveBeenCalledWith(createChecklist, {
      params: { tripId },
      body: { dayId, position: 3, id: checklistId, source: { type, id: sourceId } },
    });
    expect(refresh).toHaveBeenCalledOnce();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("generates a fresh checklist UUID for every insert", async () => {
    vi.mocked(crypto.randomUUID)
      .mockReturnValueOnce("55555555-5555-4555-8555-555555555555")
      .mockReturnValueOnce("66666666-6666-4666-8666-666666666666");
    const { result } = renderHook(() => usePackingHandlers(detail));

    await act(async () => {
      await result.current.handleInsertFromPackingSource(1, 0, "template", sourceId);
      await result.current.handleInsertFromPackingSource(1, 0, "template", sourceId);
    });

    expect(api.mock.calls.map(([, input]) => input.body.id)).toEqual([
      "55555555-5555-4555-8555-555555555555",
      "66666666-6666-4666-8666-666666666666",
    ]);
  });

  it("still sends a UUID-shaped id where crypto.randomUUID is unavailable (insecure context)", async () => {
    vi.spyOn(crypto, "randomUUID").mockRestore();
    vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues.bind(crypto) });
    try {
      const { result } = renderHook(() => usePackingHandlers(detail));

      await act(async () => {
        await result.current.handleInsertFromPackingSource(1, 0, "template", sourceId);
      });

      expect(api).toHaveBeenCalledOnce();
      expect(api.mock.calls[0][1].body.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does nothing when the day is missing or has no id", async () => {
    const { result } = renderHook(() => usePackingHandlers(payload([{ ...day, id: undefined }])));

    await act(async () => {
      await result.current.handleInsertFromPackingSource(1, 0, "template", sourceId);
      await result.current.handleInsertFromPackingSource(9, 0, "template", sourceId);
    });

    expect(api).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(result.current.newlyCreatedChecklistId).toBeNull();
  });

  it("keeps the expansion marker through stale refreshed props until the checklist appears", async () => {
    const { result, rerender } = renderHook(({ source }) => usePackingHandlers(source), {
      initialProps: { source: detail },
    });

    await act(async () => {
      await result.current.handleInsertFromPackingSource(1, 0, "packing-list", sourceId);
    });
    expect(result.current.newlyCreatedChecklistId).toBe(checklistId);

    rerender({ source: payload([day]) });
    expect(result.current.newlyCreatedChecklistId).toBe(checklistId);

    rerender({ source: withChecklist(checklistId) });
    await waitFor(() => expect(result.current.newlyCreatedChecklistId).toBeNull());
  });

  it("shows the API error once and never sets the marker or refreshes on failure", async () => {
    api.mockRejectedValue(new ApiClientError(404, "not_found", "Resource not found."));
    const { result } = renderHook(() => usePackingHandlers(detail));

    await act(async () => {
      await result.current.handleInsertFromPackingSource(1, 0, "template", sourceId);
    });

    expect(toast.error).toHaveBeenCalledExactlyOnceWith("Resource not found.");
    expect(result.current.newlyCreatedChecklistId).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows a generic error once for a network failure", async () => {
    api.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => usePackingHandlers(detail));

    await act(async () => {
      await result.current.handleInsertFromPackingSource(1, 0, "template", sourceId);
    });

    expect(toast.error).toHaveBeenCalledExactlyOnceWith("Could not save changes. Try again.");
    expect(result.current.newlyCreatedChecklistId).toBeNull();
  });

  it("sends the user to sign in without a toast or marker when the session is gone", async () => {
    api.mockRejectedValue(new ApiClientError(401, "unauthenticated", "Sign in"));
    const { result } = renderHook(() => usePackingHandlers(detail));

    await act(async () => {
      await result.current.handleInsertFromPackingSource(1, 0, "template", sourceId);
    });

    expect(push).toHaveBeenCalledWith("/sign-in");
    expect(toast.error).not.toHaveBeenCalled();
    expect(result.current.newlyCreatedChecklistId).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });
});
