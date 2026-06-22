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
}

export interface OfflinePackingItem {
  id: string;
  tripId: string;
  listId: string | null;
  name: string;
  done: boolean;
  isLabel: boolean;
  position: number;
}

export interface OfflineOutboxEntry {
  id: string;
  entityType: string;
  entityId: string;
  operation: string;
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
