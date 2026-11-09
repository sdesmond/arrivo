import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { DayItinerary } from "@/data/types";
import { useChecklistHandlers } from "./use-checklist-handlers";
const { mutate, create, title, remove } = vi.hoisted(() => ({
  mutate: vi.fn(),
  create: vi.fn(),
  title: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/lib/api/use-api-mutation", () => ({
  useApiMutation: (endpoint: { method: string; path: string }) => ({
    mutate:
      endpoint.method === "POST"
        ? create
        : endpoint.method === "DELETE"
          ? remove
          : endpoint.path.includes("checklist-items")
            ? mutate
            : title,
  }),
}));
const setNewlyCreatedChecklistId = vi.fn();
const tripId = "11111111-1111-4111-8111-111111111111";
const lifecycle = { tripId, setNewlyCreatedChecklistId };
const days: DayItinerary[] = [
  {
    id: "day",
    dayNumber: 1,
    label: "Day 1",
    events: [],
    checklists: [
      {
        id: "list",
        tripDayId: "day",
        position: 0,
        items: [{ id: "item", checklistId: "list", content: "Passport", isChecked: false }],
      },
    ],
  },
];
beforeEach(() => {
  for (const mock of [mutate, create, title, remove, setNewlyCreatedChecklistId]) mock.mockReset();
  for (const mock of [create, title, remove]) mock.mockResolvedValue(undefined);
});
function checked(result: ReturnType<typeof useChecklistHandlers>) {
  return result.days[0].checklists?.[0].items[0].isChecked;
}
it("derives rapid absolute writes from intended state even before React rerenders", () => {
  const { result } = renderHook(() => useChecklistHandlers(days, lifecycle));
  act(() => {
    result.current.handleToggleChecklistItem("item");
    result.current.handleToggleChecklistItem("item");
    result.current.handleToggleChecklistItem("item");
  });
  expect(checked(result.current)).toBe(true);
  expect(mutate.mock.calls.map(([input]) => input.body.isChecked)).toEqual([true, false, true]);
  expect(mutate.mock.calls.every(([, options]) => options.key === "item")).toBe(true);
});
it("preserves later intent through stale props and earlier failures, then rolls back final failure", async () => {
  const { result, rerender } = renderHook(({ source }) => useChecklistHandlers(source, lifecycle), {
    initialProps: { source: days },
  });
  act(() => {
    result.current.handleToggleChecklistItem("item");
  });
  act(() => {
    result.current.handleToggleChecklistItem("item");
  });
  act(() => {
    result.current.handleToggleChecklistItem("item");
  });
  rerender({ source: structuredClone(days) });
  act(() => {
    mutate.mock.calls[1][1].onSettled();
  });
  expect(checked(result.current)).toBe(true);
  act(() => {
    mutate.mock.calls[2][1].onSettled();
  });
  await waitFor(() => expect(checked(result.current)).toBe(false));
});
it("clears overrides after final refresh and on auth loss", () => {
  const { result, rerender } = renderHook(({ source }) => useChecklistHandlers(source, lifecycle), {
    initialProps: { source: days },
  });
  act(() => {
    result.current.handleToggleChecklistItem("item");
  });
  const refreshed = structuredClone(days);
  refreshed[0].checklists![0].items[0].isChecked = true;
  rerender({ source: refreshed });
  act(() => {
    mutate.mock.calls[0][1].onSettled();
  });
  expect(checked(result.current)).toBe(true);
  act(() => {
    result.current.handleToggleChecklistItem("item");
  });
  act(() => {
    mutate.mock.calls[1][1].onAuthLost();
  });
  expect(checked(result.current)).toBe(true);
});
it("ignores missing items", () => {
  const { result } = renderHook(() => useChecklistHandlers(days, lifecycle));
  act(() => {
    result.current.handleToggleChecklistItem("missing");
  });
  expect(mutate).not.toHaveBeenCalled();
});

