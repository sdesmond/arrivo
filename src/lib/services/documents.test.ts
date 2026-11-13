// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordTripUpdated: vi.fn(),
  publishTripEvent: vi.fn(),
  revalidatePath: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
  requireTripRole: vi.fn(),
  lockTrip: vi.fn(),
  lockClientIds: vi.fn(),
  afterTripWrite: vi.fn(),
  selectRows: [] as Record<string, unknown>[],
  targetRows: [] as Record<string, unknown>[],
  transactionTargetRows: undefined as Record<string, unknown>[] | undefined,
  eventRows: undefined as Record<string, unknown>[] | undefined,
  reservationRows: undefined as Record<string, unknown>[] | undefined,
  transactionEventRows: undefined as Record<string, unknown>[] | undefined,
  transactionReservationRows: undefined as Record<string, unknown>[] | undefined,
  committedRows: [] as Record<string, unknown>[],
  inserted: [] as Record<string, unknown>[],
  queueFileDeletions: vi.fn(),
  removeQueuedFiles: vi.fn(),
  updated: [] as Record<string, unknown>[],
  deleteError: undefined as Error | undefined,
  insertError: undefined as Error | undefined,
}));
vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: (table: unknown) => ({
        where: async () =>
          table === documents
            ? mocks.committedRows
            : ((table === events ? mocks.eventRows : mocks.reservationRows) ?? mocks.targetRows),
      }),
    }),
  },
}));
vi.mock("@/lib/storage/storage-adapter", () => ({ getStorageAdapter: () => ({ put: mocks.put, del: mocks.del }) }));
vi.mock("./client-ids", () => ({ lockClientIds: mocks.lockClientIds }));
vi.mock("./trip-access", async (original) => ({
  ...(await original<typeof import("./trip-access")>()),
  requireTripRole: mocks.requireTripRole,
}));
// The transaction wrapper is exercised through the real database in the API E2E; here it just runs the steps.
vi.mock("./trip-write", () => ({
  lockTrip: mocks.lockTrip,
  runTripWrite: async (
    actor: unknown,
    tripId: string,
    _input: unknown,
    steps: (
      transaction: unknown,
      markChanged: () => void
    ) => { authorize: () => Promise<void>; mutate: () => Promise<unknown> }
  ) => {
    let changed = false;
    const transaction = {
      select: () => ({
        from: (table: unknown) => ({
          where: async () => {
            if (table === documents) return mocks.selectRows;
            const specific = table === events ? mocks.transactionEventRows : mocks.transactionReservationRows;
            const outside = table === events ? mocks.eventRows : mocks.reservationRows;
            return specific ?? mocks.transactionTargetRows ?? outside ?? mocks.targetRows;
          },
        }),
      }),
      update: () => ({
        set: (patch: Record<string, unknown>) => ({
          where: () => ({
            returning: async () => {
              mocks.updated.push(patch);
              return [{ ...mocks.selectRows[0], ...patch }];
            },
          }),
        }),
      }),
      delete: () => ({
        where: async () => {
          if (mocks.deleteError) throw mocks.deleteError;
        },
      }),
      insert: () => ({
        values: (values: Record<string, unknown>) => ({
          returning: async () => {
            if (mocks.insertError) throw mocks.insertError;
            mocks.inserted.push(values);
            return [{ id: "generated-id", eventId: null, reservationId: null, addedAt: null, ...values }];
          },
        }),
      }),
    };
    const run = steps(transaction, () => {
      changed = true;
    });
    await run.authorize();
    const value = await run.mutate();
    if (changed) mocks.afterTripWrite(actor, tripId);
    return value;
  },
}));

