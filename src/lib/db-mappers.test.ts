// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  dbTripToType,
  dbEventToType,
  dbDocToType,
  dbReservationToType,
  dbCollabToType,
  dbNoteToType,
  dbChecklistToType,
  dbLoyaltyToType,
  dbWishlistToType,
  dbCompanionToType,
  dbUserToType,
  dbPackingItemToType,
  dbPackingListToType,
  dbTemplateToType,
  dbTemplateItemToType,
} from "@/lib/db-mappers";
import type {
  trips,
  events,
  documents,
  reservations,
  collaborators,
  packingItems,
  tripPackingLists,
  packingTemplates,
  packingTemplateItems,
  users,
  itineraryNotes,
  itineraryChecklists,
  checklistItems,
  userLoyaltyNumbers,
  userWishlistDestinations,
  userCompanions,
} from "@/db/schema";

type TripRow = typeof trips.$inferSelect;
type EventRow = typeof events.$inferSelect;
type DocRow = typeof documents.$inferSelect;
type ReservationRow = typeof reservations.$inferSelect;
type CollabRow = typeof collaborators.$inferSelect;
type PackingItemRow = typeof packingItems.$inferSelect;
type TripPackingListRow = typeof tripPackingLists.$inferSelect;
type PackingTemplateRow = typeof packingTemplates.$inferSelect;
type PackingTemplateItemRow = typeof packingTemplateItems.$inferSelect;
type UserRow = typeof users.$inferSelect;

// ── dbTripToType ──────────────────────────────────────────────────────────────

const BASE_TRIP: TripRow = {
  id: "trip-1",
  ownerId: "user-1",
  name: "Tokyo Trip",
  startDate: "2020-01-01",
  endDate: "2020-01-10",
  coverImageUrl: null,
  coverPhotographer: null,
  coverPhotographerUrl: null,
  destinationName: null,
  destinationCountry: null,
  destinationCountryCode: null,
  notes: null,
  budgetCurrency: null,
  budgetTotal: null,
  budgetPerPerson: null,
  tags: null,
  createdAt: null,
  updatedAt: null,
};

describe("dbTripToType", () => {
  it("maps core fields correctly", () => {
    const result = dbTripToType(BASE_TRIP);
    expect(result.id).toBe("trip-1");
    expect(result.name).toBe("Tokyo Trip");
    expect(result.startDate).toBe("2020-01-01");
    expect(result.endDate).toBe("2020-01-10");
  });

  it("maps null dates to undefined and upcoming status", () => {
    const result = dbTripToType({ ...BASE_TRIP, startDate: null, endDate: null });
    expect(result.startDate).toBeUndefined();
    expect(result.endDate).toBeUndefined();
    expect(result.status).toBe("upcoming");
  });

  it("null optional fields become undefined", () => {
    const result = dbTripToType(BASE_TRIP);
    expect(result.coverImageUrl).toBeUndefined();
    expect(result.coverPhotographer).toBeUndefined();
    expect(result.coverPhotographerUrl).toBeUndefined();
    expect(result.notes).toBeUndefined();
    expect(result.budget).toBeUndefined();
  });

  it("null tags defaults to empty array", () => {
    const result = dbTripToType(BASE_TRIP);
    expect(result.tags).toEqual([]);
  });

  it("maps tags array when present", () => {
    const result = dbTripToType({ ...BASE_TRIP, tags: ["beach", "city"] });
    expect(result.tags).toEqual(["beach", "city"]);
  });

  it("maps coverImageUrl and notes when present", () => {
    const result = dbTripToType({
      ...BASE_TRIP,
      coverImageUrl: "https://example.com/img.jpg",
      coverPhotographer: "Jane Lens",
      coverPhotographerUrl: "https://unsplash.com/@janelens",
      notes: "Pack light",
    });
    expect(result.coverImageUrl).toBe("https://example.com/img.jpg");
    expect(result.coverPhotographer).toBe("Jane Lens");
    expect(result.coverPhotographerUrl).toBe("https://unsplash.com/@janelens");
    expect(result.notes).toBe("Pack light");
  });

  it("null destination fields become undefined", () => {
    const result = dbTripToType(BASE_TRIP);
    expect(result.destinationName).toBeUndefined();
    expect(result.destinationCountry).toBeUndefined();
    expect(result.destinationCountryCode).toBeUndefined();
  });

  it("maps destination fields when present", () => {
    const result = dbTripToType({
      ...BASE_TRIP,
      destinationName: "Tokyo",
      destinationCountry: "Japan",
      destinationCountryCode: "JP",
    });
    expect(result.destinationName).toBe("Tokyo");
    expect(result.destinationCountry).toBe("Japan");
    expect(result.destinationCountryCode).toBe("JP");
  });

  it("constructs budget object from numeric strings", () => {
    const result = dbTripToType({
      ...BASE_TRIP,
      budgetTotal: "5000.00",
      budgetPerPerson: "2500.00",
      budgetCurrency: "EUR",
    });
    expect(result.budget).toEqual({ currency: "EUR", total: 5000, perPerson: 2500 });
  });

  it("defaults budget currency to USD when null", () => {
    const result = dbTripToType({ ...BASE_TRIP, budgetTotal: "1000.00", budgetCurrency: null });
    expect(result.budget?.currency).toBe("USD");
  });

  it("defaults budget perPerson to 0 when null", () => {
    const result = dbTripToType({ ...BASE_TRIP, budgetTotal: "1000.00", budgetPerPerson: null });
    expect(result.budget?.perPerson).toBe(0);
  });
});

