import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { DayItinerary } from "@/data/types";
import { useChecklistHandlers } from "./use-checklist-handlers";
const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("@/lib/api/use-api-mutation", () => ({ useApiMutation: () => ({ mutate }) }));
const days: DayItinerary[] = [
  {
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
  mutate.mockReset();
});
function checked(result: ReturnType<typeof useChecklistHandlers>) {
  return result.days[0].checklists?.[0].items[0].isChecked;
}
it("derives rapid absolute writes from intended state even before React rerenders", () => {
  const { result } = renderHook(() => useChecklistHandlers(days));
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
  const { result, rerender } = renderHook(({ source }) => useChecklistHandlers(source), {
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
  const { result, rerender } = renderHook(({ source }) => useChecklistHandlers(source), {
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
  const { result } = renderHook(() => useChecklistHandlers(days));
  act(() => {
    result.current.handleToggleChecklistItem("missing");
  });
  expect(mutate).not.toHaveBeenCalled();
});

it("keeps newer intent while an earlier successful refresh delivers stale props", () => {
  const { result, rerender } = renderHook(({ source }) => useChecklistHandlers(source), {
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
  const { result, rerender } = renderHook(({ sourceDays }) => useChecklistHandlers(sourceDays), {
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
  const { result, rerender } = renderHook(({ source }) => useChecklistHandlers(source), {
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
  const { result } = renderHook(() => useChecklistHandlers(source));
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
