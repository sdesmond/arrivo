// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, eventsTable, reservationsTable } = vi.hoisted(() => ({
  db: { select: vi.fn() },
  eventsTable: { id: "events.id", tripId: "events.tripId" },
  reservationsTable: { id: "reservations.id", tripId: "reservations.tripId" },
}));

vi.mock("@/db", () => ({ db }));
vi.mock("@/db/schema", () => ({ events: eventsTable, reservations: reservationsTable }));

import { resolveOwningTripId } from "./trip-resolution";

describe("resolveOwningTripId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves trip-document keys directly from the ownerId segment", async () => {
    await expect(resolveOwningTripId("trip-documents/trip-1/uuid.pdf")).resolves.toBe("trip-1");
    expect(db.select).not.toHaveBeenCalled();
  });

  it("resolves trip-cover keys directly from the ownerId segment", async () => {
    await expect(resolveOwningTripId("trip-covers/trip-1/uuid.jpg")).resolves.toBe("trip-1");
    expect(db.select).not.toHaveBeenCalled();
  });

  it("resolves event-document keys by looking up the event's tripId", async () => {
    db.select.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(async () => [{ tripId: "trip-2" }]),
      })),
    });

    await expect(resolveOwningTripId("event-documents/event-1/uuid.jpg")).resolves.toBe("trip-2");
  });

  it("throws 'Event not found' when the event record does not exist", async () => {
    db.select.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(async () => []),
      })),
    });

    await expect(resolveOwningTripId("event-documents/event-1/uuid.jpg")).rejects.toThrow("Event not found");
  });

  it("resolves reservation-document keys by looking up the reservation's tripId", async () => {
    db.select.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(async () => [{ tripId: "trip-3" }]),
      })),
    });

    await expect(resolveOwningTripId("reservation-documents/res-1/uuid.pdf")).resolves.toBe("trip-3");
  });

  it("throws 'Reservation not found.' when the reservation record does not exist", async () => {
    db.select.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(async () => []),
      })),
    });

    await expect(resolveOwningTripId("reservation-documents/res-1/uuid.pdf")).rejects.toThrow("Reservation not found.");
  });

  it("throws on a malformed key (delegated to parseUploadStorageName)", async () => {
    await expect(resolveOwningTripId("not-a-scope/foo/bar.jpg")).rejects.toThrow();
  });
});
