"use client";

import { useCallback, useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { toast } from "sonner";
import { createExpense, deleteExpense, updateExpense } from "@/app/(app)/trips/[tripId]/budget/actions";
import { type CreateExpenseInput, type Document, type Expense, type TripEvent } from "@/data/types";
import { cn, isEventNow } from "@/lib/utils";
import { openExternalMaps } from "@/lib/open-external-maps";
import { useNow } from "@/components/providers/mock-date-provider";
import { DocsBlock } from "./docs-block";
import { PlaceRowNameField } from "./place-row-name-field";
import { PlaceRowActionBar } from "./place-row-action-bar";
import { PlaceRowDialogs } from "./place-row-dialogs";
import { PlaceRowLinkedEvent } from "./place-row-linked-event";
import { PlaceRowNoteEditor } from "./place-row-note-editor";
import { PlaceRowTrailingActions } from "./place-row-trailing-actions";
import { useCanEditTrip } from "./trip-edit-access";
import { RESERVATION_TYPE_META, formatAnchorDateTime, formatAnchorDateTimeRange } from "./reservation-type-badge";

function composeStartEndAt(dayDate: string | undefined, startHHMM: string, endHHMM: string) {
  if (!dayDate) return { startAt: undefined, endAt: undefined };
  return {
    startAt: `${dayDate}T${startHHMM}:00.000Z`,
    endAt: `${dayDate}T${endHHMM}:00.000Z`,
  };
}

export interface PlaceRowProps {
  place: TripEvent;
  dayDate?: string;
  defaultCurrency?: string;
  isLast?: boolean;
  onUpdate: (event: TripEvent) => void;
  onDelete: (id: string) => void;
  onLinkedEventTap?: (linkedReservationId: string) => void;
  dragHandle?: React.ReactNode;
  id?: string;
  isDraft?: boolean;
  onCreate?: (name: string) => void;
  onCancelDraft?: () => void;
  tripDocs?: Document[];
  isHighlighted?: boolean;
  hasScheduleConflict?: boolean;
}

export function PlaceRow({
  place,
  dayDate,
  defaultCurrency,
  isLast,
  onUpdate,
  onDelete,
  onLinkedEventTap,
  dragHandle,
  id,
  isDraft,
  onCreate,
  onCancelDraft,
  tripDocs,
  isHighlighted,
  hasScheduleConflict,
}: PlaceRowProps) {
  const [showDocs, setShowDocs] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const [isEditingName, setIsEditingName] = useState(isDraft ?? false);
  const [draftName, setDraftName] = useState(place.name);

  const [isEditingNote, setIsEditingNote] = useState(false);
  const [draftNote, setDraftNote] = useState(place.note ?? "");

  const [showTimeDialog, setShowTimeDialog] = useState(false);
  const [showCostDialog, setShowCostDialog] = useState(false);
  const [showLocationDialog, setShowLocationDialog] = useState(false);
  const [showAddDocDialog, setShowAddDocDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [expense, setExpense] = useState<Expense | undefined>(place.expense);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setExpense(place.expense);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [place.expense]);

  const placeWithExpense = { ...place, expense };

  const now = useNow();
  const canEdit = useCanEditTrip();
  const hasDocs = (place.docs?.length ?? 0) > 0;
  const isNow = isEventNow(place, now);
  const isLinkedEvent = !!place.linkedReservationId && !!place.reservationType;
  const isCombinedLinkedEvent = isLinkedEvent && !!place.startAt && !!place.endAt;
  const reservationMeta = place.reservationType
    ? (RESERVATION_TYPE_META[place.reservationType] ?? RESERVATION_TYPE_META.other)
    : undefined;
  const linkedIcon = reservationMeta?.icon;
  const LinkedIcon = linkedIcon;
  const linkedSeparatorIndex = place.name.indexOf(" — ");
  const linkedAnchorLabel = linkedSeparatorIndex === -1 ? place.name : place.name.slice(0, linkedSeparatorIndex);
  const linkedProviderLabel = linkedSeparatorIndex === -1 ? "" : place.name.slice(linkedSeparatorIndex + 3);
  const linkedDateTime = isCombinedLinkedEvent
    ? formatAnchorDateTimeRange(place.startAt!, place.endAt!)
    : place.startAt
      ? formatAnchorDateTime(place.startAt)
      : "";
  const linkedAriaLabel =
    isLinkedEvent && linkedDateTime
      ? isCombinedLinkedEvent
        ? `${place.name}: ${linkedDateTime}, Linked, opens Reservations`
        : `${linkedAnchorLabel}: ${linkedDateTime} — ${linkedProviderLabel}, Linked, opens Reservations`
      : undefined;
  const linkedMetaLabel = isLinkedEvent
    ? isCombinedLinkedEvent
      ? `${linkedDateTime} — from ${reservationMeta?.label} reservation`
      : place.startAt
        ? `${linkedAnchorLabel}: ${formatAnchorDateTime(place.startAt)} — from ${reservationMeta?.label} reservation`
        : undefined
    : undefined;

  function saveName() {
    const trimmed = draftName.trim();
    if (isDraft) {
      if (trimmed) onCreate?.(trimmed);
      else onCancelDraft?.();
      return;
    }
    if (trimmed && trimmed !== place.name) onUpdate({ ...place, name: trimmed });
    else setDraftName(place.name);
    setIsEditingName(false);
  }

  function saveNote() {
    const val = draftNote.trim() || undefined;
    if (val !== place.note) onUpdate({ ...place, note: val });
    setIsEditingNote(false);
  }

  async function handleExpenseSave(expenseInput: CreateExpenseInput): Promise<void> {
    if (!place.tripId) {
      toast.error("Failed to save cost.");
      return;
    }

    const linkedExpenseInput = {
      ...expenseInput,
      eventId: place.id,
    };

    try {
      if (expense?.id) {
        const updateResult = await updateExpense(expense.id, linkedExpenseInput);
        if (updateResult?.conversionError) {
          toast.error("Couldn't convert currency — try again.");
        }
        setExpense({
          ...expense,
          ...expenseInput,
          eventId: place.id,
          convertedAmountTrip: expenseInput.convertedAmountTrip ?? undefined,
          conversionRateTrip: expenseInput.conversionRateTrip ?? undefined,
          convertedCurrencyTrip: expenseInput.convertedCurrencyTrip ?? undefined,
          convertedAmountProfile: expenseInput.convertedAmountProfile ?? undefined,
          conversionRateProfile: expenseInput.conversionRateProfile ?? undefined,
          convertedCurrencyProfile: expenseInput.convertedCurrencyProfile ?? undefined,
        });
        return;
      }

      const createResult = await createExpense(place.tripId, linkedExpenseInput);
      if (createResult.conversionError) {
        toast.error("Couldn't convert currency — try again.");
      }
      setExpense({
        id: createResult.id,
        tripId: place.tripId,
        eventId: place.id,
        category: expenseInput.category,
        amount: expenseInput.amount,
        currency: expenseInput.currency,
        date: expenseInput.date,
        note: expenseInput.note,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save cost.");
      throw error;
    }
  }

  async function handleExpenseRemove(): Promise<void> {
    if (!expense?.id) {
      return;
    }

    try {
      await deleteExpense(expense.id);
      setExpense(undefined);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove cost.");
      throw error;
    }
  }

  const handleOpenMaps = useCallback(() => {
    openExternalMaps({
      address: place.locationAddress,
      lat: place.locationLat,
      lng: place.locationLng,
      label: place.locationName,
    });
  }, [place.locationAddress, place.locationLat, place.locationLng, place.locationName]);

  return (
    <div
      id={id}
      className="group relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={cn("flex items-start gap-3 rounded-[8px] px-3 py-2.5", isHighlighted && "highlight-pulse-ring")}
        style={{
          background: isNow && !isLinkedEvent ? "var(--accent-soft)" : undefined,
          border: isNow && !isLinkedEvent ? "1px solid var(--accent-brand)" : "1px solid transparent",
        }}
      >
        {/* Event icon */}
        <div className="flex flex-col items-center shrink-0 pt-0.5" style={{ width: 16 }}>
          {isLinkedEvent && LinkedIcon ? (
            <LinkedIcon
              size={16}
              strokeWidth={1.5}
              aria-hidden="true"
              style={{ color: "var(--fg-3)", flexShrink: 0 }}
            />
          ) : (
            <MapPin
              size={16}
              strokeWidth={1.5}
              style={{ color: isNow ? "var(--accent-brand)" : "var(--fg-3)", flexShrink: 0 }}
            />
          )}
          {!isLast && <div style={{ width: 1, flex: 1, minHeight: 12, background: "var(--line)", marginTop: 2 }} />}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {isLinkedEvent ? (
            <PlaceRowLinkedEvent
              place={place}
              onLinkedEventTap={onLinkedEventTap}
              linkedAriaLabel={linkedAriaLabel}
              linkedMetaLabel={linkedMetaLabel}
              LinkedIcon={LinkedIcon}
              isCombinedLinkedEvent={isCombinedLinkedEvent}
            />
          ) : (
            <>
              <PlaceRowNameField
                isEditingName={isEditingName}
                draftName={draftName}
                onDraftChange={setDraftName}
                onBlur={saveName}
                onKeyDown={(event) => {
                  if (event.key === "Enter") saveName();
                  if (event.key === "Escape") {
                    if (isDraft) {
                      onCancelDraft?.();
                      return;
                    }
                    setDraftName(place.name);
                    setIsEditingName(false);
                  }
                }}
                displayName={place.name}
                isHovered={isHovered}
                isDraft={isDraft}
                onStartEdit={() => {
                  setDraftName(place.name);
                  setIsEditingName(true);
                }}
              />

              {/* Note area */}
              <div className="mt-1.5">
                <PlaceRowNoteEditor
                  note={place.note}
                  isEditingNote={isEditingNote}
                  draftNote={draftNote}
                  onDraftChange={setDraftNote}
                  onSave={saveNote}
                  onCancel={() => {
                    setDraftNote(place.note ?? "");
                    setIsEditingNote(false);
                  }}
                  onStartEdit={() => {
                    setDraftNote(place.note ?? "");
                    setIsEditingNote(true);
                  }}
                />
              </div>

              <PlaceRowActionBar
                place={placeWithExpense}
                showDocs={showDocs}
                onToggleDocs={() => setShowDocs((prev) => !prev)}
                onOpenTime={() => setShowTimeDialog(true)}
                onOpenLocation={() => setShowLocationDialog(true)}
                onOpenCost={() => setShowCostDialog(true)}
                onOpenAddDoc={() => setShowAddDocDialog(true)}
                onOpenMaps={place.locationAddress ? handleOpenMaps : undefined}
                hasScheduleConflict={hasScheduleConflict}
              />

              {showDocs && hasDocs && (
                <DocsBlock docs={place.docs!} onAdd={canEdit ? () => setShowAddDocDialog(true) : undefined} />
              )}
            </>
          )}
        </div>

        {!isLinkedEvent && (
          <PlaceRowTrailingActions
            dragHandle={dragHandle}
            onDelete={() => {
              if (hasDocs) {
                setShowDeleteDialog(true);
              } else {
                onDelete(place.id);
              }
            }}
          />
        )}
      </div>

      {!isLinkedEvent && (
        <PlaceRowDialogs
          place={placeWithExpense}
          defaultCurrency={defaultCurrency}
          tripDocs={tripDocs}
          showTimeDialog={showTimeDialog}
          onTimeOpenChange={setShowTimeDialog}
          onTimeSave={(time, et) => {
            if (!time) {
              onUpdate({ ...place, startAt: undefined, endAt: undefined });
            } else {
              onUpdate({ ...place, ...composeStartEndAt(dayDate, time, et ?? time) });
            }
          }}
          showCostDialog={showCostDialog}
          onCostOpenChange={setShowCostDialog}
          onCostSave={handleExpenseSave}
          onCostRemove={handleExpenseRemove}
          showLocationDialog={showLocationDialog}
          onLocationOpenChange={setShowLocationDialog}
          onLocationSave={(location) =>
            onUpdate({
              ...place,
              locationName: location?.name,
              locationAddress: location?.address,
              locationLat: location?.lat,
              locationLng: location?.lng,
            })
          }
          showAddDocDialog={showAddDocDialog}
          onAddDocOpenChange={setShowAddDocDialog}
          showDeleteDialog={showDeleteDialog}
          onDeleteOpenChange={setShowDeleteDialog}
        />
      )}
    </div>
  );
}