// ── dbEventToType ─────────────────────────────────────────────────────────────

const BASE_EVENT: EventRow = {
  id: "event-1",
  dayId: "day-1",
  tripId: "trip-1",
  name: "Airport Arrival",
  note: null,
  startAt: null,
  endAt: null,
  displacedDate: null,
  locationName: null,
  locationAddress: null,
  locationLat: null,
  locationLng: null,
  cost: null,
  confirmationNumber: null,
  position: 0,
  createdAt: null,
  updatedAt: null,
};

describe("dbEventToType", () => {
  it("maps core fields correctly", () => {
    const result = dbEventToType(BASE_EVENT);
    expect(result.id).toBe("event-1");
    expect(result.name).toBe("Airport Arrival");
    expect(result.position).toBe(0);
  });

  it("null optional fields become undefined", () => {
    const result = dbEventToType(BASE_EVENT);
    expect(result.startAt).toBeUndefined();
    expect(result.endAt).toBeUndefined();
    expect(result.locationName).toBeUndefined();
    expect(result.locationAddress).toBeUndefined();
    expect(result.locationLat).toBeUndefined();
    expect(result.locationLng).toBeUndefined();
    expect(result.cost).toBeUndefined();
    expect(result.confirmationNumber).toBeUndefined();
    expect(result.note).toBeUndefined();
  });

  it("converts Date fields to ISO strings", () => {
    const start = new Date("2026-05-13T09:00:00.000Z");
    const end = new Date("2026-05-13T11:00:00.000Z");
    const result = dbEventToType({ ...BASE_EVENT, startAt: start, endAt: end });
    expect(result.startAt).toBe(start.toISOString());
    expect(result.endAt).toBe(end.toISOString());
  });

  it("round-trips a literal-tagged floating anchor byte-for-byte through a Date object", () => {
    // Mirrors what a timestamptz column round-trip does: a literal-UTC-tagged ISO string,
    // written as a Date and read back, must report the exact same digits via toISOString().
    const literal = "2026-05-13T15:00:00.000Z";
    const result = dbEventToType({ ...BASE_EVENT, startAt: new Date(literal) });
    expect(result.startAt).toBe(literal);
  });

  it("converts cost numeric string to number", () => {
    const result = dbEventToType({ ...BASE_EVENT, cost: "149.99" });
    expect(result.cost).toBe(149.99);
  });

  it("maps location fields when present", () => {
    const result = dbEventToType({
      ...BASE_EVENT,
      locationName: "Narita Airport",
      locationAddress: "1 Furugome, Narita",
      locationLat: 35.7653,
      locationLng: 140.3856,
    });
    expect(result.locationName).toBe("Narita Airport");
    expect(result.locationAddress).toBe("1 Furugome, Narita");
    expect(result.locationLat).toBe(35.7653);
    expect(result.locationLng).toBe(140.3856);
  });
});

