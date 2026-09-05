"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { TripConfetti } from "@/components/packt/trip-confetti";
import { TripDetailTabBar } from "./trip-detail-tab-bar";
import { TripDetailTabBody } from "./trip-detail-tab-body";
import { TripDetailHero } from "./trip-detail-hero";
import { TripEditSheet } from "@/components/packt/trip-edit-sheet";
import { TripShareDialog } from "@/components/packt/trip-share-dialog";
import { BudgetStatus, CollaboratorRole, TripDetailTab } from "@/data/types";
import {
  calculateActual,
  calculateBudgetStatus,
  DEFAULT_WARNING_THRESHOLD,
  DEFAULT_DANGER_THRESHOLD,
} from "@/lib/budget";
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
import { useTripLiveRefresh } from "@/lib/use-trip-live-refresh";
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
  warningThreshold?: number;
  dangerThreshold?: number;
  walkThresholdMeters?: number | null;
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
  warningThreshold = DEFAULT_WARNING_THRESHOLD,
  dangerThreshold = DEFAULT_DANGER_THRESHOLD,
  walkThresholdMeters,
}: TripDetailClientProps): ReactElement {
  const highlightedEventId = useFocusScroll();

  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TripDetailTabValue>(initialActiveTab);
  const [editingTrip, setEditingTrip] = useState(false);
  const [sharingTrip, setSharingTrip] = useState(false);
  const [highlightTripDates, setHighlightTripDates] = useState(false);
  const [pendingTripPatch, setPendingTripPatch] = useState<UpdateTripPatch | null>(null);
  const [pendingCurrencyChangeMode, setPendingCurrencyChangeMode] = useState<TripCurrencyChangeMode | undefined>(
    undefined
  );
  const [tripDateConfirmation, setTripDateConfirmation] = useState<TripDateChangeConfirmation | null>(null);
  const [reservationsAnnouncement, setReservationsAnnouncement] = useState("");
  const [announcementId, setAnnouncementId] = useState(0);
  const handlers = useTripDetailHandlers(detail);

  const { trip, days, unscheduledEvents, docs, packingItems, packingLists, reservations, expenses, notes, accessRole } =
    detail;

  useTripLiveRefresh(trip.id);

  const tabs = accessRole === CollaboratorRole.Viewer ? TABS.filter((tab) => tab.id !== TripDetailTab.Budget) : TABS;
  const canManage = accessRole === CollaboratorRole.Manager;
  const canEditBudget = accessRole !== CollaboratorRole.Viewer;

  const hasBudget = !!trip.budget && (trip.budget.total ?? 0) > 0 && !!trip.budget.currency;
  const budgetActual = hasBudget ? calculateActual(expenses, trip.budget!.currency) : 0;
  const budgetTotalAmount = hasBudget ? trip.budget!.total! : 0;
  const budgetStatus = hasBudget
    ? calculateBudgetStatus(budgetActual, budgetTotalAmount, warningThreshold, dangerThreshold)
    : BudgetStatus.Neutral;

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
      const nextTab = resolveTripDetailTab(new URLSearchParams(window.location.search).get("tab"), accessRole);
      setActiveTab(nextTab);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [accessRole]);

  // Child components (CTA, linked-event taps, ReservationsTab) navigate via next/navigation's router
  // rather than raw history APIs, so this syncs activeTab from the live search params instead of
  // relying solely on the popstate listener above, which only catches browser back/forward.
  useEffect(() => {
    if (previousTabParamRef.current === tabParam) return;
    previousTabParamRef.current = tabParam;
    const nextTab = resolveTripDetailTab(tabParam, accessRole);
    setActiveTab(nextTab);
    if (nextTab === TripDetailTab.Reservations && pendingCtaAnnouncementRef.current) {
      setAnnouncementId((current) => current + 1);
      setReservationsAnnouncement("Reservations tab");
    }
    pendingCtaAnnouncementRef.current = false;
  }, [tabParam, accessRole]);

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

  function handleOpenMapTab(dayNumber: number): void {
    setActiveTab(TripDetailTab.Map);
    const nextParams = new URLSearchParams(window.location.search);
    nextParams.set("tab", TripDetailTab.Map);
    nextParams.set("day", String(dayNumber));
    const nextQueryString = nextParams.toString();
    window.history.replaceState(null, "", nextQueryString ? `${pathname}?${nextQueryString}` : pathname);
  }

  return (
    <div className="flex flex-col h-full">
      <div aria-live="polite" className="sr-only">
        <span key={announcementId}>{reservationsAnnouncement}</span>
      </div>

      <TripDetailHero
        detail={detail}
        nowISO={nowISO}
        dateFormat={dateFormat}
        onEdit={() => setEditingTrip(true)}
        onShare={canManage ? () => setSharingTrip(true) : undefined}
      />

      <TripDetailTabBar
        tabs={tabs}
        activeTab={activeTab}
        budgetStatus={budgetStatus}
        budgetActual={budgetActual}
        budgetTotalAmount={budgetTotalAmount}
        onTabChange={handleTabChange}
      />

      {/* Body */}
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 overflow-y-auto p-4 lg:p-6 min-w-0">
          <TripDetailTabBody
            tripId={trip.id}
            trip={trip}
            defaultExpenseCurrency={defaultExpenseCurrency}
            warningThreshold={warningThreshold}
            dangerThreshold={dangerThreshold}
            walkThresholdMeters={walkThresholdMeters}
            activeTab={activeTab}
            days={days}
            unscheduledEvents={unscheduledEvents}
            docs={docs}
            packingItems={packingItems}
            packingLists={packingLists}
            reservations={reservations}
            expenses={expenses}
            notes={notes}
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
            onOpenMapTab={handleOpenMapTab}
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
        canManage={canManage}
        canEditBudget={canEditBudget}
        onDelete={canManage ? handlers.handleDeleteTrip : undefined}
        isDeleting={handlers.isDeleting}
      />
      {canManage ? <TripShareDialog open={sharingTrip} onOpenChange={setSharingTrip} tripId={trip.id} /> : null}
      {isNew ? <TripConfetti tripId={trip.id} /> : null}
    </div>
  );
}
