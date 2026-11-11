import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ItineraryItemType, type TripEvent } from "@/data/types";
import { ApiClientError } from "@/lib/api/client";
import type { TimelineItem } from "./day-card-dnd";
import { useDayDraft, type UseDayDraftOptions } from "./use-day-draft";

function buildEvent(overrides: Partial<TripEvent> = {}): TripEvent {
  return { id: "event-1", name: "Museum", position: 0, ...overrides };
}

function buildOptions(overrides: Partial<UseDayDraftOptions> = {}): UseDayDraftOptions {
  return {
    dayNumber: 1,
    timelineItems: [],
    propTimelineItemIds: [],
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

    expect(onAddNote).toHaveBeenCalledWith(3, "Bring sunscreen", 5, expect.any(String));
  });

  it("commitDraft routes a checklist draft through onAddChecklist, treating empty content as no first item", async () => {
    const onAddChecklist = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useDayDraft(buildOptions({ dayNumber: 2, onAddChecklist })));

    act(() => result.current.activateDraft(ItineraryItemType.Checklist, 1, "bottom"));
    await act(async () => result.current.commitDraft(""));

    expect(onAddChecklist).toHaveBeenCalledWith(2, 1, undefined, expect.any(String));
  });

  it("commitDraft routes an event draft after the preceding event when the gap follows a plain event", async () => {
    const onAddEvent = vi.fn().mockResolvedValue(undefined);
    const timelineItems: TimelineItem[] = [{ kind: "event", data: buildEvent({ id: "event-1" }), position: 0 }];
    const { result } = renderHook(() => useDayDraft(buildOptions({ timelineItems, onAddEvent })));

    act(() => result.current.activateDraft(ItineraryItemType.Event, 1, "gap-0"));
    await act(async () => result.current.commitDraft("Cafe"));

    expect(onAddEvent).toHaveBeenCalledWith(1, "Cafe", "event-1", undefined, expect.any(String));
  });

  it("commitDraft falls back to insertAtPosition when the preceding item is a linked event", async () => {
    const onAddEvent = vi.fn().mockResolvedValue(undefined);
    const timelineItems: TimelineItem[] = [
      { kind: "event", data: buildEvent({ id: "linked-1", linkedReservationId: "reservation-1" }), position: 0 },
    ];
    const { result } = renderHook(() => useDayDraft(buildOptions({ timelineItems, onAddEvent })));

    act(() => result.current.activateDraft(ItineraryItemType.Event, 1, "gap-0"));
    await act(async () => result.current.commitDraft("Snack"));

    expect(onAddEvent).toHaveBeenCalledWith(1, "Snack", undefined, 1, expect.any(String));
  });

  it("commitDraft falls back to insertAtPosition for a bottom-gap event draft", async () => {
    const onAddEvent = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useDayDraft(buildOptions({ onAddEvent })));

    act(() => result.current.activateDraft(ItineraryItemType.Event, 3, "bottom"));
    await act(async () => result.current.commitDraft("Dinner"));

    expect(onAddEvent).toHaveBeenCalledWith(1, "Dinner", undefined, 3, expect.any(String));
  });

  it("keeps the draft open when the commit rejects, so the user can retry", async () => {
    const onAddNote = vi.fn().mockRejectedValueOnce(new Error("failed"));
    const { result } = renderHook(() => useDayDraft(buildOptions({ onAddNote })));

    act(() => result.current.activateDraft(ItineraryItemType.Note, 0, "bottom"));
    await act(async () => result.current.commitDraft("content"));

    expect(result.current.draft).not.toBeNull();
  });

  it("submits a draft once when commit is called again while the first call is in flight", async () => {
    let resolveAdd: () => void = () => {};
    const onAddNote = vi.fn().mockReturnValue(new Promise<void>((resolve) => (resolveAdd = resolve)));
    const { result } = renderHook(() => useDayDraft(buildOptions({ onAddNote })));

    act(() => result.current.activateDraft(ItineraryItemType.Note, 0, "bottom"));
    await act(async () => {
      const first = result.current.commitDraft("content");
      const second = result.current.commitDraft("content");
      resolveAdd();
      await Promise.all([first, second]);
    });

    expect(onAddNote).toHaveBeenCalledTimes(1);
  });

  it("submits a draft once when commit is called again after it resolved but before the refreshed day lands", async () => {
    const onAddNote = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useDayDraft(buildOptions({ onAddNote })));

    act(() => result.current.activateDraft(ItineraryItemType.Note, 0, "bottom"));
    await act(async () => result.current.commitDraft("content"));
    await act(async () => result.current.commitDraft("content"));

    expect(onAddNote).toHaveBeenCalledTimes(1);
  });

  it("allows a retry after a rejected commit and after a new draft is activated", async () => {
    const onAddNote = vi.fn().mockRejectedValueOnce(new Error("failed")).mockResolvedValue(undefined);
    const { result } = renderHook(() => useDayDraft(buildOptions({ onAddNote })));

    act(() => result.current.activateDraft(ItineraryItemType.Note, 0, "bottom"));
    await act(async () => result.current.commitDraft("content"));
    await act(async () => result.current.commitDraft("content"));
    expect(onAddNote).toHaveBeenCalledTimes(2);

    act(() => result.current.cancelDraft());
    act(() => result.current.activateDraft(ItineraryItemType.Note, 0, "bottom"));
    await act(async () => result.current.commitDraft("next"));
    expect(onAddNote).toHaveBeenCalledTimes(3);
  });

  it("clears the draft once the timeline grows past the baseline captured at commit time", async () => {
    const onAddNote = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook((options: UseDayDraftOptions) => useDayDraft(options), {
      initialProps: buildOptions({ propTimelineItemIds: ["a"], onAddNote }),
    });

    act(() => result.current.activateDraft(ItineraryItemType.Note, 1, "bottom"));
    await act(async () => result.current.commitDraft("content"));
    expect(result.current.draft).not.toBeNull();

    rerender(buildOptions({ propTimelineItemIds: ["a", "b"], onAddNote }));
    expect(result.current.draft).toBeNull();
  });

  it("clears the draft when its own ID appears even if the timeline did not grow", async () => {
    const onAddChecklist = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook((options: UseDayDraftOptions) => useDayDraft(options), {
      initialProps: buildOptions({ propTimelineItemIds: ["a", "b"], onAddChecklist }),
    });

    act(() => result.current.activateDraft(ItineraryItemType.Checklist, 1, "bottom"));
    await act(async () => result.current.commitDraft("x"));
    const draftId = onAddChecklist.mock.calls[0][3];

    rerender(buildOptions({ propTimelineItemIds: ["a", draftId], onAddChecklist }));
    expect(result.current.draft).toBeNull();
  });

  it("clears the draft when its own ID is already in the timeline once the commit resolves", async () => {
    let draftId = "";
    const { result, rerender } = renderHook((options: UseDayDraftOptions) => useDayDraft(options), {
      initialProps: buildOptions({ propTimelineItemIds: ["a"] }),
    });
    const onAddChecklist = vi.fn().mockImplementation(async (...args: unknown[]) => {
      draftId = args[3] as string;
      rerender(buildOptions({ propTimelineItemIds: ["a", draftId], onAddChecklist }));
    });
    rerender(buildOptions({ propTimelineItemIds: ["a"], onAddChecklist }));

    act(() => result.current.activateDraft(ItineraryItemType.Checklist, 1, "bottom"));
    await act(async () => result.current.commitDraft("x"));

    expect(result.current.draft).toBeNull();
  });

  it("sends one ID per checklist draft across a rejected commit and a repeat commit", async () => {
    const onAddChecklist = vi.fn().mockRejectedValueOnce(new Error("failed")).mockResolvedValue(undefined);
    const { result } = renderHook(() => useDayDraft(buildOptions({ onAddChecklist })));

    act(() => result.current.activateDraft(ItineraryItemType.Checklist, 1, "bottom"));
    await act(async () => result.current.commitDraft("x"));
    await act(async () => result.current.commitDraft("x"));

    expect(onAddChecklist).toHaveBeenCalledTimes(2);
    expect(onAddChecklist.mock.calls[1][3]).toBe(onAddChecklist.mock.calls[0][3]);
  });

  it("re-arms a committed draft when the day changes without growing, and reuses its ID", async () => {
    const onAddChecklist = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook((options: UseDayDraftOptions) => useDayDraft(options), {
      initialProps: buildOptions({ propTimelineItemIds: ["a", "b"], onAddChecklist }),
    });

    act(() => result.current.activateDraft(ItineraryItemType.Checklist, 1, "bottom"));
    await act(async () => result.current.commitDraft("x"));
    await act(async () => result.current.commitDraft("x"));
    expect(onAddChecklist).toHaveBeenCalledTimes(1);

    rerender(buildOptions({ propTimelineItemIds: ["a"], onAddChecklist }));
    expect(result.current.draft).not.toBeNull();
    await act(async () => result.current.commitDraft("x"));

    expect(onAddChecklist).toHaveBeenCalledTimes(2);
    expect(onAddChecklist.mock.calls[1][3]).toBe(onAddChecklist.mock.calls[0][3]);
  });

  it("re-arms a committed note draft when the day changes without growing, and reuses its ID", async () => {
    const onAddNote = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook((options: UseDayDraftOptions) => useDayDraft(options), {
      initialProps: buildOptions({ propTimelineItemIds: ["a", "b"], onAddNote }),
    });

    act(() => result.current.activateDraft(ItineraryItemType.Note, 1, "bottom"));
    await act(async () => result.current.commitDraft("x"));
    await act(async () => result.current.commitDraft("x"));
    expect(onAddNote).toHaveBeenCalledTimes(1);

    rerender(buildOptions({ propTimelineItemIds: ["a"], onAddNote }));
    expect(result.current.draft).not.toBeNull();
    await act(async () => result.current.commitDraft("x"));

    expect(onAddNote).toHaveBeenCalledTimes(2);
    expect(onAddNote.mock.calls[1][3]).toBe(onAddNote.mock.calls[0][3]);
  });

  it("sends one ID per note draft across a rejected commit and a repeat commit", async () => {
    const onAddNote = vi.fn().mockRejectedValueOnce(new Error("failed")).mockResolvedValue(undefined);
    const { result } = renderHook(() => useDayDraft(buildOptions({ onAddNote })));

    act(() => result.current.activateDraft(ItineraryItemType.Note, 1, "bottom"));
    await act(async () => result.current.commitDraft("x"));
    await act(async () => result.current.commitDraft("x"));

    expect(onAddNote).toHaveBeenCalledTimes(2);
    expect(onAddNote.mock.calls[0][3]).toEqual(expect.any(String));
    expect(onAddNote.mock.calls[1][3]).toBe(onAddNote.mock.calls[0][3]);
  });

  it("clears a note draft when its own ID lands even though the commit rejected (lost response)", async () => {
    const onAddNote = vi.fn().mockRejectedValue(new Error("timed out"));
    const { result, rerender } = renderHook((options: UseDayDraftOptions) => useDayDraft(options), {
      initialProps: buildOptions({ propTimelineItemIds: ["a"], onAddNote }),
    });

    act(() => result.current.activateDraft(ItineraryItemType.Note, 1, "bottom"));
    await act(async () => result.current.commitDraft("x"));
    expect(result.current.draft).not.toBeNull();

    rerender(buildOptions({ propTimelineItemIds: ["a", onAddNote.mock.calls[0][3]], onAddNote }));
    expect(result.current.draft).toBeNull();
  });

  it("clears the draft when its own ID lands even though the commit rejected (lost response)", async () => {
    const onAddChecklist = vi.fn().mockRejectedValue(new Error("timed out"));
    const { result, rerender } = renderHook((options: UseDayDraftOptions) => useDayDraft(options), {
      initialProps: buildOptions({ propTimelineItemIds: ["a"], onAddChecklist }),
    });

    act(() => result.current.activateDraft(ItineraryItemType.Checklist, 1, "bottom"));
    await act(async () => result.current.commitDraft("x"));
    expect(result.current.draft).not.toBeNull();
    const draftId = onAddChecklist.mock.calls[0][3];

    rerender(buildOptions({ propTimelineItemIds: ["a", draftId], onAddChecklist }));
    expect(result.current.draft).toBeNull();
  });

  it("clears a re-armed draft when its own ID lands later", async () => {
    const onAddChecklist = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook((options: UseDayDraftOptions) => useDayDraft(options), {
      initialProps: buildOptions({ propTimelineItemIds: ["a", "b"], onAddChecklist }),
    });

    act(() => result.current.activateDraft(ItineraryItemType.Checklist, 1, "bottom"));
    await act(async () => result.current.commitDraft("x"));
    const draftId = onAddChecklist.mock.calls[0][3];
    rerender(buildOptions({ propTimelineItemIds: ["a"], onAddChecklist }));
    expect(result.current.draft).not.toBeNull();

    rerender(buildOptions({ propTimelineItemIds: ["a", draftId], onAddChecklist }));
    expect(result.current.draft).toBeNull();
  });

  it("keeps a committed draft armed against commits while the timeline signature is unchanged", async () => {
    const onAddChecklist = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook((options: UseDayDraftOptions) => useDayDraft(options), {
      initialProps: buildOptions({ propTimelineItemIds: ["a"], onAddChecklist }),
    });

    act(() => result.current.activateDraft(ItineraryItemType.Checklist, 1, "bottom"));
    await act(async () => result.current.commitDraft("x"));
    rerender(buildOptions({ propTimelineItemIds: ["a"], onAddChecklist }));
    await act(async () => result.current.commitDraft("x"));

    expect(onAddChecklist).toHaveBeenCalledTimes(1);
  });

  it("sends one ID per event draft across a rejected commit and a repeat commit", async () => {
    const onAddEvent = vi.fn().mockRejectedValueOnce(new Error("failed")).mockResolvedValue(undefined);
    const { result } = renderHook(() => useDayDraft(buildOptions({ onAddEvent })));

    act(() => result.current.activateDraft(ItineraryItemType.Event, 1, "bottom"));
    await act(async () => result.current.commitDraft("Cafe"));
    await act(async () => result.current.commitDraft("Cafe"));

    expect(onAddEvent).toHaveBeenCalledTimes(2);
    expect(onAddEvent.mock.calls[0][4]).toEqual(expect.any(String));
    expect(onAddEvent.mock.calls[1][4]).toBe(onAddEvent.mock.calls[0][4]);
  });

  it("clears an event draft when its own ID lands even though the commit rejected (lost response)", async () => {
    const onAddEvent = vi.fn().mockRejectedValue(new Error("timed out"));
    const { result, rerender } = renderHook((options: UseDayDraftOptions) => useDayDraft(options), {
      initialProps: buildOptions({ propTimelineItemIds: ["a"], onAddEvent }),
    });

    act(() => result.current.activateDraft(ItineraryItemType.Event, 1, "bottom"));
    await act(async () => result.current.commitDraft("Cafe"));
    expect(result.current.draft).not.toBeNull();
    const draftId = onAddEvent.mock.calls[0][4];

    rerender(buildOptions({ propTimelineItemIds: ["a", draftId], onAddEvent }));
    expect(result.current.draft).toBeNull();
  });

  it("re-arms a committed event draft when the day changes without growing, and reuses its ID", async () => {
    const onAddEvent = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook((options: UseDayDraftOptions) => useDayDraft(options), {
      initialProps: buildOptions({ propTimelineItemIds: ["a", "b"], onAddEvent }),
    });

    act(() => result.current.activateDraft(ItineraryItemType.Event, 1, "bottom"));
    await act(async () => result.current.commitDraft("Cafe"));
    await act(async () => result.current.commitDraft("Cafe"));
    expect(onAddEvent).toHaveBeenCalledTimes(1);

    rerender(buildOptions({ propTimelineItemIds: ["a"], onAddEvent }));
    expect(result.current.draft).not.toBeNull();
    await act(async () => result.current.commitDraft("Cafe"));

    expect(onAddEvent).toHaveBeenCalledTimes(2);
    expect(onAddEvent.mock.calls[1][4]).toBe(onAddEvent.mock.calls[0][4]);
  });

  it("mints a new event ID for each new event draft", async () => {
    const onAddEvent = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useDayDraft(buildOptions({ onAddEvent })));

    act(() => result.current.activateDraft(ItineraryItemType.Event, 1, "bottom"));
    await act(async () => result.current.commitDraft("Cafe"));
    act(() => result.current.cancelDraft());
    act(() => result.current.activateDraft(ItineraryItemType.Event, 1, "bottom"));
    await act(async () => result.current.commitDraft("Bar"));

    expect(onAddEvent.mock.calls[1][4]).not.toBe(onAddEvent.mock.calls[0][4]);
  });

  it.each([
    ["event", ItineraryItemType.Event, "onAddEvent", 4],
    ["checklist", ItineraryItemType.Checklist, "onAddChecklist", 3],
    ["note", ItineraryItemType.Note, "onAddNote", 3],
  ] as const)(
    "mints a new %s ID after a conflict, so an edited retry is not stuck on a 409",
    async (_name, kind, handler, idIndex) => {
      const onAdd = vi
        .fn()
        .mockRejectedValueOnce(new ApiClientError(409, "conflict", "This ID was already used."))
        .mockResolvedValue(undefined);
      const { result } = renderHook(() => useDayDraft(buildOptions({ [handler]: onAdd })));

      act(() => result.current.activateDraft(kind, 1, "bottom"));
      await act(async () => result.current.commitDraft("first"));
      await act(async () => result.current.commitDraft("edited"));

      expect(onAdd).toHaveBeenCalledTimes(2);
      expect(onAdd.mock.calls[1][idIndex]).toEqual(expect.any(String));
      expect(onAdd.mock.calls[1][idIndex]).not.toBe(onAdd.mock.calls[0][idIndex]);
    }
  );

  it("keeps the ID after a rejection that is not a conflict", async () => {
    const onAddEvent = vi
      .fn()
      .mockRejectedValueOnce(new ApiClientError(500, "server_error", "boom"))
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => useDayDraft(buildOptions({ onAddEvent })));

    act(() => result.current.activateDraft(ItineraryItemType.Event, 1, "bottom"));
    await act(async () => result.current.commitDraft("a"));
    await act(async () => result.current.commitDraft("a"));
    await act(async () => result.current.commitDraft("a"));

    expect(onAddEvent.mock.calls[1][4]).toBe(onAddEvent.mock.calls[0][4]);
    expect(onAddEvent.mock.calls[2][4]).toBe(onAddEvent.mock.calls[0][4]);
  });

  it("mints a new ID after cancel and for each new draft", async () => {
    const onAddChecklist = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useDayDraft(buildOptions({ onAddChecklist })));

    act(() => result.current.activateDraft(ItineraryItemType.Checklist, 1, "bottom"));
    await act(async () => result.current.commitDraft("x"));
    act(() => result.current.cancelDraft());
    act(() => result.current.activateDraft(ItineraryItemType.Checklist, 1, "bottom"));
    await act(async () => result.current.commitDraft("y"));

    expect(onAddChecklist.mock.calls[1][3]).not.toBe(onAddChecklist.mock.calls[0][3]);
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
