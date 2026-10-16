import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ItineraryItemType, type TripEvent } from "@/data/types";
import type { TimelineItem } from "./day-card-dnd";
import { useDayDraft, type UseDayDraftOptions } from "./use-day-draft";

function buildEvent(overrides: Partial<TripEvent> = {}): TripEvent {
  return { id: "event-1", name: "Museum", position: 0, ...overrides };
}

function buildOptions(overrides: Partial<UseDayDraftOptions> = {}): UseDayDraftOptions {
  return {
    dayNumber: 1,
    timelineItems: [],
    propTimelineItemCount: 0,
    ...overrides,
  };
}

describe("useDayDraft", () => {
  it("openGap sets openGapKey and clears any in-progress draft", () => {
    const { result } = renderHook(() => useDayDraft(buildOptions()));

    act(() => result.current.activateDraft(ItineraryItemType.Note, 0, "bottom"));
    expect(result.current.draft).toEqual({ kind: ItineraryItemType.Note, insertAtPosition: 0, gapKey: "bottom" });

    act(() => result.current.openGap("gap-0"));
    expect(result.current.openGapKey).toBe("gap-0");
    expect(result.current.draft).toBeNull();
  });

  it("activateDraft sets the draft and closes any open gap", () => {
    const { result } = renderHook(() => useDayDraft(buildOptions()));

    act(() => result.current.openGap("gap-0"));
    act(() => result.current.activateDraft(ItineraryItemType.Event, 2, "gap-1"));

    expect(result.current.openGapKey).toBeNull();
    expect(result.current.draft).toEqual({ kind: ItineraryItemType.Event, insertAtPosition: 2, gapKey: "gap-1" });
  });

  it("closeGap clears openGapKey without touching the draft", () => {
    const { result } = renderHook(() => useDayDraft(buildOptions()));

    act(() => result.current.openGap("gap-0"));
    expect(result.current.openGapKey).toBe("gap-0");

    act(() => result.current.closeGap());
    expect(result.current.openGapKey).toBeNull();
  });

  it("cancelDraft clears the draft", () => {
    const { result } = renderHook(() => useDayDraft(buildOptions()));

    act(() => result.current.activateDraft(ItineraryItemType.Note, 0, "bottom"));
    expect(result.current.draft).not.toBeNull();

    act(() => result.current.cancelDraft());
    expect(result.current.draft).toBeNull();
  });

  it("commitDraft is a no-op when there is no active draft", async () => {
    const onAddNote = vi.fn();
    const { result } = renderHook(() => useDayDraft(buildOptions({ onAddNote })));

    await act(async () => result.current.commitDraft("content"));

    expect(onAddNote).not.toHaveBeenCalled();
  });

  it("commitDraft routes a note draft through onAddNote", async () => {
    const onAddNote = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useDayDraft(buildOptions({ dayNumber: 3, onAddNote })));

    act(() => result.current.activateDraft(ItineraryItemType.Note, 5, "bottom"));
    await act(async () => result.current.commitDraft("Bring sunscreen"));

    expect(onAddNote).toHaveBeenCalledWith(3, "Bring sunscreen", 5);
  });

  it("commitDraft routes a checklist draft through onAddChecklist, treating empty content as no first item", async () => {
    const onAddChecklist = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useDayDraft(buildOptions({ dayNumber: 2, onAddChecklist })));

    act(() => result.current.activateDraft(ItineraryItemType.Checklist, 1, "bottom"));
    await act(async () => result.current.commitDraft(""));

    expect(onAddChecklist).toHaveBeenCalledWith(2, 1, undefined);
  });

  it("commitDraft routes an event draft after the preceding event when the gap follows a plain event", async () => {
    const onAddEvent = vi.fn().mockResolvedValue(undefined);
    const timelineItems: TimelineItem[] = [{ kind: "event", data: buildEvent({ id: "event-1" }), position: 0 }];
    const { result } = renderHook(() => useDayDraft(buildOptions({ timelineItems, onAddEvent })));

    act(() => result.current.activateDraft(ItineraryItemType.Event, 1, "gap-0"));
    await act(async () => result.current.commitDraft("Cafe"));

    expect(onAddEvent).toHaveBeenCalledWith(1, "Cafe", "event-1");
  });

  it("commitDraft falls back to insertAtPosition when the preceding item is a linked event", async () => {
    const onAddEvent = vi.fn().mockResolvedValue(undefined);
    const timelineItems: TimelineItem[] = [
      { kind: "event", data: buildEvent({ id: "linked-1", linkedReservationId: "reservation-1" }), position: 0 },
    ];
    const { result } = renderHook(() => useDayDraft(buildOptions({ timelineItems, onAddEvent })));

    act(() => result.current.activateDraft(ItineraryItemType.Event, 1, "gap-0"));
    await act(async () => result.current.commitDraft("Snack"));

    expect(onAddEvent).toHaveBeenCalledWith(1, "Snack", undefined, 1);
  });

  it("commitDraft falls back to insertAtPosition for a bottom-gap event draft", async () => {
    const onAddEvent = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useDayDraft(buildOptions({ onAddEvent })));

    act(() => result.current.activateDraft(ItineraryItemType.Event, 3, "bottom"));
    await act(async () => result.current.commitDraft("Dinner"));

    expect(onAddEvent).toHaveBeenCalledWith(1, "Dinner", undefined, 3);
  });

  it("keeps the draft open when the commit rejects, so the user can retry", async () => {
    const onAddNote = vi.fn().mockRejectedValueOnce(new Error("failed"));
    const { result } = renderHook(() => useDayDraft(buildOptions({ onAddNote })));

    act(() => result.current.activateDraft(ItineraryItemType.Note, 0, "bottom"));
    await act(async () => result.current.commitDraft("content"));

    expect(result.current.draft).not.toBeNull();
  });

  it("clears the draft once propTimelineItemCount grows past the baseline captured at commit time", async () => {
    const onAddNote = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook((options: UseDayDraftOptions) => useDayDraft(options), {
      initialProps: buildOptions({ propTimelineItemCount: 1, onAddNote }),
    });

    act(() => result.current.activateDraft(ItineraryItemType.Note, 1, "bottom"));
    await act(async () => result.current.commitDraft("content"));
    expect(result.current.draft).not.toBeNull();

    rerender(buildOptions({ propTimelineItemCount: 2, onAddNote }));
    expect(result.current.draft).toBeNull();
  });

  it("makeGapProps reflects active gap state and wires selection/dismiss/packing callbacks", () => {
    const onOpenPackingListPicker = vi.fn();
    const { result } = renderHook(() => useDayDraft(buildOptions({ onOpenPackingListPicker })));

    act(() => result.current.openGap("gap-0"));
    const activeProps = result.current.makeGapProps("gap-0", 2);
    expect(activeProps.isActive).toBe(true);

    act(() => activeProps.onSelectType(ItineraryItemType.Note));
    expect(result.current.draft).toEqual({ kind: ItineraryItemType.Note, insertAtPosition: 2, gapKey: "gap-0" });

    const inactiveProps = result.current.makeGapProps("gap-1", 4);
    expect(inactiveProps.isActive).toBe(false);

    act(() => inactiveProps.onDismiss());
    expect(result.current.openGapKey).toBeNull();

    inactiveProps.onOpenPackingListPicker?.();
    expect(onOpenPackingListPicker).toHaveBeenCalledWith(4);
  });

  it("makeGapProps.onOpen is a no-op while a draft is already active, but opens the gap otherwise", () => {
    const { result } = renderHook(() => useDayDraft(buildOptions()));

    act(() => result.current.activateDraft(ItineraryItemType.Note, 0, "bottom"));
    const propsWhileDrafting = result.current.makeGapProps("gap-0", 1);
    act(() => propsWhileDrafting.onOpen());
    expect(result.current.openGapKey).toBeNull();

    act(() => result.current.cancelDraft());
    const propsWithoutDraft = result.current.makeGapProps("gap-0", 1);
    act(() => propsWithoutDraft.onOpen());
    expect(result.current.openGapKey).toBe("gap-0");
  });

  it("makeGapProps omits onOpenPackingListPicker when not provided", () => {
    const { result } = renderHook(() => useDayDraft(buildOptions()));

    const props = result.current.makeGapProps("gap-0", 0);
    expect(props.onOpenPackingListPicker).toBeUndefined();
  });
});
