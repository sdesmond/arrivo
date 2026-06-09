"use client";

import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { usePathname } from "next/navigation";
import { TripConfetti } from "@/components/packt/trip-confetti";
import { TripDetailTabBody } from "./trip-detail-tab-body";
import { TripDetailHero } from "./trip-detail-hero";
import { TripEditSheet } from "@/components/packt/trip-edit-sheet";
import { TripDetailTab } from "@/data/types";
import type {
  TripDetailPayload,
  TripDateChangeConfirmation,
  TripDateConflictResolution,
  UpdateTripPatch,
  TripDetailTab as TripDetailTabValue,
  PackingTemplate,
} from "@/data/types";
import { useFocusScroll } from "@/lib/use-focus-scroll";
import { useTripDetailHandlers } from "./use-trip-detail-handlers";
import { buildTripDetailTabHref, resolveTripDetailTab } from "./trip-detail-tabs";

const TABS: { id: TripDetailTabValue; label: string }[] = [
  { id: "itin", label: "Itinerary" },
  { id: "map", label: "Map" },
  { id: "docs", label: "Documents" },
  { id: "pack", label: "Packing" },
  { id: "notes", label: "Notes" },
];

interface TripDetailClientProps {
  detail: TripDetailPayload;
  nowISO: string;
  dateFormat: string;
  initialExpandedDayNumber?: number;
  initialActiveTab?: TripDetailTabValue;
  isNew?: boolean;
  templates?: PackingTemplate[];
}

export function TripDetailClient({
  detail,
  nowISO,
  dateFormat,
  initialExpandedDayNumber,
  initialActiveTab = TripDetailTab.Itinerary,
  isNew,
  templates = [],
}: TripDetailClientProps): ReactElement {
  useFocusScroll();

  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState<TripDetailTabValue>(initialActiveTab);
  const [editingTrip, setEditingTrip] = useState(false);
  const [pendingTripPatch, setPendingTripPatch] = useState<UpdateTripPatch | null>(null);
  const [tripDateConfirmation, setTripDateConfirmation] = useState<TripDateChangeConfirmation | null>(null);
  const handlers = useTripDetailHandlers(detail);

  const { trip, days, unscheduledEvents, docs, packingItems, packingLists } = detail;

  useEffect(() => {
    function handlePopState(): void {
      const nextTab = resolveTripDetailTab(new URLSearchParams(window.location.search).get("tab"));
      setActiveTab(nextTab);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  async function handleTripSave(patch: UpdateTripPatch): Promise<void> {
    const result = await handlers.handleTripSave(patch);
    if (!result) return;
    if (result.status === "saved") {
      setTripDateConfirmation(null);
      setPendingTripPatch(null);
      setEditingTrip(false);
      return;
    }
    setPendingTripPatch(patch);
    setTripDateConfirmation(result.confirmation);
  }

  async function handleTripDateResolution(resolution: TripDateConflictResolution): Promise<void> {
    if (!pendingTripPatch || !tripDateConfirmation) return;
    const result = await handlers.handleTripSaveResolution(pendingTripPatch, resolution, tripDateConfirmation);
    if (!result || result.status !== "saved") return;
    setTripDateConfirmation(null);
    setPendingTripPatch(null);
    setEditingTrip(false);
  }

  function handleTripDateResolutionCancel(): void {
    setTripDateConfirmation(null);
    setPendingTripPatch(null);
  }

  function handleTabChange(nextTab: TripDetailTabValue): void {
    if (nextTab === activeTab) return;

    setActiveTab(nextTab);
    const nextUrl = buildTripDetailTabHref(pathname, new URLSearchParams(window.location.search), nextTab);
    window.history.pushState(null, "", nextUrl);
  }

  return (
    <div className="flex flex-col min-h-full">
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
            activeTab={activeTab}
            days={days}
            unscheduledEvents={unscheduledEvents}
            docs={docs}
            packingItems={packingItems}
            packingLists={packingLists}
            templates={templates}
            dateFormat={dateFormat}
            initialExpandedDayNumber={initialExpandedDayNumber}
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
            onOpenEditDates={() => setEditingTrip(true)}
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
        open={editingTrip}
        onClose={() => setEditingTrip(false)}
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