it("keeps newer intent while an earlier successful refresh delivers stale props", () => {
  const { result, rerender } = renderHook(({ source }) => useChecklistHandlers(source, lifecycle), {
    initialProps: { source: days },
  });
  act(() => {
    result.current.handleToggleChecklistItem("item");
  });
  act(() => {
    result.current.handleToggleChecklistItem("item");
  });
  const firstRefresh = structuredClone(days);
  firstRefresh[0].checklists![0].items[0].isChecked = true;
  rerender({ source: firstRefresh });
  act(() => {
    mutate.mock.calls[0][1].onSettled();
  });
  expect(checked(result.current)).toBe(false);
  rerender({ source: structuredClone(days) });
  act(() => {
    mutate.mock.calls[1][1].onSettled();
  });
  expect(checked(result.current)).toBe(false);
});

it("acknowledges each item only from fresh matching committed props", async () => {
  const source = structuredClone(days);
  source[0].checklists![0].items.push({ id: "second", checklistId: "list", content: "Second", isChecked: false });
  const { result, rerender } = renderHook(({ sourceDays }) => useChecklistHandlers(sourceDays, lifecycle), {
    initialProps: { sourceDays: source },
  });
  act(() => {
    result.current.handleToggleChecklistItem("item");
  });
  act(() => {
    result.current.handleToggleChecklistItem("second");
  });
  let firstSettled = false;
  let secondSettled = false;
  void mutate.mock.calls[0][1].waitForRefresh().then(() => {
    firstSettled = true;
  });
  void mutate.mock.calls[1][1].waitForRefresh().then(() => {
    secondSettled = true;
  });
  rerender({ sourceDays: source });
  await act(async () => {
    await Promise.resolve();
  });
  expect(firstSettled).toBe(false);
  expect(secondSettled).toBe(false);
  const refreshed = structuredClone(source);
  refreshed[0].checklists![0].items[1].isChecked = true;
  rerender({ sourceDays: refreshed });
  await act(async () => {
    await Promise.resolve();
  });
  expect(firstSettled).toBe(false);
  expect(secondSettled).toBe(true);
});

it("does not acknowledge a queued write using matching props from before its success", async () => {
  const { result, rerender } = renderHook(({ source }) => useChecklistHandlers(source, lifecycle), {
    initialProps: { source: days },
  });
  act(() => {
    result.current.handleToggleChecklistItem("item");
    result.current.handleToggleChecklistItem("item");
  });
  const earlierCommit = structuredClone(days);
  rerender({ source: earlierCommit });
  let settled = false;
  void mutate.mock.calls[1][1].waitForRefresh().then(() => {
    settled = true;
  });
  rerender({ source: earlierCommit });
  await act(async () => {
    await Promise.resolve();
  });
  expect(settled).toBe(false);
  rerender({ source: structuredClone(days) });
  await act(async () => {
    await Promise.resolve();
  });
  expect(settled).toBe(true);
});

