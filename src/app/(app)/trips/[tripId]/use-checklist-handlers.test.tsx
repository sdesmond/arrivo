import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { DayItinerary } from "@/data/types";
import { useChecklistHandlers } from "./use-checklist-handlers";
const { mutate, create, title, remove, createItem, removeItem } = vi.hoisted(() => ({
  mutate: vi.fn(),
  create: vi.fn(),
  title: vi.fn(),
  remove: vi.fn(),
  createItem: vi.fn(),
  removeItem: vi.fn(),
}));
vi.mock("@/lib/api/use-api-mutation", () => ({
  useApiMutation: (endpoint: { method: string; path: string }) => ({
    mutate: endpoint.path.includes("/items")
      ? createItem
      : endpoint.path.includes("checklist-items")
        ? endpoint.method === "DELETE"
          ? removeItem
          : mutate
        : endpoint.method === "POST"
          ? create
          : endpoint.method === "DELETE"
            ? remove
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
  for (const mock of [mutate, create, title, remove, createItem, removeItem, setNewlyCreatedChecklistId])
    mock.mockReset();
  for (const mock of [mutate, create, title, remove, createItem, removeItem]) mock.mockResolvedValue(undefined);
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

it("sends the draft's client ID as the checklist id, and none when no ID is given", async () => {
  create.mockImplementation(async (_input, options) => options.onSuccess({ id: "created" }));
  const { result } = renderHook(() => useChecklistHandlers(days, lifecycle));
  await act(async () => {
    await result.current.handleAddChecklist(1, 0, "Passport", "draft-id");
    await result.current.handleAddChecklist(1, 0, "Passport");
  });
  expect(create.mock.calls[0][0].body).toEqual({
    dayId: "day",
    position: 0,
    id: "draft-id",
    firstItem: { content: "Passport" },
  });
  expect(create.mock.calls[1][0].body).not.toHaveProperty("id");
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

function shownTitle(result: ReturnType<typeof useChecklistHandlers>) {
  return result.days[0].checklists?.[0].title;
}

it("shows a renamed title immediately and drops the overlay once the write settles", () => {
  const { result } = renderHook(() => useChecklistHandlers(days, lifecycle));
  act(() => {
    result.current.handleUpdateChecklistTitle("list", "Docs");
  });
  expect(shownTitle(result.current)).toBe("Docs");
  act(() => {
    title.mock.calls[0][1].onSettled();
  });
  expect(shownTitle(result.current)).toBeUndefined();
});

it("shows a cleared title immediately", () => {
  const titled = structuredClone(days);
  titled[0].checklists![0].title = "Docs";
  const { result } = renderHook(() => useChecklistHandlers(titled, lifecycle));
  act(() => {
    result.current.handleUpdateChecklistTitle("list", undefined);
  });
  expect(shownTitle(result.current)).toBeUndefined();
  expect(result.current.days[0].checklists![0]).not.toHaveProperty("title", "Docs");
});

it("keeps the refreshed title once props arrive and rolls back a failed rename", () => {
  const { result, rerender } = renderHook(({ source }) => useChecklistHandlers(source, lifecycle), {
    initialProps: { source: days },
  });
  act(() => {
    result.current.handleUpdateChecklistTitle("list", "Docs");
  });
  const refreshed = structuredClone(days);
  refreshed[0].checklists![0].title = "Docs";
  rerender({ source: refreshed });
  act(() => {
    title.mock.calls[0][1].onSettled();
  });
  expect(shownTitle(result.current)).toBe("Docs");
  act(() => {
    result.current.handleUpdateChecklistTitle("list", "Broken");
  });
  expect(shownTitle(result.current)).toBe("Broken");
  act(() => {
    title.mock.calls[1][1].onSettled();
  });
  expect(shownTitle(result.current)).toBe("Docs");
});

it("keeps the newest rename visible when an earlier write settles first", () => {
  const { result } = renderHook(() => useChecklistHandlers(days, lifecycle));
  act(() => {
    result.current.handleUpdateChecklistTitle("list", "First");
    result.current.handleUpdateChecklistTitle("list", "Second");
  });
  act(() => {
    title.mock.calls[0][1].onSettled();
  });
  expect(shownTitle(result.current)).toBe("Second");
  act(() => {
    title.mock.calls[1][1].onSettled();
  });
  expect(shownTitle(result.current)).toBeUndefined();
});

it("drops every title overlay on auth loss", () => {
  const { result } = renderHook(() => useChecklistHandlers(days, lifecycle));
  act(() => {
    result.current.handleUpdateChecklistTitle("list", "Docs");
  });
  act(() => {
    title.mock.calls[0][1].onAuthLost();
  });
  expect(shownTitle(result.current)).toBeUndefined();
});

function twoItemDays() {
  const source = structuredClone(days);
  source[0].checklists![0].items.push({ id: "second", checklistId: "list", content: "Second", isChecked: false });
  return source;
}
function shownItems(result: ReturnType<typeof useChecklistHandlers>) {
  return result.days[0].checklists![0].items;
}

it("adds an item through the create API, queued per checklist", () => {
  const { result } = renderHook(() => useChecklistHandlers(days, lifecycle));
  act(() => {
    result.current.handleAddChecklistItem("list", "Charger");
    result.current.handleAddChecklistItem("list", "Adapter");
  });
  expect(createItem.mock.calls.map(([input]) => input)).toEqual([
    { params: { checklistId: "list" }, body: { id: expect.any(String), content: "Charger" } },
    { params: { checklistId: "list" }, body: { id: expect.any(String), content: "Adapter" } },
  ]);
  expect(createItem.mock.calls[0][0].body.id).not.toBe(createItem.mock.calls[1][0].body.id);
  expect(createItem.mock.calls.every(([, options]) => options.key === "list")).toBe(true);
});

it("sends a content edit as a partial PATCH on the item queue and shows it immediately", () => {
  const { result } = renderHook(() => useChecklistHandlers(days, lifecycle));
  act(() => {
    result.current.handleUpdateChecklistItem("item", "Passport copy");
  });
  expect(mutate).toHaveBeenCalledWith(
    { params: { itemId: "item" }, body: { content: "Passport copy" } },
    expect.objectContaining({ key: "item" })
  );
  expect(shownItems(result.current)[0]).toMatchObject({ content: "Passport copy", isChecked: false });
});

it("ignores edits to missing items and edits that repeat the intended content", () => {
  const { result } = renderHook(() => useChecklistHandlers(days, lifecycle));
  act(() => {
    result.current.handleUpdateChecklistItem("missing", "Anything");
    result.current.handleUpdateChecklistItem("item", "Passport");
  });
  expect(mutate).not.toHaveBeenCalled();
  act(() => {
    result.current.handleUpdateChecklistItem("item", "Visa");
    result.current.handleUpdateChecklistItem("item", "Visa");
  });
  expect(mutate).toHaveBeenCalledOnce();
});

it("sends an edit back to the original text when the earlier edit is still in flight", () => {
  const { result } = renderHook(() => useChecklistHandlers(days, lifecycle));
  act(() => {
    result.current.handleUpdateChecklistItem("item", "Visa");
    result.current.handleUpdateChecklistItem("item", "Passport");
  });
  expect(mutate.mock.calls.map(([input]) => input.body)).toEqual([{ content: "Visa" }, { content: "Passport" }]);
  expect(shownItems(result.current)[0].content).toBe("Passport");
});

it("orders edit then check of one item on a single queue key without losing either intent", () => {
  const { result } = renderHook(() => useChecklistHandlers(days, lifecycle));
  act(() => {
    result.current.handleUpdateChecklistItem("item", "Visa");
    result.current.handleToggleChecklistItem("item");
  });
  expect(mutate.mock.calls.map(([input]) => input.body)).toEqual([{ content: "Visa" }, { isChecked: true }]);
  expect(mutate.mock.calls.every(([, options]) => options.key === "item")).toBe(true);
  expect(shownItems(result.current)[0]).toMatchObject({ content: "Visa", isChecked: true });
});

it("keeps the newest edit visible when an earlier write settles first, then drops overlays on settle", () => {
  const { result } = renderHook(() => useChecklistHandlers(days, lifecycle));
  act(() => {
    result.current.handleUpdateChecklistItem("item", "First");
    result.current.handleUpdateChecklistItem("item", "Second");
  });
  act(() => {
    mutate.mock.calls[0][1].onSettled();
  });
  expect(shownItems(result.current)[0].content).toBe("Second");
  act(() => {
    mutate.mock.calls[1][1].onSettled();
  });
  expect(shownItems(result.current)[0].content).toBe("Passport");
});

it("keeps refreshed content after the write settles and rolls back a failed edit", () => {
  const { result, rerender } = renderHook(({ source }) => useChecklistHandlers(source, lifecycle), {
    initialProps: { source: days },
  });
  act(() => {
    result.current.handleUpdateChecklistItem("item", "Visa");
  });
  const refreshed = structuredClone(days);
  refreshed[0].checklists![0].items[0].content = "Visa";
  rerender({ source: refreshed });
  act(() => {
    mutate.mock.calls[0][1].onSettled();
  });
  expect(shownItems(result.current)[0].content).toBe("Visa");
  act(() => {
    result.current.handleUpdateChecklistItem("item", "Broken");
  });
  act(() => {
    mutate.mock.calls[1][1].onSettled();
  });
  expect(shownItems(result.current)[0].content).toBe("Visa");
});

it("holds an edit refresh acknowledgment until refreshed props show the new content", async () => {
  const { result, rerender } = renderHook(({ source }) => useChecklistHandlers(source, lifecycle), {
    initialProps: { source: days },
  });
  act(() => {
    result.current.handleUpdateChecklistItem("item", "Visa");
  });
  let settled = false;
  void mutate.mock.calls[0][1].waitForRefresh().then(() => {
    settled = true;
  });
  rerender({ source: structuredClone(days) });
  await act(async () => {
    await Promise.resolve();
  });
  expect(settled).toBe(false);
  const refreshed = structuredClone(days);
  refreshed[0].checklists![0].items[0].content = "Visa";
  rerender({ source: refreshed });
  await act(async () => {
    await Promise.resolve();
  });
  expect(settled).toBe(true);
});

it("hides a deleted item immediately and sends the trip context", () => {
  const { result } = renderHook(() => useChecklistHandlers(twoItemDays(), lifecycle));
  act(() => {
    result.current.handleDeleteChecklistItem("item");
  });
  expect(shownItems(result.current).map((item) => item.id)).toEqual(["second"]);
  expect(removeItem).toHaveBeenCalledWith(
    { params: { itemId: "item" }, body: { tripId } },
    expect.objectContaining({ key: "item" })
  );
});

it("restores a deleted item when the delete fails", () => {
  const { result } = renderHook(() => useChecklistHandlers(twoItemDays(), lifecycle));
  act(() => {
    result.current.handleDeleteChecklistItem("item");
  });
  act(() => {
    removeItem.mock.calls[0][1].onSettled();
  });
  expect(shownItems(result.current).map((item) => item.id)).toEqual(["item", "second"]);
});

it("acknowledges a delete only when refreshed props no longer contain the item", async () => {
  const source = twoItemDays();
  const { result, rerender } = renderHook(({ sourceDays }) => useChecklistHandlers(sourceDays, lifecycle), {
    initialProps: { sourceDays: source },
  });
  act(() => {
    result.current.handleDeleteChecklistItem("item");
  });
  let settled = false;
  void removeItem.mock.calls[0][1].waitForRefresh().then(() => {
    settled = true;
  });
  rerender({ sourceDays: structuredClone(source) });
  await act(async () => {
    await Promise.resolve();
  });
  expect(settled).toBe(false);
  const refreshed = structuredClone(source);
  refreshed[0].checklists![0].items.shift();
  rerender({ sourceDays: refreshed });
  await act(async () => {
    await Promise.resolve();
  });
  expect(settled).toBe(true);
});

it("lets an in-flight edit land before deleting the same item", async () => {
  let finishWrite!: () => void;
  mutate.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finishWrite = resolve;
    })
  );
  const { result } = renderHook(() => useChecklistHandlers(days, lifecycle));
  act(() => {
    result.current.handleUpdateChecklistItem("item", "Visa");
    result.current.handleDeleteChecklistItem("item");
  });
  expect(removeItem).not.toHaveBeenCalled();
  expect(shownItems(result.current)).toEqual([]);
  await act(async () => {
    finishWrite();
  });
  expect(removeItem).toHaveBeenCalledOnce();
});

it("does not block independent items on another pending write or delete", () => {
  const { result } = renderHook(() => useChecklistHandlers(twoItemDays(), lifecycle));
  mutate.mockReturnValueOnce(new Promise<void>(() => {}));
  act(() => {
    result.current.handleUpdateChecklistItem("item", "Visa");
    result.current.handleToggleChecklistItem("second");
    result.current.handleDeleteChecklistItem("second");
  });
  expect(mutate.mock.calls.map(([input]) => input.params.itemId)).toEqual(["item", "second"]);
  expect(shownItems(result.current)).toMatchObject([{ id: "item", content: "Visa" }]);
});

it("lets pending item adds and edits land before deleting their checklist", async () => {
  let finishCreate!: () => void;
  let finishEdit!: () => void;
  createItem.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finishCreate = resolve;
    })
  );
  mutate.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finishEdit = resolve;
    })
  );
  const { result } = renderHook(() => useChecklistHandlers(days, lifecycle));
  act(() => {
    result.current.handleAddChecklistItem("list", "Charger");
    result.current.handleUpdateChecklistItem("item", "Visa");
    result.current.handleDeleteChecklist("list");
  });
  expect(remove).not.toHaveBeenCalled();
  await act(async () => {
    finishCreate();
  });
  expect(remove).not.toHaveBeenCalled();
  await act(async () => {
    finishEdit();
  });
  expect(remove).toHaveBeenCalledOnce();
});