vi.mock("@/lib/file-cleanup", () => ({
  queueFileDeletions: mocks.queueFileDeletions,
  removeQueuedFiles: mocks.removeQueuedFiles,
}));
vi.mock("@/lib/trip-activity", () => ({ recordTripUpdated: mocks.recordTripUpdated }));
vi.mock("@/lib/trip-events", () => ({ publishTripEvent: mocks.publishTripEvent }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
import { afterTripWrite } from "./trip-write-effects";
import { LiveSyncEventType } from "@/data/types";
import {
  uploadTripDocument,
  uploadEventDocument,
  uploadReservationDocument,
  updateDocument,
  removeDocument,
} from "./documents";
import { documents, events } from "@/db/schema";
import { TripForbiddenError, TripNotFoundError } from "./trip-access";
import { ConflictError } from "./conflict-error";
import { UploadInvalidError, UploadTooLargeError } from "@/lib/upload-policy";

const actor = { userId: "user" };
const tripId = "223e4567-e89b-12d3-a456-426614174000";
const otherTripId = "423e4567-e89b-12d3-a456-426614174000";
const documentId = "123e4567-e89b-12d3-a456-426614174000";
const pdf = () => new File(["%PDF-1.4 content"], "pass.pdf", { type: "application/pdf" });
const stored = (overrides: Record<string, unknown> = {}) => ({
  id: documentId,
  tripId,
  eventId: null,
  reservationId: null,
  name: "pass.pdf",
  kind: "pdf",
  size: "0.0 KB",
  url: "/api/storage/earlier.pdf",
  previewLines: null,
  addedAt: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updated = [];
  mocks.deleteError = undefined;
  mocks.queueFileDeletions.mockResolvedValue([{ id: "queued", url: "/api/storage/earlier.pdf" }]);
  mocks.selectRows = [];
  mocks.targetRows = [{ tripId }];
  mocks.transactionTargetRows = undefined;
  mocks.eventRows = mocks.reservationRows = undefined;
  mocks.transactionEventRows = mocks.transactionReservationRows = undefined;
  mocks.committedRows = [];
  mocks.inserted = [];
  mocks.insertError = undefined;
  mocks.afterTripWrite.mockImplementation(afterTripWrite);
  mocks.requireTripRole.mockResolvedValue("editor");
  mocks.put.mockImplementation(async (key: string) => `/api/storage/${key}`);
  mocks.del.mockResolvedValue(undefined);
});

it("stores the file and a trip-scope document row, then runs the write effects once", async () => {
  const result = await uploadTripDocument(actor, tripId, {}, pdf());
  expect(mocks.put).toHaveBeenCalledWith(
    expect.stringMatching(new RegExp(`^trip-documents/${tripId}/.+\\.pdf$`)),
    expect.any(File)
  );
  expect(mocks.inserted).toEqual([
    expect.objectContaining({ tripId, name: "pass.pdf", kind: "pdf", url: expect.stringContaining("/api/storage/") }),
  ]);
  expect(mocks.inserted[0]).not.toHaveProperty("id");
  expect(result).toMatchObject({ name: "pass.pdf", kind: "pdf", scope: "trip" });
  expect(mocks.afterTripWrite).toHaveBeenCalledTimes(1);
  expect(mocks.del).not.toHaveBeenCalled();
});

it("keeps a client id, claiming it before the trip lock", async () => {
  const order: string[] = [];
  mocks.lockClientIds.mockImplementation(async () => void order.push("ids"));
  mocks.lockTrip.mockImplementation(async () => void order.push("trip"));
  await uploadTripDocument(actor, tripId, { id: documentId }, pdf());
  expect(mocks.lockClientIds).toHaveBeenCalledWith(expect.anything(), [`document:${documentId}`]);
  expect(order).toEqual(["ids", "trip"]);
  expect(mocks.inserted[0]).toMatchObject({ id: documentId });
});

it("returns the stored row for a same-id retry, removing the new file and running no effect", async () => {
  mocks.selectRows = [stored()];
  const result = await uploadTripDocument(actor, tripId, { id: documentId }, pdf());
  expect(result).toMatchObject({ id: documentId, url: "/api/storage/earlier.pdf" });
  expect(mocks.inserted).toEqual([]);
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  expect(mocks.del).toHaveBeenCalledTimes(1);
  expect(mocks.del).toHaveBeenCalledWith(mocks.put.mock.results[0] && (await mocks.put.mock.results[0].value));
});

it.each([
  ["another name", { name: "other.pdf" }],
  ["another size", { size: "1.0 MB" }],
  ["another kind", { kind: "image" }],
  ["an event scope", { eventId: "e1" }],
  ["a reservation scope", { reservationId: "r1" }],
])("rejects a reused id with %s as a conflict and removes the new file", async (_label, overrides) => {
  mocks.selectRows = [stored(overrides)];
  await expect(uploadTripDocument(actor, tripId, { id: documentId }, pdf())).rejects.toBeInstanceOf(ConflictError);
  expect(mocks.inserted).toEqual([]);
  expect(mocks.del).toHaveBeenCalledTimes(1);
});

it("conflicts on an id held by another trip the actor can see", async () => {
  mocks.selectRows = [stored({ tripId: otherTripId })];
  await expect(uploadTripDocument(actor, tripId, { id: documentId }, pdf())).rejects.toBeInstanceOf(ConflictError);
  expect(mocks.requireTripRole).toHaveBeenCalledWith(otherTripId, "user", "viewer", expect.anything());
});

it("never returns a row held by a trip the actor cannot see", async () => {
  mocks.selectRows = [stored({ tripId: otherTripId })];
  mocks.requireTripRole.mockImplementation(async (id: string) => {
    if (id === otherTripId) throw new TripNotFoundError();
    return "editor";
  });
  await expect(uploadTripDocument(actor, tripId, { id: documentId }, pdf())).rejects.toBeInstanceOf(TripNotFoundError);
  expect(mocks.del).toHaveBeenCalledTimes(1);
});

it("treats a same-id row with no trip as not found", async () => {
  mocks.selectRows = [stored({ tripId: null })];
  await expect(uploadTripDocument(actor, tripId, { id: documentId }, pdf())).rejects.toBeInstanceOf(TripNotFoundError);
});

it("refuses a viewer or stranger before storing anything", async () => {
  mocks.requireTripRole.mockRejectedValueOnce(new TripForbiddenError("editor"));
  await expect(uploadTripDocument(actor, tripId, {}, pdf())).rejects.toBeInstanceOf(TripForbiddenError);
  mocks.requireTripRole.mockRejectedValueOnce(new TripNotFoundError());
  await expect(uploadTripDocument(actor, tripId, {}, pdf())).rejects.toBeInstanceOf(TripNotFoundError);
  expect(mocks.put).not.toHaveBeenCalled();
});

it("refuses an oversize, wrongly typed or mismatched file before storing anything", async () => {
  const big = pdf();
  Object.defineProperty(big, "size", { value: 25 * 1024 * 1024 + 1 });
  await expect(uploadTripDocument(actor, tripId, {}, big)).rejects.toBeInstanceOf(UploadTooLargeError);
  await expect(
    uploadTripDocument(actor, tripId, {}, new File(["x"], "n.docx", { type: "application/msword" }))
  ).rejects.toBeInstanceOf(UploadInvalidError);
  await expect(
    uploadTripDocument(actor, tripId, {}, new File(["<html>"], "fake.pdf", { type: "application/pdf" }))
  ).rejects.toBeInstanceOf(UploadInvalidError);
  expect(mocks.put).not.toHaveBeenCalled();
});

it("writes no row when storage fails", async () => {
  mocks.put.mockRejectedValue(new Error("disk full"));
  await expect(uploadTripDocument(actor, tripId, {}, pdf())).rejects.toThrow("disk full");
  expect(mocks.inserted).toEqual([]);
  expect(mocks.del).not.toHaveBeenCalled();
});

it("removes the stored file when the insert fails", async () => {
  mocks.insertError = new Error("insert failed");
  await expect(uploadTripDocument(actor, tripId, {}, pdf())).rejects.toThrow("insert failed");
  expect(mocks.del).toHaveBeenCalledTimes(1);
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it("keeps the file when a step after the commit fails, since the row now points at it", async () => {
  mocks.afterTripWrite.mockImplementationOnce(() => {
    throw new Error("effect failed");
  });
  mocks.committedRows = [stored()];
  await expect(uploadTripDocument(actor, tripId, {}, pdf())).rejects.toThrow("effect failed");
  expect(mocks.del).not.toHaveBeenCalled();
});

it("keeps the original failure when removing the unused file also fails", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.insertError = new Error("insert failed");
  mocks.del.mockRejectedValue(new Error("gone"));
  await expect(uploadTripDocument(actor, tripId, {}, pdf())).rejects.toThrow("insert failed");
  expect(error).toHaveBeenCalled();
  error.mockRestore();
});

it("rejects a malformed trip id or body before anything else", async () => {
  await expect(uploadTripDocument(actor, "bad", {}, pdf())).rejects.toThrow();
  await expect(uploadTripDocument(actor, tripId, { id: "nope" }, pdf())).rejects.toThrow();
  expect(mocks.requireTripRole).not.toHaveBeenCalled();
});

const targetId = "623e4567-e89b-12d3-a456-426614174000";
it.each([uploadEventDocument, uploadReservationDocument])(
  "classifies valid PNG bytes by MIME despite a PDF filename",
  async (upload) => {
    const bytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==",
      "base64"
    );
    const result = await upload(actor, targetId, {}, new File([bytes], "scan.pdf", { type: "image/png" }));
    expect(mocks.inserted[0]).toMatchObject({ name: "scan.pdf", kind: "image" });
    expect(result).toMatchObject({ name: "scan.pdf", kind: "image" });
  }
);
it.each([
  ["event", uploadEventDocument, "eventId", "reservationId"],
  ["reservation", uploadReservationDocument, "reservationId", "eventId"],
] as const)("uploads and safely replays %s documents", async (scope, upload, targetColumn, siblingColumn) => {
  const result = await upload(actor, targetId, { id: documentId }, pdf());
  expect(result.scope).toBe(scope);
  expect(mocks.inserted[0]).toMatchObject({ tripId, [targetColumn]: targetId });
  expect(mocks.afterTripWrite).toHaveBeenCalledTimes(1);
  expect(mocks.recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user", tripId);
  expect(mocks.publishTripEvent).toHaveBeenCalledExactlyOnceWith(tripId, {
    type: LiveSyncEventType.ItineraryChanged,
    tripId,
  });
  expect(mocks.revalidatePath).toHaveBeenCalledExactlyOnceWith(`/trips/${tripId}`);
  mocks.selectRows = [stored({ [targetColumn]: targetId })];
  await expect(upload(actor, targetId, { id: documentId }, pdf())).resolves.toMatchObject({ id: documentId });
  expect(mocks.afterTripWrite).toHaveBeenCalledTimes(1);
  expect(mocks.del).toHaveBeenCalledTimes(1);
  for (const overrides of [
    { [targetColumn]: null },
    { [targetColumn]: otherTripId },
    { [targetColumn]: targetId, [siblingColumn]: targetId },
    { [targetColumn]: targetId, name: "other.pdf" },
    { [targetColumn]: targetId, kind: "image" },
    { [targetColumn]: targetId, size: "1.0 MB" },
  ]) {
    mocks.selectRows = [stored(overrides)];
    await expect(upload(actor, targetId, { id: documentId }, pdf())).rejects.toBeInstanceOf(ConflictError);
  }
});
it.each([uploadEventDocument, uploadReservationDocument])(
  "rechecks target existence and ownership after storage under lock",
  async (upload) => {
    for (const rows of [[], [{ tripId: otherTripId }]]) {
      mocks.transactionTargetRows = rows;
      await expect(upload(actor, targetId, {}, pdf())).rejects.toBeInstanceOf(TripNotFoundError);
    }
    expect(mocks.del).toHaveBeenCalledTimes(2);
    expect(mocks.inserted).toEqual([]);
  }
);
it.each([uploadEventDocument, uploadReservationDocument])(
  "rejects missing targets, invalid IDs and denied access before storage",
  async (upload) => {
    await expect(upload(actor, "linked-event", {}, pdf())).rejects.toThrow();
    mocks.targetRows = [];
    await expect(upload(actor, targetId, {}, pdf())).rejects.toBeInstanceOf(TripNotFoundError);
    mocks.targetRows = [{ tripId }];
    mocks.requireTripRole.mockRejectedValueOnce(new TripForbiddenError("editor"));
    await expect(upload(actor, targetId, {}, pdf())).rejects.toBeInstanceOf(TripForbiddenError);
    expect(mocks.put).not.toHaveBeenCalled();
  }
);

it.each([uploadEventDocument, uploadReservationDocument])(
  "applies policy and cleanup for scoped documents",
  async (upload) => {
    const big = pdf();
    Object.defineProperty(big, "size", { value: 25 * 1024 * 1024 + 1 });
    await expect(upload(actor, targetId, {}, big)).rejects.toBeInstanceOf(UploadTooLargeError);
    await expect(
      upload(actor, targetId, {}, new File(["bad"], "notes.doc", { type: "application/msword" }))
    ).rejects.toBeInstanceOf(UploadInvalidError);
    await expect(
      upload(actor, targetId, {}, new File(["bad"], "fake.pdf", { type: "application/pdf" }))
    ).rejects.toBeInstanceOf(UploadInvalidError);
    expect(mocks.put).not.toHaveBeenCalled();
    mocks.put.mockRejectedValueOnce(new Error("storage failed"));
    await expect(upload(actor, targetId, {}, pdf())).rejects.toThrow("storage failed");
    expect(mocks.inserted).toEqual([]);
    mocks.insertError = new Error("insert failed");
    await expect(upload(actor, targetId, {}, pdf())).rejects.toThrow("insert failed");
    expect(mocks.del).toHaveBeenCalledTimes(1);
    mocks.insertError = undefined;
    mocks.afterTripWrite.mockImplementationOnce(() => {
      throw new Error("effect failed");
    });
    mocks.committedRows = [stored()];
    await expect(upload(actor, targetId, {}, pdf())).rejects.toThrow("effect failed");
    expect(mocks.del).toHaveBeenCalledTimes(1);
  }
);
it.each([uploadEventDocument, uploadReservationDocument])(
  "hides inaccessible document IDs and rechecks role under lock",
  async (upload) => {
    mocks.selectRows = [stored({ tripId: otherTripId })];
    mocks.requireTripRole.mockImplementation(async (id: string) => {
      if (id === otherTripId) throw new TripNotFoundError();
      return "editor";
    });
    await expect(upload(actor, targetId, { id: documentId }, pdf())).rejects.toBeInstanceOf(TripNotFoundError);
    expect(mocks.del).toHaveBeenCalledTimes(1);
    mocks.selectRows = [];
    mocks.requireTripRole.mockResolvedValueOnce("editor").mockRejectedValueOnce(new TripForbiddenError("editor"));
    await expect(upload(actor, targetId, {}, pdf())).rejects.toBeInstanceOf(TripForbiddenError);
    expect(mocks.del).toHaveBeenCalledTimes(2);
    expect(mocks.inserted).toEqual([]);
  }
);

it.each([{}, { eventId: targetId, tripId: null }, { reservationId: targetId, tripId: null }])(
  "renames all scopes with legacy ancestry and publishes one effect",
  async (scope) => {
    mocks.committedRows = mocks.selectRows = [stored(scope)];
    await expect(updateDocument(actor, documentId, { name: "New" })).resolves.toMatchObject({ name: "New" });
    expect(mocks.updated).toEqual([
      { name: "New", tripId, eventId: scope.eventId ?? null, reservationId: scope.reservationId ?? null },
    ]);
    expect(mocks.requireTripRole).toHaveBeenCalledTimes(2);
    expect(mocks.publishTripEvent).toHaveBeenCalledTimes(1);
  }
);
it("leaves empty patches untouched and rejects invalid names in every scope", async () => {
  for (const scope of [{}, { eventId: targetId }, { reservationId: targetId }]) {
    mocks.committedRows = mocks.selectRows = [stored(scope)];
    await updateDocument(actor, documentId, {});
    await updateDocument(actor, documentId, { name: "pass.pdf" });
    for (const name of [" ", "x".repeat(201)])
      await expect(updateDocument(actor, documentId, { name })).rejects.toThrow();
  }
  expect(mocks.updated).toEqual([]);
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});
it("queues file removal before commit effects and removes files afterwards", async () => {
  mocks.selectRows = [stored({ reservationId: targetId, tripId: null })];
  await removeDocument(actor, documentId, { tripId });
  expect(mocks.queueFileDeletions).toHaveBeenCalledWith(expect.anything(), ["/api/storage/earlier.pdf"]);
  expect(mocks.removeQueuedFiles).toHaveBeenCalledTimes(1);
  expect(mocks.queueFileDeletions.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.afterTripWrite.mock.invocationCallOrder[0]
  );
  expect(mocks.afterTripWrite.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.removeQueuedFiles.mock.invocationCallOrder[0]
  );
});
it("keeps files when delete rolls back", async () => {
  mocks.selectRows = [stored()];
  mocks.deleteError = new Error("rollback");
  await expect(removeDocument(actor, documentId, { tripId })).rejects.toThrow("rollback");
  expect(mocks.removeQueuedFiles).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});
it("allows authorized repeat deletes and conceals foreign trips", async () => {
  await expect(removeDocument(actor, documentId, { tripId })).resolves.toBeNull();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  mocks.selectRows = [stored({ tripId: otherTripId })];
  await expect(removeDocument(actor, documentId, { tripId })).rejects.toBeInstanceOf(TripNotFoundError);
});
it.each([
  { name: "new" },
  { eventId: targetId },
  { reservationId: targetId },
  { eventId: null },
  { reservationId: null },
])("rechecks roles under lock and hides unknown documents", async (patch) => {
  await expect(updateDocument(actor, documentId, {})).rejects.toBeInstanceOf(TripNotFoundError);
  mocks.committedRows = mocks.selectRows = [stored({ eventId: targetId, reservationId: targetId })];
  mocks.requireTripRole.mockResolvedValueOnce("editor").mockRejectedValueOnce(new TripForbiddenError("editor"));
  await expect(updateDocument(actor, documentId, patch)).rejects.toBeInstanceOf(TripForbiddenError);
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  expect(mocks.updated).toEqual([]);
});

it.each([{}, { eventId: targetId, tripId: null }, { reservationId: targetId, tripId: null }])(
  "deletes every document scope through the trip write effects",
  async (scope) => {
    mocks.selectRows = [stored(scope)];
    await removeDocument(actor, documentId, { tripId });
    expect(mocks.requireTripRole).toHaveBeenNthCalledWith(1, tripId, "user", "editor");
    expect(mocks.requireTripRole).toHaveBeenNthCalledWith(2, tripId, "user", "editor", expect.anything());
    expect(mocks.recordTripUpdated).toHaveBeenCalledTimes(1);
    expect(mocks.publishTripEvent).toHaveBeenCalledTimes(1);
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(1);
  }
);
it("rejects changed document ancestry under lock before renaming", async () => {
  mocks.committedRows = [stored()];
  for (const current of [[], [stored({ tripId: otherTripId })]]) {
    mocks.selectRows = current;
    await expect(updateDocument(actor, documentId, { name: "New" })).rejects.toBeInstanceOf(TripNotFoundError);
  }
  expect(mocks.updated).toEqual([]);
});
it("conceals orphaned legacy rows without a resolvable trip", async () => {
  for (const scope of [{}, { eventId: targetId }, { reservationId: targetId }]) {
    mocks.committedRows = [stored({ tripId: null, ...scope })];
    mocks.targetRows = [];
    await expect(updateDocument(actor, documentId, { name: "New" })).rejects.toBeInstanceOf(TripNotFoundError);
  }
  expect(mocks.updated).toEqual([]);
});
it("reauthorizes delete under lock before queueing any file", async () => {
  mocks.selectRows = [stored()];
  mocks.requireTripRole.mockResolvedValueOnce("editor").mockRejectedValueOnce(new TripForbiddenError("editor"));
  await expect(removeDocument(actor, documentId, { tripId })).rejects.toBeInstanceOf(TripForbiddenError);
  expect(mocks.queueFileDeletions).not.toHaveBeenCalled();
  expect(mocks.removeQueuedFiles).not.toHaveBeenCalled();
});
it("removes a document without a file without queueing a URL", async () => {
  mocks.selectRows = [stored({ url: null })];
  await removeDocument(actor, documentId, { tripId });
  expect(mocks.queueFileDeletions).toHaveBeenCalledWith(expect.anything(), []);
});

it.each(["eventId", "reservationId"] as const)(
  "attaches atomically to %s and emits each trip effect once",
  async (field) => {
    mocks.committedRows = mocks.selectRows = [stored({ eventId: targetId, reservationId: targetId })];
    const result = await updateDocument(actor, documentId, { [field]: targetId, name: "Attached" });
    expect(result).toMatchObject({ name: "Attached", scope: field === "eventId" ? "event" : "reservation" });
    expect(mocks.updated).toEqual([
      {
        name: "Attached",
        tripId,
        eventId: field === "eventId" ? targetId : null,
        reservationId: field === "reservationId" ? targetId : null,
      },
    ]);
    expect(mocks.recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user", tripId);
    expect(mocks.revalidatePath).toHaveBeenCalledExactlyOnceWith("/trips/" + tripId);
    expect(mocks.publishTripEvent).toHaveBeenCalledExactlyOnceWith(tripId, {
      type: LiveSyncEventType.ItineraryChanged,
      tripId,
    });
  }
);
it.each([
  { field: "eventId", links: { eventId: targetId } },
  { field: "eventId", links: { reservationId: targetId } },
  { field: "eventId", links: { eventId: targetId, reservationId: targetId } },
  { field: "reservationId", links: { eventId: targetId } },
  { field: "reservationId", links: { reservationId: targetId } },
  { field: "reservationId", links: { eventId: targetId, reservationId: targetId } },
])("promotes legacy $links through $field and preserves ancestry", async ({ field, links }) => {
  mocks.committedRows = mocks.selectRows = [stored({ tripId: null, ...links })];
  await expect(updateDocument(actor, documentId, { [field]: null })).resolves.toMatchObject({ scope: "trip" });
  expect(mocks.updated).toEqual([{ name: "pass.pdf", tripId, eventId: null, reservationId: null }]);
  expect(mocks.recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user", tripId);
  expect(mocks.revalidatePath).toHaveBeenCalledExactlyOnceWith("/trips/" + tripId);
  expect(mocks.publishTripEvent).toHaveBeenCalledExactlyOnceWith(tripId, {
    type: LiveSyncEventType.ItineraryChanged,
    tripId,
  });
});
it.each(["eventId", "reservationId"] as const)(
  "returns normalized repeated %s attachments without effects",
  async (field) => {
    mocks.committedRows = mocks.selectRows = [stored({ [field]: targetId })];
    await updateDocument(actor, documentId, { [field]: targetId });
    expect(mocks.updated).toEqual([]);
    expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  }
);
it("preserves reservation precedence on effective legacy dual-link rename, while unchanged patches remain no-ops", async () => {
  mocks.committedRows = mocks.selectRows = [stored({ tripId: null, eventId: targetId, reservationId: targetId })];
  await updateDocument(actor, documentId, {});
  await updateDocument(actor, documentId, { name: "pass.pdf" });
  expect(mocks.updated).toEqual([]);
  await expect(updateDocument(actor, documentId, { name: "New" })).resolves.toMatchObject({ scope: "reservation" });
  expect(mocks.updated).toEqual([{ name: "New", tripId, eventId: null, reservationId: targetId }]);
});
it.each(["eventId", "reservationId"] as const)("rejects missing or foreign %s under lock", async (field) => {
  mocks.committedRows = mocks.selectRows = [stored()];
  for (const rows of [[], [{ tripId: otherTripId }]]) {
    mocks.transactionTargetRows = rows;
    await expect(updateDocument(actor, documentId, { [field]: targetId, name: "New" })).rejects.toBeInstanceOf(
      TripNotFoundError
    );
  }
  expect(mocks.updated).toEqual([]);
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});
it.each([new TripForbiddenError("editor"), new TripNotFoundError()])(
  "rejects unauthorized scope changes before write",
  async (error) => {
    mocks.committedRows = mocks.selectRows = [stored()];
    mocks.requireTripRole.mockRejectedValueOnce(error);
    await expect(updateDocument(actor, documentId, { eventId: targetId })).rejects.toBe(error);
    expect(mocks.updated).toEqual([]);
  }
);
it.each([{ eventId: targetId, reservationId: null }, { eventId: "linked-event" }, { reservationId: "bad" }])(
  "validates scope patches in service",
  async (body) => {
    await expect(updateDocument(actor, documentId, body)).rejects.toThrow();
    expect(mocks.requireTripRole).not.toHaveBeenCalled();
  }
);

it.each(["eventId", "reservationId"] as const)("rejects invalid name plus valid %s atomically", async (field) => {
  mocks.committedRows = mocks.selectRows = [stored()];
  await expect(updateDocument(actor, documentId, { name: " ", [field]: targetId })).rejects.toThrow();
  expect(mocks.updated).toEqual([]);
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});
it.each(["eventId", "reservationId"] as const)(
  "leaves repeated %s promotion of a trip document untouched",
  async (field) => {
    mocks.committedRows = mocks.selectRows = [stored()];
    await expect(updateDocument(actor, documentId, { [field]: null })).resolves.toMatchObject({
      id: documentId,
      scope: "trip",
    });
    await updateDocument(actor, documentId, { [field]: null });
    expect(mocks.updated).toEqual([]);
    expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  }
);
it("moves a normalized event document to reservation and clears old event column", async () => {
  mocks.committedRows = mocks.selectRows = [stored({ eventId: targetId })];
  await expect(updateDocument(actor, documentId, { reservationId: targetId })).resolves.toMatchObject({
    id: documentId,
    scope: "reservation",
  });
  expect(mocks.updated).toEqual([{ name: "pass.pdf", tripId, eventId: null, reservationId: targetId }]);
  expect(mocks.afterTripWrite).toHaveBeenCalledExactlyOnceWith(actor, tripId);
});

const inconsistent: [string, Record<string, unknown>, { events?: string; reservations?: string }][] = [
  ["a trip document claiming an event of another trip", { tripId, eventId: targetId }, { events: otherTripId }],
  [
    "a trip document claiming a reservation of another trip",
    { tripId, reservationId: targetId },
    { reservations: otherTripId },
  ],
  [
    "an event and a reservation in different trips",
    { tripId: null, eventId: targetId, reservationId: targetId },
    { reservations: otherTripId },
  ],
  [
    "an explicit trip that matches neither parent",
    { tripId: otherTripId, eventId: targetId, reservationId: targetId },
    {},
  ],
  ["a missing event", { tripId: null, eventId: targetId }, { events: "" }],
  ["a missing reservation", { tripId, reservationId: targetId }, { reservations: "" }],
];
function seedInconsistent(row: Record<string, unknown>, parents: { events?: string; reservations?: string }) {
  mocks.committedRows = mocks.selectRows = [stored(row)];
  const rowsFor = (parent: string | undefined) =>
    parent === undefined ? [{ tripId }] : parent ? [{ tripId: parent }] : [];
  mocks.eventRows = rowsFor(parents.events);
  mocks.reservationRows = rowsFor(parents.reservations);
}
describe.each(inconsistent)("inconsistent ancestry: %s", (_label, row, parents) => {
  it.each([
    ["renames", { name: "New" }],
    ["sends an empty patch", {}],
    ["repeats the stored name", { name: "pass.pdf" }],
    ["attaches to an event", { eventId: targetId }],
    ["attaches to a reservation", { reservationId: targetId }],
    ["promotes from an event", { eventId: null }],
    ["promotes from a reservation", { reservationId: null }],
  ])("conceals the document when the editor %s", async (_action, patch) => {
    seedInconsistent(row, parents);
    // The editor owns every trip involved, so only the ancestry check can refuse.
    await expect(updateDocument(actor, documentId, patch)).rejects.toBeInstanceOf(TripNotFoundError);
    expect(mocks.updated).toEqual([]);
    expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  });

  it.each([tripId, otherTripId])("conceals the document on delete through trip %s", async (bodyTripId) => {
    seedInconsistent(row, parents);
    await expect(removeDocument(actor, documentId, { tripId: bodyTripId })).rejects.toBeInstanceOf(TripNotFoundError);
    expect(mocks.queueFileDeletions).not.toHaveBeenCalled();
    expect(mocks.removeQueuedFiles).not.toHaveBeenCalled();
    expect(mocks.afterTripWrite).not.toHaveBeenCalled();
  });
});
it("rejects ancestry that turns inconsistent under the trip lock before writing", async () => {
  mocks.committedRows = mocks.selectRows = [stored({ tripId: null, eventId: targetId })];
  mocks.transactionEventRows = [{ tripId: otherTripId }];
  await expect(updateDocument(actor, documentId, { name: "New" })).rejects.toBeInstanceOf(TripNotFoundError);
  await expect(removeDocument(actor, documentId, { tripId })).rejects.toBeInstanceOf(TripNotFoundError);
  expect(mocks.updated).toEqual([]);
  expect(mocks.queueFileDeletions).not.toHaveBeenCalled();
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});
it("still renames, repeats and deletes a consistent dual legacy link through its one trip", async () => {
  mocks.committedRows = mocks.selectRows = [stored({ tripId: null, eventId: targetId, reservationId: targetId })];
  await expect(updateDocument(actor, documentId, { name: "New" })).resolves.toMatchObject({ name: "New" });
  await expect(removeDocument(actor, documentId, { tripId })).resolves.toBeNull();
  expect(mocks.queueFileDeletions).toHaveBeenCalledTimes(1);
});
