"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import Dexie, { type Table } from "dexie";
import { assertClientId, formatFileSize, getTripStatus, inferDocKind } from "@/lib/utils";
import { getNow } from "@/lib/mock-date";
import {
  OfflineEntityType,
  OFFLINE_DB_SCHEMA_V1,
  OFFLINE_DB_SCHEMA_V2,
  OfflineOperation,
  OfflineSyncStatus,
  type OfflineDay,
  type OfflineDocument,
  type OfflineEvent,
  type OfflineOutboxEntry,
  type OfflinePackingItem,
  type OfflineSyncStatus as OfflineSyncStatusValue,
  type OfflineTrip,
} from "./schema";
import type {
  AddPackingItemInput,
  CreateEventInput,
  DayItinerary,
  Document,
  PackingItem,
  Trip,
  TripDetailPayload,
  TripEvent,
  TripListEntry,
  UpdateDayPatch,
  UpdateEventPatch,
  UpdatePackingItemInput,
} from "@/data/types";

type OfflineEntitySyncTable = "event" | "document" | "packingItem";

interface WriteDocumentLocallyInput {
  id: string;
  tripId?: string;
  eventId?: string;
  reservationId?: string;
  file: File;
}

interface OfflineDayUpdatePayload {
  dayId: string;
  patch: UpdateDayPatch;
}

type WritePackingItemLocallyInput =
  | {
      operation: "create";
      tripId: string;
      input: AddPackingItemInput;
    }
  | {
      operation: "update";
      itemId: string;
      patch: UpdatePackingItemInput;
    }
  | {
      operation: "toggle";
      itemId: string;
    };

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
    this.version(2).stores(OFFLINE_DB_SCHEMA_V2);
  }
}

const instances = new Map<string, OfflineDb>();
const trackedBlobUrls = new Set<string>();

export function trackBlobUrl(url: string | null): void {
  if (url && typeof URL.revokeObjectURL === "function") {
    trackedBlobUrls.add(url);
  }
}

function revokeAllTrackedBlobUrls(): void {
  for (const url of trackedBlobUrls) {
    URL.revokeObjectURL(url);
  }
  trackedBlobUrls.clear();
}

function revokeTrackedBlobUrl(url: string | null): void {
  if (url && trackedBlobUrls.has(url) && typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(url);
    trackedBlobUrls.delete(url);
  }
}

function getNowIso(): string {
  return getNow().toISOString();
}

function byPosition(first: { position: number }, second: { position: number }): number {
  return first.position - second.position;
}

function byIsoString(firstValue?: string, secondValue?: string): number {
  return (firstValue ?? "").localeCompare(secondValue ?? "");
}

function replaceInListById<RowType extends { id?: string }>(
  rows: RowType[],
  nextRow: RowType & { id: string }
): RowType[] {
  const currentIndex = rows.findIndex((row) => row.id === nextRow.id);
  if (currentIndex === -1) {
    return [...rows, nextRow];
  }

  return rows.map((row) => (row.id === nextRow.id ? nextRow : row));
}

function mergeRowsById<RowType extends { id: string }>(baseRows: RowType[], overridingRows: RowType[]): RowType[] {
  const rowsById = new Map(baseRows.map((row) => [row.id, row]));

  for (const row of overridingRows) {
    rowsById.set(row.id, row);
  }

  return [...rowsById.values()];
}

function cloneDocs(docs: Document[] | undefined): Document[] {
  return docs?.map((doc) => ({ ...doc })) ?? [];
}

function renumberEventPositions(events: OfflineEvent[]): OfflineEvent[] {
  const dayGroups = new Map<string | "null", OfflineEvent[]>();

  for (const event of events) {
    const key = event.dayId ?? "null";
    const group = dayGroups.get(key) ?? [];
    group.push(event);
    dayGroups.set(key, group);
  }

  const result: OfflineEvent[] = [];

  for (const [, group] of dayGroups) {
    group.sort(byPosition);
    group.forEach((event, index) => {
      result.push({ ...event, position: index });
    });
  }

  return result;
}

function renumberPackingItemPositions(items: OfflinePackingItem[]): OfflinePackingItem[] {
  const listGroups = new Map<string | "null", OfflinePackingItem[]>();

  for (const item of items) {
    const key = item.listId ?? "null";
    const group = listGroups.get(key) ?? [];
    group.push(item);
    listGroups.set(key, group);
  }

  const result: OfflinePackingItem[] = [];

  for (const [, group] of listGroups) {
    group.sort(byPosition);
    group.forEach((item, index) => {
      result.push({ ...item, position: index });
    });
  }

  return result;
}

async function getSessionUserId(): Promise<string | null> {
  return fetch("/api/auth/session")
    .then((response) => response.json())
    .then((session: { user?: { id?: string } } | null) => session?.user?.id ?? null)
    .catch(() => null);
}

function tripToOfflineRow(trip: Trip, userId: string): OfflineTrip {
  const nowIso = getNowIso();

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
    createdAt: trip.createdAt ?? nowIso,
    updatedAt: trip.updatedAt ?? nowIso,
    listEntrySnapshot: null,
    detailSnapshot: null,
  };
}

function withListEntrySnapshot(tripRow: OfflineTrip, listEntrySnapshot: TripListEntry | null): OfflineTrip {
  return {
    ...tripRow,
    listEntrySnapshot,
  };
}