// ── dbReservationToType ──────────────────────────────────────────────────────

const BASE_RESERVATION: ReservationRow = {
  id: "reservation-1",
  tripId: "trip-1",
  type: "lodging",
  provider: "Grand Hotel",
  startAt: null,
  endAt: null,
  startAddress: null,
  startLocationName: null,
  startLocationLat: null,
  startLocationLng: null,
  endAddress: null,
  endLocationName: null,
  endLocationLat: null,
  endLocationLng: null,
  cost: null,
  confirmationCode: null,
  serviceNumber: null,
  notes: null,
  createdAt: null,
  updatedAt: null,
};

describe("dbReservationToType", () => {
  it("maps core fields correctly", () => {
    const result = dbReservationToType(BASE_RESERVATION);
    expect(result.id).toBe("reservation-1");
    expect(result.tripId).toBe("trip-1");
    expect(result.type).toBe("lodging");
    expect(result.provider).toBe("Grand Hotel");
  });

  it("null optional fields become undefined", () => {
    const result = dbReservationToType(BASE_RESERVATION);
    expect(result.startAt).toBeUndefined();
    expect(result.endAt).toBeUndefined();
    expect(result.startAddress).toBeUndefined();
    expect(result.startLocationName).toBeUndefined();
    expect(result.startLocationLat).toBeUndefined();
    expect(result.startLocationLng).toBeUndefined();
    expect(result.endAddress).toBeUndefined();
    expect(result.endLocationName).toBeUndefined();
    expect(result.endLocationLat).toBeUndefined();
    expect(result.endLocationLng).toBeUndefined();
    expect(result.cost).toBeUndefined();
    expect(result.confirmationCode).toBeUndefined();
    expect(result.serviceNumber).toBeUndefined();
    expect(result.notes).toBeUndefined();
    expect(result.createdAt).toBeUndefined();
    expect(result.updatedAt).toBeUndefined();
  });

  it("converts Date fields to ISO strings", () => {
    const startAt = new Date("2026-07-01T15:00:00.000Z");
    const endAt = new Date("2026-07-03T11:00:00.000Z");
    const createdAt = new Date("2026-06-01T00:00:00.000Z");
    const updatedAt = new Date("2026-06-02T00:00:00.000Z");
    const result = dbReservationToType({ ...BASE_RESERVATION, startAt, endAt, createdAt, updatedAt });
    expect(result.startAt).toBe(startAt.toISOString());
    expect(result.endAt).toBe(endAt.toISOString());
    expect(result.createdAt).toBe(createdAt.toISOString());
    expect(result.updatedAt).toBe(updatedAt.toISOString());
  });

  it("maps optional confirmation code, service number, and notes when present", () => {
    const result = dbReservationToType({
      ...BASE_RESERVATION,
      confirmationCode: "ABC123",
      serviceNumber: "AA123",
      notes: "Late check-in arranged",
    });
    expect(result.confirmationCode).toBe("ABC123");
    expect(result.serviceNumber).toBe("AA123");
    expect(result.notes).toBe("Late check-in arranged");
  });

  it("maps startAddress and endAddress when present", () => {
    const result = dbReservationToType({
      ...BASE_RESERVATION,
      startAddress: "JFK International Airport, New York, NY",
      endAddress: "LAX International Airport, Los Angeles, CA",
    });
    expect(result.startAddress).toBe("JFK International Airport, New York, NY");
    expect(result.endAddress).toBe("LAX International Airport, Los Angeles, CA");
  });

  it("maps structured reservation location fields when present", () => {
    const result = dbReservationToType({
      ...BASE_RESERVATION,
      startLocationName: "John F. Kennedy International Airport",
      startLocationLat: 40.6413,
      startLocationLng: -73.7781,
      endLocationName: "Los Angeles International Airport",
      endLocationLat: 33.9416,
      endLocationLng: -118.4085,
    });

    expect(result.startLocationName).toBe("John F. Kennedy International Airport");
    expect(result.startLocationLat).toBe(40.6413);
    expect(result.startLocationLng).toBe(-73.7781);
    expect(result.endLocationName).toBe("Los Angeles International Airport");
    expect(result.endLocationLat).toBe(33.9416);
    expect(result.endLocationLng).toBe(-118.4085);
  });

  it("converts cost numeric string to number", () => {
    const result = dbReservationToType({ ...BASE_RESERVATION, cost: "249.99" });
    expect(result.cost).toBe(249.99);
  });
});

