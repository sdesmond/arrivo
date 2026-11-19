import { use, useState } from "react";
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

/** Renders the hook with a router whose refresh starts a real transition, as Next's does, so keyed writes can settle. */
function renderPackingHandlers(data: TripDetailPayload, refreshed: Promise<void> = Promise.resolve()) {
  return renderHook(() => {
    const [pendingRefresh, setPendingRefresh] = useState<Promise<void> | null>(null);
    refresh.mockImplementation(() => setPendingRefresh(refreshed));
    const handlers = usePackingHandlers(data);
    if (pendingRefresh) use(pendingRefresh);
    return handlers;
  });
}

/** Awaits a successful write outside act, so the refresh transition it waits for can commit meanwhile. */
async function settled(write: Promise<void>): Promise<void> {
  let done = false;
  void write.then(() => {
    done = true;
  });
  await waitFor(() => expect(done).toBe(true));
}

beforeEach(() => {
  vi.clearAllMocks();
  api.mockReset();
  api.mockResolvedValue({ id: checklistId });
  vi.spyOn(crypto, "randomUUID").mockReturnValue(checklistId);
});

describe("handleInsertFromPackingSource", () => {
  it.each(["packing-list", "template"] as const)("creates from a %s through the checklist API", async (type) => {
    const { result } = renderPackingHandlers(detail);

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
    const { result } = renderPackingHandlers(detail);

    await act(async () => {
      await result.current.handleInsertFromPackingSource(1, 0, "template", sourceId);
      await result.current.handleInsertFromPackingSource(1, 0, "template", sourceId);
    });

    expect(api.mock.calls.map(([, input]) => input.body.id)).toEqual([
      "55555555-5555-4555-8555-555555555555",
      "66666666-6666-4666-8666-666666666666",
    ]);
  });

  it("sends one request when the same insert is selected twice before the first settles", async () => {
    let finish: (value: { id: string }) => void = () => {};
    api.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const { result } = renderPackingHandlers(detail);

    await act(async () => {
      const first = result.current.handleInsertFromPackingSource(1, 0, "template", sourceId);
      const second = result.current.handleInsertFromPackingSource(1, 0, "template", sourceId);
      finish({ id: checklistId });
      await Promise.all([first, second]);
    });

    expect(api).toHaveBeenCalledOnce();
  });

  it("accepts a later insert after the first settled or failed, with a new ID", async () => {
    vi.mocked(crypto.randomUUID)
      .mockReturnValueOnce("55555555-5555-4555-8555-555555555555")
      .mockReturnValueOnce("66666666-6666-4666-8666-666666666666");
    api.mockRejectedValueOnce(new ApiClientError(500, "internal", "boom"));
    const { result } = renderPackingHandlers(detail);

    await act(async () => {
      await result.current.handleInsertFromPackingSource(1, 0, "template", sourceId);
    });
    await act(async () => {
      await result.current.handleInsertFromPackingSource(1, 0, "template", sourceId);
    });

    expect(api).toHaveBeenCalledTimes(2);
    expect(api.mock.calls.map(([, input]) => input.body.id)).toEqual([
      "55555555-5555-4555-8555-555555555555",
      "66666666-6666-4666-8666-666666666666",
    ]);
  });

  it("still sends a UUID-shaped id where crypto.randomUUID is unavailable (insecure context)", async () => {
    vi.spyOn(crypto, "randomUUID").mockRestore();
    vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues.bind(crypto) });
    try {
      const { result } = renderPackingHandlers(detail);

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
    const { result } = renderPackingHandlers(detail);

    await act(async () => {
      await result.current.handleInsertFromPackingSource(1, 0, "template", sourceId);
    });

    expect(toast.error).toHaveBeenCalledExactlyOnceWith("Resource not found.");
    expect(result.current.newlyCreatedChecklistId).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows a generic error once for a network failure", async () => {
    api.mockRejectedValue(new Error("network"));
    const { result } = renderPackingHandlers(detail);

    await act(async () => {
      await result.current.handleInsertFromPackingSource(1, 0, "template", sourceId);
    });

    expect(toast.error).toHaveBeenCalledExactlyOnceWith("Could not save changes. Try again.");
    expect(result.current.newlyCreatedChecklistId).toBeNull();
  });

  it("sends the user to sign in without a toast or marker when the session is gone", async () => {
    api.mockRejectedValue(new ApiClientError(401, "unauthenticated", "Sign in"));
    const { result } = renderPackingHandlers(detail);

    await act(async () => {
      await result.current.handleInsertFromPackingSource(1, 0, "template", sourceId);
    });

    expect(push).toHaveBeenCalledWith("/sign-in");
    expect(toast.error).not.toHaveBeenCalled();
    expect(result.current.newlyCreatedChecklistId).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("packing item API writes", () => {
  it("sends absolute packed state and trip-scoped deletion", async () => {
    const { result } = renderPackingHandlers(detail);
    await act(async () => {
      await result.current.handleTogglePackingItem(sourceId, true);
    });
    await act(async () => {
      await result.current.handleRemovePackingItem(sourceId);
    });
    expect(api.mock.calls.map(([, input]) => input)).toEqual([
      { params: { itemId: sourceId }, body: { isPacked: true } },
      { params: { itemId: sourceId }, body: { tripId } },
    ]);
  });
  it("rejects failed toggles so optimistic state can roll back", async () => {
    api.mockRejectedValueOnce(new Error("network"));
    const { result } = renderPackingHandlers(detail);
    await act(async () => {
      await expect(result.current.handleTogglePackingItem(sourceId, false)).rejects.toThrow();
    });
    expect(toast.error).toHaveBeenCalledOnce();
  });
  it("orders rename and deletion for the same item", async () => {
    let finish: (value: unknown) => void = () => {};
    api.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    const { result } = renderPackingHandlers(detail);
    let removal: Promise<void> = Promise.resolve();
    await act(async () => {
      result.current.handleUpdatePackingItem(sourceId, "Boots");
      removal = result.current.handleRemovePackingItem(sourceId);
      await Promise.resolve();
      expect(api).toHaveBeenCalledTimes(1);
      finish({});
    });
    await act(async () => {
      await removal;
    });
    expect(api).toHaveBeenCalledTimes(2);
    expect(api.mock.calls[0][1].body).toEqual({ name: "Boots" });
    expect(api.mock.calls[1][1].body).toEqual({ tripId });
  });
});

it("keeps same-item writes ordered when the handlers remount", async () => {
  let finish: (value: unknown) => void = () => {};
  api.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  const first = renderPackingHandlers(detail);
  act(() => first.result.current.handleUpdatePackingItem(sourceId, "Boots"));
  first.unmount();
  const second = renderPackingHandlers(detail);
  let deletion: Promise<void> = Promise.resolve();
  act(() => {
    deletion = second.result.current.handleRemovePackingItem(sourceId);
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(api).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish({});
    await deletion;
  });
  expect(api.mock.calls.map(([, request]) => request.body)).toEqual([{ name: "Boots" }, { tripId }]);
});

it("creates packing entries with a client ID and scoped placement", async () => {
  const { createPackingItem } = await import("@/lib/api/contract/packing");
  const { result } = renderPackingHandlers(detail);
  await settled(result.current.handleAddPackingItem("Boots", false, sourceId, undefined, null, null));
  expect(api).toHaveBeenCalledWith(
    createPackingItem,
    expect.objectContaining({
      params: { tripId },
      body: expect.objectContaining({ id: checklistId, name: "Boots", afterItemId: sourceId, listId: null }),
    })
  );
});
it("holds a created entry's promise until the refreshed list arrives", async () => {
  let releaseRefresh: () => void = () => {};
  const blocked = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  const { result } = renderPackingHandlers(detail, blocked);
  let done = false;
  const creation = result.current.handleAddPackingItem("Toiletries", true).then(() => {
    done = true;
  });
  await waitFor(() => expect(refresh).toHaveBeenCalled());
  expect(done).toBe(false);
  releaseRefresh();
  await creation;
  expect(done).toBe(true);
});
it.each(["delete-items", "move-items-to-ungrouped"] as const)("removes a packing section using %s", async (mode) => {
  const { removePackingSection } = await import("@/lib/api/contract/packing");
  const { result } = renderPackingHandlers(detail);
  await settled(result.current.handleRemovePackingSection(sourceId, mode));
  expect(api).toHaveBeenCalledWith(removePackingSection, { params: { itemId: sourceId }, body: { tripId, mode } });
});
it("rejects creation and refreshes when the API fails", async () => {
  api.mockRejectedValueOnce(new ApiClientError(409, "conflict", "Conflict"));
  const { result } = renderPackingHandlers(detail);
  await act(async () => {
    await expect(result.current.handleAddPackingItem("Boots")).rejects.toThrow("Conflict");
  });
  expect(refresh).toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledWith("Conflict");
});

it.each(["delete-items", "move-items-to-ungrouped"] as const)(
  "rejects a failed section removal using %s and refreshes",
  async (mode) => {
    api.mockRejectedValueOnce(new ApiClientError(409, "conflict", "Section changed"));
    const { result } = renderPackingHandlers(detail);
    await act(async () => {
      await expect(result.current.handleRemovePackingSection(sourceId, mode)).rejects.toThrow("Section changed");
    });
    expect(toast.error).toHaveBeenCalledExactlyOnceWith("Section changed");
    expect(refresh).toHaveBeenCalled();
  }
);

it("reuses the create UUID after a failed submission and clears it after success", async () => {
  const nextId = "55555555-5555-4555-8555-555555555555";
  vi.mocked(crypto.randomUUID).mockReturnValueOnce(checklistId).mockReturnValueOnce(nextId);
  api.mockRejectedValueOnce(new ApiClientError(0, "network_error", "Lost response"));
  const { result } = renderPackingHandlers(detail);
  await act(async () => {
    await expect(result.current.handleAddPackingItem("Boots", false, sourceId, undefined, null, null)).rejects.toThrow(
      "Lost response"
    );
  });
  await settled(result.current.handleAddPackingItem("Boots", false, sourceId, undefined, null, null));
  await settled(result.current.handleAddPackingItem("Boots", false, sourceId, undefined, null, null));
  expect(api.mock.calls.map(([, input]) => input.body.id)).toEqual([checklistId, checklistId, nextId]);
});
it.each([
  ["name", ["Hat", false, sourceId, undefined, null, null]],
  ["section flag", ["Boots", true, sourceId, undefined, null, null]],
  ["after anchor", ["Boots", false, checklistId, undefined, null, null]],
  ["before anchor", ["Boots", false, undefined, sourceId, null, null]],
  ["section", ["Boots", false, sourceId, undefined, checklistId, null]],
  ["list", ["Boots", false, sourceId, undefined, null, checklistId]],
] as const)("uses a fresh create UUID when %s changes after failure", async (_field, changed) => {
  const nextId = "55555555-5555-4555-8555-555555555555";
  vi.mocked(crypto.randomUUID).mockReturnValueOnce(checklistId).mockReturnValueOnce(nextId);
  api.mockRejectedValueOnce(new ApiClientError(0, "network_error", "Lost response"));
  const { result } = renderPackingHandlers(detail);
  await act(async () => {
    await expect(result.current.handleAddPackingItem("Boots", false, sourceId, undefined, null, null)).rejects.toThrow(
      "Lost response"
    );
  });
  await settled(
    result.current.handleAddPackingItem(changed[0], changed[1], changed[2], changed[3], changed[4], changed[5])
  );
  expect(api.mock.calls.map(([, input]) => input.body.id)).toEqual([checklistId, nextId]);
});

it("does not retain an older failure after a newer submission succeeds", async () => {
  const secondId = "55555555-5555-4555-8555-555555555555";
  const thirdId = "66666666-6666-4666-8666-666666666666";
  vi.mocked(crypto.randomUUID)
    .mockReturnValueOnce(checklistId)
    .mockReturnValueOnce(secondId)
    .mockReturnValueOnce(thirdId);
  let rejectFirst: (error: Error) => void = () => {};
  api.mockReturnValueOnce(
    new Promise((_resolve, reject) => {
      rejectFirst = reject;
    })
  );
  const { result } = renderPackingHandlers(detail);
  const first = result.current.handleAddPackingItem("Boots");
  const firstOutcome = expect(first).rejects.toThrow("Lost response");
  await settled(result.current.handleAddPackingItem("Hat"));
  rejectFirst(new Error("Lost response"));
  await firstOutcome;
  await settled(result.current.handleAddPackingItem("Boots"));
  expect(api.mock.calls.map(([, input]) => input.body.id)).toEqual([checklistId, secondId, thirdId]);
});