function withDetailSnapshot(tripRow: OfflineTrip, detailSnapshot: TripDetailPayload | null): OfflineTrip {
  return {
    ...tripRow,
    detailSnapshot,
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

function cloneTripWithCurrentStatus(trip: Trip, now: Date): Trip {
  return {
    ...trip,
    status: getTripStatus(trip.startDate ?? null, trip.endDate ?? null, now),
  };
}

function cloneTripListEntrySnapshot(entry: TripListEntry, now: Date): TripListEntry {
  return {
    ...entry,
    trip: cloneTripWithCurrentStatus(entry.trip, now),
    todayEvents: entry.todayEvents.map((event) => ({ ...event })),
  };
}

function cloneTripDetailSnapshot(detail: TripDetailPayload, now: Date): TripDetailPayload {
  return {
    ...detail,
    trip: cloneTripWithCurrentStatus(detail.trip, now),
    days: detail.days.map((day) => ({
      ...day,
      events: day.events.map((event) => ({ ...event, docs: event.docs?.map((doc) => ({ ...doc })) ?? [] })),
      notes: day.notes?.map((note) => ({ ...note })),
      checklists: day.checklists?.map((checklist) => ({
        ...checklist,
        items: checklist.items.map((item) => ({ ...item })),
      })),
    })),
    unscheduledEvents: detail.unscheduledEvents.map((event) => ({
      ...event,
      docs: event.docs?.map((doc) => ({ ...doc })) ?? [],
    })),
    docs: detail.docs.map((doc) => ({ ...doc })),
    collaborators: detail.collaborators.map((collaborator) => ({ ...collaborator })),
    packingItems: detail.packingItems.map((item) => ({ ...item })),
    packingLists: detail.packingLists.map((list) => ({ ...list })),
    reservations: detail.reservations.map((reservation) => ({
      ...reservation,
      documents: reservation.documents?.map((doc) => ({ ...doc })),
    })),
  };
}

function syncTripIntoListSnapshot(snapshot: TripListEntry | null, trip: Trip): TripListEntry | null {
  if (!snapshot) return null;

  return {
    ...snapshot,
    trip: {
      ...snapshot.trip,
      ...trip,
    },
  };
}

function syncTripIntoDetailSnapshot(snapshot: TripDetailPayload | null, trip: Trip): TripDetailPayload | null {
  if (!snapshot) return null;

  return {
    ...snapshot,
    trip: {
      ...snapshot.trip,
      ...trip,
    },
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

function eventToOfflineRow(
  event: TripEvent,
  tripId: string,
  syncStatus: OfflineSyncStatusValue = OfflineSyncStatus.Synced
): OfflineEvent {
  const nowIso = getNowIso();

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
    locationLat: event.locationLat ?? null,
    locationLng: event.locationLng ?? null,
    position: event.position,
    cost: event.cost ?? null,
    confirmationNumber: event.confirmationNumber ?? null,
    createdAt: event.createdAt ?? nowIso,
    updatedAt: event.updatedAt ?? nowIso,
    syncStatus,
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
    locationLat: row.locationLat ?? undefined,
    locationLng: row.locationLng ?? undefined,
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

function documentToOfflineRow(
  doc: Document,
  context: DocumentContext,
  syncStatus: OfflineSyncStatusValue = OfflineSyncStatus.Synced
): OfflineDocument {
  const nowIso = getNowIso();

  return {
    id: doc.id,
    tripId: context.tripId,
    eventId: context.eventId,
    reservationId: context.reservationId,
    name: doc.name,
    kind: doc.kind,
    scope: doc.scope,
    size: doc.size ?? null,
    offline: doc.offline,
    url: doc.url ?? null,
    addedAt: doc.addedAt ?? nowIso,
    updatedAt: doc.addedAt ?? nowIso,
    syncStatus,
  };
}

const VALID_DOC_KINDS = new Set(["pdf", "image", "doc"]);

function offlineDocumentToType(row: OfflineDocument): Document {
  return {
    id: row.id,
    name: row.name,
    kind: (VALID_DOC_KINDS.has(row.kind) ? row.kind : "doc") as Document["kind"],
    size: row.size ?? undefined,
    scope: row.scope as Document["scope"],
    offline: row.offline,
    url: row.url ?? undefined,
    addedAt: row.addedAt,
  };
}

function packingItemToOfflineRow(
  item: PackingItem & { id: string },
  tripId: string,
  syncStatus: OfflineSyncStatusValue = OfflineSyncStatus.Synced
): OfflinePackingItem {
  return {
    id: item.id,
    tripId,
    listId: item.listId ?? null,
    name: item.name,
    done: item.done,
    isLabel: item.isLabel ?? false,
    position: item.position ?? 0,
    updatedAt: getNowIso(),
    syncStatus,
  };
}

function offlinePackingItemToType(row: OfflinePackingItem): PackingItem & { id: string } {
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

function eventPayloadFromRow(row: OfflineEvent): Omit<OfflineEvent, "syncStatus"> {
  return {
    id: row.id,
    tripId: row.tripId,
    dayId: row.dayId,
    name: row.name,
    note: row.note,
    startAt: row.startAt,
    endAt: row.endAt,
    locationName: row.locationName,
    locationAddress: row.locationAddress,
    locationLat: row.locationLat,
    locationLng: row.locationLng,
    position: row.position,
    cost: row.cost,
    confirmationNumber: row.confirmationNumber,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function documentPayloadFromRow(
  row: OfflineDocument,
  blobRef: string
): Omit<OfflineDocument, "syncStatus"> & { blobRef: string } {
  return {
    id: row.id,
    tripId: row.tripId,
    eventId: row.eventId,
    reservationId: row.reservationId,
    name: row.name,
    kind: row.kind,
    scope: row.scope,
    size: row.size,
    offline: row.offline,
    url: row.url,
    addedAt: row.addedAt,
    updatedAt: row.updatedAt,
    blobRef,
  };
}

function packingItemPayloadFromRow(row: OfflinePackingItem): Omit<OfflinePackingItem, "syncStatus"> {
  return {
    id: row.id,
    tripId: row.tripId,
    listId: row.listId,
    name: row.name,
    done: row.done,
    isLabel: row.isLabel,
    position: row.position,
    updatedAt: row.updatedAt,
  };
}

function findEventInSnapshot(detail: TripDetailPayload, eventId: string): TripEvent | null {
  for (const day of detail.days) {
    const event = day.events.find((candidate) => candidate.id === eventId);
    if (event) {
      return event;
    }
  }

  return detail.unscheduledEvents.find((candidate) => candidate.id === eventId) ?? null;
}

function removeEventFromSnapshot(detail: TripDetailPayload, eventId: string): TripEvent | null {
  for (const day of detail.days) {
    const eventIndex = day.events.findIndex((candidate) => candidate.id === eventId);
    if (eventIndex !== -1) {
      const [removedEvent] = day.events.splice(eventIndex, 1);
      return removedEvent ?? null;
    }
  }

  const unscheduledIndex = detail.unscheduledEvents.findIndex((candidate) => candidate.id === eventId);
  if (unscheduledIndex !== -1) {
    const [removedEvent] = detail.unscheduledEvents.splice(unscheduledIndex, 1);
    return removedEvent ?? null;
  }

  return null;
}

function upsertEventInSnapshot(
  detail: TripDetailPayload,
  row: OfflineEvent,
  explicitDocRows: OfflineDocument[] = []
): void {
  const existingEvent = removeEventFromSnapshot(detail, row.id);
  const nextDocs =
    explicitDocRows.length > 0 ? explicitDocRows.map(offlineDocumentToType) : cloneDocs(existingEvent?.docs);
  const nextEvent: TripEvent = {
    ...existingEvent,
    ...offlineEventToType(row),
    docs: nextDocs,
  };

  if (row.dayId) {
    const targetDay = detail.days.find((day) => day.id === row.dayId);
    if (targetDay) {
      targetDay.events = [...targetDay.events, nextEvent].sort(byPosition);
      return;
    }
  }

  detail.unscheduledEvents = [...detail.unscheduledEvents, nextEvent].sort(byPosition);
}

function upsertDocumentInSnapshot(detail: TripDetailPayload, row: OfflineDocument): void {
  const existingDocument = detail.docs.find((doc) => doc.id === row.id);
  const nextDocument: Document = {
    ...existingDocument,
    ...offlineDocumentToType(row),
  };

  detail.docs = replaceInListById(detail.docs, nextDocument);

  if (row.eventId) {
    const event = findEventInSnapshot(detail, row.eventId);
    if (event) {
      event.docs = replaceInListById(cloneDocs(event.docs), nextDocument);
    }
  }
}

function upsertPackingItemInSnapshot(detail: TripDetailPayload, row: OfflinePackingItem): void {
  const nextItem = offlinePackingItemToType(row);
  detail.packingItems = replaceInListById(detail.packingItems, nextItem).sort(
    (first, second) => (first.position ?? 0) - (second.position ?? 0)
  );
}

function applyPendingRowsToDetail(
  detail: TripDetailPayload,
  pendingDayUpdates: Map<string, OfflineDayUpdatePayload>,
  pendingDayRows: Map<string, OfflineDay>,
  deletedEventIds: Set<string>,
  deletedDocIds: Set<string>,
  deletedPackingItemIds: Set<string>,
  pendingEventRows: OfflineEvent[],
  pendingDocRows: OfflineDocument[],
  pendingPackingItemRows: OfflinePackingItem[]
): TripDetailPayload {
  const nextDetail = cloneTripDetailSnapshot(detail, getNow());

  for (const eventId of deletedEventIds) {
    const removedEvent = removeEventFromSnapshot(nextDetail, eventId);
    for (const doc of removedEvent?.docs ?? []) {
      removeDocumentFromSnapshot(nextDetail, doc.id);
    }
  }

  for (const documentId of deletedDocIds) {
    removeDocumentFromSnapshot(nextDetail, documentId);
  }

  for (const packingItemId of deletedPackingItemIds) {
    removePackingItemFromSnapshot(nextDetail, packingItemId);
  }

  for (const [dayId, pendingDayUpdate] of pendingDayUpdates) {
    applyPendingDayUpdateToSnapshot(nextDetail, dayId, pendingDayUpdate.patch, pendingDayRows.get(dayId));
  }

  for (const eventRow of pendingEventRows.sort(byPosition)) {
    const eventDocRows = pendingDocRows
      .filter((docRow) => docRow.eventId === eventRow.id)
      .sort((first, second) => byIsoString(first.addedAt, second.addedAt));
    upsertEventInSnapshot(nextDetail, eventRow, eventDocRows);
  }

  for (const docRow of pendingDocRows.sort((first, second) => byIsoString(first.addedAt, second.addedAt))) {
    upsertDocumentInSnapshot(nextDetail, docRow);
  }

  for (const packingItemRow of pendingPackingItemRows.sort(byPosition)) {
    upsertPackingItemInSnapshot(nextDetail, packingItemRow);
  }

  return nextDetail;
}

function updateTripSnapshot(
  tripRow: OfflineTrip | undefined,
  updateSnapshot: (detailSnapshot: TripDetailPayload) => void
): TripDetailPayload | null {
  if (!tripRow?.detailSnapshot) {
    return tripRow?.detailSnapshot ?? null;
  }

  const nextDetailSnapshot = cloneTripDetailSnapshot(tripRow.detailSnapshot, getNow());
  updateSnapshot(nextDetailSnapshot);
  return nextDetailSnapshot;
}

function removeDocumentFromSnapshot(detail: TripDetailPayload, documentId: string): void {
  detail.docs = detail.docs.filter((doc) => doc.id !== documentId);

  for (const day of detail.days) {
    day.events = day.events.map((event) => ({
      ...event,
      docs: cloneDocs(event.docs).filter((doc) => doc.id !== documentId),
    }));
  }

  detail.unscheduledEvents = detail.unscheduledEvents.map((event) => ({
    ...event,
    docs: cloneDocs(event.docs).filter((doc) => doc.id !== documentId),
  }));

  detail.reservations = detail.reservations.map((reservation) => ({
    ...reservation,
    documents: cloneDocs(reservation.documents).filter((doc) => doc.id !== documentId),
  }));
}

function removePackingItemFromSnapshot(detail: TripDetailPayload, packingItemId: string): void {
  detail.packingItems = detail.packingItems.filter((item) => item.id !== packingItemId);
}

function applyPendingDayUpdateToSnapshot(
  detail: TripDetailPayload,
  dayId: string,
  patch: UpdateDayPatch,
  overridingRow?: OfflineDay
): void {
  detail.days = detail.days.map((day) => {
    if (day.id !== dayId) {
      return day;
    }

    return {
      ...day,
      ...(overridingRow
        ? {
            date: overridingRow.date ?? undefined,
            dayNumber: overridingRow.dayNumber,
            label: overridingRow.label ?? undefined,
            subtitle: overridingRow.subtitle ?? undefined,
            tripId: overridingRow.tripId,
          }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(patch, "label") ? { label: patch.label ?? day.label } : {}),
      ...(Object.prototype.hasOwnProperty.call(patch, "subtitle") ? { subtitle: patch.subtitle ?? undefined } : {}),
      ...(Object.prototype.hasOwnProperty.call(patch, "weather") ? { weather: patch.weather ?? undefined } : {}),
      ...(Object.prototype.hasOwnProperty.call(patch, "travelSummary")
        ? { travelSummary: patch.travelSummary ?? undefined }
        : {}),
    };
  });
}

function hasOutboxOperation(
  entries: OfflineOutboxEntry[],
  operation: (typeof OfflineOperation)[keyof typeof OfflineOperation]
): boolean {
  return entries.some((entry) => entry.operation === operation);
}

async function getOutboxEntriesForEntity(database: OfflineDb, entityId: string): Promise<OfflineOutboxEntry[]> {
  return database.outbox.where("entityId").equals(entityId).toArray();
}

async function clearOutboxEntriesForEntity(database: OfflineDb, entityId: string): Promise<OfflineOutboxEntry[]> {
  const entries = await getOutboxEntriesForEntity(database, entityId);

  for (const entry of entries) {
    await database.outbox.delete(entry.id);
  }

  return entries;
}

export async function getOfflineDb(userId: string): Promise<OfflineDb> {
  const existing = instances.get(userId);
  if (existing) return existing;

  const instance = new OfflineDb(userId);
  instances.set(userId, instance);
  return instance;
}

export async function clearOfflineDb(userId: string): Promise<void> {
  revokeAllTrackedBlobUrls();
  instances.delete(userId);
  await Dexie.delete(`packt-offline-${userId}`);
}

export function useOfflineDb(): OfflineDb | null {
  const [database, setDatabase] = useState<OfflineDb | null>(null);

  useEffect(() => {
    let cancelled = false;

    getSessionUserId()
      .then((userId) => (userId ? getOfflineDb(userId) : null))
      .then((instance) => {
        if (!cancelled) {
          setDatabase(instance);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDatabase(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return database;
}

export function useOfflineEntitySyncStatus(
  entityType: OfflineEntitySyncTable,
  entityId?: string
): OfflineSyncStatusValue {
  const database = useOfflineDb();

  const syncStatus = useLiveQuery(async () => {
    if (!database || !entityId) {
      return OfflineSyncStatus.Synced;
    }

    if (entityType === "event") {
      return (await database.events.get(entityId))?.syncStatus ?? OfflineSyncStatus.Synced;
    }

    if (entityType === "document") {
      return (await database.documents.get(entityId))?.syncStatus ?? OfflineSyncStatus.Synced;
    }

    return (await database.packingItems.get(entityId))?.syncStatus ?? OfflineSyncStatus.Synced;
  }, [database, entityId, entityType]);

  return syncStatus ?? OfflineSyncStatus.Synced;
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

  const eventRows = allEvents.map((event) => eventToOfflineRow(event, tripId));
  const packingItemRows = detail.packingItems
    .filter((item): item is PackingItem & { id: string } => !!item.id)
    .map((item) => packingItemToOfflineRow(item, tripId));

  await database.transaction(
    "rw",
    [database.trips, database.days, database.events, database.documents, database.packingItems, database.outbox],
    async () => {
      const existingTripRow = await database.trips.get(tripId);
      const pendingEventRows = (await database.events.where("tripId").equals(tripId).toArray()).filter(
        (row) => row.syncStatus === OfflineSyncStatus.Pending
      );
      const pendingDocRows = (await database.documents.where("tripId").equals(tripId).toArray()).filter(
        (row) => row.syncStatus === OfflineSyncStatus.Pending
      );
      const pendingPackingItemRows = (await database.packingItems.where("tripId").equals(tripId).toArray()).filter(
        (row) => row.syncStatus === OfflineSyncStatus.Pending
      );
      const deletedEventIds = new Set<string>();
      const deletedDocIds = new Set<string>();
      const deletedPackingItemIds = new Set<string>();
      const pendingDayRows = new Map<string, OfflineDay>();
      const pendingDayUpdates = new Map<string, OfflineDayUpdatePayload>();

      const localDays = (await database.days.where("tripId").equals(tripId).toArray()).filter(
        (row) => row.syncStatus === OfflineSyncStatus.Pending
      );
      for (const day of localDays) {
        pendingDayRows.set(day.id, day);
      }

      for (const dayRow of dayRows) {
        const dayEntries = (await getOutboxEntriesForEntity(database, dayRow.id))
          .filter((entry) => entry.entityType === OfflineEntityType.Day && entry.operation === OfflineOperation.Update)
          .sort((first, second) => first.createdAt.localeCompare(second.createdAt));
        const latestDayEntry = dayEntries.at(-1);
        if (!latestDayEntry) {
          continue;
        }

        const localDayRow = await database.days.get(dayRow.id);
        if (localDayRow) {
          pendingDayRows.set(dayRow.id, localDayRow);
        }

        pendingDayUpdates.set(dayRow.id, latestDayEntry.payload as OfflineDayUpdatePayload);
      }

      for (const eventRow of eventRows) {
        const entries = (await getOutboxEntriesForEntity(database, eventRow.id)).filter(
          (entry) => entry.entityType === OfflineEntityType.Event
        );
        if (hasOutboxOperation(entries, OfflineOperation.Delete)) {
          deletedEventIds.add(eventRow.id);
        }
      }

      for (const docRow of [...eventDocRows, ...tripScopedDocRows]) {
        const entries = (await getOutboxEntriesForEntity(database, docRow.id)).filter(
          (entry) => entry.entityType === OfflineEntityType.Document
        );
        if (hasOutboxOperation(entries, OfflineOperation.Delete)) {
          deletedDocIds.add(docRow.id);
        }
      }

      for (const packingItemRow of packingItemRows) {
        const entries = (await getOutboxEntriesForEntity(database, packingItemRow.id)).filter(
          (entry) => entry.entityType === OfflineEntityType.PackingItem
        );
        if (hasOutboxOperation(entries, OfflineOperation.Delete)) {
          deletedPackingItemIds.add(packingItemRow.id);
        }
      }

      await database.days.where("tripId").equals(tripId).delete();
      await database.events.where("tripId").equals(tripId).delete();
      await database.documents.where("tripId").equals(tripId).delete();
      await database.packingItems.where("tripId").equals(tripId).delete();

      const mergedDayRows = [
        ...dayRows.map((row) => pendingDayRows.get(row.id) ?? row),
        ...Array.from(pendingDayRows.entries())
          .filter(([, row]) => !dayRows.some((day) => day.id === row.id))
          .map(([, row]) => row),
      ];
      const mergedEventRows = renumberEventPositions(
        mergeRowsById(
          eventRows.filter((row) => !deletedEventIds.has(row.id)),
          pendingEventRows
        ).sort(byPosition)
      );
      const mergedDocRows = mergeRowsById(
        [...eventDocRows, ...tripScopedDocRows].filter(
          (row) => !deletedDocIds.has(row.id) && !deletedEventIds.has(row.eventId ?? "")
        ),
        pendingDocRows
      ).sort((first, second) => byIsoString(first.addedAt, second.addedAt));
      const mergedPackingItemRows = renumberPackingItemPositions(
        mergeRowsById(
          packingItemRows.filter((row) => !deletedPackingItemIds.has(row.id)),
          pendingPackingItemRows
        ).sort(byPosition)
      );
      const mergedDetailSnapshot =
        pendingDayUpdates.size > 0 ||
        deletedEventIds.size > 0 ||
        deletedDocIds.size > 0 ||
        deletedPackingItemIds.size > 0 ||
        pendingEventRows.length > 0 ||
        pendingDocRows.length > 0 ||
        pendingPackingItemRows.length > 0
          ? applyPendingRowsToDetail(
              detail,
              pendingDayUpdates,
              pendingDayRows,
              deletedEventIds,
              deletedDocIds,
              deletedPackingItemIds,
              pendingEventRows,
              pendingDocRows,
              pendingPackingItemRows
            )
          : detail;
      const tripRow = tripToOfflineRow(detail.trip, database.userId);

      await database.trips.put(
        withDetailSnapshot(
          withListEntrySnapshot(
            tripRow,
            syncTripIntoListSnapshot(existingTripRow?.listEntrySnapshot ?? null, detail.trip)
          ),
          mergedDetailSnapshot
        )
      );
      await database.days.bulkPut(mergedDayRows);
      await database.events.bulkPut(mergedEventRows);
      await database.documents.bulkPut(mergedDocRows);
      await database.packingItems.bulkPut(mergedPackingItemRows);
    }
  );
}

export async function mirrorTripListEntries(database: OfflineDb, entries: TripListEntry[]): Promise<void> {
  const existingRows = await database.trips.where("ownerId").equals(database.userId).toArray();
  const existingRowsById = new Map(existingRows.map((row) => [row.id, row]));
  const incomingTripIds = new Set(entries.map((entry) => entry.trip.id));
  const removedTripIds = existingRows.filter((row) => !incomingTripIds.has(row.id)).map((row) => row.id);
  const rows = entries.map((entry) => {
    const existingRow = existingRowsById.get(entry.trip.id);
    const tripRow = tripToOfflineRow(entry.trip, database.userId);
    return withDetailSnapshot(
      withListEntrySnapshot(tripRow, entry),
      syncTripIntoDetailSnapshot(existingRow?.detailSnapshot ?? null, entry.trip)
    );
  });

  await database.transaction(
    "rw",
    [database.trips, database.days, database.events, database.documents, database.packingItems, database.outbox],
    async () => {
      for (const removedTripId of removedTripIds) {
        const deletedEventIds = (await database.events.where("tripId").equals(removedTripId).toArray()).map(
          (row) => row.id
        );
        const deletedDocIds = (await database.documents.where("tripId").equals(removedTripId).toArray()).map(
          (row) => row.id
        );
        const deletedPackingItemIds = (await database.packingItems.where("tripId").equals(removedTripId).toArray()).map(
          (row) => row.id
        );
        const deletedEntityIds = [...deletedEventIds, ...deletedDocIds, ...deletedPackingItemIds];

        await database.trips.delete(removedTripId);
        await database.days.where("tripId").equals(removedTripId).delete();
        await database.events.where("tripId").equals(removedTripId).delete();
        await database.documents.where("tripId").equals(removedTripId).delete();
        await database.packingItems.where("tripId").equals(removedTripId).delete();

        if (deletedEntityIds.length > 0) {
          const pendingOutbox = await database.outbox.toArray();
          const orphanedIds = pendingOutbox
            .filter((entry) => deletedEntityIds.includes(entry.entityId))
            .map((entry) => entry.id);
          for (const orphanedId of orphanedIds) {
            await database.outbox.delete(orphanedId);
          }
        }
      }

      await database.trips.bulkPut(rows);
    }
  );
}

export async function readTripDetailFromMirror(
  database: OfflineDb,
  tripId: string,
  now: Date
): Promise<TripDetailPayload | null> {
  const tripRow = await database.trips.get(tripId);
  if (!tripRow) return null;

  if (tripRow.detailSnapshot) {
    return cloneTripDetailSnapshot(tripRow.detailSnapshot, now);
  }

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
  for (const eventRow of eventRows) {
    const event: TripEvent = { ...offlineEventToType(eventRow), docs: docsByEventId.get(eventRow.id) ?? [] };
    if (eventRow.dayId) {
      const list = eventsByDayId.get(eventRow.dayId) ?? [];
      list.push(event);
      eventsByDayId.set(eventRow.dayId, list);
    } else {
      unscheduledEvents.push(event);
    }
  }

  unscheduledEvents.sort(byPosition);

  const days: DayItinerary[] = dayRows.map((dayRow) => ({
    ...offlineDayToType(dayRow),
    events: (eventsByDayId.get(dayRow.id) ?? []).sort(byPosition),
  }));

  return {
    trip: offlineTripToType(tripRow, now),
    days,
    unscheduledEvents,
    docs: docRows.filter((docRow) => !docRow.eventId).map(offlineDocumentToType),
    collaborators: [],
    packingItems: packingItemRows.map(offlinePackingItemToType),
    packingLists: [],
    reservations: [],
  };
}

export async function readTripListFromMirror(database: OfflineDb, now: Date): Promise<TripListEntry[]> {
  const tripRows = await database.trips.where("ownerId").equals(database.userId).toArray();

  return tripRows
    .map((tripRow) =>
      tripRow.listEntrySnapshot
        ? cloneTripListEntrySnapshot(tripRow.listEntrySnapshot, now)
        : { trip: offlineTripToType(tripRow, now), todayEvents: [] }
    )
    .sort((first, second) => {
      const firstDate = first.trip.startDate ? new Date(first.trip.startDate).getTime() : 0;
      const secondDate = second.trip.startDate ? new Date(second.trip.startDate).getTime() : 0;
      return firstDate - secondDate;
    });
}

export async function writeEventLocally(
  database: OfflineDb,
  tripId: string,
  dayId: string,
  input: CreateEventInput & { id: string }
): Promise<void> {
  assertClientId(input.id);
  const { enqueueOutbox } = await import("./outbox");
  const nowIso = getNowIso();

  await database.transaction("rw", database.trips, database.events, database.outbox, async () => {
    const tripRow = await database.trips.get(tripId);
    const existingEventRows = await database.events.where("tripId").equals(tripId).toArray();
    const dayEventRows = existingEventRows.filter((row) => row.dayId === dayId).sort(byPosition);

    let nextPosition = dayEventRows.at(-1)?.position ?? -1;

    if (input.afterEventId) {
      const targetEvent = dayEventRows.find((row) => row.id === input.afterEventId);
      if (targetEvent) {
        nextPosition = targetEvent.position + 1;
        const shiftedRows = dayEventRows
          .filter((row) => row.position > targetEvent.position)
          .map((row) => ({ ...row, position: row.position + 1 }));
        if (shiftedRows.length > 0) {
          await database.events.bulkPut(shiftedRows);
        }
      } else {
        nextPosition = (dayEventRows.at(-1)?.position ?? -1) + 1;
      }
    } else if (input.insertAtPosition !== undefined) {
      nextPosition = Math.max(0, input.insertAtPosition);
      const shiftedRows = dayEventRows
        .filter((row) => row.position >= input.insertAtPosition!)
        .map((row) => ({ ...row, position: row.position + 1 }));
      if (shiftedRows.length > 0) {
        await database.events.bulkPut(shiftedRows);
      }
    } else {
      nextPosition += 1;
    }

    const row: OfflineEvent = {
      id: input.id,
      tripId,
      dayId,
      name: input.name,
      note: input.note ?? null,
      startAt: input.startAt ?? null,
      endAt: input.endAt ?? null,
      locationName: input.locationName ?? null,
      locationAddress: input.locationAddress ?? null,
      locationLat: input.locationLat ?? null,
      locationLng: input.locationLng ?? null,
      position: nextPosition,
      cost: input.cost ?? null,
      confirmationNumber: input.confirmationNumber ?? null,
      createdAt: nowIso,
      updatedAt: nowIso,
      syncStatus: OfflineSyncStatus.Pending,
    };

    await database.events.put(row);
    await enqueueOutbox(database, "event", row.id, OfflineOperation.Create, eventPayloadFromRow(row));

    if (tripRow) {
      const nextDetailSnapshot = updateTripSnapshot(tripRow, (detailSnapshot) => {
        upsertEventInSnapshot(detailSnapshot, row);
      });

      await database.trips.put(withDetailSnapshot(tripRow, nextDetailSnapshot));
    }
  });
}

export async function updateEventLocally(database: OfflineDb, eventId: string, patch: UpdateEventPatch): Promise<void> {
  const { enqueueOutbox } = await import("./outbox");
  const nowIso = getNowIso();

  await database.transaction("rw", database.trips, database.events, database.outbox, async () => {
    const currentRow = await database.events.get(eventId);
    if (!currentRow) return;

    const tripRow = await database.trips.get(currentRow.tripId);
    const nextRow: OfflineEvent = {
      ...currentRow,
      name: Object.prototype.hasOwnProperty.call(patch, "name") ? (patch.name ?? currentRow.name) : currentRow.name,
      note: Object.prototype.hasOwnProperty.call(patch, "note") ? (patch.note ?? null) : currentRow.note,
      startAt: Object.prototype.hasOwnProperty.call(patch, "startAt") ? (patch.startAt ?? null) : currentRow.startAt,
      endAt: Object.prototype.hasOwnProperty.call(patch, "endAt") ? (patch.endAt ?? null) : currentRow.endAt,
      locationName: Object.prototype.hasOwnProperty.call(patch, "locationName")
        ? (patch.locationName ?? null)
        : currentRow.locationName,
      locationAddress: Object.prototype.hasOwnProperty.call(patch, "locationAddress")
        ? (patch.locationAddress ?? null)
        : currentRow.locationAddress,
      locationLat: Object.prototype.hasOwnProperty.call(patch, "locationLat")
        ? (patch.locationLat ?? null)
        : currentRow.locationLat,
      locationLng: Object.prototype.hasOwnProperty.call(patch, "locationLng")
        ? (patch.locationLng ?? null)
        : currentRow.locationLng,
      cost: Object.prototype.hasOwnProperty.call(patch, "cost") ? (patch.cost ?? null) : currentRow.cost,
      confirmationNumber: Object.prototype.hasOwnProperty.call(patch, "confirmationNumber")
        ? (patch.confirmationNumber ?? null)
        : currentRow.confirmationNumber,
      updatedAt: nowIso,
      syncStatus: OfflineSyncStatus.Pending,
    };

    await database.events.put(nextRow);
    await enqueueOutbox(database, "event", nextRow.id, OfflineOperation.Update, eventPayloadFromRow(nextRow));

    if (tripRow) {
      const nextDetailSnapshot = updateTripSnapshot(tripRow, (detailSnapshot) => {
        upsertEventInSnapshot(detailSnapshot, nextRow);
      });

      await database.trips.put(withDetailSnapshot(tripRow, nextDetailSnapshot));
    }
  });
}

export async function reorderEventsLocally(
  database: OfflineDb,
  dayId: string,
  reorderedEvents: Array<{ id: string; position: number }>
): Promise<void> {
  const { enqueueOutbox } = await import("./outbox");
  const nowIso = getNowIso();

  await database.transaction("rw", database.trips, database.events, database.outbox, async () => {
    const nextRows: OfflineEvent[] = [];

    for (const reorderedEvent of reorderedEvents) {
      const currentRow = await database.events.get(reorderedEvent.id);
      if (!currentRow || currentRow.dayId !== dayId) {
        continue;
      }

      const nextRow: OfflineEvent = {
        ...currentRow,
        position: reorderedEvent.position,
        updatedAt: nowIso,
        syncStatus: OfflineSyncStatus.Pending,
      };

      await database.events.put(nextRow);
      await clearOutboxEntriesForEntity(database, nextRow.id);
      await enqueueOutbox(database, "event", nextRow.id, OfflineOperation.Update, eventPayloadFromRow(nextRow));
      nextRows.push(nextRow);
    }

    const tripId = nextRows[0]?.tripId;
    if (!tripId) {
      return;
    }

    const tripRow = await database.trips.get(tripId);
    if (tripRow) {
      const nextDetailSnapshot = updateTripSnapshot(tripRow, (detailSnapshot) => {
        for (const nextRow of nextRows) {
          upsertEventInSnapshot(detailSnapshot, nextRow);
        }
      });

      await database.trips.put(withDetailSnapshot(tripRow, nextDetailSnapshot));
    }
  });
}

export async function deleteEventLocally(database: OfflineDb, eventId: string): Promise<void> {
  const { enqueueOutbox } = await import("./outbox");

  await database.transaction("rw", database.trips, database.events, database.documents, database.outbox, async () => {
    const currentRow = await database.events.get(eventId);
    if (!currentRow) return;

    const tripRow = await database.trips.get(currentRow.tripId);
    const existingEntries = await clearOutboxEntriesForEntity(database, eventId);
    const eventDocRows = await database.documents.where("eventId").equals(eventId).toArray();

    for (const docRow of eventDocRows) {
      revokeTrackedBlobUrl(docRow.url);
      await clearOutboxEntriesForEntity(database, docRow.id);
      await database.documents.delete(docRow.id);
    }

    if (!hasOutboxOperation(existingEntries, OfflineOperation.Create)) {
      await enqueueOutbox(database, "event", currentRow.id, OfflineOperation.Delete, eventPayloadFromRow(currentRow));
    }

    await database.events.delete(eventId);

    if (tripRow) {
      const nextDetailSnapshot = updateTripSnapshot(tripRow, (detailSnapshot) => {
        const removedEvent = removeEventFromSnapshot(detailSnapshot, eventId);
        for (const doc of removedEvent?.docs ?? []) {
          removeDocumentFromSnapshot(detailSnapshot, doc.id);
        }
      });

      await database.trips.put(withDetailSnapshot(tripRow, nextDetailSnapshot));
    }
  });
}

export async function updateDayLocally(database: OfflineDb, dayId: string, patch: UpdateDayPatch): Promise<void> {
  const { enqueueOutbox } = await import("./outbox");

  await database.transaction("rw", database.trips, database.days, database.outbox, async () => {
    const currentRow = await database.days.get(dayId);
    if (!currentRow) return;

    const tripRow = await database.trips.get(currentRow.tripId);
    const nowIso = getNowIso();
    const nextRow: OfflineDay = {
      ...currentRow,
      label: Object.prototype.hasOwnProperty.call(patch, "label")
        ? (patch.label ?? currentRow.label)
        : currentRow.label,
      subtitle: Object.prototype.hasOwnProperty.call(patch, "subtitle")
        ? (patch.subtitle ?? null)
        : currentRow.subtitle,
      syncStatus: OfflineSyncStatus.Pending,
      updatedAt: nowIso,
    };

    await database.days.put(nextRow);
    await enqueueOutbox(database, "day", currentRow.id, OfflineOperation.Update, {
      dayId: currentRow.id,
      patch,
    } satisfies OfflineDayUpdatePayload);

    if (tripRow) {
      const nextDetailSnapshot = updateTripSnapshot(tripRow, (detailSnapshot) => {
        applyPendingDayUpdateToSnapshot(detailSnapshot, currentRow.id, patch, nextRow);
      });

      await database.trips.put(withDetailSnapshot(tripRow, nextDetailSnapshot));
    }
  });
}

export async function writeDocumentLocally(database: OfflineDb, input: WriteDocumentLocallyInput): Promise<void> {
  assertClientId(input.id);
  const { enqueueOutbox } = await import("./outbox");
  const nowIso = getNowIso();

  await database.transaction("rw", database.trips, database.events, database.documents, database.outbox, async () => {
    const eventRow = input.eventId ? await database.events.get(input.eventId) : undefined;
    if (input.eventId && !eventRow) {
      throw new Error("Event not found");
    }
    const tripId = input.tripId ?? eventRow?.tripId ?? null;
    if (!tripId) {
      throw new Error("Trip not found");
    }

    const tripRow = await database.trips.get(tripId);
    const objectUrl =
      typeof URL !== "undefined" && typeof URL.createObjectURL === "function" ? URL.createObjectURL(input.file) : null;
    trackBlobUrl(objectUrl);
    const row: OfflineDocument = {
      id: input.id,
      tripId,
      eventId: input.eventId ?? null,
      reservationId: input.reservationId ?? null,
      name: input.file.name,
      kind: inferDocKind(input.file.type),
      scope: input.eventId ? "event" : input.reservationId ? "reservation" : "trip",
      size: formatFileSize(input.file.size),
      offline: true,
      url: objectUrl,
      addedAt: nowIso,
      updatedAt: nowIso,
      syncStatus: OfflineSyncStatus.Pending,
    };

    await database.documents.put(row);
    await enqueueOutbox(database, "document", row.id, OfflineOperation.Create, documentPayloadFromRow(row, row.id));

    if (tripRow) {
      const nextDetailSnapshot = updateTripSnapshot(tripRow, (detailSnapshot) => {
        upsertDocumentInSnapshot(detailSnapshot, row);
      });

      await database.trips.put(withDetailSnapshot(tripRow, nextDetailSnapshot));
    }
  });
}

export async function deleteDocumentLocally(database: OfflineDb, documentId: string): Promise<void> {
  const { enqueueOutbox } = await import("./outbox");

  await database.transaction("rw", database.trips, database.documents, database.outbox, async () => {
    const currentRow = await database.documents.get(documentId);
    if (!currentRow) return;

    const tripRow = currentRow.tripId ? await database.trips.get(currentRow.tripId) : undefined;
    const existingEntries = await clearOutboxEntriesForEntity(database, documentId);
    revokeTrackedBlobUrl(currentRow.url);

    if (!hasOutboxOperation(existingEntries, OfflineOperation.Create)) {
      await enqueueOutbox(
        database,
        "document",
        currentRow.id,
        OfflineOperation.Delete,
        documentPayloadFromRow(currentRow, currentRow.id)
      );
    }

    await database.documents.delete(documentId);

    if (tripRow) {
      const nextDetailSnapshot = updateTripSnapshot(tripRow, (detailSnapshot) => {
        removeDocumentFromSnapshot(detailSnapshot, documentId);
      });

      await database.trips.put(withDetailSnapshot(tripRow, nextDetailSnapshot));
    }
  });
}

export async function writePackingItemLocally(database: OfflineDb, input: WritePackingItemLocallyInput): Promise<void> {
  const { enqueueOutbox } = await import("./outbox");
  const nowIso = getNowIso();

  await database.transaction("rw", database.trips, database.packingItems, database.outbox, async () => {
    if (input.operation === "create") {
      const validatedId = assertClientId(input.input.id).id;
      if (!validatedId) {
        throw new Error("Packing item id required");
      }
      const tripRow = await database.trips.get(input.tripId);
      const allTripRows = await database.packingItems.where("tripId").equals(input.tripId).toArray();
      const listId = input.input.listId ?? null;
      const labelId = input.input.isLabel ? null : (input.input.labelId ?? null);
      const scopedRows = allTripRows.filter((row) => (row.listId ?? null) === listId).sort(byPosition);
      const trimmedName = input.input.name.trim();
      if (!trimmedName) return;

      let nextPosition = (scopedRows.at(-1)?.position ?? -1) + 1;

      if (input.input.afterItemId) {
        const targetRow = scopedRows.find((row) => row.id === input.input.afterItemId);
        if (!targetRow) {
          throw new Error("Target item not found");
        }
        nextPosition = targetRow.position + 1;
        const shiftedRows = scopedRows
          .filter((row) => row.position > targetRow.position)
          .map((row) => ({ ...row, position: row.position + 1 }));
        if (shiftedRows.length > 0) {
          await database.packingItems.bulkPut(shiftedRows);
        }
      } else if (input.input.beforeItemId) {
        const targetRow = scopedRows.find((row) => row.id === input.input.beforeItemId);
        if (!targetRow) {
          throw new Error("Target item not found");
        }
        nextPosition = targetRow.position;
        const shiftedRows = scopedRows
          .filter((row) => row.position >= targetRow.position)
          .map((row) => ({ ...row, position: row.position + 1 }));
        if (shiftedRows.length > 0) {
          await database.packingItems.bulkPut(shiftedRows);
        }
      }

      const row: OfflinePackingItem = {
        id: validatedId,
        tripId: input.tripId,
        listId,
        name: trimmedName,
        done: false,
        isLabel: input.input.isLabel ?? false,
        position: nextPosition,
        updatedAt: nowIso,
        syncStatus: OfflineSyncStatus.Pending,
      };

      await database.packingItems.put(row);
      await enqueueOutbox(database, "packingItem", row.id, OfflineOperation.Create, {
        ...packingItemPayloadFromRow(row),
        labelId,
      });

      if (tripRow) {
        const nextDetailSnapshot = updateTripSnapshot(tripRow, (detailSnapshot) => {
          upsertPackingItemInSnapshot(detailSnapshot, { ...row, listId });
        });

        await database.trips.put(withDetailSnapshot(tripRow, nextDetailSnapshot));
      }

      return;
    }

    const itemId = input.itemId;
    const currentRow = await database.packingItems.get(itemId);
    if (!currentRow) return;

    const tripRow = await database.trips.get(currentRow.tripId);
    let nextRow = currentRow;

    if (input.operation === "toggle") {
      nextRow = {
        ...currentRow,
        done: !currentRow.done,
        updatedAt: nowIso,
        syncStatus: OfflineSyncStatus.Pending,
      };
    } else {
      const trimmedName = input.patch.name?.trim();
      if (!trimmedName) return;
      nextRow = {
        ...currentRow,
        name: trimmedName,
        updatedAt: nowIso,
        syncStatus: OfflineSyncStatus.Pending,
      };
    }

    await database.packingItems.put(nextRow);
    await enqueueOutbox(
      database,
      "packingItem",
      nextRow.id,
      OfflineOperation.Update,
      packingItemPayloadFromRow(nextRow)
    );

    if (tripRow) {
      const nextDetailSnapshot = updateTripSnapshot(tripRow, (detailSnapshot) => {
        upsertPackingItemInSnapshot(detailSnapshot, nextRow);
      });

      await database.trips.put(withDetailSnapshot(tripRow, nextDetailSnapshot));
    }
  });
}

export async function deletePackingItemLocally(database: OfflineDb, itemId: string): Promise<void> {
  const { enqueueOutbox } = await import("./outbox");

  await database.transaction("rw", database.trips, database.packingItems, database.outbox, async () => {
    const currentRow = await database.packingItems.get(itemId);
    if (!currentRow) return;

    const tripRow = await database.trips.get(currentRow.tripId);
    const existingEntries = await clearOutboxEntriesForEntity(database, itemId);

    if (!hasOutboxOperation(existingEntries, OfflineOperation.Create)) {
      await enqueueOutbox(
        database,
        "packingItem",
        currentRow.id,
        OfflineOperation.Delete,
        packingItemPayloadFromRow(currentRow)
      );
    }

    await database.packingItems.delete(itemId);

    if (tripRow) {
      const nextDetailSnapshot = updateTripSnapshot(tripRow, (detailSnapshot) => {
        removePackingItemFromSnapshot(detailSnapshot, itemId);
      });

      await database.trips.put(withDetailSnapshot(tripRow, nextDetailSnapshot));
    }
  });
}
