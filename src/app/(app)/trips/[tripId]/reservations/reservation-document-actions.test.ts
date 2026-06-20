// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { assertTripAccess, db, documentsTable, requireUser, reservationsTable, revalidatePath } = vi.hoisted(() => ({
  assertTripAccess: vi.fn(),
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  documentsTable: { id: "documents.id", reservationId: "documents.reservationId", url: "documents.url" },
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

vi.mock("next/cache", () => ({
  revalidatePath,
}));

const { put, del } = vi.hoisted(() => ({
  put: vi.fn(),
  del: vi.fn(),
}));
vi.mock("@vercel/blob", () => ({ put, del }));

const { saveLocalUpload } = vi.hoisted(() => ({
  saveLocalUpload: vi.fn(),
}));
vi.mock("@/lib/local-upload", () => ({ saveLocalUpload }));

import {
  uploadReservationDocument,
  removeReservationDocument,
  renameReservationDocument,
  promoteReservationDocToTrip,
  attachTripDocToReservation,
} from "./reservation-document-actions";

describe("uploadReservationDocument", () => {
  const reservationRow = { id: "res-1", tripId: "trip-1" };

  function makeFile(name: string, size: number): File {
    const file = new File(["x"], name, { type: "application/pdf" });
    Object.defineProperty(file, "size", { value: size, configurable: true });
    return file;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    db.select.mockReset();
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockResolvedValue(undefined);
    put.mockResolvedValue({ url: "https://blob.example.com/doc.pdf" });
    saveLocalUpload.mockResolvedValue("http://localhost/stub/doc.pdf");
    db.insert.mockReturnValue({ values: async () => undefined });
  });

  it("throws when the reservation does not exist", async () => {
    db.select.mockReturnValue({ from: () => ({ where: async () => [] }) });

    const form = new FormData();
    form.append("file", makeFile("doc.pdf", 100));

    await expect(uploadReservationDocument("missing", form)).rejects.toThrow("Reservation not found.");
    expect(assertTripAccess).not.toHaveBeenCalled();
  });

  it("checks editor access before uploading", async () => {
    db.select.mockReturnValue({ from: () => ({ where: async () => [reservationRow] }) });

    const form = new FormData();
    form.append("file", makeFile("doc.pdf", 100));

    await uploadReservationDocument("res-1", form);

    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
  });

  it("rejects files larger than MAX_UPLOAD_BYTES", async () => {
    db.select.mockReturnValue({ from: () => ({ where: async () => [reservationRow] }) });

    const form = new FormData();
    form.append("file", makeFile("big.pdf", 30 * 1024 * 1024));

    await expect(uploadReservationDocument("res-1", form)).rejects.toThrow("File is too large.");
    expect(put).not.toHaveBeenCalled();
  });

  it("calls put() with the file and inserts a document row", async () => {
    db.select.mockReturnValue({ from: () => ({ where: async () => [reservationRow] }) });
    let insertedValues: Record<string, unknown> | undefined;
    db.insert.mockReturnValue({
      values: async (vals: Record<string, unknown>) => {
        insertedValues = vals;
      },
    });

    const form = new FormData();
    form.append("file", makeFile("doc.pdf", 100));

    await uploadReservationDocument("res-1", form);

    expect(put).toHaveBeenCalled();
    expect(insertedValues).toMatchObject({
      tripId: "trip-1",
      reservationId: "res-1",
      name: "doc.pdf",
      kind: "pdf",
      size: "0.1 KB",
      url: "https://blob.example.com/doc.pdf",
    });
  });

  it("derives the document kind from the file MIME type, not the filename", async () => {
    db.select.mockReturnValue({ from: () => ({ where: async () => [reservationRow] }) });
    let insertedValues: Record<string, unknown> | undefined;
    db.insert.mockReturnValue({
      values: async (vals: Record<string, unknown>) => {
        insertedValues = vals;
      },
    });

    // Filename ends in .pdf but the MIME type is an image — kind must follow the MIME type.
    const file = new File(["x"], "scan.pdf", { type: "image/png" });
    Object.defineProperty(file, "size", { value: 100, configurable: true });
    const form = new FormData();
    form.append("file", file);

    await uploadReservationDocument("res-1", form);

    expect(insertedValues).toMatchObject({ kind: "image" });
  });

  it("rolls back the uploaded blob when the document insert fails", async () => {
    db.select.mockReturnValue({ from: () => ({ where: async () => [reservationRow] }) });
    db.insert.mockReturnValue({
      values: async () => {
        throw new Error("insert failed");
      },
    });

    const form = new FormData();
    form.append("file", makeFile("doc.pdf", 100));

    await expect(uploadReservationDocument("res-1", form)).rejects.toThrow("insert failed");
    expect(del).toHaveBeenCalledWith("https://blob.example.com/doc.pdf");
  });

  it("does not attempt blob rollback when the insert fails under UPLOAD_STUB", async () => {
    process.env.UPLOAD_STUB = "true";
    db.select.mockReturnValue({ from: () => ({ where: async () => [reservationRow] }) });
    db.insert.mockReturnValue({
      values: async () => {
        throw new Error("insert failed");
      },
    });

    const form = new FormData();
    form.append("file", makeFile("doc.pdf", 100));

    await expect(uploadReservationDocument("res-1", form)).rejects.toThrow("insert failed");
    expect(del).not.toHaveBeenCalled();
    delete process.env.UPLOAD_STUB;
  });

  it("calls saveLocalUpload() when UPLOAD_STUB is 'true'", async () => {
    process.env.UPLOAD_STUB = "true";
    db.select.mockReturnValue({ from: () => ({ where: async () => [reservationRow] }) });

    const form = new FormData();
    form.append("file", makeFile("doc.pdf", 100));

    await uploadReservationDocument("res-1", form);

    expect(saveLocalUpload).toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    delete process.env.UPLOAD_STUB;
  });

  it("revalidates the trip path after upload", async () => {
    db.select.mockReturnValue({ from: () => ({ where: async () => [reservationRow] }) });

    const form = new FormData();
    form.append("file", makeFile("doc.pdf", 100));

    await uploadReservationDocument("res-1", form);

    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });
});

