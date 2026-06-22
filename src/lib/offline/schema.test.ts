import { describe, it, expect } from "vitest";
import { OFFLINE_DB_SCHEMA_V1, OFFLINE_DB_SCHEMA_V2 } from "./schema";

describe("OFFLINE_DB_SCHEMA_V1", () => {
  it("defines all six tables", () => {
    expect(Object.keys(OFFLINE_DB_SCHEMA_V1)).toEqual([
      "trips",
      "days",
      "events",
      "documents",
      "packingItems",
      "outbox",
    ]);
  });

  it("indexes trips by id and ownerId", () => {
    expect(OFFLINE_DB_SCHEMA_V1.trips).toBe("id, ownerId");
  });

  it("indexes days by tripId and dayNumber with a compound index", () => {
    expect(OFFLINE_DB_SCHEMA_V1.days).toBe("id, tripId, dayNumber, [tripId+dayNumber]");
  });

  it("indexes events by tripId, dayId, position with a compound [tripId+dayId] index", () => {
    expect(OFFLINE_DB_SCHEMA_V1.events).toBe("id, tripId, dayId, position, [tripId+dayId]");
  });

  it("indexes documents by tripId, eventId, and reservationId", () => {
    expect(OFFLINE_DB_SCHEMA_V1.documents).toBe("id, tripId, eventId, reservationId");
  });

  it("indexes packingItems by tripId and listId", () => {
    expect(OFFLINE_DB_SCHEMA_V1.packingItems).toBe("id, tripId, listId");
  });

  it("indexes outbox by entityId", () => {
    expect(OFFLINE_DB_SCHEMA_V1.outbox).toBe("id, entityId");
  });
});

describe("OFFLINE_DB_SCHEMA_V2", () => {
  it("adds syncStatus index to events", () => {
    expect(OFFLINE_DB_SCHEMA_V2.events).toBe("id, tripId, dayId, position, [tripId+dayId], syncStatus");
  });

  it("adds syncStatus index to documents", () => {
    expect(OFFLINE_DB_SCHEMA_V2.documents).toBe("id, tripId, eventId, reservationId, syncStatus");
  });

  it("adds syncStatus index to packingItems", () => {
    expect(OFFLINE_DB_SCHEMA_V2.packingItems).toBe("id, tripId, listId, syncStatus");
  });
});
