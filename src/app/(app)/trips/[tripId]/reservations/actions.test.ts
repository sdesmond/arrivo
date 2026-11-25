// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  assertTripAccess,
  db,
  daysTable,
  documentsTable,
  fileCleanup,
  recordTripUpdated,
  recordDeletion,
  requireTripRole,
  requireUser,
  resolveDocumentTripId,
  reservationsTable,
  revalidatePath,
  tripsTable,
} = vi.hoisted(() => ({
  assertTripAccess: vi.fn(),
  recordTripUpdated: vi.fn(),
  recordDeletion: vi.fn(),
  db: {
    execute: vi.fn(),
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  },
  daysTable: {
    id: "days.id",
    tripId: "days.tripId",
    dayNumber: "days.dayNumber",
    date: "days.date",
    label: "days.label",
  },
  documentsTable: { id: "documents.id", reservationId: "documents.reservationId", url: "documents.url" },
  fileCleanup: { queueFileDeletions: vi.fn(), removeQueuedFiles: vi.fn() },
  requireTripRole: vi.fn(),
  requireUser: vi.fn(),
  resolveDocumentTripId: vi.fn(),
  reservationsTable: { id: "reservations.id", tripId: "reservations.tripId" },
  revalidatePath: vi.fn(),
  tripsTable: { id: "trips.id", startDate: "trips.startDate", endDate: "trips.endDate" },
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
  days: daysTable,
  trips: tripsTable,
}));

vi.mock("next/cache", () => ({
  revalidatePath,
}));

vi.mock("@/lib/trip-activity", () => ({ recordTripUpdated }));
vi.mock("@/lib/services/deletion-records", () => ({ recordDeletion }));
vi.mock("@/lib/file-cleanup", () => fileCleanup);
vi.mock("@/lib/document-ancestry", () => ({ resolveDocumentTripId }));
vi.mock("@/lib/services/trip-access", async (original) => ({
  ...(await original<typeof import("@/lib/services/trip-access")>()),
  requireTripRole,
}));

const { adapterDel, getStorageAdapter } = vi.hoisted(() => ({
  adapterDel: vi.fn(),
  getStorageAdapter: vi.fn(),
}));
vi.mock("@/lib/storage/storage-adapter", () => ({ getStorageAdapter }));

import { deleteReservation } from "./actions";
import { notFound } from "next/navigation";
import { TripForbiddenError, TripNotFoundError } from "@/lib/services/trip-access";