describe("removeReservationDocument", () => {
  const docRow = { id: "doc-1", url: "https://blob.example.com/doc.pdf", reservationId: "res-1" };
  const reservationRow = { id: "res-1", tripId: "trip-1" };

  beforeEach(() => {
    vi.clearAllMocks();
    db.select.mockReset();
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockResolvedValue(undefined);
    del.mockResolvedValue(undefined);
    db.delete.mockReturnValue({ where: async () => undefined });
  });

  it("resolves silently when the document does not exist (idempotent)", async () => {
    db.select.mockReturnValue({ from: () => ({ where: async () => [] }) });

    await expect(removeReservationDocument("missing")).resolves.toBeUndefined();
    expect(assertTripAccess).not.toHaveBeenCalled();
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
  });

  it("checks editor access on the reservation's trip", async () => {
    db.select
      .mockReturnValueOnce({ from: () => ({ where: async () => [docRow] }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [reservationRow] }) });

    await removeReservationDocument("doc-1");

    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
  });

  it("calls del() on the blob URL before deleting the document row", async () => {
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    db.delete.mockReturnValue({ where: deleteWhere });

    db.select
      .mockReturnValueOnce({ from: () => ({ where: async () => [docRow] }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [reservationRow] }) });

    await removeReservationDocument("doc-1");

    expect(del).toHaveBeenCalledWith("https://blob.example.com/doc.pdf");
    expect(deleteWhere).toHaveBeenCalled();
  });

  it("skips del() when UPLOAD_STUB is 'true'", async () => {
    process.env.UPLOAD_STUB = "true";
    db.select
      .mockReturnValueOnce({ from: () => ({ where: async () => [docRow] }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [reservationRow] }) });

    await removeReservationDocument("doc-1");

    expect(del).not.toHaveBeenCalled();
    delete process.env.UPLOAD_STUB;
  });

  it("skips del() when the document has no url", async () => {
    db.select
      .mockReturnValueOnce({ from: () => ({ where: async () => [{ ...docRow, url: null }] }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [reservationRow] }) });

    await removeReservationDocument("doc-1");

    expect(del).not.toHaveBeenCalled();
  });

  it("still deletes the document row when blob cleanup fails (best-effort)", async () => {
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    db.delete.mockReturnValue({ where: deleteWhere });
    del.mockRejectedValue(new Error("blob store unavailable"));

    db.select
      .mockReturnValueOnce({ from: () => ({ where: async () => [docRow] }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [reservationRow] }) });

    await expect(removeReservationDocument("doc-1")).resolves.toBeUndefined();
    expect(deleteWhere).toHaveBeenCalled();
  });

  it("revalidates the trip path after removal", async () => {
    db.select
      .mockReturnValueOnce({ from: () => ({ where: async () => [docRow] }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [reservationRow] }) });

    await removeReservationDocument("doc-1");

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
  });

  it("checks editor access before attaching", async () => {
    const setSpy = vi.fn(() => ({ where: async () => undefined }));
    db.update.mockReturnValue({ set: setSpy });

    await attachTripDocToReservation("doc-1", "res-1");

    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
  });

  it("sets the reservationId on the document and revalidates the trip path", async () => {
    const setSpy = vi.fn(() => ({ where: async () => undefined }));
    db.update.mockReturnValue({ set: setSpy });

    await attachTripDocToReservation("doc-1", "res-1");

    expect(setSpy).toHaveBeenCalledWith({ reservationId: "res-1" });
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });
});