// ── dbDocToType ───────────────────────────────────────────────────────────────

const BASE_DOC: DocRow = {
  id: "doc-1",
  tripId: "trip-1",
  eventId: null,
  reservationId: null,
  name: "Boarding Pass",
  kind: "pdf",
  size: null,
  offline: null,
  url: null,
  previewLines: null,
  addedAt: null,
};

describe("dbDocToType", () => {
  it("throws when tripId, eventId, and reservationId are all null", () => {
    expect(() => dbDocToType({ ...BASE_DOC, tripId: null, eventId: null, reservationId: null })).toThrow(
      "Orphan document id=doc-1: tripId, eventId, and reservationId are all null"
    );
  });

  it("maps core fields correctly", () => {
    const result = dbDocToType(BASE_DOC);
    expect(result.id).toBe("doc-1");
    expect(result.name).toBe("Boarding Pass");
    expect(result.kind).toBe("pdf");
  });

  it("scope is trip when eventId is null", () => {
    // tripId set, eventId null → trip-scoped
    expect(dbDocToType(BASE_DOC).scope).toBe("trip");
  });

  it("scope is event when eventId is set", () => {
    // both tripId and eventId set → event-scoped (eventId takes precedence)
    expect(dbDocToType({ ...BASE_DOC, eventId: "event-1" }).scope).toBe("event");
  });

  it("maps scope to 'reservation' when reservationId is set", () => {
    expect(dbDocToType({ ...BASE_DOC, tripId: null, eventId: null, reservationId: "res-1" }).scope).toBe("reservation");
  });

  it("maps scope to 'event' when eventId is set and reservationId is null", () => {
    expect(dbDocToType({ ...BASE_DOC, eventId: "event-1", reservationId: null }).scope).toBe("event");
  });

  it("null optional fields become undefined", () => {
    const result = dbDocToType(BASE_DOC);
    expect(result.size).toBeUndefined();
    expect(result.url).toBeUndefined();
    expect(result.previewLines).toBeUndefined();
  });

  it("null offline defaults to false", () => {
    expect(dbDocToType(BASE_DOC).offline).toBe(false);
  });

  it("maps size and url when present", () => {
    const result = dbDocToType({ ...BASE_DOC, size: "2.4 MB", url: "https://example.com/doc.pdf" });
    expect(result.size).toBe("2.4 MB");
    expect(result.url).toBe("https://example.com/doc.pdf");
  });

  it("converts addedAt Date to ISO string", () => {
    const date = new Date("2026-05-01T00:00:00.000Z");
    const result = dbDocToType({ ...BASE_DOC, addedAt: date });
    expect(result.addedAt).toBe(date.toISOString());
  });
});

// ── dbCollabToType ────────────────────────────────────────────────────────────

const BASE_COLLAB: CollabRow = {
  id: "collab-1",
  tripId: "trip-1",
  userId: null,
  email: "alice@example.com",
  name: "Alice",
  initials: "AL",
  role: "editor",
  tintBg: null,
  tintFg: null,
};

describe("dbCollabToType", () => {
  it("maps core fields correctly", () => {
    const result = dbCollabToType(BASE_COLLAB);
    expect(result.id).toBe("collab-1");
    expect(result.email).toBe("alice@example.com");
    expect(result.name).toBe("Alice");
    expect(result.initials).toBe("AL");
    expect(result.role).toBe("editor");
  });

  it("null tint fields become undefined", () => {
    const result = dbCollabToType(BASE_COLLAB);
    expect(result.tintBg).toBeUndefined();
    expect(result.tintFg).toBeUndefined();
  });

  it("maps tint fields when present", () => {
    const result = dbCollabToType({
      ...BASE_COLLAB,
      tintBg: "oklch(0.86 0.07 30)",
      tintFg: "oklch(0.30 0.10 30)",
    });
    expect(result.tintBg).toBe("oklch(0.86 0.07 30)");
    expect(result.tintFg).toBe("oklch(0.30 0.10 30)");
  });
});

