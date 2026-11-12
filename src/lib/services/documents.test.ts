// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

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
  committedRows: [] as Record<string, unknown>[],
  inserted: [] as Record<string, unknown>[],
  insertError: undefined as Error | undefined,
}));
vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: (table: unknown) => ({ where: async () => (table === documents ? mocks.committedRows : mocks.targetRows) }),
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
          where: async () =>
            table === documents ? mocks.selectRows : (mocks.transactionTargetRows ?? mocks.targetRows),
        }),
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

vi.mock("@/lib/trip-activity", () => ({ recordTripUpdated: mocks.recordTripUpdated }));
vi.mock("@/lib/trip-events", () => ({ publishTripEvent: mocks.publishTripEvent }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
import { afterTripWrite } from "./trip-write-effects";
import { LiveSyncEventType } from "@/data/types";
import { uploadTripDocument, uploadEventDocument, uploadReservationDocument } from "./documents";
import { documents } from "@/db/schema";
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
  mocks.selectRows = [];
  mocks.targetRows = [{ tripId }];
  mocks.transactionTargetRows = undefined;
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
