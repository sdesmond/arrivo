"use client";

import { useEffect, useState } from "react";
import Dexie, { type Table } from "dexie";
import {
  OFFLINE_DB_SCHEMA_V1,
  type OfflineTrip,
  type OfflineDay,
  type OfflineEvent,
  type OfflineDocument,
  type OfflinePackingItem,
  type OfflineOutboxEntry,
} from "./schema";
import { getTripStatus } from "@/lib/utils";
import type {
  Trip,
  TripEvent,
  Document,
  DayItinerary,
  PackingItem,
  TripDetailPayload,
  TripListEntry,
} from "@/data/types";

export class OfflineDb extends Dexie {
  trips!: Table<OfflineTrip, string>;
  days!: Table<OfflineDay, string>;
  events!: Table<OfflineEvent, string>;
  documents!: Table<OfflineDocument, string>;
  packingItems!: Table<OfflinePackingItem, string>;
  outbox!: Table<OfflineOutboxEntry, string>;
  userId: string;

  constructor(userId: string) {
    super(`packt-offline-${userId}`);
    this.userId = userId;
    this.version(1).stores(OFFLINE_DB_SCHEMA_V1);
  }
}

const instances = new Map<string, OfflineDb>();

export async function getOfflineDb(userId: string): Promise<OfflineDb> {
  const existing = instances.get(userId);
  if (existing) return existing;
  const instance = new OfflineDb(userId);
  instances.set(userId, instance);
  return instance;
}

export async function clearOfflineDb(userId: string): Promise<void> {
  const existing = instances.get(userId);
  instances.delete(userId);
  const instance = existing ?? new OfflineDb(userId);
  await instance.delete();
}