describe("deleteReservation", () => {
  const reservationRow = { id: "res-1", tripId: "trip-1" };
  const attached = (id: string, url: string | null) => ({
    id,
    url,
    tripId: null,
    eventId: null,
    reservationId: "res-1",
  });
  let order: string[];
  let transaction: {
    execute: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let underLock: { reservation: unknown[]; documents: unknown[] };
  let deletedTables: unknown[];

  function selecting(rows: () => unknown[], label: string) {
    return {
      from: () => ({
        where: async () => {
          order.push(label);
          return rows();
        },
      }),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    order = [];
    deletedTables = [];
    underLock = { reservation: [reservationRow], documents: [] };
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockImplementation(async () => void order.push("preflight"));
    requireTripRole.mockReset();
    requireTripRole.mockImplementation(async () => void order.push("role"));
    vi.mocked(notFound).mockImplementation(() => {
      throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
    });
    resolveDocumentTripId.mockReset();
    resolveDocumentTripId.mockImplementation(async () => "trip-1");
    fileCleanup.queueFileDeletions.mockReset();
    fileCleanup.queueFileDeletions.mockImplementation(async (_transaction: unknown, urls: string[]) => {
      order.push("queue");
      return urls.map((url, index) => ({ id: `queued-${index}`, url }));
    });
    fileCleanup.removeQueuedFiles.mockReset();
    fileCleanup.removeQueuedFiles.mockImplementation(async () => void order.push("cleanup"));
    recordTripUpdated.mockImplementation(() => void order.push("activity"));
    revalidatePath.mockImplementation(() => void order.push("revalidate"));
    getStorageAdapter.mockReturnValue({ put: vi.fn(), del: adapterDel });
    db.select.mockReset();
    db.select.mockReturnValue(selecting(() => [reservationRow], "preflight-read"));
    transaction = {
      execute: vi.fn(async () => {
        order.push("lock");
        return [{ id: "trip-1" }];
      }),
      select: vi.fn(() => ({
        from: (table: unknown) => ({
          where: async () => {
            const isReservation = table === reservationsTable;
            order.push(isReservation ? "read-reservation" : "read-documents");
            return isReservation ? underLock.reservation : underLock.documents;
          },
        }),
      })),
      delete: vi.fn((table: unknown) => ({
        where: async () => {
          order.push(table === reservationsTable ? "delete-reservation" : "delete-other");
          deletedTables.push(table);
        },
      })),
    };
    db.transaction.mockReset();
    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) => {
      await callback(transaction);
      order.push("commit");
    });
  });

  it("resolves silently when the reservation does not exist (idempotent)", async () => {
    db.select.mockReturnValue(selecting(() => [], "preflight-read"));

    await expect(deleteReservation("missing")).resolves.toBeUndefined();

    expect(assertTripAccess).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
    expect(recordTripUpdated).not.toHaveBeenCalled();
  });

  it("checks editor access on the reservation's trip before opening the transaction", async () => {
    await deleteReservation("res-1");

    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
    expect(order.indexOf("preflight")).toBeLessThan(order.indexOf("lock"));
  });

  it("locks the trip, rechecks the role, then reads, queues and deletes before any effect or cleanup", async () => {
    underLock.documents = [attached("doc-1", "/api/storage/reservation-documents/res-1/a.pdf")];

    await deleteReservation("res-1");

    expect(order).toEqual([
      "preflight-read",
      "preflight",
      "lock",
      "role",
      "read-reservation",
      "read-documents",
      "queue",
      "delete-reservation",
      "commit",
      "activity",
      "revalidate",
      "cleanup",
    ]);
    expect(requireTripRole).toHaveBeenCalledExactlyOnceWith("trip-1", "user-1", "editor", transaction);
    expect(recordDeletion).toHaveBeenCalledExactlyOnceWith(transaction, "reservation", "res-1", "user-1");
    expect(fileCleanup.queueFileDeletions).toHaveBeenCalledWith(transaction, [
      "/api/storage/reservation-documents/res-1/a.pdf",
    ]);
    expect(fileCleanup.removeQueuedFiles).toHaveBeenCalledWith([
      { id: "queued-0", url: "/api/storage/reservation-documents/res-1/a.pdf" },
    ]);
    expect(recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user-1", "trip-1");
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/trips/trip-1");
  });

  it("queues each attached file by name only and never deletes storage inside the action", async () => {
    underLock.documents = [
      attached("doc-1", "/api/storage/a.pdf"),
      attached("doc-2", null),
      attached("doc-3", "/api/storage/b.pdf"),
    ];

    await deleteReservation("res-1");

    expect(fileCleanup.queueFileDeletions).toHaveBeenCalledWith(transaction, [
      "/api/storage/a.pdf",
      "/api/storage/b.pdf",
    ]);
    expect(adapterDel).not.toHaveBeenCalled();
    expect(deletedTables).toEqual([reservationsTable]);
  });

  it("queues nothing when the document was promoted first, so its file survives the cascade", async () => {
    // A promotion that committed earlier cleared reservation_id, so the locked read no longer returns the row.
    underLock.documents = [];

    await deleteReservation("res-1");

    expect(fileCleanup.queueFileDeletions).toHaveBeenCalledWith(transaction, []);
    expect(fileCleanup.removeQueuedFiles).toHaveBeenCalledWith([]);
    expect(adapterDel).not.toHaveBeenCalled();
    expect(deletedTables).toEqual([reservationsTable]);
  });

  it("is a silent no-op with no effects when a concurrent deletion already removed the reservation", async () => {
    underLock.reservation = [];

    await expect(deleteReservation("res-1")).resolves.toBeUndefined();

    expect(order).not.toContain("read-documents");
    expect(fileCleanup.queueFileDeletions).not.toHaveBeenCalled();
    expect(transaction.delete).not.toHaveBeenCalled();
    expect(fileCleanup.removeQueuedFiles).not.toHaveBeenCalled();
    expect(recordTripUpdated).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("is a silent no-op when the trip itself is gone before the lock", async () => {
    transaction.execute.mockResolvedValue([]);

    await expect(deleteReservation("res-1")).resolves.toBeUndefined();

    expect(requireTripRole).not.toHaveBeenCalled();
    expect(transaction.delete).not.toHaveBeenCalled();
    expect(recordTripUpdated).not.toHaveBeenCalled();
  });

  it("propagates other lock failures", async () => {
    transaction.execute.mockRejectedValue(new Error("lock timeout"));

    await expect(deleteReservation("res-1")).rejects.toThrow("lock timeout");
    expect(transaction.delete).not.toHaveBeenCalled();
  });

  it("conceals a reservation that moved to another trip under the lock", async () => {
    underLock.reservation = [{ id: "res-1", tripId: "trip-2" }];

    await expect(deleteReservation("res-1")).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");

    expect(fileCleanup.queueFileDeletions).not.toHaveBeenCalled();
    expect(transaction.delete).not.toHaveBeenCalled();
    expect(fileCleanup.removeQueuedFiles).not.toHaveBeenCalled();
    expect(recordTripUpdated).not.toHaveBeenCalled();
  });

  it.each([new TripForbiddenError("editor"), new TripNotFoundError()])(
    "conceals the reservation when the role is lost under the lock (%s)",
    async (error) => {
      requireTripRole.mockRejectedValue(error);

      await expect(deleteReservation("res-1")).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");

      expect(order).not.toContain("read-reservation");
      expect(fileCleanup.queueFileDeletions).not.toHaveBeenCalled();
      expect(transaction.delete).not.toHaveBeenCalled();
      expect(recordTripUpdated).not.toHaveBeenCalled();
    }
  );

  it("does not swallow unexpected role-check failures", async () => {
    requireTripRole.mockRejectedValue(new Error("database down"));

    await expect(deleteReservation("res-1")).rejects.toThrow("database down");
    expect(notFound).not.toHaveBeenCalled();
  });

  it("does not catch the framework notFound raised by the preflight access check", async () => {
    assertTripAccess.mockImplementation(async () => notFound());

    await expect(deleteReservation("res-1")).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["is unresolved", undefined],
    ["belongs to another trip", "trip-2"],
  ])("conceals the reservation when an attached document's ancestry %s", async (_label, resolved) => {
    underLock.documents = [attached("doc-1", "/api/storage/a.pdf"), attached("doc-2", "/api/storage/b.pdf")];
    resolveDocumentTripId.mockResolvedValueOnce("trip-1").mockResolvedValueOnce(resolved);

    await expect(deleteReservation("res-1")).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");

    expect(resolveDocumentTripId).toHaveBeenCalledWith(transaction, expect.objectContaining({ id: "doc-2" }));
    expect(fileCleanup.queueFileDeletions).not.toHaveBeenCalled();
    expect(transaction.delete).not.toHaveBeenCalled();
    expect(fileCleanup.removeQueuedFiles).not.toHaveBeenCalled();
    expect(recordTripUpdated).not.toHaveBeenCalled();
  });

  it("keeps every row and file, with no effects or cleanup, when the delete rolls back", async () => {
    underLock.documents = [attached("doc-1", "/api/storage/a.pdf")];
    transaction.delete.mockImplementation(() => ({
      where: async () => {
        throw new Error("rollback");
      },
    }));

    await expect(deleteReservation("res-1")).rejects.toThrow("rollback");

    expect(order).not.toContain("commit");
    expect(fileCleanup.removeQueuedFiles).not.toHaveBeenCalled();
    expect(adapterDel).not.toHaveBeenCalled();
    expect(recordTripUpdated).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("deletes nothing when queueing the file names fails", async () => {
    underLock.documents = [attached("doc-1", "/api/storage/a.pdf")];
    fileCleanup.queueFileDeletions.mockRejectedValue(new Error("queue failed"));

    await expect(deleteReservation("res-1")).rejects.toThrow("queue failed");

    expect(transaction.delete).not.toHaveBeenCalled();
    expect(fileCleanup.removeQueuedFiles).not.toHaveBeenCalled();
    expect(recordTripUpdated).not.toHaveBeenCalled();
  });

  it("still succeeds when storage cleanup fails after the commit, leaving the queued names for a retry", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    underLock.documents = [attached("doc-1", "/api/storage/a.pdf")];
    fileCleanup.removeQueuedFiles.mockRejectedValue(new Error("storage down"));

    await expect(deleteReservation("res-1")).resolves.toBeUndefined();

    expect(order).toContain("commit");
    expect(recordTripUpdated).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("a retry after the commit finds nothing and runs no second effect", async () => {
    await deleteReservation("res-1");
    underLock.reservation = [];
    db.select.mockReturnValue(selecting(() => [], "preflight-read"));

    await expect(deleteReservation("res-1")).resolves.toBeUndefined();

    expect(recordTripUpdated).toHaveBeenCalledTimes(1);
    expect(fileCleanup.removeQueuedFiles).toHaveBeenCalledTimes(1);
  });
});