it("clears every overlay and active item acknowledgment on auth loss", async () => {
  const source = structuredClone(days);
  source[0].checklists![0].items.push({ id: "second", checklistId: "list", content: "Second", isChecked: false });
  const { result } = renderHook(() => useChecklistHandlers(source, lifecycle));
  act(() => {
    result.current.handleToggleChecklistItem("item");
    result.current.handleToggleChecklistItem("second");
  });
  let refreshSettled = false;
  void mutate.mock.calls[0][1].waitForRefresh().then(() => {
    refreshSettled = true;
  });
  act(() => {
    mutate.mock.calls[1][1].onAuthLost();
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(refreshSettled).toBe(true);
  expect(result.current.days[0].checklists![0].items.map((item) => item.isChecked)).toEqual([false, false]);
});

it("creates an empty checklist at the requested position and resolves once the mutation settles", async () => {
  create.mockImplementation(async (_input, options) => options.onSuccess({ id: "created" }));
  const { result } = renderHook(() => useChecklistHandlers(days, lifecycle));
  await act(async () => {
    await expect(result.current.handleAddChecklist(1, 2)).resolves.toBeUndefined();
  });
  expect(create).toHaveBeenCalledWith({ params: { tripId }, body: { dayId: "day", position: 2 } }, expect.any(Object));
  expect(setNewlyCreatedChecklistId).not.toHaveBeenCalled();
});

it("creates a checklist with its first item in one request and expands the mapped checklist", async () => {
  create.mockImplementation(async (_input, options) => options.onSuccess({ id: "created" }));
  const { result } = renderHook(() => useChecklistHandlers(days, lifecycle));
  await act(async () => {
    await result.current.handleAddChecklist(1, 0, "Passport");
  });
  expect(create).toHaveBeenCalledOnce();
  expect(create.mock.calls[0][0]).toEqual({
    params: { tripId },
    body: { dayId: "day", position: 0, firstItem: { content: "Passport" } },
  });
  expect(setNewlyCreatedChecklistId).toHaveBeenCalledWith("created");
});

it("does nothing when the day is missing or has no id", async () => {
  const idless = [{ ...days[0], id: undefined }];
  const { result } = renderHook(() =>
    useChecklistHandlers([...days, ...idless.map((day) => ({ ...day, dayNumber: 2 }))], lifecycle)
  );
  await act(async () => {
    await result.current.handleAddChecklist(9, 0, "Passport");
    await result.current.handleAddChecklist(2, 0, "Passport");
  });
  expect(create).not.toHaveBeenCalled();
});

it.each([
  [
    "an API failure",
    (options: { onError: (error: unknown) => void }) => options.onError(new Error("Forbidden")),
    "Forbidden",
  ],
  [
    "a network failure",
    (options: { onError: (error: unknown) => void }) => options.onError("offline"),
    "Failed to add checklist",
  ],
  ["auth loss", (options: { onAuthLost: () => void }) => options.onAuthLost(), "session"],
])("rejects creation and never expands on %s", async (_label, fail, message) => {
  create.mockImplementation(async (_input, options) => fail(options));
  const { result } = renderHook(() => useChecklistHandlers(days, lifecycle));
  await act(async () => {
    await expect(result.current.handleAddChecklist(1, 0, "Passport")).rejects.toThrow(message);
  });
  expect(setNewlyCreatedChecklistId).not.toHaveBeenCalled();
});

it("rejects creation when the mutation never ran", async () => {
  const { result } = renderHook(() => useChecklistHandlers(days, lifecycle));
  await act(async () => {
    await expect(result.current.handleAddChecklist(1, 0)).rejects.toThrow("Failed to add checklist");
  });
});

it("patches a title and sends explicit null when the title is cleared", () => {
  const { result } = renderHook(() => useChecklistHandlers(days, lifecycle));
  act(() => {
    result.current.handleUpdateChecklistTitle("list", "Docs");
    result.current.handleUpdateChecklistTitle("list", undefined);
  });
  expect(title.mock.calls.map(([input]) => input)).toEqual([
    { params: { checklistId: "list" }, body: { title: "Docs" } },
    { params: { checklistId: "list" }, body: { title: null } },
  ]);
  expect(title.mock.calls.every(([, options]) => options.key === "list")).toBe(true);
});

it("deletes a checklist with the current trip context", () => {
  const { result } = renderHook(() => useChecklistHandlers(days, lifecycle));
  act(() => {
    result.current.handleDeleteChecklist("list");
  });
  expect(remove).toHaveBeenCalledWith(
    { params: { checklistId: "list" }, body: { tripId } },
    expect.objectContaining({ key: "list" })
  );
});

it("lets an in-flight rename finish before deleting the same checklist", async () => {
  let finishRename!: () => void;
  title.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finishRename = resolve;
    })
  );
  const { result } = renderHook(() => useChecklistHandlers(days, lifecycle));
  act(() => {
    result.current.handleUpdateChecklistTitle("list", "Docs");
    result.current.handleDeleteChecklist("list");
  });
  expect(remove).not.toHaveBeenCalled();
  await act(async () => {
    finishRename();
  });
  expect(remove).toHaveBeenCalledOnce();
});