it("deletes at once when earlier item writes have already settled", async () => {
  const { result } = renderHook(() => useChecklistHandlers(days, lifecycle));
  await act(async () => {
    result.current.handleUpdateChecklistItem("item", "Visa");
  });
  act(() => {
    result.current.handleDeleteChecklistItem("item");
  });
  expect(removeItem).toHaveBeenCalledOnce();
});

it("keeps waiting on the newest item write when an older one settles first", async () => {
  let finishFirst!: () => void;
  let finishSecond!: () => void;
  mutate
    .mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishFirst = resolve;
      })
    )
    .mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishSecond = resolve;
      })
    );
  const { result } = renderHook(() => useChecklistHandlers(days, lifecycle));
  act(() => {
    result.current.handleUpdateChecklistItem("item", "Visa");
    result.current.handleUpdateChecklistItem("item", "Docs");
  });
  await act(async () => {
    finishFirst();
  });
  act(() => {
    result.current.handleDeleteChecklistItem("item");
  });
  expect(removeItem).not.toHaveBeenCalled();
  await act(async () => {
    finishSecond();
  });
  expect(removeItem).toHaveBeenCalledOnce();
});

it("deletes a checklist at once when its renames and item adds have already settled", async () => {
  const { result } = renderHook(() => useChecklistHandlers(days, lifecycle));
  await act(async () => {
    result.current.handleAddChecklistItem("list", "Charger");
    result.current.handleUpdateChecklistTitle("list", "Docs");
  });
  act(() => {
    result.current.handleDeleteChecklist("list");
  });
  expect(remove).toHaveBeenCalledOnce();
});

