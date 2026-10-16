"use client";

import { useEffect, useRef, useState } from "react";
import type { GapZoneProps } from "./gap-zone";
import type { TimelineItem } from "./day-card-dnd";
import { ItineraryItemType } from "@/data/types";

interface DraftState {
  kind: ItineraryItemType;
  insertAtPosition: number;
  gapKey: string;
}

export interface UseDayDraftOptions {
  dayNumber: number;
  timelineItems: TimelineItem[];
  propTimelineItemCount: number;
  onAddEvent?: (dayNumber: number, name: string, afterEventId?: string, insertAtPosition?: number) => Promise<void>;
  onAddNote?: (dayNumber: number, content: string, insertAtPosition?: number) => Promise<void>;
  onAddChecklist?: (dayNumber: number, insertAtPosition: number, firstItemContent?: string) => Promise<void>;
  onOpenPackingListPicker?: (insertAtPosition: number) => void;
}

export interface UseDayDraftResult {
  draft: DraftState | null;
  openGapKey: string | null;
  openGap: (gapKey: string) => void;
  closeGap: () => void;
  activateDraft: (type: ItineraryItemType, insertAtPosition: number, gapKey: string) => void;
  commitDraft: (content: string) => Promise<void>;
  cancelDraft: () => void;
  makeGapProps: (gapKey: string, insertAtPosition: number) => GapZoneProps;
}

export function useDayDraft({
  dayNumber,
  timelineItems,
  propTimelineItemCount,
  onAddEvent,
  onAddNote,
  onAddChecklist,
  onOpenPackingListPicker,
}: UseDayDraftOptions): UseDayDraftResult {
  const [openGapKey, setOpenGapKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const pendingCommitBaselineRef = useRef<number | null>(null);

  useEffect(() => {
    if (pendingCommitBaselineRef.current === null) return;
    // The add action's promise can resolve slightly before the revalidated `day` prop lands,
    // so wait for the real item to actually show up in props instead of clearing on a timer.
    if (propTimelineItemCount > pendingCommitBaselineRef.current) {
      pendingCommitBaselineRef.current = null;
      setDraft(null);
    }
  }, [propTimelineItemCount]);

  function openGap(gapKey: string): void {
    setOpenGapKey(gapKey);
    setDraft(null);
  }

  function activateDraft(type: ItineraryItemType, insertAtPosition: number, gapKey: string): void {
    setOpenGapKey(null);
    setDraft({ kind: type, insertAtPosition, gapKey });
  }

  function cancelDraft(): void {
    setDraft(null);
  }

  function closeGap(): void {
    setOpenGapKey(null);
  }

  async function commitDraft(content: string): Promise<void> {
    if (!draft) return;
    const baselineCount = propTimelineItemCount;
    try {
      if (draft.kind === ItineraryItemType.Note) {
        await onAddNote?.(dayNumber, content, draft.insertAtPosition);
      } else if (draft.kind === ItineraryItemType.Checklist) {
        await onAddChecklist?.(dayNumber, draft.insertAtPosition, content || undefined);
      } else {
        const gapIndex = draft.gapKey === "bottom" ? -1 : parseInt(draft.gapKey.slice(3), 10);
        const itemBefore = gapIndex >= 0 ? timelineItems[gapIndex] : undefined;
        const afterEventId =
          itemBefore?.kind === "event" && !itemBefore.data.linkedReservationId ? itemBefore.data.id : undefined;
        if (afterEventId) {
          await onAddEvent?.(dayNumber, content, afterEventId);
        } else {
          await onAddEvent?.(dayNumber, content, undefined, draft.insertAtPosition);
        }
      }
      pendingCommitBaselineRef.current = baselineCount;
    } catch {
      // handler already surfaced a toast; keep the draft open so the user can retry
    }
  }

  function makeGapProps(gapKey: string, insertAtPosition: number): GapZoneProps {
    return {
      gapKey,
      isActive: openGapKey === gapKey,
      onOpen: draft !== null ? () => {} : () => openGap(gapKey),
      onSelectType: (type) => activateDraft(type, insertAtPosition, gapKey),
      onDismiss: closeGap,
      onOpenPackingListPicker: onOpenPackingListPicker ? () => onOpenPackingListPicker(insertAtPosition) : undefined,
    };
  }

  return { draft, openGapKey, openGap, closeGap, activateDraft, commitDraft, cancelDraft, makeGapProps };
}
