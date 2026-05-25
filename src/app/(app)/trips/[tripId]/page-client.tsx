"use client";

import { useState } from "react";
import type { ReactElement } from "react";
import Link from "next/link";
import { ChevronLeft, Share2, Download, MoreHorizontal, Calendar, MapPin, FileText, Users, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TripCover } from "@/components/packt/trip-cover";
import { TripDetailTabBody } from "./trip-detail-tab-body";
import { TripEditSheet } from "@/components/packt/trip-edit-sheet";
import type {
  TripDetailPayload,
  TripDateChangeConfirmation,
  TripDateConflictResolution,
  UpdateTripPatch,
  TripDetailTab,
} from "@/data/types";
import { getTripStatus, getTripDays, formatDate } from "@/lib/utils";
import { useFocusScroll } from "@/lib/use-focus-scroll";
import { useTripDetailHandlers } from "./use-trip-detail-handlers";

const TABS: { id: TripDetailTab; label: string }[] = [
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
}

export function TripDetailClient({
  detail,
  nowISO,
  dateFormat,
  initialExpandedDayNumber,
}: TripDetailClientProps): ReactElement {
  const now = new Date(nowISO);
  useFocusScroll();

  const [activeTab, setActiveTab] = useState<TripDetailTab>("itin");
  const [editingTrip, setEditingTrip] = useState(false);
  const [pendingTripPatch, setPendingTripPatch] = useState<UpdateTripPatch | null>(null);
  const [tripDateConfirmation, setTripDateConfirmation] = useState<TripDateChangeConfirmation | null>(null);
  const handlers = useTripDetailHandlers(detail);

  const { trip, days, unscheduledEvents, docs, collaborators } = detail;

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

  const eventCount = days.reduce((count, day) => count + day.events.length, 0) + unscheduledEvents.length;
  const dayTotal = getTripDays(trip.startDate, trip.endDate);
  const status = getTripStatus(trip.startDate, trip.endDate, now);
  const heroStatusLabel =
    trip.startDate && trip.endDate ? `${status.toUpperCase()} TRIP · OFFLINE` : "UNSCHEDULED TRIP · OFFLINE";
  const heroDateLine =
    trip.startDate && trip.endDate
      ? `${formatDate(trip.startDate, dateFormat)} — ${formatDate(trip.endDate, dateFormat)}`
      : "";

  return (
    <div className="flex flex-col min-h-full">
      {/* Crumb bar */}
      <div
        className="flex items-center gap-2 px-4 lg:px-6 py-2.5 shrink-0"
        style={{ borderBottom: "1px solid var(--line)" }}
      >
        <Link
          href="/trips"
          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 font-medium h-7 transition-colors hover:bg-surface"
          style={{ fontSize: "0.8rem", color: "var(--fg)" }}
        >
          <ChevronLeft size={14} strokeWidth={1.5} />
          Trips
        </Link>
        <span style={{ color: "var(--fg-4)", fontSize: "calc(13px * var(--font-scale))" }}>/</span>
        <span style={{ fontSize: "calc(13px * var(--font-scale))", fontWeight: 500, color: "var(--fg)" }}>
          {trip.name}
        </span>
        <span className="flex-1" />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditingTrip(true)}>
            <Pencil size={13} strokeWidth={1.5} />
            Edit
          </Button>
          <Button variant="outline" size="sm">
            <Share2 size={13} strokeWidth={1.5} />
            Share
          </Button>
          <Button variant="outline" size="sm">
            <Download size={13} strokeWidth={1.5} />
            Offline
          </Button>
          <Button variant="outline" size="icon-sm" title="More options">
            <MoreHorizontal size={13} strokeWidth={1.5} />
          </Button>
        </div>
      </div>

      {/* Hero */}
      <div className="relative shrink-0" style={{ minHeight: 260 }}>
        <TripCover name={trip.name} country="" metaTag={heroStatusLabel} showCity={false} style={{ minHeight: 260 }} />
        <div className="absolute inset-0 pointer-events-none" style={{ background: "var(--cover-scrim)" }} />
        <div className="absolute bottom-0 left-0 right-0 p-5 lg:p-6">
          <div
            style={{
              fontFamily: "var(--font-mono-family, ui-monospace)",
              fontSize: "calc(10.5px * var(--font-scale))",
              fontWeight: 500,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--cover-text-dim)",
              marginBottom: 6,
            }}
          >
            {heroDateLine}
          </div>
          <h1
            style={{
              fontFamily: "var(--font-heading-family, ui-sans-serif)",
              fontSize: "clamp(28px, 5vw, 40px)",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              color: "var(--cover-text)",
              lineHeight: 1.05,
              marginBottom: 10,
            }}
          >
            {trip.name}
          </h1>
          <div
            className="flex items-center gap-4 flex-wrap"
            style={{ color: "var(--cover-text-sub)", fontSize: "calc(12.5px * var(--font-scale))" }}
          >
            <span className="flex items-center gap-1.5">
              <Calendar size={13} strokeWidth={1.5} />
              {dayTotal} days
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin size={13} strokeWidth={1.5} />
              {eventCount} places
            </span>
            <span className="flex items-center gap-1.5">
              <FileText size={13} strokeWidth={1.5} />
              {docs.filter((document) => document.scope === "trip").length} docs
            </span>
            <span className="flex items-center gap-1.5">
              <Users size={13} strokeWidth={1.5} />
              {collaborators.length} collaborators
            </span>
          </div>
        </div>
      </div>

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
              onClick={() => setActiveTab(tabItem.id)}
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
            dateFormat={dateFormat}
            initialExpandedDayNumber={initialExpandedDayNumber}
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
      />
    </div>
  );
}
