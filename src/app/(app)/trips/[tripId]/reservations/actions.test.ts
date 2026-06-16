// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { assertTripAccess, db, requireUser, revalidatePath } = vi.hoisted(() => ({
  assertTripAccess: vi.fn(),
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  requireUser: vi.fn(),
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
  reservations: {},
  documents: {},
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
  createReservation,
  updateReservation,
  deleteReservation,
  uploadReservationDocument,
  removeReservationDocument,
} from "./actions";
import { ReservationType } from "@/data/types";

describe("createReservation", () => {
  let insertedValues: unknown;

  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockResolvedValue(undefined);
    insertedValues = undefined;
    db.insert.mockReturnValue({
      values: async (values: unknown) => {
        insertedValues = values;
      },
    });
  });

  it.each([ReservationType.Lodging, ReservationType.RentalCar, ReservationType.Cruise])(
    "requires an end date for %s reservations",
    async (type) => {
      await expect(
        createReservation("trip-1", {
          type,
          provider: "Acme",
          startAt: "2026-08-01T10:00:00.000Z",
        })
      ).rejects.toThrow("An end date and time is required for this reservation type.");

      expect(db.insert).not.toHaveBeenCalled();
    }
  );

  it.each([
    ReservationType.Flight,
    ReservationType.Train,
    ReservationType.Bus,
    ReservationType.Ferry,
    ReservationType.Other,
  ])("allows %s reservations without an end date", async (type) => {
    await createReservation("trip-1", {
      type,
      provider: "Acme",
      startAt: "2026-08-01T10:00:00.000Z",
    });

    expect(db.insert).toHaveBeenCalled();
    expect(insertedValues).toMatchObject({
      tripId: "trip-1",
      type,
      provider: "Acme",
      endAt: undefined,
    });
  });

  it("checks editor access before inserting", async () => {
    await createReservation("trip-1", {
      type: ReservationType.Flight,
      provider: "Acme Air",
      startAt: "2026-08-01T10:00:00.000Z",
    });

    expect(requireUser).toHaveBeenCalled();
    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
  });

  it("inserts a reservation with all provided fields and converts dates", async () => {
    await createReservation("trip-1", {
      type: ReservationType.Lodging,
      provider: "Grand Hotel",
      startAt: "2026-08-01T15:00:00.000Z",
      endAt: "2026-08-05T11:00:00.000Z",
      confirmationCode: "ABC123",
      notes: "Late checkout requested",
    });

    expect(insertedValues).toEqual({
      tripId: "trip-1",
      type: ReservationType.Lodging,
      provider: "Grand Hotel",
      startAt: new Date("2026-08-01T15:00:00.000Z"),
      endAt: new Date("2026-08-05T11:00:00.000Z"),
      confirmationCode: "ABC123",
      notes: "Late checkout requested",
    });
  });

  it("revalidates the trip path after a successful insert", async () => {
    await createReservation("trip-1", {
      type: ReservationType.Flight,
      provider: "Acme Air",
      startAt: "2026-08-01T10:00:00.000Z",
    });

    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("omits startAt and endAt when not provided", async () => {
    await createReservation("trip-1", {
      type: ReservationType.Other,
      provider: "Misc",
    });

    expect(insertedValues).toMatchObject({
      startAt: undefined,
      endAt: undefined,
    });
  });

  it("rejects an unknown reservation type", async () => {
    await expect(
      createReservation("trip-1", {
        type: "teleport" as ReservationType,
        provider: "Acme",
      })
    ).rejects.toThrow("Invalid reservation type.");

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects a blank provider", async () => {
    await expect(
      createReservation("trip-1", {
        type: ReservationType.Other,
        provider: "   ",
      })
    ).rejects.toThrow("Provider is required.");

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("trims the provider before inserting", async () => {
    await createReservation("trip-1", {
      type: ReservationType.Other,
      provider: "  Misc  ",
    });

    expect(insertedValues).toMatchObject({ provider: "Misc" });
  });
});

describe("updateReservation", () => {
  let updatedValues: Record<string, unknown> | undefined;

  function mockExistingReservation(row: Record<string, unknown> | undefined): void {
    db.select.mockReturnValue({
      from: () => ({
        where: async () => (row ? [row] : []),
      }),
    });
  }

  const baseRow = {
    id: "res-1",
    tripId: "trip-1",
    type: ReservationType.Flight,
    provider: "Acme Air",
    startAt: new Date("2026-08-01T10:00:00.000Z"),
    endAt: null,
    confirmationCode: null,
    notes: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockResolvedValue(undefined);
    updatedValues = undefined;
    mockExistingReservation(baseRow);
    db.update.mockReturnValue({
      set: (values: Record<string, unknown>) => {
        updatedValues = values;
        return { where: async () => undefined };
      },
    });
  });

  it("throws when the reservation does not exist", async () => {
    mockExistingReservation(undefined);

    await expect(updateReservation("missing", { provider: "New Name" })).rejects.toThrow("Reservation not found.");

    expect(assertTripAccess).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("checks editor access on the reservation's trip before updating", async () => {
    await updateReservation("res-1", { provider: "New Name" });

    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
  });

  it("updates the provider independently and trims it", async () => {
    await updateReservation("res-1", { provider: "  New Name  " });

    expect(updatedValues).toMatchObject({ provider: "New Name" });
    expect(updatedValues).not.toHaveProperty("startAt");
    expect(updatedValues).not.toHaveProperty("endAt");
  });

  it("rejects an empty provider", async () => {
    await expect(updateReservation("res-1", { provider: "   " })).rejects.toThrow("Provider is required.");

    expect(db.update).not.toHaveBeenCalled();
  });

  it("updates startAt independently, converting to a Date", async () => {
    await updateReservation("res-1", { startAt: "2026-09-01T12:00:00.000Z" });

    expect(updatedValues).toMatchObject({ startAt: new Date("2026-09-01T12:00:00.000Z") });
    expect(updatedValues).not.toHaveProperty("provider");
  });

  it("updates endAt independently, converting to a Date", async () => {
    await updateReservation("res-1", { endAt: "2026-09-02T12:00:00.000Z" });

    expect(updatedValues).toMatchObject({ endAt: new Date("2026-09-02T12:00:00.000Z") });
  });

  it("rejects an unparseable startAt before any update", async () => {
    await expect(updateReservation("res-1", { startAt: "not-a-date" })).rejects.toThrow("Invalid start date and time.");

    expect(db.update).not.toHaveBeenCalled();
  });

  it("rejects an unparseable endAt before any update", async () => {
    await expect(updateReservation("res-1", { endAt: "garbage" })).rejects.toThrow("Invalid end date and time.");

    expect(db.update).not.toHaveBeenCalled();
  });

  it("updates confirmationCode independently", async () => {
    await updateReservation("res-1", { confirmationCode: "XYZ987" });

    expect(updatedValues).toMatchObject({ confirmationCode: "XYZ987" });
  });

  it("updates notes independently", async () => {
    await updateReservation("res-1", { notes: "Window seat please" });

    expect(updatedValues).toMatchObject({ notes: "Window seat please" });
  });

  it("clears confirmationCode and notes when set to an empty string", async () => {
    mockExistingReservation({ ...baseRow, confirmationCode: "ABC123", notes: "Old notes" });

    await updateReservation("res-1", { confirmationCode: "", notes: "" });

    expect(updatedValues).toMatchObject({ confirmationCode: null, notes: null });
  });

  it.each([ReservationType.Lodging, ReservationType.RentalCar, ReservationType.Cruise])(
    "rejects clearing endAt for %s reservations",
    async (type) => {
      mockExistingReservation({
        ...baseRow,
        type,
        startAt: new Date("2026-08-01T10:00:00.000Z"),
        endAt: new Date("2026-08-05T11:00:00.000Z"),
      });

      await expect(updateReservation("res-1", { endAt: "" })).rejects.toThrow(
        "An end date and time is required for this reservation type."
      );

      expect(db.update).not.toHaveBeenCalled();
    }
  );

  it("rejects setting endAt when the resulting startAt is unset", async () => {
    mockExistingReservation({ ...baseRow, startAt: null, endAt: null });

    await expect(updateReservation("res-1", { endAt: "2026-09-02T12:00:00.000Z" })).rejects.toThrow(
      "A start date and time is required when an end date and time is set."
    );

    expect(db.update).not.toHaveBeenCalled();
  });

  it("rejects clearing startAt when the resulting endAt is still set", async () => {
    mockExistingReservation({
      ...baseRow,
      startAt: new Date("2026-08-01T10:00:00.000Z"),
      endAt: new Date("2026-08-05T11:00:00.000Z"),
      type: ReservationType.Other,
    });

    await expect(updateReservation("res-1", { startAt: "" })).rejects.toThrow(
      "A start date and time is required when an end date and time is set."
    );

    expect(db.update).not.toHaveBeenCalled();
  });

  it("rejects an endAt before the resulting startAt", async () => {
    await expect(
      updateReservation("res-1", { startAt: "2026-09-05T10:00:00.000Z", endAt: "2026-09-01T10:00:00.000Z" })
    ).rejects.toThrow("The end date and time must be after the start date and time.");

    expect(db.update).not.toHaveBeenCalled();
  });

  it("validates endAt against the existing startAt when only endAt is patched", async () => {
    mockExistingReservation({ ...baseRow, startAt: new Date("2026-09-05T10:00:00.000Z"), endAt: null });

    await expect(updateReservation("res-1", { endAt: "2026-09-01T10:00:00.000Z" })).rejects.toThrow(
      "The end date and time must be after the start date and time."
    );

    expect(db.update).not.toHaveBeenCalled();
  });

  it("allows a successful patch that omits fields, changing only the provided keys", async () => {
    await updateReservation("res-1", { notes: "Updated notes" });

    expect(updatedValues).toEqual({ updatedAt: expect.any(Date), notes: "Updated notes" });
  });

  it("revalidates the trip path after a successful update", async () => {
    await updateReservation("res-1", { provider: "New Name" });

    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });
});

describe("deleteReservation", () => {
  const baseRow = {
    id: "res-1",
    tripId: "trip-1",
    type: ReservationType.Flight,
    provider: "Acme Air",
    startAt: new Date("2026-08-01T10:00:00.000Z"),
    endAt: null,
    confirmationCode: null,
    notes: null,
  };

  function mockExistingReservation(row: Record<string, unknown> | undefined): void {
    db.select.mockReturnValue({
      from: () => ({
        where: async () => (row ? [row] : []),
      }),
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockResolvedValue(undefined);
    mockExistingReservation(baseRow);
    db.delete.mockReturnValue({
      where: async () => undefined,
    });
  });

  it("resolves silently when the reservation does not exist (idempotent)", async () => {
    mockExistingReservation(undefined);

    await expect(deleteReservation("missing")).resolves.toBeUndefined();

    expect(assertTripAccess).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
  });

  it("checks editor access on the reservation's trip before deleting", async () => {
    await deleteReservation("res-1");

    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
  });

  it("deletes the reservation row with a where filter on the reservation id", async () => {
    const whereStub = vi.fn().mockResolvedValue(undefined);
    db.delete.mockReturnValue({ where: whereStub });

    await deleteReservation("res-1");

    expect(db.delete).toHaveBeenCalled();
    expect(whereStub).toHaveBeenCalledWith(expect.anything());
  });

  it("revalidates the trip path after a successful delete", async () => {
    await deleteReservation("res-1");

    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });
});

describe("deleteReservation — blob cleanup", () => {
  const baseRow = {
    id: "res-1",
    tripId: "trip-1",
    type: ReservationType.Flight,
    provider: "Acme Air",
    startAt: new Date("2026-08-01T10:00:00.000Z"),
    endAt: null,
    confirmationCode: null,
    notes: null,
  };

  const docRow = { id: "doc-1", url: "https://blob.example.com/doc.pdf", reservationId: "res-1" };

  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockResolvedValue(undefined);
    del.mockResolvedValue(undefined);
    db.delete.mockReturnValue({ where: async () => undefined });
  });

  it("calls del() on each attached document blob URL before deleting the reservation row", async () => {
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    db.delete.mockReturnValue({ where: deleteWhere });

    db.select
      .mockReturnValueOnce({ from: () => ({ where: async () => [baseRow] }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [docRow] }) });

    await deleteReservation("res-1");

    expect(del).toHaveBeenCalledWith(["https://blob.example.com/doc.pdf"]);
    expect(deleteWhere).toHaveBeenCalled();
  });

  it("skips del() when UPLOAD_STUB is 'true'", async () => {
    process.env.UPLOAD_STUB = "true";
    db.select
      .mockReturnValueOnce({ from: () => ({ where: async () => [baseRow] }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [docRow] }) });

    await deleteReservation("res-1");

    expect(del).not.toHaveBeenCalled();
    delete process.env.UPLOAD_STUB;
  });

  it("skips del() when there are no attached documents", async () => {
    db.select
      .mockReturnValueOnce({ from: () => ({ where: async () => [baseRow] }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [] }) });

    await deleteReservation("res-1");

    expect(del).not.toHaveBeenCalled();
  });
});

describe("uploadReservationDocument", () => {
  const reservationRow = { id: "res-1", tripId: "trip-1" };

  function makeFile(name: string, size: number): File {
    const file = new File(["x"], name, { type: "application/pdf" });
    Object.defineProperty(file, "size", { value: size, configurable: true });
    return file;
  }

  beforeEach(() => {
    vi.clearAllMocks();
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
    let insertedValues: unknown;
    db.insert.mockReturnValue({
      values: async (vals: unknown) => {
        insertedValues = vals;
      },
    });

    const form = new FormData();
    form.append("file", makeFile("doc.pdf", 100));

    await uploadReservationDocument("res-1", form);

    expect(put).toHaveBeenCalled();
    expect(insertedValues).toMatchObject({ reservationId: "res-1", name: "doc.pdf" });
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

  it("revalidates the trip path after removal", async () => {
    db.select
      .mockReturnValueOnce({ from: () => ({ where: async () => [docRow] }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [reservationRow] }) });

    await removeReservationDocument("doc-1");

    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });
});
