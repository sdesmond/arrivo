import type { TripDetailPayload, TripListEntry } from "@/data/types";

export const OfflineSyncStatus = {
  Pending: "pending",
  Synced: "synced",
} as const;
export type OfflineSyncStatus = (typeof OfflineSyncStatus)[keyof typeof OfflineSyncStatus];

export const OfflineEntityType = {
  Trip: "trip",
  Day: "day",
  Event: "event",
  Document: "document",
  PackingItem: "packingItem",
} as const;
export type OfflineEntityType = (typeof OfflineEntityType)[keyof typeof OfflineEntityType];

export const OfflineOperation = {
  Create: "create",
  Update: "update",
  Delete: "delete",
} as const;
export type OfflineOperation = (typeof OfflineOperation)[keyof typeof OfflineOperation];

export interface OfflineTrip {
  id: string;
  ownerId: string;
  name: string;
  startDate?: string;
  endDate?: string;
  destinationName: string | null;
  destinationCountry: string | null;
  coverImageUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  listEntrySnapshot: TripListEntry | null;
  detailSnapshot: TripDetailPayload | null;
}

export interface OfflineDay {
  id: string;
  tripId: string;
  dayNumber: number;
  date: string | null;
  label: string;
  subtitle: string | null;
}

export interface OfflineEvent {
  id: string;
  tripId: string;
  dayId: string | null;
  name: string;
  note: string | null;
  startAt: string | null;
  endAt: string | null;
  locationName: string | null;
  locationAddress: string | null;
  position: number;
  cost: number | null;
  confirmationNumber: string | null;
  createdAt: string;
  updatedAt: string;
  syncStatus: OfflineSyncStatus;
}

export interface OfflineDocument {
  id: string;
  tripId: string | null;
  eventId: string | null;
  reservationId: string | null;
  name: string;
  kind: string;
  scope: string;
  size: string | null;
  offline: boolean;
  url: string | null;
  addedAt: string;
  updatedAt: string;
  syncStatus: OfflineSyncStatus;
}

export interface OfflinePackingItem {
  id: string;
  tripId: string;
  listId: string | null;
  name: string;
  done: boolean;
  isLabel: boolean;
  position: number;
  updatedAt: string;
  syncStatus: OfflineSyncStatus;
}

export interface OfflineOutboxEntry {
  id: string;
  entityType: OfflineEntityType;
  entityId: string;
  operation: OfflineOperation;
  payload: unknown;
  createdAt: string;
  attempts: number;
}

export const OFFLINE_DB_SCHEMA_V1 = {
  trips: "id, ownerId",
  days: "id, tripId, dayNumber, [tripId+dayNumber]",
  events: "id, tripId, dayId, position, [tripId+dayId]",
  documents: "id, tripId, eventId, reservationId",
  packingItems: "id, tripId, listId",
  outbox: "id, entityId",
} as const;

export const OFFLINE_DB_SCHEMA_V2 = {
  trips: "id, ownerId",
  days: "id, tripId, dayNumber, [tripId+dayNumber]",
  events: "id, tripId, dayId, position, [tripId+dayId], syncStatus",
  documents: "id, tripId, eventId, reservationId, syncStatus",
  packingItems: "id, tripId, listId, syncStatus",
  outbox: "id, entityId",
} as const;