export function useOfflineDb(): OfflineDb | null {
  const [database, setDatabase] = useState<OfflineDb | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/session")
      .then((response) => response.json())
      .then((session: { user?: { id?: string } } | null) => {
        const userId = session?.user?.id;
        return userId ? getOfflineDb(userId) : null;
      })
      .then((instance) => {
        if (!cancelled) setDatabase(instance);
      })
      .catch(() => {
        if (!cancelled) setDatabase(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return database;
}

function tripToOfflineRow(trip: Trip, userId: string): OfflineTrip {
  return {
    id: trip.id,
    ownerId: userId,
    name: trip.name,
    startDate: trip.startDate,
    endDate: trip.endDate,
    destinationName: trip.destinationName ?? null,
    destinationCountry: trip.destinationCountry ?? null,
    coverImageUrl: trip.coverImageUrl ?? null,
    notes: trip.notes ?? null,
    createdAt: trip.createdAt ?? new Date().toISOString(),
    updatedAt: trip.updatedAt ?? new Date().toISOString(),
  };
}

function offlineTripToType(row: OfflineTrip, now: Date): Trip {
  return {
    id: row.id,
    name: row.name,
    status: getTripStatus(row.startDate ?? null, row.endDate ?? null, now),
    startDate: row.startDate,
    endDate: row.endDate,
    destinationName: row.destinationName ?? undefined,
    destinationCountry: row.destinationCountry ?? undefined,
    coverImageUrl: row.coverImageUrl ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function dayToOfflineRow(day: DayItinerary & { id: string }, tripId: string): OfflineDay {
  return {
    id: day.id,
    tripId,
    dayNumber: day.dayNumber,
    date: day.date ?? null,
    label: day.label,
    subtitle: day.subtitle ?? null,
  };
}

function offlineDayToType(row: OfflineDay): Omit<DayItinerary, "events"> {
  return {
    id: row.id,
    tripId: row.tripId,
    dayNumber: row.dayNumber,
    date: row.date ?? undefined,
    label: row.label,
    subtitle: row.subtitle ?? undefined,
  };
}

function eventToOfflineRow(event: TripEvent, tripId: string): OfflineEvent {
  return {
    id: event.id,
    tripId,
    dayId: event.dayId ?? null,
    name: event.name,
    note: event.note ?? null,
    startAt: event.startAt ?? null,
    endAt: event.endAt ?? null,
    locationName: event.locationName ?? null,
    locationAddress: event.locationAddress ?? null,
    position: event.position,
    cost: event.cost ?? null,
    confirmationNumber: event.confirmationNumber ?? null,
    createdAt: event.createdAt ?? new Date().toISOString(),
    updatedAt: event.updatedAt ?? new Date().toISOString(),
  };
}

function offlineEventToType(row: OfflineEvent): Omit<TripEvent, "docs"> {
  return {
    id: row.id,
    tripId: row.tripId,
    dayId: row.dayId ?? undefined,
    name: row.name,
    note: row.note ?? undefined,
    startAt: row.startAt ?? undefined,
    endAt: row.endAt ?? undefined,
    locationName: row.locationName ?? undefined,
    locationAddress: row.locationAddress ?? undefined,
    position: row.position,
    cost: row.cost ?? undefined,
    confirmationNumber: row.confirmationNumber ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

interface DocumentContext {
  tripId: string | null;
  eventId: string | null;
  reservationId: string | null;
}

function documentToOfflineRow(doc: Document, context: DocumentContext): OfflineDocument {
  return {
    id: doc.id,
    tripId: context.tripId,
    eventId: context.eventId,
    reservationId: context.reservationId,
    name: doc.name,
    kind: doc.kind,
    size: doc.size ?? null,
    offline: doc.offline,
    url: doc.url ?? null,
    addedAt: doc.addedAt ?? new Date().toISOString(),
  };
}

function offlineDocumentToType(row: OfflineDocument): Document {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as Document["kind"],
    size: row.size ?? undefined,
    scope: row.reservationId ? "reservation" : row.eventId ? "event" : "trip",
    offline: row.offline,
    url: row.url ?? undefined,
    addedAt: row.addedAt,
  };
}

function packingItemToOfflineRow(item: PackingItem & { id: string }, tripId: string): OfflinePackingItem {
  return {
    id: item.id,
    tripId,
    listId: item.listId ?? null,
    name: item.name,
    done: item.done,
    isLabel: item.isLabel ?? false,
    position: item.position ?? 0,
  };
}

function offlinePackingItemToType(row: OfflinePackingItem): PackingItem {
  return {
    id: row.id,
    name: row.name,
    done: row.done,
    tripId: row.tripId,
    listId: row.listId,
    position: row.position,
    isLabel: row.isLabel,
  };
}

export async function mirrorTripDetail(database: OfflineDb, detail: TripDetailPayload): Promise<void> {
  const tripId = detail.trip.id;

  const allEvents: TripEvent[] = [];
  const eventDocRows: OfflineDocument[] = [];

  for (const day of detail.days) {
    for (const event of day.events) {
      allEvents.push(event);
      for (const doc of event.docs ?? []) {
        eventDocRows.push(documentToOfflineRow(doc, { tripId, eventId: event.id, reservationId: null }));
      }
    }
  }
  for (const event of detail.unscheduledEvents) {
    allEvents.push(event);
    for (const doc of event.docs ?? []) {
      eventDocRows.push(documentToOfflineRow(doc, { tripId, eventId: event.id, reservationId: null }));
    }
  }

  const eventDocIds = new Set(eventDocRows.map((row) => row.id));
  const tripScopedDocRows = detail.docs
    .filter((doc) => !eventDocIds.has(doc.id))
    .map((doc) => documentToOfflineRow(doc, { tripId, eventId: null, reservationId: null }));

  const dayRows = detail.days
    .filter((day): day is DayItinerary & { id: string } => !!day.id)
    .map((day) => dayToOfflineRow(day, tripId));

  const packingItemRows = detail.packingItems
    .filter((item): item is PackingItem & { id: string } => !!item.id)
    .map((item) => packingItemToOfflineRow(item, tripId));

  await database.transaction(
    "rw",
    database.trips,
    database.days,
    database.events,
    database.documents,
    database.packingItems,
    async () => {
      await database.trips.put(tripToOfflineRow(detail.trip, database.userId));
      await database.days.bulkPut(dayRows);
      await database.events.bulkPut(allEvents.map((event) => eventToOfflineRow(event, tripId)));
      await database.documents.bulkPut([...eventDocRows, ...tripScopedDocRows]);
      await database.packingItems.bulkPut(packingItemRows);
    }
  );
}

export async function mirrorTripListEntries(database: OfflineDb, entries: TripListEntry[]): Promise<void> {
  const rows = entries.map((entry) => tripToOfflineRow(entry.trip, database.userId));
  await database.trips.bulkPut(rows);
}

export async function readTripDetailFromMirror(
  database: OfflineDb,
  tripId: string,
  now: Date
): Promise<TripDetailPayload | null> {
  const tripRow = await database.trips.get(tripId);
  if (!tripRow) return null;

  const [dayRows, eventRows, docRows, packingItemRows] = await Promise.all([
    database.days.where("tripId").equals(tripId).sortBy("dayNumber"),
    database.events.where("tripId").equals(tripId).toArray(),
    database.documents.where("tripId").equals(tripId).toArray(),
    database.packingItems.where("tripId").equals(tripId).toArray(),
  ]);

  const docsByEventId = new Map<string, Document[]>();
  for (const docRow of docRows) {
    if (!docRow.eventId) continue;
    const list = docsByEventId.get(docRow.eventId) ?? [];
    list.push(offlineDocumentToType(docRow));
    docsByEventId.set(docRow.eventId, list);
  }

  const eventsByDayId = new Map<string, TripEvent[]>();
  const unscheduledEvents: TripEvent[] = [];
  const sortedEventRows = [...eventRows].sort((first, second) => first.position - second.position);
  for (const eventRow of sortedEventRows) {
    const event: TripEvent = { ...offlineEventToType(eventRow), docs: docsByEventId.get(eventRow.id) ?? [] };
    if (eventRow.dayId) {
      const list = eventsByDayId.get(eventRow.dayId) ?? [];
      list.push(event);
      eventsByDayId.set(eventRow.dayId, list);
    } else {
      unscheduledEvents.push(event);
    }
  }

  const days: DayItinerary[] = dayRows.map((dayRow) => ({
    ...offlineDayToType(dayRow),
    events: eventsByDayId.get(dayRow.id) ?? [],
  }));

  return {
    trip: offlineTripToType(tripRow, now),
    days,
    unscheduledEvents,
    docs: docRows.map(offlineDocumentToType),
    collaborators: [],
    packingItems: packingItemRows.map(offlinePackingItemToType),
    packingLists: [],
    reservations: [],
  };
}

export async function readTripListFromMirror(database: OfflineDb, now: Date): Promise<TripListEntry[]> {
  const tripRows = await database.trips.where("ownerId").equals(database.userId).toArray();

  return tripRows
    .map((tripRow) => ({ trip: offlineTripToType(tripRow, now), todayEvents: [] }))
    .sort((first, second) => (first.trip.startDate ?? "").localeCompare(second.trip.startDate ?? ""));
}
