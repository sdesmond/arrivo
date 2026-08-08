import {
  trips,
  users,
  events,
  documents,
  reservations,
  expenses,
  collaborators,
  itineraryChecklists,
  checklistItems,
  itineraryNotes,
  notes,
  packingItems,
  packingTemplates,
  packingTemplateItems,
  tripPackingLists,
  userLoyaltyNumbers,
  userWishlistDestinations,
  userCompanions,
} from "@/db/schema";
import { getTripStatus } from "@/lib/utils";
import { ExpenseCategory } from "@/data/types";
import type {
  Trip,
  UserProfile,
  TripEvent,
  Document,
  Reservation,
  ReservationType,
  Expense,
  Collaborator,
  DocPreviewLine,
  Checklist,
  ChecklistItem,
  Note,
  TripNote,
  LoyaltyNumber,
  WishlistDestination,
  Companion,
  PackingItem,
  PackingTemplate,
  PackingTemplateItem,
  TripPackingList,
} from "@/data/types";
import { CoverType, TransitMode } from "@/data/types";

const VALID_COVER_TYPES = Object.values(CoverType);
const VALID_TRANSIT_MODES = Object.values(TransitMode);

function isCoverType(value: string): value is CoverType {
  return VALID_COVER_TYPES.some((coverType) => coverType === value);
}

export function isTransitMode(value: string): value is TransitMode {
  return VALID_TRANSIT_MODES.some((transitMode) => transitMode === value);
}

export function dbTripToType(row: typeof trips.$inferSelect): Trip {
  return {
    id: row.id,
    name: row.name,
    startDate: row.startDate ?? undefined,
    endDate: row.endDate ?? undefined,
    status: getTripStatus(row.startDate, row.endDate),
    coverImageUrl: row.coverImageUrl ?? undefined,
    coverPhotographer: row.coverPhotographer ?? undefined,
    coverPhotographerUrl: row.coverPhotographerUrl ?? undefined,
    destinationName: row.destinationName ?? undefined,
    destinationCountry: row.destinationCountry ?? undefined,
    destinationCountryCode: row.destinationCountryCode ?? undefined,
    notes: row.notes ?? undefined,
    budget: row.budgetTotal
      ? {
          currency: row.budgetCurrency ?? "USD",
          total: Number(row.budgetTotal),
        }
      : undefined,
    tags: row.tags ?? [],
    transitMode: row.transitMode && isTransitMode(row.transitMode) ? row.transitMode : null,
  };
}

export function dbUserToType(row: typeof users.$inferSelect): UserProfile {
  const defaultCoverType = row.defaultCoverType ?? "";

  return {
    id: row.id,
    name: row.name ?? null,
    email: row.email ?? "",
    dateFormat: row.dateFormat ?? null,
    currency: row.currency ?? null,
    distanceUnit: row.distanceUnit ?? null,
    transitMode: row.transitMode && isTransitMode(row.transitMode) ? row.transitMode : null,
    walkThresholdMeters: row.walkThresholdMeters ?? null,
    passportNumber: row.passportNumber ?? null,
    passportExpiry: row.passportExpiry ?? null,
    passportNationality: row.passportNationality ?? null,
    knownTravelerNumber: row.knownTravelerNumber ?? null,
    defaultCoverType: isCoverType(defaultCoverType) ? defaultCoverType : undefined,
    warningThreshold: row.warningThreshold,
    dangerThreshold: row.dangerThreshold,
    loyaltyNumbers: [],
    wishlistDestinations: [],
    companions: [],
  };
}

export function dbEventToType(row: typeof events.$inferSelect): TripEvent {
  return {
    id: row.id,
    tripId: row.tripId,
    dayId: row.dayId ?? undefined,
    name: row.name,
    startAt: row.startAt?.toISOString() ?? undefined,
    endAt: row.endAt?.toISOString() ?? undefined,
    displacedDate: row.displacedDate ?? undefined,
    locationName: row.locationName ?? undefined,
    locationAddress: row.locationAddress ?? undefined,
    locationLat: row.locationLat ?? undefined,
    locationLng: row.locationLng ?? undefined,
    confirmationNumber: row.confirmationNumber ?? undefined,
    note: row.note ?? undefined,
    position: row.position,
  };
}

export function dbDocToType(row: typeof documents.$inferSelect): Document {
  if (!row.tripId && !row.eventId && !row.reservationId) {
    throw new Error(`Orphan document id=${row.id}: tripId, eventId, and reservationId are all null`);
  }
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as Document["kind"],
    size: row.size ?? undefined,
    url: row.url ?? undefined,
    scope: row.reservationId ? "reservation" : row.eventId ? "event" : "trip",
    previewLines: (row.previewLines as DocPreviewLine[] | null) ?? undefined,
    addedAt: row.addedAt?.toISOString() ?? new Date().toISOString(),
  };
}