// ── dbPackingItemToType ──────────────────────────────────────────────────────

const BASE_PACKING_ITEM: PackingItemRow = {
  id: "packing-1",
  tripId: "trip-1",
  listId: null,
  name: "Passport",
  done: false,
  isLabel: false,
  position: 0,
  labelId: null,
};

describe("dbPackingItemToType", () => {
  it("maps packing item fields including labels", () => {
    const result = dbPackingItemToType({ ...BASE_PACKING_ITEM, name: "Documents", isLabel: true, position: 3 });

    expect(result).toEqual({
      id: "packing-1",
      tripId: "trip-1",
      listId: null,
      name: "Documents",
      done: false,
      isLabel: true,
      position: 3,
      labelId: null,
    });
  });

  it("maps a non-null labelId for items that belong to a section", () => {
    const result = dbPackingItemToType({ ...BASE_PACKING_ITEM, labelId: "label-1" });

    expect(result.labelId).toBe("label-1");
  });

  it("defaults nullable done values to false", () => {
    const result = dbPackingItemToType({ ...BASE_PACKING_ITEM, done: null });

    expect(result.done).toBe(false);
    expect(result.isLabel).toBe(false);
  });

  it("maps a non-null listId", () => {
    const result = dbPackingItemToType({ ...BASE_PACKING_ITEM, listId: "list-1" });

    expect(result.listId).toBe("list-1");
  });

  it("maps null listId to null", () => {
    const result = dbPackingItemToType(BASE_PACKING_ITEM);

    expect(result.listId).toBeNull();
  });
});

// ── dbPackingListToType ──────────────────────────────────────────────────────

const BASE_PACKING_LIST: TripPackingListRow = {
  id: "list-1",
  tripId: "trip-1",
  name: "Carry-On",
  position: 0,
  createdAt: null,
};

describe("dbPackingListToType", () => {
  it("maps id, tripId, name, and position correctly", () => {
    const result = dbPackingListToType(BASE_PACKING_LIST);
    expect(result.id).toBe("list-1");
    expect(result.tripId).toBe("trip-1");
    expect(result.name).toBe("Carry-On");
    expect(result.position).toBe(0);
  });

  it("null createdAt becomes undefined", () => {
    const result = dbPackingListToType(BASE_PACKING_LIST);
    expect(result.createdAt).toBeUndefined();
  });

  it("converts createdAt Date to ISO string", () => {
    const createdAt = new Date("2026-06-01T12:00:00.000Z");
    const result = dbPackingListToType({ ...BASE_PACKING_LIST, createdAt });
    expect(result.createdAt).toBe(createdAt.toISOString());
  });

  it("maps non-zero position", () => {
    const result = dbPackingListToType({ ...BASE_PACKING_LIST, position: 2 });
    expect(result.position).toBe(2);
  });
});

// ── dbTemplateToType ─────────────────────────────────────────────────────────

const BASE_TEMPLATE: PackingTemplateRow = {
  id: "template-1",
  userId: "user-1",
  name: "Beach Weekend",
  createdAt: null,
};

describe("dbTemplateToType", () => {
  it("maps core fields correctly", () => {
    const result = dbTemplateToType(BASE_TEMPLATE);

    expect(result).toEqual({
      id: "template-1",
      name: "Beach Weekend",
      createdAt: undefined,
    });
  });

  it("converts createdAt to an ISO string", () => {
    const createdAt = new Date("2026-06-02T10:00:00.000Z");
    const result = dbTemplateToType({ ...BASE_TEMPLATE, createdAt });

    expect(result.createdAt).toBe(createdAt.toISOString());
  });
});

// ── dbTemplateItemToType ─────────────────────────────────────────────────────

const BASE_TEMPLATE_ITEM: PackingTemplateItemRow = {
  id: "template-item-1",
  templateId: "template-1",
  text: "Passport",
  isLabel: false,
  position: 1,
  labelId: null,
};

