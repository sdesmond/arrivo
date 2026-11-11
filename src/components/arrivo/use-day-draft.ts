"use client";

import { useEffect, useRef, useState } from "react";
import type { GapZoneProps } from "./gap-zone";
import type { TimelineItem } from "./day-card-dnd";
import { ItineraryItemType } from "@/data/types";
import { ApiClientError } from "@/lib/api/client";
import { createRandomId } from "@/lib/utils";

interface DraftState {
  kind: ItineraryItemType;
  insertAtPosition: number;
  gapKey: string;
}

export interface UseDayDraftOptions {
  dayNumber: number;
  timelineItems: TimelineItem[];
  propTimelineItemIds: string[];
  onAddEvent?: (
    dayNumber: number,
    name: string,
    afterEventId?: string,
    insertAtPosition?: number,
    clientId?: string
  ) => Promise<void>;
  onAddNote?: (dayNumber: number, content: string, insertAtPosition?: number, clientId?: string) => Promise<void>;
  onAddChecklist?: (
    dayNumber: number,
    insertAtPosition: number,
    firstItemContent?: string,
    clientId?: string
  ) => Promise<void>;
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
  propTimelineItemIds,
  onAddEvent,
  onAddNote,
  onAddChecklist,
  onOpenPackingListPicker,
}: UseDayDraftOptions): UseDayDraftResult {
  const [openGapKey, setOpenGapKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  // Set once a commit resolved, so the effect below watches the refreshed day for it. The version state re-runs the
  // effect against props that landed before the commit resolved.
  const committedRef = useRef<{ count: number; signature: string } | null>(null);
  const [commitVersion, setCommitVersion] = useState(0);
  // Enter and the blur it triggers both commit the same draft, and the draft stays mounted until the refreshed day
  // lands, so one draft must submit once; a rejected commit or a new draft re-arms it.
  const commitStartedRef = useRef(false);
  // One client ID per draft, sent on every commit of it, so a retry replays instead of duplicating.
  const draftIdRef = useRef<string | null>(null);
  const signature = propTimelineItemIds.join("|");
  const itemCount = propTimelineItemIds.length;

  useEffect(() => {
    const committed = committedRef.current;
    const ownId = draftIdRef.current;
    // The add action's promise can resolve slightly before the revalidated `day` prop lands, so wait for the real
    // item (our own ID, or growth past the baseline) to show up in props instead of clearing on a timer. Our own ID
    // clears the draft even when the commit rejected: a timed-out create may still have landed.
    if ((ownId !== null && signature.split("|").includes(ownId)) || (committed && itemCount > committed.count)) {
      commitStartedRef.current = false;
      draftIdRef.current = null;
      committedRef.current = null;
      setDraft(null);
    } else if (committed && signature !== committed.signature) {
      // The day changed without gaining the item (a live-sync removal): accept another commit. The retained client ID
      // makes a duplicate commit a replay.
      commitStartedRef.current = false;
      committedRef.current = null;
    }
  }, [commitVersion, signature, itemCount]);

  function openGap(gapKey: string): void {
    setOpenGapKey(gapKey);
    commitStartedRef.current = false;
    draftIdRef.current = null;
    committedRef.current = null;
    setDraft(null);
  }

  function activateDraft(type: ItineraryItemType, insertAtPosition: number, gapKey: string): void {
    setOpenGapKey(null);
    commitStartedRef.current = false;
    draftIdRef.current = createRandomId();
    committedRef.current = null;
    setDraft({ kind: type, insertAtPosition, gapKey });
  }

  function cancelDraft(): void {
    commitStartedRef.current = false;
    draftIdRef.current = null;
    committedRef.current = null;
    setDraft(null);
  }

  function closeGap(): void {
    setOpenGapKey(null);
  }

  async function commitDraft(content: string): Promise<void> {
    if (!draft || commitStartedRef.current) return;
    commitStartedRef.current = true;
    // Every kind carries the draft's client ID, so a duplicate commit is a replay and the draft may re-arm.
    const baseline = { count: itemCount, signature };
    try {
      if (draft.kind === ItineraryItemType.Note) {
        await onAddNote?.(dayNumber, content, draft.insertAtPosition, draftIdRef.current ?? undefined);
      } else if (draft.kind === ItineraryItemType.Checklist) {
        await onAddChecklist?.(
          dayNumber,
          draft.insertAtPosition,
          content || undefined,
          draftIdRef.current ?? undefined
        );
      } else {
        const gapIndex = draft.gapKey === "bottom" ? -1 : parseInt(draft.gapKey.slice(3), 10);
        const itemBefore = gapIndex >= 0 ? timelineItems[gapIndex] : undefined;
        const afterEventId =
          itemBefore?.kind === "event" && !itemBefore.data.linkedReservationId ? itemBefore.data.id : undefined;
        const clientId = draftIdRef.current ?? undefined;
        if (afterEventId) {
          await onAddEvent?.(dayNumber, content, afterEventId, undefined, clientId);
        } else {
          await onAddEvent?.(dayNumber, content, undefined, draft.insertAtPosition, clientId);
        }
      }
      committedRef.current = baseline;
      setCommitVersion((version) => version + 1);
    } catch (error) {
      // handler already surfaced a toast; keep the draft open so the user can retry
      commitStartedRef.current = false;
      // A 409 means the retained ID already names different content (an earlier attempt landed before the user edited
      // the text), so it can never succeed again: the next commit gets a fresh one.
      if (error instanceof ApiClientError && error.code === "conflict") {
        draftIdRef.current = createRandomId();
      }
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
