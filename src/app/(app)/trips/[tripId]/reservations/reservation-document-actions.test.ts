// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  assertTripAccess,
  db,
  documentsTable,
  getStorageAdapter,
  recordTripUpdated,
  requireUser,
  reservationsTable,
  revalidatePath,
} = vi.hoisted(() => ({
  adapterDel: vi.fn(),
  assertTripAccess: vi.fn(),
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  documentsTable: {
    id: "documents.id",
    tripId: "documents.tripId",
    reservationId: "documents.reservationId",
    url: "documents.url",
  },
  getStorageAdapter: vi.fn(),
  recordTripUpdated: vi.fn(),
  requireUser: vi.fn(),
  reservationsTable: { id: "reservations.id", tripId: "reservations.tripId" },
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth-helpers", () => ({
  assertTripAccess,
  requireUser,
}));

vi.mock("@/db", () => ({
  db,
}));

vi.mock("@/db/schema", () => ({
  reservations: reservationsTable,
  documents: documentsTable,
}));

// The resolver throws the real owner-not-found error; only the adapter lookup is replaced.
vi.mock("@/lib/storage/storage-adapter", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage/storage-adapter")>()),
  getStorageAdapter,
}));

vi.mock("next/cache", () => ({
  revalidatePath,
}));

vi.mock("@/lib/trip-activity", () => ({ recordTripUpdated }));

import { promoteReservationDocToTrip, attachTripDocToReservation } from "./reservation-document-actions";

describe("promoteReservationDocToTrip", () => {
  const reservationRow = { id: "res-1", tripId: "trip-1" };

  beforeEach(() => {
    vi.clearAllMocks();
    db.select.mockReset();
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockResolvedValue(undefined);
  });

  it("does nothing when the document does not exist", async () => {
    db.select.mockReturnValue({ from: () => ({ where: async () => [] }) });

    await expect(promoteReservationDocToTrip("missing")).resolves.toBeUndefined();
    expect(assertTripAccess).not.toHaveBeenCalled();
    expect(recordTripUpdated).not.toHaveBeenCalled();
  });

  it("sets tripId and clears reservationId, resolving the trip via the reservation when needed", async () => {
    db.select
      .mockReturnValueOnce({
        from: () => ({ where: async () => [{ id: "doc-1", tripId: null, reservationId: "res-1" }] }),
      })
      .mockReturnValueOnce({ from: () => ({ where: async () => [reservationRow] }) });
    const setSpy = vi.fn(() => ({ where: async () => undefined }));
    db.update.mockReturnValue({ set: setSpy });

    await promoteReservationDocToTrip("doc-1");

    expect(setSpy).toHaveBeenCalledWith({ tripId: "trip-1", reservationId: null });
    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
    expect(recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user-1", "trip-1");
  });

  it("uses the doc's existing tripId without a reservation lookup", async () => {
    db.select.mockReturnValueOnce({ from: () => ({ where: async () => [{ id: "doc-1", tripId: "trip-1" }] }) });
    const setSpy = vi.fn(() => ({ where: async () => undefined }));
    db.update.mockReturnValue({ set: setSpy });

    await promoteReservationDocToTrip("doc-1");

    expect(setSpy).toHaveBeenCalledWith({ tripId: "trip-1", reservationId: null });
  });
});

describe("attachTripDocToReservation", () => {
  const reservationRow = { id: "res-1", tripId: "trip-1" };

  beforeEach(() => {
    vi.clearAllMocks();
    db.select.mockReset();
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockResolvedValue(undefined);
    db.select.mockReturnValue({ from: () => ({ where: async () => [reservationRow] }) });
  });

  it("throws when the reservation does not exist", async () => {
    db.select.mockReturnValue({ from: () => ({ where: async () => [] }) });

    await expect(attachTripDocToReservation("doc-1", "missing")).rejects.toThrow("Reservation not found.");
    expect(recordTripUpdated).not.toHaveBeenCalled();
  });

  function mockDocUpdate(rows: { id: string }[]) {
    const returning = vi.fn(async () => rows);
    const where = vi.fn(() => ({ returning }));
    const setSpy = vi.fn(() => ({ where }));
    db.update.mockReturnValue({ set: setSpy });
    return { setSpy, where };
  }

  it("checks editor access before attaching", async () => {
    mockDocUpdate([{ id: "doc-1" }]);

    await attachTripDocToReservation("doc-1", "res-1");

    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
  });

  it("sets the reservationId on the document and revalidates the trip path", async () => {
    const { setSpy } = mockDocUpdate([{ id: "doc-1" }]);

    await attachTripDocToReservation("doc-1", "res-1");

    expect(setSpy).toHaveBeenCalledWith({ reservationId: "res-1" });
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
    expect(recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user-1", "trip-1");
  });

  it("rejects a document that belongs to another trip", async () => {
    mockDocUpdate([]);

    await expect(attachTripDocToReservation("other-trip-doc", "res-1")).rejects.toThrow("Document not found.");
    expect(recordTripUpdated).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
