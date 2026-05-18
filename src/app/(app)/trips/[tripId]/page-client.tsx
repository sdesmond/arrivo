"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ChevronLeft, Share2, Download, MoreHorizontal, Calendar, MapPin, FileText, Users, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TripCover } from "@/components/packt/trip-cover";
import { TripItineraryView } from "./trip-itinerary-view";
import { TripEditSheet } from "@/components/packt/trip-edit-sheet";
import {
  type TripDetailPayload,
  type TripEvent,
  type DayItinerary,
  type UpdateTripPatch,
  type DayItemType,
} from "@/data/types";
import { getTripStatus, getTripDays, formatDate } from "@/lib/utils";
import { useFocusScroll } from "@/lib/use-focus-scroll";
import { updateTripMetadata } from "../actions";
import {
  updateEvent,
  deleteEvent,
  reorderDayItems,
  updateDay,
  createEvent,
  createNote,
  updateNote,
  deleteNote,
  addDocument,
  removeDocument,
  createChecklist,
  createChecklistWithItem,
  updateChecklistTitle,
  deleteChecklist,
  createChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  toggleChecklistItem,
} from "./actions";

const TABS = [
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
}

export function TripDetailClient({ detail, nowISO, dateFormat }: TripDetailClientProps) {
  const now = new Date(nowISO);
  useFocusScroll();

  const [activeTab, setActiveTab] = useState<"itin" | "map" | "docs" | "pack" | "notes">("itin");
  const [editingTrip, setEditingTrip] = useState(false);
  const [newlyCreatedChecklistId, setNewlyCreatedChecklistId] = useState<string | null>(null);

  const { trip, days, docs, collaborators } = detail;

  function handleEventUpdate(updated: TripEvent): void {
    React.startTransition(() => {
      updateEvent(updated.id, {
        name: updated.name,
        startAt: updated.startAt,
        endAt: updated.endAt,
        locationName: updated.locationName,
        locationAddress: updated.locationAddress,
        locationLat: updated.locationLat,
        locationLng: updated.locationLng,
        cost: updated.cost,
        confirmationNumber: updated.confirmationNumber,
        note: updated.note,
      });
    });
  }

  function handleEventDelete(id: string): void {
    React.startTransition(() => {
      deleteEvent(id);
    });
  }

  function handleDayItemsReorder(dayNumber: number, orderedItems: { type: DayItemType; id: string }[]): void {
    const day = days.find((d) => d.dayNumber === dayNumber);
    if (!day?.id) return;
    React.startTransition(() => {
      reorderDayItems({ dayId: day.id!, orderedItems });
    });
  }

  function handleDayUpdate(dayNumber: number, updates: Partial<DayItinerary>): void {
    const day = days.find((d) => d.dayNumber === dayNumber);
    if (!day?.id) return;
    React.startTransition(() => {
      updateDay(day.id!, updates);
    });
  }

  function handleAddEvent(dayNumber: number, name: string, afterEventId?: string, insertAtPosition?: number): void {
    const day = days.find((d) => d.dayNumber === dayNumber);
    if (!day?.id) return;
    React.startTransition(() => {
      createEvent(day.id!, { name, afterEventId, insertAtPosition });
    });
  }

  function handleAddNote(dayNumber: number, content: string, insertAtPosition?: number): void {
    const day = days.find((d) => d.dayNumber === dayNumber);
    if (!day?.id) return;
    React.startTransition(() => {
      createNote(day.id!, content, insertAtPosition);
    });
  }

  function handleUpdateNote(noteId: string, content: string): void {
    React.startTransition(() => {
      updateNote(noteId, content);
    });
  }

  function handleDeleteNote(noteId: string): void {
    React.startTransition(() => {
      deleteNote(noteId);
    });
  }

  function handleAddDoc(eventId: string, input: { name: string; kind: string; url?: string; offline?: boolean }): void {
    React.startTransition(() => {
      addDocument({
        eventId,
        name: input.name,
        kind: input.kind,
        url: input.url,
        offline: input.offline,
      });
    });
  }

  function handleDeleteDoc(docId: string): void {
    React.startTransition(() => {
      removeDocument(docId);
    });
  }

  function handleAddChecklist(dayNumber: number, insertAtPosition: number, firstItemContent?: string): void {
    const day = days.find((d) => d.dayNumber === dayNumber);
    if (!day?.id) return;
    if (firstItemContent) {
      React.startTransition(async () => {
        const id = await createChecklistWithItem(day.id!, insertAtPosition, firstItemContent);
        setNewlyCreatedChecklistId(id);
        setTimeout(() => setNewlyCreatedChecklistId(null), 1000);
      });
    } else {
      React.startTransition(() => {
        createChecklist(day.id!, insertAtPosition);
      });
    }
  }

  function handleUpdateChecklistTitle(checklistId: string, title: string | undefined): void {
    React.startTransition(() => {
      updateChecklistTitle(checklistId, title);
    });
  }

  function handleDeleteChecklist(checklistId: string): void {
    React.startTransition(() => {
      deleteChecklist(checklistId);
    });
  }

  function handleAddChecklistItem(checklistId: string, content: string): void {
    React.startTransition(() => {
      createChecklistItem(checklistId, content);
    });
  }

  function handleUpdateChecklistItem(itemId: string, content: string): void {
    React.startTransition(() => {
      updateChecklistItem(itemId, content);
    });
  }

  function handleDeleteChecklistItem(itemId: string): void {
    React.startTransition(() => {
      deleteChecklistItem(itemId);
    });
  }

  function handleToggleChecklistItem(itemId: string): void {
    React.startTransition(() => {
      toggleChecklistItem(itemId);
    });
  }

  function handleTripSave(patch: UpdateTripPatch): void {
    React.startTransition(() => {
      updateTripMetadata(trip.id, patch);
    });
    setEditingTrip(false);
  }

  const eventCount = days.reduce((count, day) => count + day.events.length, 0);
  const dayTotal = getTripDays(trip.startDate, trip.endDate);
  const status = getTripStatus(trip.startDate, trip.endDate, now);
  const heroDateLine = `${formatDate(trip.startDate, dateFormat)} — ${formatDate(trip.endDate, dateFormat)}`;

  return (
    <div className="flex flex-col min-h-full">
      {/* Crumb bar */}
      <div
        className="flex items-center gap-2 px-4 lg:px-6 py-2.5 shrink-0"
        style={{ borderBottom: "1px solid var(--line)" }}
      >
        <Link
          href="/trips"
          className="inline-flex shrink-0 items-center gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 font-medium h-7 transition-colors hover:bg-surface"
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
        <TripCover
          name={trip.name}
          country=""
          metaTag={`${status.toUpperCase()} TRIP · OFFLINE`}
          showCity={false}
          style={{ minHeight: 260 }}
        />
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
              {docs.length} docs
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
              onClick={() => setActiveTab(tabItem.id as typeof activeTab)}
            >
              {tabItem.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 overflow-y-auto p-4 lg:p-6 min-w-0">
          {activeTab === "itin" && (
            <TripItineraryView
              days={days}
              dateFormat={dateFormat}
              onUpdateEvent={handleEventUpdate}
              onDeleteEvent={handleEventDelete}
              onReorderDayItems={handleDayItemsReorder}
              onUpdateDay={handleDayUpdate}
              onAddEvent={handleAddEvent}
              onAddNote={handleAddNote}
              onUpdateNote={handleUpdateNote}
              onDeleteNote={handleDeleteNote}
              onAddDoc={handleAddDoc}
              onDeleteDoc={handleDeleteDoc}
              onAddChecklist={handleAddChecklist}
              newlyCreatedChecklistId={newlyCreatedChecklistId ?? undefined}
              onUpdateChecklistTitle={handleUpdateChecklistTitle}
              onDeleteChecklist={handleDeleteChecklist}
              onAddChecklistItem={handleAddChecklistItem}
              onUpdateChecklistItem={handleUpdateChecklistItem}
              onDeleteChecklistItem={handleDeleteChecklistItem}
              onToggleChecklistItem={handleToggleChecklistItem}
            />
          )}
          {activeTab === "docs" && (
            <div style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--fg-2)" }}>
              Document view coming soon.
            </div>
          )}
          {activeTab === "map" && (
            <div style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--fg-2)" }}>
              Map view coming soon.
            </div>
          )}
          {activeTab === "pack" && (
            <div style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--fg-2)" }}>
              Packing list view coming soon.
            </div>
          )}
          {activeTab === "notes" && (
            <div style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--fg-2)" }}>Notes coming soon.</div>
          )}
        </div>
      </div>

      <TripEditSheet
        key={trip.id}
        trip={trip}
        open={editingTrip}
        onClose={() => setEditingTrip(false)}
        onSave={handleTripSave}
      />
    </div>
  );
}
