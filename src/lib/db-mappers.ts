import {
  trips,
  events,
  documents,
  collaborators,
  itineraryChecklists,
  checklistItems,
  itineraryNotes,
} from "@/db/schema";
import { getTripStatus } from "@/lib/utils";
import type {
  Trip,
  TripEvent,
  Document,
  Collaborator,
  DocPreviewLine,
  Checklist,
  ChecklistItem,
  Note,
} from "@/data/types";

export function dbTripToType(row: typeof trips.$inferSelect): Trip {
  return {
    id: row.id,
    name: row.name,
    startDate: row.startDate,
    endDate: row.endDate,
    status: getTripStatus(row.startDate, row.endDate),
    coverImageUrl: row.coverImageUrl ?? undefined,
    notes: row.notes ?? undefined,
    budget: row.budgetTotal
      ? {
          currency: row.budgetCurrency ?? "USD",
          total: Number(row.budgetTotal),
          perPerson: Number(row.budgetPerPerson ?? 0),
        }
      : undefined,
    tags: row.tags ?? [],
  };
}

export function dbEventToType(row: typeof events.$inferSelect): TripEvent {
  return {
    id: row.id,
    name: row.name,
    startAt: row.startAt?.toISOString() ?? undefined,
    endAt: row.endAt?.toISOString() ?? undefined,
    locationName: row.locationName ?? undefined,
    locationAddress: row.locationAddress ?? undefined,
    locationLat: row.locationLat ?? undefined,
    locationLng: row.locationLng ?? undefined,
    cost: row.cost ? Number(row.cost) : undefined,
    confirmationNumber: row.confirmationNumber ?? undefined,
    note: row.note ?? undefined,
    position: row.position,
  };
}

export function dbDocToType(row: typeof documents.$inferSelect): Document {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as Document["kind"],
    size: row.size ?? undefined,
    offline: row.offline ?? false,
    url: row.url ?? undefined,
    scope: row.tripId ? "trip" : "event",
    previewLines: (row.previewLines as DocPreviewLine[] | null) ?? undefined,
    addedAt: row.addedAt?.toISOString() ?? new Date().toISOString(),
  };
}

export function dbCollabToType(row: typeof collaborators.$inferSelect): Collaborator {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    initials: row.initials,
    role: row.role as Collaborator["role"],
    tintBg: row.tintBg ?? undefined,
    tintFg: row.tintFg ?? undefined,
  };
}

function dbChecklistItemToType(row: typeof checklistItems.$inferSelect): ChecklistItem {
  return {
    id: row.id,
    checklistId: row.checklistId,
    content: row.content,
    isChecked: row.isChecked,
    createdAt: row.createdAt?.toISOString() ?? undefined,
  };
}

export function dbChecklistToType(
  row: typeof itineraryChecklists.$inferSelect,
  itemRows: (typeof checklistItems.$inferSelect)[]
): Checklist {
  return {
    id: row.id,
    tripDayId: row.dayId,
    position: row.position,
    title: row.title ?? undefined,
    items: itemRows.map(dbChecklistItemToType),
    createdAt: row.createdAt?.toISOString() ?? undefined,
    updatedAt: row.updatedAt?.toISOString() ?? undefined,
  };
}

export function dbNoteToType(row: typeof itineraryNotes.$inferSelect): Note {
  return {
    id: row.id,
    tripDayId: row.dayId,
    position: row.position,
    content: row.content,
    createdAt: row.createdAt?.toISOString() ?? undefined,
    updatedAt: row.updatedAt?.toISOString() ?? undefined,
  };
}
