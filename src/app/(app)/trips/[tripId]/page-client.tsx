"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { TripConfetti } from "@/components/packt/trip-confetti";
import { TripDetailTabBody } from "./trip-detail-tab-body";
import { TripDetailHero } from "./trip-detail-hero";
import { TripEditSheet } from "@/components/packt/trip-edit-sheet";
import { TripDetailTab } from "@/data/types";
import type {
  TripDetailPayload,
  TripCurrencyChangeMode,
  TripDateChangeConfirmation,
  TripDateConflictResolution,
  UpdateTripPatch,
  TripDetailTab as TripDetailTabValue,
  PackingTemplate,
  CurrencyOption,
} from "@/data/types";
import { useFocusScroll } from "@/lib/use-focus-scroll";
import { useTripDetailHandlers } from "./use-trip-detail-handlers";
import {
  buildReservationsDeepLinkHref,
  buildTripDetailTabHref,
  resolveTripDetailTab,
  type ReservationsDeepLinkTarget,
} from "./trip-detail-tabs";

const DATES_HIGHLIGHT_DURATION_MS = 1500;

const TABS: { id: TripDetailTabValue; label: string }[] = [
  { id: "res", label: "Reservations" },
  { id: "itin", label: "Itinerary" },
  { id: "budget", label: "Budget" },
  { id: "map", label: "Map" },
  { id: "docs", label: "Documents" },
  { id: "pack", label: "Packing" },
  { id: "notes", label: "Notes" },
];

interface TripDetailClientProps {
  detail: TripDetailPayload;
  currencyOptions?: CurrencyOption[];
  defaultExpenseCurrency?: string;
  nowISO: string;
  dateFormat: string;
  initialExpandedDayNumber?: number;
  initialActiveTab?: TripDetailTabValue;
  isNew?: boolean;
  templates?: PackingTemplate[];
}

