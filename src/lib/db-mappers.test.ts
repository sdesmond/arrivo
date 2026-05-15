import { describe, it, expect } from "vitest";
import {
  dbTripToType,
  dbEventToType,
  dbDocToType,
  dbCollabToType,
  dbNoteToType,
  dbChecklistToType,
} from "@/lib/db-mappers";
import type {
  trips,
  events,
  documents,
  collaborators,
  itineraryNotes,
  itineraryChecklists,
  checklistItems,
} from "@/db/schema";

type TripRow = typeof trips.$inferSelect;
type EventRow = typeof events.$inferSelect;
type DocRow = typeof documents.$inferSelect;
type CollabRow = typeof collaborators.$inferSelect;

// ── dbTripToType ──────────────────────────────────────────────────────────────

const BASE_TRIP: TripRow = {
  id: "trip-1",
  ownerId: "user-1",
  name: "Tokyo Trip",
  startDate: "2020-01-01",
  endDate: "2020-01-10",
  coverImageUrl: null,
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

  it("null optional fields become undefined", () => {
    const result = dbTripToType(BASE_TRIP);
    expect(result.coverImageUrl).toBeUndefined();
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
      notes: "Pack light",
    });
    expect(result.coverImageUrl).toBe("https://example.com/img.jpg");
    expect(result.notes).toBe("Pack light");
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

// ── dbDocToType ───────────────────────────────────────────────────────────────

const BASE_DOC: DocRow = {
  id: "doc-1",
  tripId: "trip-1",
  eventId: null,
  name: "Boarding Pass",
  kind: "pdf",
  size: null,
  offline: null,
  url: null,
  previewLines: null,
  addedAt: null,
};

describe("dbDocToType", () => {
  it("maps core fields correctly", () => {
    const result = dbDocToType(BASE_DOC);
    expect(result.id).toBe("doc-1");
    expect(result.name).toBe("Boarding Pass");
    expect(result.kind).toBe("pdf");
  });

  it("scope is trip when tripId is set", () => {
    expect(dbDocToType(BASE_DOC).scope).toBe("trip");
  });

  it("scope is event when tripId is null", () => {
    expect(dbDocToType({ ...BASE_DOC, tripId: null }).scope).toBe("event");
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
