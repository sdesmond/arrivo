import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  addDocumentSchema,
  createReservationSchema,
  createTripSchema,
  parseInput,
  tripNoteBodySchema,
  tripNoteTitleSchema,
  updateDaySchema,
  updateEventSchema,
  updateReservationSchema,
  updateTripSchema,
} from "./validation-schemas";
import { FIELD_LIMITS, MAX_BUDGET_TOTAL } from "./validation-limits";

const OVER = (limit: number) => "x".repeat(limit + 1);

describe("parseInput", () => {
  it("returns parsed data", () => {
    expect(parseInput(z.object({ a: z.string() }), { a: "ok" })).toEqual({ a: "ok" });
  });

  it("throws the first issue message", () => {
    expect(() => parseInput(z.object({ a: z.string({ error: "A is required." }) }), {})).toThrow("A is required.");
  });

  it("throws a generic message when there are no issues to report", () => {
    const schema = z.custom(() => false);
    expect(() => parseInput(schema, 1)).toThrow();
  });
});

describe("createTripSchema", () => {
  it("accepts a minimal trip", () => {
    expect(parseInput(createTripSchema, { name: "Japan" })).toEqual({ name: "Japan" });
  });

  it("rejects blank and whitespace names", () => {
    expect(() => parseInput(createTripSchema, { name: "" })).toThrow("Trip name is required.");
    expect(() => parseInput(createTripSchema, { name: "   " })).toThrow("Trip name is required.");
  });

  it("rejects oversize name, notes, destination and tags", () => {
    expect(() => parseInput(createTripSchema, { name: OVER(FIELD_LIMITS.tripName) })).toThrow(
      "Trip name must be 100 characters or fewer."
    );
    expect(() => parseInput(createTripSchema, { name: "a", notes: OVER(FIELD_LIMITS.tripNotes) })).toThrow("Notes");
    expect(() => parseInput(createTripSchema, { name: "a", destinationName: OVER(FIELD_LIMITS.destination) })).toThrow(
      "Destination"
    );
    expect(() => parseInput(createTripSchema, { name: "a", tags: [OVER(FIELD_LIMITS.tag)] })).toThrow("Tag");
    expect(() =>
      parseInput(createTripSchema, { name: "a", tags: Array.from({ length: FIELD_LIMITS.tagCount + 1 }, () => "t") })
    ).toThrow("tags");
  });

  it("rejects impossible calendar dates", () => {
    expect(() => parseInput(createTripSchema, { name: "a", startDate: "2026-99-99" })).toThrow(
      "Invalid start date format. Expected YYYY-MM-DD."
    );
    expect(() => parseInput(createTripSchema, { name: "a", endDate: "2026-02-30" })).toThrow(
      "Invalid end date format. Expected YYYY-MM-DD."
    );
  });

  it("bounds the budget", () => {
    expect(() => parseInput(createTripSchema, { name: "a", budgetTotal: -1 })).toThrow("Budget");
    expect(() => parseInput(createTripSchema, { name: "a", budgetTotal: Number.NaN })).toThrow("Budget");
    expect(() => parseInput(createTripSchema, { name: "a", budgetTotal: MAX_BUDGET_TOTAL + 1 })).toThrow("Budget");
    expect(parseInput(createTripSchema, { name: "a", budgetTotal: 0 }).budgetTotal).toBe(0);
  });

  it("validates destination center coordinates", () => {
    expect(parseInput(createTripSchema, { name: "a", destinationCenter: [139.7, 35.6] }).destinationCenter).toEqual([
      139.7, 35.6,
    ]);
    expect(() => parseInput(createTripSchema, { name: "a", destinationCenter: [200, 35] })).toThrow();
  });

  it("keeps only known keys", () => {
    expect(parseInput(createTripSchema, { name: "a", ownerId: "evil" })).toEqual({ name: "a" });
  });
});

describe("updateTripSchema", () => {
  it("allows nulling nullable fields and omitting everything", () => {
    expect(parseInput(updateTripSchema, {})).toEqual({});
    expect(parseInput(updateTripSchema, { startDate: null, endDate: null, coverImageUrl: null })).toEqual({
      startDate: null,
      endDate: null,
      coverImageUrl: null,
    });
  });

  it("rejects blank name when present", () => {
    expect(() => parseInput(updateTripSchema, { name: " " })).toThrow("Trip name is required.");
  });

  it("rejects bad dates and oversize text", () => {
    expect(() => parseInput(updateTripSchema, { startDate: "2026-13-01" })).toThrow("start date");
    expect(() => parseInput(updateTripSchema, { notes: OVER(FIELD_LIMITS.tripNotes) })).toThrow("Notes");
  });
});