export function TripDetailClient({
  detail,
  currencyOptions = [],
  defaultExpenseCurrency,
  nowISO,
  dateFormat,
  initialExpandedDayNumber,
  initialActiveTab = TripDetailTab.Itinerary,
  isNew,
  templates = [],
}: TripDetailClientProps): ReactElement {
  const highlightedEventId = useFocusScroll();

  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TripDetailTabValue>(initialActiveTab);
  const [editingTrip, setEditingTrip] = useState(false);
  const [highlightTripDates, setHighlightTripDates] = useState(false);
  const [pendingTripPatch, setPendingTripPatch] = useState<UpdateTripPatch | null>(null);
  const [pendingCurrencyChangeMode, setPendingCurrencyChangeMode] = useState<TripCurrencyChangeMode | undefined>(
    undefined
  );
  const [tripDateConfirmation, setTripDateConfirmation] = useState<TripDateChangeConfirmation | null>(null);
  const [reservationsAnnouncement, setReservationsAnnouncement] = useState("");
  const [announcementId, setAnnouncementId] = useState(0);
  const handlers = useTripDetailHandlers(detail);

  const { trip, days, unscheduledEvents, docs, packingItems, packingLists, reservations, expenses } = detail;

  const tabParam = searchParams.get("tab");
  const previousTabParamRef = useRef(tabParam);
  const pendingCtaAnnouncementRef = useRef(false);

  useEffect(() => {
    if (!highlightTripDates) return;
    const timeoutId = setTimeout(() => setHighlightTripDates(false), DATES_HIGHLIGHT_DURATION_MS);
    return () => clearTimeout(timeoutId);
  }, [highlightTripDates]);

  useEffect(() => {
    function handlePopState(): void {
      const nextTab = resolveTripDetailTab(new URLSearchParams(window.location.search).get("tab"));
      setActiveTab(nextTab);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Child components (CTA, linked-event taps, ReservationsTab) navigate via next/navigation's router
  // rather than raw history APIs, so this syncs activeTab from the live search params instead of
  // relying solely on the popstate listener above, which only catches browser back/forward.
  useEffect(() => {
    if (previousTabParamRef.current === tabParam) return;
    previousTabParamRef.current = tabParam;
    const nextTab = resolveTripDetailTab(tabParam);
    setActiveTab(nextTab);
    if (nextTab === TripDetailTab.Reservations && pendingCtaAnnouncementRef.current) {
      setAnnouncementId((current) => current + 1);
      setReservationsAnnouncement("Reservations tab");
    }
    pendingCtaAnnouncementRef.current = false;
  }, [tabParam]);

  function navigateToReservations(target: ReservationsDeepLinkTarget): void {
    if (target.kind === "add-reservation") {
      pendingCtaAnnouncementRef.current = true;
    }
    router.push(buildReservationsDeepLinkHref(pathname, searchParams, target), { scroll: false });
  }

  async function handleTripSave(patch: UpdateTripPatch, currencyChangeMode?: TripCurrencyChangeMode): Promise<void> {
    const result = await handlers.handleTripSave(patch, currencyChangeMode);
    if (!result) return;
    if (result.status === "saved") {
      setTripDateConfirmation(null);
      setPendingTripPatch(null);
      setPendingCurrencyChangeMode(undefined);
      setEditingTrip(false);
      return;
    }
    setPendingTripPatch(patch);
    setPendingCurrencyChangeMode(currencyChangeMode);
    setTripDateConfirmation(result.confirmation);
  }

  async function handleTripDateResolution(resolution: TripDateConflictResolution): Promise<void> {
    if (!pendingTripPatch || !tripDateConfirmation) return;
    const result = await handlers.handleTripSaveResolution(
      pendingTripPatch,
      resolution,
      tripDateConfirmation,
      pendingCurrencyChangeMode
    );
    if (!result || result.status !== "saved") return;
    setTripDateConfirmation(null);
    setPendingTripPatch(null);
    setPendingCurrencyChangeMode(undefined);
    setEditingTrip(false);
  }

  function handleTripDateResolutionCancel(): void {
    setTripDateConfirmation(null);
    setPendingTripPatch(null);
    setPendingCurrencyChangeMode(undefined);
  }

  function handleTabChange(nextTab: TripDetailTabValue): void {
    if (nextTab === activeTab) return;

    setActiveTab(nextTab);
    const nextUrl = buildTripDetailTabHref(pathname, new URLSearchParams(window.location.search), nextTab);
    window.history.pushState(null, "", nextUrl);
  }

  return (
    <div className="flex flex-col min-h-full">
      <div aria-live="polite" className="sr-only">
        <span key={announcementId}>{reservationsAnnouncement}</span>
      </div>

      <TripDetailHero detail={detail} nowISO={nowISO} dateFormat={dateFormat} onEdit={() => setEditingTrip(true)} />

      {/* Tab bar */}
      <div
        className="flex items-center gap-0 px-4 lg:px-6 shrink-0"
        style={{ borderBottom: "1px solid var(--line)", background: "var(--bg)" }}
      >
        <div className="flex items-center flex-1 gap-0 overflow-x-auto overflow-y-hidden scroll-thin">
          {TABS.map((tabItem) => (
            <button
              key={tabItem.id}
              className="shrink-0 px-3.5 py-3 transition-colors relative"
              style={{
                fontSize: "calc(13px * var(--font-scale))",
                fontWeight: activeTab === tabItem.id ? 600 : 400,
                color: activeTab === tabItem.id ? "var(--fg)" : "var(--fg-3)",
                background: "none",
                border: "none",
                borderBottom: activeTab === tabItem.id ? "2px solid var(--accent-brand)" : "2px solid transparent",
                marginBottom: -1,
              }}
              onClick={() => handleTabChange(tabItem.id)}
            >
              {tabItem.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 overflow-y-auto p-4 lg:p-6 min-w-0">
          <TripDetailTabBody
            tripId={trip.id}
            trip={trip}
            defaultExpenseCurrency={defaultExpenseCurrency}
            activeTab={activeTab}
            days={days}
            unscheduledEvents={unscheduledEvents}
            docs={docs}
            packingItems={packingItems}
            packingLists={packingLists}
            reservations={reservations}
            expenses={expenses}
            templates={templates}
            dateFormat={dateFormat}
            initialExpandedDayNumber={initialExpandedDayNumber}
            highlightedEventId={highlightedEventId}
            isNew={isNew}
            newlyCreatedChecklistId={handlers.newlyCreatedChecklistId ?? undefined}
            onUpdateEvent={handlers.handleEventUpdate}
            onDeleteEvent={handlers.handleEventDelete}
            onReorderDayItems={handlers.handleDayItemsReorder}
            onUpdateDay={handlers.handleDayUpdate}
            onAddEvent={handlers.handleAddEvent}
            onAddNote={handlers.handleAddNote}
            onUpdateNote={handlers.handleUpdateNote}
            onDeleteNote={handlers.handleDeleteNote}
            onAddChecklist={handlers.handleAddChecklist}
            onUpdateChecklistTitle={handlers.handleUpdateChecklistTitle}
            onDeleteChecklist={handlers.handleDeleteChecklist}
            onAddChecklistItem={handlers.handleAddChecklistItem}
            onUpdateChecklistItem={handlers.handleUpdateChecklistItem}
            onDeleteChecklistItem={handlers.handleDeleteChecklistItem}
            onToggleChecklistItem={handlers.handleToggleChecklistItem}
            onAddPackingItem={(name, isLabel, afterItemId, beforeItemId, labelId, listId) =>
              handlers.handleAddPackingItem(name, isLabel, afterItemId, beforeItemId, labelId, listId)
            }
            onRemovePackingItem={handlers.handleRemovePackingItem}
            onRemovePackingSection={(id, input) => handlers.handleRemovePackingSection(id, input.mode)}
            onTogglePackingItem={handlers.handleTogglePackingItem}
            onReorderPackingItems={handlers.handleReorderPackingItems}
            onEditPackingItem={handlers.handleUpdatePackingItem}
            onPullTemplates={handlers.handlePullTemplates}
            onSaveAsTemplate={handlers.handleSaveAsTemplate}
            onCreatePackingList={handlers.handleCreatePackingList}
            onRenamePackingList={handlers.handleRenamePackingList}
            onDeletePackingList={handlers.handleDeletePackingList}
            onInsertFromPackingSource={handlers.handleInsertFromPackingSource}
            isDateless={!trip.startDate}
            onOpenEditDates={() => {
              setEditingTrip(true);
              setHighlightTripDates(true);
            }}
            onOpenEditBudget={() => {
              setEditingTrip(true);
            }}
            onActivateReservationsCta={() => navigateToReservations({ kind: "add-reservation" })}
            onLinkedEventTap={(reservationId) => navigateToReservations({ kind: "highlight", reservationId })}
            onAddDay={handlers.handleAddDay}
            onRemoveLastDay={handlers.handleRemoveLastDay}
            addingDay={handlers.addingDay}
            removingDay={handlers.removingDay}
          />
        </div>
      </div>

      <TripEditSheet
        key={trip.id}
        trip={trip}
        currencyOptions={currencyOptions}
        expenses={expenses}
        open={editingTrip}
        onClose={() => {
          setEditingTrip(false);
          setHighlightTripDates(false);
        }}
        highlightDates={highlightTripDates}
        onSave={handleTripSave}
        saving={handlers.savingTrip}
        dateFormat={dateFormat}
        dateChangeConfirmation={tripDateConfirmation}
        onResolveDateChange={handleTripDateResolution}
        onCancelDateChange={handleTripDateResolutionCancel}
        onDelete={handlers.handleDeleteTrip}
        isDeleting={handlers.isDeleting}
      />
      {isNew ? <TripConfetti tripId={trip.id} /> : null}
    </div>
  );
}
