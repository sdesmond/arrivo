// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, documentsTable, eventsTable, reservationsTable } = vi.hoisted(() => ({
  db: { select: vi.fn() },
  documentsTable: { url: "documents.url", tripId: "documents.tripId" },
  eventsTable: { id: "events.id", tripId: "events.tripId" },
  reservationsTable: { id: "reservations.id", tripId: "reservations.tripId" },
}));

vi.mock("@/db", () => ({ db }));
vi.mock("@/db/schema", () => ({ documents: documentsTable, events: eventsTable, reservations: reservationsTable }));

import { MalformedKeyError } from "@/lib/upload-policy";
import { StorageOwnerNotFoundError } from "./storage-adapter";
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

  function selectResult(rows: unknown[]) {
    return { from: vi.fn(() => ({ where: vi.fn(async () => rows) })) };
  }

  it("falls back to the document row's trip when the event was deleted but its document was kept", async () => {
    db.select.mockReturnValueOnce(selectResult([])).mockReturnValueOnce(selectResult([{ tripId: "trip-4" }]));

    await expect(resolveOwningTripId("event-documents/event-1/uuid.jpg")).resolves.toBe("trip-4");
    expect(db.select).toHaveBeenCalledTimes(2);
  });

  it("throws 'Event not found' when neither the event nor a document row exists", async () => {
    db.select.mockReturnValueOnce(selectResult([])).mockReturnValueOnce(selectResult([]));

    await expect(resolveOwningTripId("event-documents/event-1/uuid.jpg")).rejects.toThrow("Event not found");
    db.select.mockReturnValueOnce(selectResult([])).mockReturnValueOnce(selectResult([]));
    await expect(resolveOwningTripId("event-documents/event-1/uuid.jpg")).rejects.toBeInstanceOf(
      StorageOwnerNotFoundError
    );
  });

  it("throws 'Event not found' when the surviving document row has no trip", async () => {
    db.select.mockReturnValueOnce(selectResult([])).mockReturnValueOnce(selectResult([{ tripId: null }]));

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

    await expect(resolveOwningTripId("reservation-documents/res-1/uuid.pdf")).rejects.toBeInstanceOf(
      StorageOwnerNotFoundError
    );
  });

  it("never resolves a user-avatar key to a trip", async () => {
    await expect(resolveOwningTripId("user-avatars/user-1/uuid.webp")).rejects.toThrow(
      "user-avatar keys have no owning trip"
    );
    expect(db.select).not.toHaveBeenCalled();
  });

  it("throws on a malformed key (delegated to parseUploadStorageName)", async () => {
    await expect(resolveOwningTripId("not-a-scope/foo/bar.jpg")).rejects.toThrow();
  });

  // The container keeps its generated auth secret under the storage root; the proxy must never serve it.
  it("rejects the container's persisted auth secret as a malformed key", async () => {
    await expect(resolveOwningTripId(".arrivo/auth-secret")).rejects.toBeInstanceOf(MalformedKeyError);
    expect(db.select).not.toHaveBeenCalled();
  });
});