it("keeps a checklist delete waiting on the newest rename when an older one settles first", async () => {
  let finishFirst!: () => void;
  let finishSecond!: () => void;
  title
    .mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishFirst = resolve;
      })
    )
    .mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishSecond = resolve;
      })
    );
  const { result } = renderHook(() => useChecklistHandlers(days, lifecycle));
  act(() => {
    result.current.handleUpdateChecklistTitle("list", "Docs");
    result.current.handleUpdateChecklistTitle("list", "Papers");
  });
  await act(async () => {
    finishFirst();
  });
  act(() => {
    result.current.handleDeleteChecklist("list");
  });
  expect(remove).not.toHaveBeenCalled();
  await act(async () => {
    finishSecond();
  });
  expect(remove).toHaveBeenCalledOnce();
});

it("clears content and delete overlays and acknowledgments on auth loss", async () => {
  const { result } = renderHook(() => useChecklistHandlers(twoItemDays(), lifecycle));
  act(() => {
    result.current.handleUpdateChecklistItem("item", "Visa");
    result.current.handleDeleteChecklistItem("second");
  });
  let refreshSettled = false;
  void mutate.mock.calls[0][1].waitForRefresh().then(() => {
    refreshSettled = true;
  });
  act(() => {
    removeItem.mock.calls[0][1].onAuthLost();
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(refreshSettled).toBe(true);
  expect(shownItems(result.current)).toMatchObject([
    { id: "item", content: "Passport" },
    { id: "second", content: "Second" },
  ]);
});