describe("dbTemplateItemToType", () => {
  it("maps template item fields including label membership", () => {
    const result = dbTemplateItemToType({
      ...BASE_TEMPLATE_ITEM,
      text: "Documents",
      isLabel: true,
      position: 0,
      labelId: "label-1",
    });

    expect(result).toEqual({
      id: "template-item-1",
      templateId: "template-1",
      text: "Documents",
      isLabel: true,
      position: 0,
      labelId: "label-1",
    });
  });

  it("normalizes a null labelId to null", () => {
    const result = dbTemplateItemToType(BASE_TEMPLATE_ITEM);

    expect(result.labelId).toBeNull();
  });
});

// ── dbUserToType ──────────────────────────────────────────────────────────────

const BASE_USER: UserRow = {
  id: "user-1",
  name: "Spencer",
  email: "spencer@example.com",
  emailVerified: null,
  image: null,
  passwordHash: null,
  dateFormat: null,
  currency: null,
  distanceUnit: null,
  passportNumber: null,
  passportExpiry: null,
  passportNationality: null,
  knownTravelerNumber: null,
  defaultCoverType: null,
};

describe("dbUserToType", () => {
  it("maps core fields correctly", () => {
    const result = dbUserToType(BASE_USER);
    expect(result.id).toBe("user-1");
    expect(result.name).toBe("Spencer");
    expect(result.email).toBe("spencer@example.com");
    expect(result.dateFormat).toBeNull();
    expect(result.currency).toBeNull();
    expect(result.distanceUnit).toBeNull();
    expect(result.passportNumber).toBeNull();
    expect(result.passportExpiry).toBeNull();
    expect(result.passportNationality).toBeNull();
    expect(result.knownTravelerNumber).toBeNull();
  });

  it("null defaultCoverType becomes undefined", () => {
    const result = dbUserToType(BASE_USER);
    expect(result.defaultCoverType).toBeUndefined();
  });

  it('maps defaultCoverType "photo"', () => {
    const result = dbUserToType({ ...BASE_USER, defaultCoverType: "photo" });
    expect(result.defaultCoverType).toBe("photo");
  });

  it('maps defaultCoverType "map"', () => {
    const result = dbUserToType({ ...BASE_USER, defaultCoverType: "map" });
    expect(result.defaultCoverType).toBe("map");
  });

  it('maps defaultCoverType "graphic"', () => {
    const result = dbUserToType({ ...BASE_USER, defaultCoverType: "graphic" });
    expect(result.defaultCoverType).toBe("graphic");
  });

  it("invalid defaultCoverType value becomes undefined", () => {
    const result = dbUserToType({ ...BASE_USER, defaultCoverType: "other" });
    expect(result.defaultCoverType).toBeUndefined();
  });

  it("empty-string defaultCoverType becomes undefined", () => {
    const result = dbUserToType({ ...BASE_USER, defaultCoverType: "" });
    expect(result.defaultCoverType).toBeUndefined();
  });

  it("loyaltyNumbers defaults to empty array", () => {
    const result = dbUserToType(BASE_USER);
    expect(result.loyaltyNumbers).toEqual([]);
    expect(result.wishlistDestinations).toEqual([]);
    expect(result.companions).toEqual([]);
  });
});

// ── dbChecklistToType ─────────────────────────────────────────────────────────

type ChecklistRow = typeof itineraryChecklists.$inferSelect;
type ChecklistItemRow = typeof checklistItems.$inferSelect;

const BASE_CHECKLIST: ChecklistRow = {
  id: "cl-1",
  dayId: "day-1",
  position: 0,
  title: null,
  createdAt: null,
  updatedAt: null,
};

const BASE_ITEM: ChecklistItemRow = {
  id: "item-1",
  checklistId: "cl-1",
  content: "Buy sunscreen",
  isChecked: false,
  createdAt: null,
};

