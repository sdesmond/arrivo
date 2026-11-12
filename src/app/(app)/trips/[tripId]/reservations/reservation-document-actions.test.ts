// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  adapterDel,
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

import {
  removeReservationDocument,
  renameReservationDocument,
  promoteReservationDocToTrip,
  attachTripDocToReservation,
} from "./reservation-document-actions";

describe("removeReservationDocument", () => {
  const docRow = { id: "doc-1", url: "https://blob.example.com/doc.pdf", reservationId: "res-1" };
  const reservationRow = { id: "res-1", tripId: "trip-1" };

  beforeEach(() => {
    vi.clearAllMocks();
    db.select.mockReset();
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockResolvedValue(undefined);
    getStorageAdapter.mockReturnValue({ del: adapterDel });
    adapterDel.mockResolvedValue(undefined);
    db.delete.mockReturnValue({ where: async () => undefined });
  });

  it("resolves silently when the document does not exist (idempotent)", async () => {
    db.select.mockReturnValue({ from: () => ({ where: async () => [] }) });

    await expect(removeReservationDocument("missing")).resolves.toBeUndefined();
    expect(assertTripAccess).not.toHaveBeenCalled();
    expect(recordTripUpdated).not.toHaveBeenCalled();
  });

  it("throws when the document is not attached to a reservation", async () => {
    db.select.mockReturnValue({
      from: () => ({ where: async () => [{ ...docRow, reservationId: null }] }),
    });

    await expect(removeReservationDocument("doc-1")).rejects.toThrow("Document is not attached to a reservation.");
  });

  it("throws when the reservation is not found", async () => {
    db.select
      .mockReturnValueOnce({ from: () => ({ where: async () => [docRow] }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [] }) });

    await expect(removeReservationDocument("doc-1")).rejects.toThrow("Reservation not found.");
    expect(recordTripUpdated).not.toHaveBeenCalled();
  });

  it("checks editor access on the reservation's trip", async () => {
    db.select
      .mockReturnValueOnce({ from: () => ({ where: async () => [docRow] }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [reservationRow] }) });

    await removeReservationDocument("doc-1");

    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
  });

  it("calls del() on the document URL before deleting the document row", async () => {
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    db.delete.mockReturnValue({ where: deleteWhere });

    db.select
      .mockReturnValueOnce({ from: () => ({ where: async () => [docRow] }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [reservationRow] }) });

    await removeReservationDocument("doc-1");

    expect(adapterDel).toHaveBeenCalledWith("https://blob.example.com/doc.pdf");
    expect(deleteWhere).toHaveBeenCalled();
  });

  it("calls del() unconditionally on legacy URLs (the adapter no-ops on them)", async () => {
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    db.delete.mockReturnValue({ where: deleteWhere });

    db.select
      .mockReturnValueOnce({ from: () => ({ where: async () => [{ ...docRow, url: "/uploads/legacy.pdf" }] }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [reservationRow] }) });

    await removeReservationDocument("doc-1");

    expect(adapterDel).toHaveBeenCalledWith("/uploads/legacy.pdf");
    expect(deleteWhere).toHaveBeenCalled();
  });

  it("skips del() when the document has no url", async () => {
    db.select
      .mockReturnValueOnce({ from: () => ({ where: async () => [{ ...docRow, url: null }] }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [reservationRow] }) });

    await removeReservationDocument("doc-1");

    expect(adapterDel).not.toHaveBeenCalled();
  });

  it("revalidates the trip path after removal", async () => {
    db.select
      .mockReturnValueOnce({ from: () => ({ where: async () => [docRow] }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [reservationRow] }) });

    await removeReservationDocument("doc-1");

    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
    expect(recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user-1", "trip-1");
  });

  it("still deletes the document row when the adapter del rejects", async () => {
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    db.delete.mockReturnValue({ where: deleteWhere });
    adapterDel.mockRejectedValueOnce(new Error("storage unavailable"));

    db.select
      .mockReturnValueOnce({ from: () => ({ where: async () => [docRow] }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [reservationRow] }) });

    await expect(removeReservationDocument("doc-1")).resolves.toBeUndefined();

    expect(deleteWhere).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });
});

describe("renameReservationDocument", () => {
  const reservationRow = { id: "res-1", tripId: "trip-1" };

  beforeEach(() => {
    vi.clearAllMocks();
    db.select.mockReset();
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockResolvedValue(undefined);
    db.update.mockReturnValue({ set: () => ({ where: async () => undefined }) });
  });

  it("does nothing when the document does not exist", async () => {
    db.select.mockReturnValue({ from: () => ({ where: async () => [] }) });

    await expect(renameReservationDocument("missing", "New name")).resolves.toBeUndefined();
    expect(assertTripAccess).not.toHaveBeenCalled();
    expect(recordTripUpdated).not.toHaveBeenCalled();
  });

  it("resolves the trip via the reservation when the doc has no tripId", async () => {
    db.select
      .mockReturnValueOnce({
        from: () => ({ where: async () => [{ id: "doc-1", tripId: null, reservationId: "res-1" }] }),
      })
      .mockReturnValueOnce({ from: () => ({ where: async () => [reservationRow] }) });

    await renameReservationDocument("doc-1", "New name");

    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
  });

  it("updates the document name and revalidates the trip path", async () => {
    db.select.mockReturnValue({ from: () => ({ where: async () => [{ id: "doc-1", tripId: "trip-1" }] }) });
    const setSpy = vi.fn(() => ({ where: async () => undefined }));
    db.update.mockReturnValue({ set: setSpy });

    await renameReservationDocument("doc-1", "New name");

    expect(setSpy).toHaveBeenCalledWith({ name: "New name" });
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
    expect(recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user-1", "trip-1");
  });
});

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