describe("updateEventSchema", () => {
  it("caps text and rejects invalid datetimes and out-of-range coordinates", () => {
    expect(() => parseInput(updateEventSchema, { note: OVER(FIELD_LIMITS.eventNote) })).toThrow("Note");
    expect(() => parseInput(updateEventSchema, { name: " " })).toThrow("Event name is required.");
    expect(() => parseInput(updateEventSchema, { endAt: "2026-13-40T00:00:00Z" })).toThrow("Invalid end time.");
    expect(() => parseInput(updateEventSchema, { locationLng: -181 })).toThrow("Longitude");
    expect(() => parseInput(updateEventSchema, { locationLat: Number.NaN })).toThrow("Latitude");
  });

  it("treats an empty event time as unset", () => {
    expect(parseInput(updateEventSchema, { startAt: "", endAt: "" })).toEqual({ startAt: "", endAt: "" });
  });

  it("drops keys outside the contract", () => {
    expect(parseInput(updateEventSchema, { name: "a", dayId: "x", tripId: "y", position: 3 })).toEqual({ name: "a" });
  });
});

describe("updateDaySchema", () => {
  it("caps label and text", () => {
    expect(() => parseInput(updateDaySchema, { label: OVER(FIELD_LIMITS.dayLabel) })).toThrow("Day label");
    expect(() => parseInput(updateDaySchema, { subtitle: OVER(FIELD_LIMITS.dayText) })).toThrow("Subtitle");
    expect(() => parseInput(updateDaySchema, { weather: OVER(FIELD_LIMITS.dayText) })).toThrow("Weather");
    expect(() => parseInput(updateDaySchema, { travelSummary: OVER(FIELD_LIMITS.dayText) })).toThrow("Travel summary");
    expect(parseInput(updateDaySchema, { label: "Day 1", id: "x" })).toEqual({ label: "Day 1" });
  });
});

describe("trip note schemas", () => {
  it("caps title and body", () => {
    expect(() => parseInput(tripNoteTitleSchema, OVER(FIELD_LIMITS.noteTitle))).toThrow("Title");
    expect(() => parseInput(tripNoteBodySchema, OVER(FIELD_LIMITS.noteBody))).toThrow("Note body");
    expect(parseInput(tripNoteTitleSchema, "a")).toBe("a");
    expect(parseInput(tripNoteBodySchema, "b")).toBe("b");
  });
});

describe("reservation schemas", () => {
  const base = { type: "flight" as const, provider: "ANA" };

  it("accepts a valid reservation and trims nothing it does not own", () => {
    expect(parseInput(createReservationSchema, base)).toEqual(base);
  });

  it("keeps the established error messages", () => {
    expect(() => parseInput(createReservationSchema, { ...base, type: "boat" })).toThrow("Invalid reservation type.");
    expect(() => parseInput(createReservationSchema, { ...base, provider: "  " })).toThrow("Provider is required.");
    expect(() => parseInput(createReservationSchema, { ...base, startAt: "x" })).toThrow("Invalid start time.");
    expect(() => parseInput(createReservationSchema, { ...base, endAt: "x" })).toThrow("Invalid end time.");
    expect(() => parseInput(updateReservationSchema, { provider: " " })).toThrow("Provider is required.");
    expect(() => parseInput(updateReservationSchema, { startAt: "x" })).toThrow("Invalid start date and time.");
    expect(() => parseInput(updateReservationSchema, { endAt: "x" })).toThrow("Invalid end date and time.");
    expect(parseInput(updateReservationSchema, { startAt: "", endAt: "" })).toEqual({ startAt: "", endAt: "" });
  });

  it("caps free text and coordinates", () => {
    expect(() => parseInput(createReservationSchema, { ...base, provider: OVER(FIELD_LIMITS.provider) })).toThrow(
      "Provider"
    );
    expect(() => parseInput(createReservationSchema, { ...base, notes: OVER(FIELD_LIMITS.reservationNotes) })).toThrow(
      "Notes"
    );
    expect(() =>
      parseInput(createReservationSchema, { ...base, confirmationCode: OVER(FIELD_LIMITS.confirmationCode) })
    ).toThrow("Confirmation code");
    expect(() => parseInput(updateReservationSchema, { serviceNumber: OVER(FIELD_LIMITS.serviceNumber) })).toThrow(
      "Service number"
    );
    expect(() => parseInput(updateReservationSchema, { startLocationLat: 95 })).toThrow("Latitude");
    expect(() => parseInput(createReservationSchema, { ...base, endLocationLng: 181 })).toThrow("Longitude");
  });
});

describe("addDocumentSchema", () => {
  it("requires name and kind and caps them", () => {
    expect(() => parseInput(addDocumentSchema, { name: "", kind: "pdf" })).toThrow("Document name is required.");
    expect(() => parseInput(addDocumentSchema, { name: OVER(FIELD_LIMITS.documentName), kind: "pdf" })).toThrow(
      "Document name"
    );
    expect(() => parseInput(addDocumentSchema, { name: "a", kind: OVER(FIELD_LIMITS.documentKind) })).toThrow("Kind");
    expect(parseInput(addDocumentSchema, { name: "a", kind: "pdf", url: "https://x.test/a.pdf" })).toEqual({
      name: "a",
      kind: "pdf",
      url: "https://x.test/a.pdf",
    });
  });
});