describe("dbChecklistToType", () => {
  it("maps core fields correctly", () => {
    const result = dbChecklistToType(BASE_CHECKLIST, []);
    expect(result.id).toBe("cl-1");
    expect(result.tripDayId).toBe("day-1");
    expect(result.position).toBe(0);
  });

  it("null title becomes undefined", () => {
    const result = dbChecklistToType(BASE_CHECKLIST, []);
    expect(result.title).toBeUndefined();
  });

  it("maps title when present", () => {
    const result = dbChecklistToType({ ...BASE_CHECKLIST, title: "Packing" }, []);
    expect(result.title).toBe("Packing");
  });

  it("null timestamp fields become undefined", () => {
    const result = dbChecklistToType(BASE_CHECKLIST, []);
    expect(result.createdAt).toBeUndefined();
    expect(result.updatedAt).toBeUndefined();
  });

  it("converts createdAt Date to ISO string", () => {
    const date = new Date("2026-05-14T10:00:00.000Z");
    const result = dbChecklistToType({ ...BASE_CHECKLIST, createdAt: date }, []);
    expect(result.createdAt).toBe(date.toISOString());
  });

  it("converts updatedAt Date to ISO string", () => {
    const date = new Date("2026-05-14T11:00:00.000Z");
    const result = dbChecklistToType({ ...BASE_CHECKLIST, updatedAt: date }, []);
    expect(result.updatedAt).toBe(date.toISOString());
  });

  it("returns empty items array when no items given", () => {
    const result = dbChecklistToType(BASE_CHECKLIST, []);
    expect(result.items).toEqual([]);
  });

  it("maps item core fields correctly", () => {
    const result = dbChecklistToType(BASE_CHECKLIST, [BASE_ITEM]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe("item-1");
    expect(result.items[0].checklistId).toBe("cl-1");
    expect(result.items[0].content).toBe("Buy sunscreen");
    expect(result.items[0].isChecked).toBe(false);
  });

  it("coerces isChecked boolean correctly — false", () => {
    const result = dbChecklistToType(BASE_CHECKLIST, [{ ...BASE_ITEM, isChecked: false }]);
    expect(result.items[0].isChecked).toBe(false);
  });

  it("coerces isChecked boolean correctly — true", () => {
    const result = dbChecklistToType(BASE_CHECKLIST, [{ ...BASE_ITEM, isChecked: true }]);
    expect(result.items[0].isChecked).toBe(true);
  });

  it("null item createdAt becomes undefined", () => {
    const result = dbChecklistToType(BASE_CHECKLIST, [BASE_ITEM]);
    expect(result.items[0].createdAt).toBeUndefined();
  });

  it("converts item createdAt Date to ISO string", () => {
    const date = new Date("2026-05-14T09:00:00.000Z");
    const result = dbChecklistToType(BASE_CHECKLIST, [{ ...BASE_ITEM, createdAt: date }]);
    expect(result.items[0].createdAt).toBe(date.toISOString());
  });

  it("maps multiple items preserving order", () => {
    const item2: ChecklistItemRow = { ...BASE_ITEM, id: "item-2", content: "Book hotel" };
    const result = dbChecklistToType(BASE_CHECKLIST, [BASE_ITEM, item2]);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe("item-1");
    expect(result.items[1].id).toBe("item-2");
  });

  it("maps non-zero position", () => {
    const result = dbChecklistToType({ ...BASE_CHECKLIST, position: 4 }, []);
    expect(result.position).toBe(4);
  });
});

// ── dbLoyaltyToType ───────────────────────────────────────────────────────────

type LoyaltyRow = typeof userLoyaltyNumbers.$inferSelect;

const BASE_LOYALTY: LoyaltyRow = {
  id: "loyalty-1",
  userId: "user-1",
  programName: "United MileagePlus",
  memberNumber: "MUA-12345",
  position: 0,
};

describe("dbLoyaltyToType", () => {
  it("maps core fields correctly", () => {
    const result = dbLoyaltyToType(BASE_LOYALTY);
    expect(result.id).toBe("loyalty-1");
    expect(result.programName).toBe("United MileagePlus");
    expect(result.memberNumber).toBe("MUA-12345");
    expect(result.position).toBe(0);
  });

  it("maps non-zero position", () => {
    const result = dbLoyaltyToType({ ...BASE_LOYALTY, position: 3 });
    expect(result.position).toBe(3);
  });
});

// ── dbWishlistToType ──────────────────────────────────────────────────────────

type WishlistRow = typeof userWishlistDestinations.$inferSelect;

const BASE_WISHLIST: WishlistRow = {
  id: "wish-1",
  userId: "user-1",
  name: "Kyoto, Japan",
  position: 0,
};

describe("dbWishlistToType", () => {
  it("maps core fields correctly", () => {
    const result = dbWishlistToType(BASE_WISHLIST);
    expect(result.id).toBe("wish-1");
    expect(result.name).toBe("Kyoto, Japan");
    expect(result.position).toBe(0);
  });

  it("maps non-zero position", () => {
    const result = dbWishlistToType({ ...BASE_WISHLIST, position: 2 });
    expect(result.position).toBe(2);
  });
});

// ── dbNoteToType ──────────────────────────────────────────────────────────────

type NoteRow = typeof itineraryNotes.$inferSelect;

const BASE_NOTE: NoteRow = {
  id: "note-1",
  dayId: "day-1",
  position: 0,
  content: "Remember to bring sunscreen",
  createdAt: null,
  updatedAt: null,
};

describe("dbNoteToType", () => {
  it("maps core fields correctly", () => {
    const result = dbNoteToType(BASE_NOTE);
    expect(result.id).toBe("note-1");
    expect(result.tripDayId).toBe("day-1");
    expect(result.position).toBe(0);
    expect(result.content).toBe("Remember to bring sunscreen");
  });

  it("null timestamp fields become undefined", () => {
    const result = dbNoteToType(BASE_NOTE);
    expect(result.createdAt).toBeUndefined();
    expect(result.updatedAt).toBeUndefined();
  });

  it("converts createdAt Date to ISO string", () => {
    const date = new Date("2026-05-14T10:00:00.000Z");
    const result = dbNoteToType({ ...BASE_NOTE, createdAt: date });
    expect(result.createdAt).toBe(date.toISOString());
  });

  it("converts updatedAt Date to ISO string", () => {
    const date = new Date("2026-05-14T11:00:00.000Z");
    const result = dbNoteToType({ ...BASE_NOTE, updatedAt: date });
    expect(result.updatedAt).toBe(date.toISOString());
  });

  it("maps non-zero position", () => {
    const result = dbNoteToType({ ...BASE_NOTE, position: 3 });
    expect(result.position).toBe(3);
  });

  it("maps content string exactly", () => {
    const result = dbNoteToType({ ...BASE_NOTE, content: "Gate B22 – boarding at 14:30" });
    expect(result.content).toBe("Gate B22 – boarding at 14:30");
  });
});

// ── dbCompanionToType ─────────────────────────────────────────────────────────

type CompanionRow = typeof userCompanions.$inferSelect;

const BASE_COMPANION: CompanionRow = {
  id: "companion-1",
  userId: "user-1",
  name: "Alex Smith",
  age: null,
  passportNumber: null,
  passportExpiry: null,
  passportNationality: null,
  knownTravelerNumber: null,
  packtUsername: null,
  position: 0,
  createdAt: null,
};

describe("dbCompanionToType", () => {
  it("maps core fields correctly", () => {
    const result = dbCompanionToType(BASE_COMPANION);
    expect(result.id).toBe("companion-1");
    expect(result.name).toBe("Alex Smith");
    expect(result.position).toBe(0);
  });

  it("null optional fields become undefined", () => {
    const result = dbCompanionToType(BASE_COMPANION);
    expect(result.age).toBeUndefined();
    expect(result.passportNumber).toBeUndefined();
    expect(result.passportExpiry).toBeUndefined();
    expect(result.passportNationality).toBeUndefined();
    expect(result.knownTravelerNumber).toBeUndefined();
    expect(result.packtUsername).toBeUndefined();
  });

  it("maps all travel-doc fields when present", () => {
    const result = dbCompanionToType({
      ...BASE_COMPANION,
      age: 30,
      passportNumber: "P12345678",
      passportExpiry: "2030-06-15",
      passportNationality: "United States",
      knownTravelerNumber: "KTN-9876",
      packtUsername: "alex.smith",
    });
    expect(result.age).toBe(30);
    expect(result.passportNumber).toBe("P12345678");
    expect(result.passportExpiry).toBe("2030-06-15");
    expect(result.passportNationality).toBe("United States");
    expect(result.knownTravelerNumber).toBe("KTN-9876");
    expect(result.packtUsername).toBe("alex.smith");
  });

  it("maps non-zero position", () => {
    const result = dbCompanionToType({ ...BASE_COMPANION, position: 2 });
    expect(result.position).toBe(2);
  });
});