export function dbReservationToType(row: typeof reservations.$inferSelect): Reservation {
  return {
    id: row.id,
    tripId: row.tripId,
    type: row.type as ReservationType,
    provider: row.provider,
    startAt: row.startAt?.toISOString() ?? undefined,
    endAt: row.endAt?.toISOString() ?? undefined,
    startAddress: row.startAddress ?? undefined,
    startLocationName: row.startLocationName ?? undefined,
    startLocationLat: row.startLocationLat ?? undefined,
    startLocationLng: row.startLocationLng ?? undefined,
    endAddress: row.endAddress ?? undefined,
    endLocationName: row.endLocationName ?? undefined,
    endLocationLat: row.endLocationLat ?? undefined,
    endLocationLng: row.endLocationLng ?? undefined,
    confirmationCode: row.confirmationCode ?? undefined,
    serviceNumber: row.serviceNumber ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.createdAt?.toISOString() ?? undefined,
    updatedAt: row.updatedAt?.toISOString() ?? undefined,
  };
}

export function dbExpenseToType(row: typeof expenses.$inferSelect): Expense {
  return {
    id: row.id,
    tripId: row.tripId,
    eventId: row.eventId ?? undefined,
    reservationId: row.reservationId ?? undefined,
    category: Object.values(ExpenseCategory).includes(row.category as Expense["category"])
      ? (row.category as Expense["category"])
      : ExpenseCategory.Misc,
    amount: Number(row.amount),
    currency: row.currency,
    convertedAmountTrip: row.convertedAmountTrip != null ? Number(row.convertedAmountTrip) : undefined,
    conversionRateTrip: row.conversionRateTrip != null ? Number(row.conversionRateTrip) : undefined,
    convertedCurrencyTrip: row.convertedCurrencyTrip ?? undefined,
    convertedAmountProfile: row.convertedAmountProfile != null ? Number(row.convertedAmountProfile) : undefined,
    conversionRateProfile: row.conversionRateProfile != null ? Number(row.conversionRateProfile) : undefined,
    convertedCurrencyProfile: row.convertedCurrencyProfile ?? undefined,
    date: row.date,
    note: row.note ?? undefined,
    createdAt: row.createdAt?.toISOString() ?? undefined,
    updatedAt: row.updatedAt?.toISOString() ?? undefined,
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

export function dbLoyaltyToType(row: typeof userLoyaltyNumbers.$inferSelect): LoyaltyNumber {
  return {
    id: row.id,
    programName: row.programName,
    memberNumber: row.memberNumber,
    position: row.position,
  };
}

export function dbWishlistToType(row: typeof userWishlistDestinations.$inferSelect): WishlistDestination {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
  };
}

export function dbCompanionToType(row: typeof userCompanions.$inferSelect): Companion {
  return {
    id: row.id,
    name: row.name,
    age: row.age ?? undefined,
    passportNumber: row.passportNumber ?? undefined,
    passportExpiry: row.passportExpiry ?? undefined,
    passportNationality: row.passportNationality ?? undefined,
    knownTravelerNumber: row.knownTravelerNumber ?? undefined,
    packtUsername: row.packtUsername ?? undefined,
    position: row.position,
  };
}

export function dbPackingItemToType(row: typeof packingItems.$inferSelect): PackingItem {
  return {
    id: row.id,
    name: row.name,
    done: row.done ?? false,
    tripId: row.tripId,
    listId: row.listId ?? null,
    position: row.position,
    isLabel: row.isLabel,
    labelId: row.labelId,
  };
}

export function dbPackingListToType(row: typeof tripPackingLists.$inferSelect): TripPackingList {
  return {
    id: row.id,
    tripId: row.tripId,
    name: row.name,
    position: row.position,
    createdAt: row.createdAt?.toISOString() ?? undefined,
  };
}

export function dbTemplateToType(row: typeof packingTemplates.$inferSelect): PackingTemplate {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt?.toISOString() ?? undefined,
  };
}

export function dbTemplateItemToType(row: typeof packingTemplateItems.$inferSelect): PackingTemplateItem {
  return {
    id: row.id,
    templateId: row.templateId,
    text: row.text,
    isLabel: row.isLabel,
    position: row.position,
    labelId: row.labelId ?? null,
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

export function dbTripNoteToType(row: typeof notes.$inferSelect): TripNote {
  return {
    id: row.id,
    tripId: row.tripId,
    position: row.position,
    title: row.title ?? undefined,
    body: row.body ?? undefined,
    createdAt: row.createdAt?.toISOString() ?? undefined,
    updatedAt: row.updatedAt?.toISOString() ?? undefined,
  };
}
