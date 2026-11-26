import { beforeEach, expect, it, vi } from "vitest";
import {
  checklistItems,
  collaborators,
  days,
  documents,
  events,
  expenses,
  itineraryChecklists,
  itineraryNotes,
  notes,
  packingItems,
  reservations,
  tripPackingLists,
  trips,
} from "@/db/schema";
const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  lock: vi.fn(),
  run: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  recalculate: vi.fn(),
  markChanged: vi.fn(),
  applyDateChange: vi.fn(),
  queueDeletions: vi.fn(),
  removeFiles: vi.fn(),
  discardFile: vi.fn(),
  detail: vi.fn(),
  transaction: vi.fn(),
  dbUpdate: vi.fn(),
  idempotent: vi.fn(),
  lockIds: vi.fn(),
  createInTransaction: vi.fn(),
  generateCover: vi.fn(),
  recordCreated: vi.fn(),
  revalidate: vi.fn(),
  listForUser: vi.fn(),
  now: vi.fn(),
  remove: vi.fn(),
  publishTrip: vi.fn(),
  publishUser: vi.fn(),
  purge: vi.fn(),
  after: vi.fn(),
  recordDeletions: vi.fn(),
  refuseRecentlyDeleted: vi.fn(),
}));
vi.mock("@/db", () => ({ db: { transaction: mocks.transaction, update: mocks.dbUpdate } }));
vi.mock("@/lib/api/idempotency", () => ({ withIdempotency: mocks.idempotent }));
vi.mock("@/lib/request-deadline", () => ({
  guardTransactionDeadline: (_transaction: unknown, work: () => Promise<unknown>) => work(),
}));
vi.mock("./client-ids", () => ({ lockClientIds: mocks.lockIds }));
vi.mock("@/lib/membership-writes", () => ({ createTripInTransaction: mocks.createInTransaction }));
vi.mock("./trip-cover-generation", () => ({ generateTripCover: mocks.generateCover }));
vi.mock("@/lib/trip-activity", () => ({ recordTripCreated: mocks.recordCreated }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/mock-date", () => ({ getNow: mocks.now }));
vi.mock("./trip-access", async (original) => ({
  ...(await original<typeof import("./trip-access")>()),
  requireTripRole: mocks.requireRole,
}));
vi.mock("./trip-write", () => ({ lockTrip: mocks.lock, runTripWrite: mocks.run }));
vi.mock("./trip-date-change", () => ({ applyTripDateChange: mocks.applyDateChange }));
vi.mock("@/lib/file-cleanup", () => ({
  queueFileDeletions: mocks.queueDeletions,
  removeQueuedFiles: mocks.removeFiles,
  discardStoredFile: mocks.discardFile,
}));
vi.mock("@/lib/queries", () => ({ getTripDetail: mocks.detail, listTripsForUser: mocks.listForUser }));
vi.mock("@/lib/trip-events", () => ({
  publishTripEvent: mocks.publishTrip,
  publishUserEvent: mocks.publishUser,
  purgeTripTopic: mocks.purge,
}));
vi.mock("@/lib/currency", () => ({ recalculateAll: mocks.recalculate }));
vi.mock("./deletion-records", () => ({
  recordDeletions: mocks.recordDeletions,
  refuseRecentlyDeleted: mocks.refuseRecentlyDeleted,
}));
import { ConfirmationRequiredError } from "./confirmation-required-error";
import { ConflictError } from "./conflict-error";
import { ValidationFailedError } from "./validation-failed-error";
import { TripForbiddenError, TripNotFoundError } from "./trip-access";
import { createTrip, deleteTrip, getTrip, listTrips, updateTrip } from "./trips";
const tripId = "123e4567-e89b-12d3-a456-426614174000";
const otherTripId = "223e4567-e89b-12d3-a456-426614174000";
const actor = { userId: "user" };
const row = {
  id: tripId,
  name: "Old",
  startDate: null,
  endDate: null,
  tags: [],
  transitMode: null,
  budgetTotal: null,
  budgetCurrency: "USD",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.select.mockReturnValue({ from: (table: unknown) => ({ where: async () => (table === trips ? [row] : []) }) });
  mocks.update.mockReturnValue({ set: mocks.set });
  mocks.set.mockReturnValue({ where: () => ({ returning: async () => [{ ...row, name: "New" }] }) });
  mocks.run.mockImplementation(async (_actor, _tripId, _options, steps) => {
    const work = steps({ select: mocks.select, update: mocks.update }, mocks.markChanged);
    await work.authorize();
    return work.mutate();
  });
  mocks.recalculate.mockResolvedValue([]);
  mocks.applyDateChange.mockResolvedValue({ startDate: "2026-08-01", endDate: "2026-08-01", documentUrls: [] });
  mocks.queueDeletions.mockResolvedValue([]);
});
it("locks and rechecks editor access, preserving omitted metadata", async () => {
  await updateTrip(actor, tripId, { name: "New", budgetTotal: 0 });
  expect(mocks.requireRole).toHaveBeenCalledTimes(2);
  expect(mocks.lock).toHaveBeenCalled();
  expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ name: "New", budgetTotal: "0" }));
  expect(mocks.update).toHaveBeenCalledWith(trips);
  expect(mocks.markChanged).toHaveBeenCalledOnce();
  expect(mocks.run).toHaveBeenCalledWith(
    actor,
    tripId,
    expect.objectContaining({ revalidate: ["/trips"] }),
    expect.any(Function)
  );
});
it("recalculates within the write transaction and aborts on failure", async () => {
  mocks.recalculate.mockRejectedValueOnce(new Error("conversion failed"));
  await expect(updateTrip(actor, tripId, { budgetCurrency: "eur", convertCurrency: true })).rejects.toThrow(
    "conversion failed"
  );
  expect(mocks.update).not.toHaveBeenCalledWith(trips);
  expect(mocks.recalculate).toHaveBeenCalledWith([], "EUR");
  expect(mocks.select).toHaveBeenCalled();
  expect(expenses).toBeDefined();
});
it("rejects access before starting the write and rechecks inside the lock", async () => {
  mocks.requireRole.mockRejectedValueOnce(new Error("denied"));
  await expect(updateTrip(actor, tripId, { name: "New" })).rejects.toThrow("denied");
  expect(mocks.run).not.toHaveBeenCalled();
  mocks.requireRole.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("revoked"));
  await expect(updateTrip(actor, tripId, { name: "New" })).rejects.toThrow("revoked");
  expect(mocks.update).not.toHaveBeenCalled();
});
it("returns unchanged data for an empty patch", async () => {
  await expect(updateTrip(actor, tripId, {})).resolves.toMatchObject({ id: tripId, name: "Old" });
  expect(mocks.update).not.toHaveBeenCalled();
});
it("converts expenses and persists their rates before the trip update", async () => {
  mocks.recalculate.mockResolvedValue([{ expenseId: "expense", convertedAmount: 12, rate: 1.2 }]);
  mocks.set.mockReturnValue({ where: () => ({ returning: async () => [{ ...row, budgetCurrency: "EUR" }] }) });
  await updateTrip(actor, tripId, { budgetCurrency: "EUR", convertCurrency: true });
  expect(mocks.update).toHaveBeenCalledWith(expenses);
  expect(mocks.set).toHaveBeenCalledWith(
    expect.objectContaining({ convertedAmountTrip: "12", conversionRateTrip: "1.2", convertedCurrencyTrip: "EUR" })
  );
});
it("rejects missing rows before or after updating", async () => {
  mocks.select.mockReturnValueOnce({ from: () => ({ where: async () => [] }) });
  await expect(updateTrip(actor, tripId, { name: "New" })).rejects.toThrow();
  mocks.set.mockReturnValueOnce({ where: () => ({ returning: async () => [] }) });
  await expect(updateTrip(actor, tripId, { name: "New" })).rejects.toThrow();
});

it("ignores a conversion flag without a currency or metadata", async () => {
  await updateTrip(actor, tripId, { convertCurrency: true });
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.markChanged).not.toHaveBeenCalled();
});
it("resets native-currency expenses while converting other expenses", async () => {
  const native = {
    id: "native",
    tripId,
    category: "Food",
    amount: "35.00",
    currency: "EUR",
    date: "2025-01-01",
    convertedAmountTrip: "40.00",
    conversionRateTrip: "1.14",
    convertedCurrencyTrip: "USD",
  };
  const foreign = { ...native, id: "foreign", currency: "USD", amount: "100.00" };
  mocks.select.mockReturnValue({
    from: (table: unknown) => ({ where: async () => (table === trips ? [row] : [native, foreign]) }),
  });
  mocks.recalculate.mockResolvedValue([{ expenseId: "foreign", convertedAmount: 92, rate: 0.92 }]);
  await updateTrip(actor, tripId, { budgetCurrency: "EUR", convertCurrency: true });
  expect(mocks.set).toHaveBeenCalledWith(
    expect.objectContaining({ convertedAmountTrip: "35.00", conversionRateTrip: "1", convertedCurrencyTrip: "EUR" })
  );
  expect(mocks.set).toHaveBeenCalledWith(
    expect.objectContaining({ convertedAmountTrip: "92", conversionRateTrip: "0.92", convertedCurrencyTrip: "EUR" })
  );
});
it("changes currency without touching expenses when conversion is not requested", async () => {
  mocks.set.mockReturnValue({ where: () => ({ returning: async () => [{ ...row, budgetCurrency: "EUR" }] }) });
  await updateTrip(actor, tripId, { budgetCurrency: "EUR" });
  expect(mocks.recalculate).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalledWith(expenses);
  expect(mocks.update).toHaveBeenCalledWith(trips);
});

const confirmation = {
  removedDates: ["2026-08-02"],
  events: [],
  noteCount: 1,
  checklistCount: 0,
  eventDocumentCount: 0,
};
it("writes the new dates with metadata in one update after moving the days", async () => {
  mocks.set.mockReturnValue({ where: () => ({ returning: async () => [{ ...row, startDate: "2026-08-01" }] }) });
  await updateTrip(actor, tripId, { name: "New", startDate: "2026-08-01", endDate: "2026-08-01" });
  expect(mocks.applyDateChange).toHaveBeenCalledWith(
    expect.anything(),
    tripId,
    row,
    { startDate: "2026-08-01", endDate: "2026-08-01", resolution: undefined, confirmation: undefined },
    "user"
  );
  expect(mocks.set).toHaveBeenCalledWith(
    expect.objectContaining({ name: "New", startDate: "2026-08-01", endDate: "2026-08-01" })
  );
  expect(mocks.markChanged).toHaveBeenCalledOnce();
});
it.each([{ startDate: null }, { startDate: null, endDate: null }])(
  "skips an unchanged effective range: %j",
  async (dates) => {
    await updateTrip(actor, tripId, dates);
    expect(mocks.applyDateChange).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.markChanged).not.toHaveBeenCalled();
  }
);
it.each([{ startDate: "2026-08-01", endDate: "2026-08-03" }, { startDate: "2026-08-01" }, { endDate: "2026-08-03" }])(
  "skips an unchanged dated range: %j",
  async (dates) => {
    mocks.now.mockReturnValue(new Date("2026-01-01T12:00:00Z"));
    mocks.select.mockReturnValue({
      from: () => ({ where: async () => [{ ...row, startDate: "2026-08-01", endDate: "2026-08-03" }] }),
    });
    await updateTrip(actor, tripId, dates);
    expect(mocks.applyDateChange).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.markChanged).not.toHaveBeenCalled();
  }
);
it("applies metadata while skipping an unchanged effective date range", async () => {
  await updateTrip(actor, tripId, { startDate: null, name: "New" });
  expect(mocks.applyDateChange).not.toHaveBeenCalled();
  expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ name: "New" }));
});
it("writes cleared dates even when no metadata is sent", async () => {
  mocks.select.mockReturnValue({
    from: () => ({ where: async () => [{ ...row, startDate: "2026-08-01", endDate: "2026-08-01" }] }),
  });
  mocks.applyDateChange.mockResolvedValue({ startDate: null, endDate: null, documentUrls: [] });
  await updateTrip(actor, tripId, { startDate: null });
  expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ startDate: null, endDate: null }));
  expect(mocks.markChanged).toHaveBeenCalledOnce();
});
it("rejects a confirmation against an unchanged range", async () => {
  await expect(
    updateTrip(actor, tripId, { startDate: null, resolution: "delete-events", confirmation })
  ).rejects.toBeInstanceOf(ConflictError);
  expect(mocks.update).not.toHaveBeenCalled();
});
it("rejects a stale confirmation when clearing dates", async () => {
  mocks.select.mockReturnValue({
    from: () => ({ where: async () => [{ ...row, startDate: "2026-08-01", endDate: "2026-08-01" }] }),
  });
  await expect(
    updateTrip(actor, tripId, { startDate: null, resolution: "delete-events", confirmation })
  ).rejects.toBeInstanceOf(ConflictError);
  expect(mocks.applyDateChange).not.toHaveBeenCalled();
});
it("rejects a confirmation without a resolution", async () => {
  await expect(updateTrip(actor, tripId, { startDate: "2026-08-01", confirmation })).rejects.toBeInstanceOf(
    ValidationFailedError
  );
  expect(mocks.run).not.toHaveBeenCalled();
});
it("passes the resolution and confirmation through and queues removed documents before the files go", async () => {
  const queued = [{ id: "queue-1", url: "/api/storage/doc.pdf" }];
  mocks.applyDateChange.mockResolvedValue({
    startDate: "2026-08-01",
    endDate: "2026-08-01",
    documentUrls: ["/api/storage/doc.pdf"],
  });
  mocks.queueDeletions.mockResolvedValue(queued);
  await updateTrip(actor, tripId, {
    startDate: "2026-08-01",
    endDate: "2026-08-01",
    resolution: "delete-events",
    confirmation,
  });
  expect(mocks.applyDateChange).toHaveBeenCalledWith(
    expect.anything(),
    tripId,
    row,
    expect.objectContaining({ resolution: "delete-events", confirmation }),
    "user"
  );
  expect(mocks.queueDeletions).toHaveBeenCalledWith(expect.anything(), ["/api/storage/doc.pdf"]);
  // Storage deletes run after the response, so a committed PATCH never waits on them (as deleteTrip does).
  expect(mocks.after).toHaveBeenCalledOnce();
  expect(mocks.removeFiles).not.toHaveBeenCalled();
  await mocks.after.mock.calls[0][0]();
  expect(mocks.removeFiles).toHaveBeenCalledWith(queued);
});
it("keeps a committed date change successful when file cleanup cannot be scheduled", async () => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.applyDateChange.mockResolvedValue({ startDate: "2026-08-01", endDate: "2026-08-01", documentUrls: ["/f"] });
  mocks.queueDeletions.mockResolvedValue([{ id: "queue-1", url: "/f" }]);
  mocks.after.mockImplementationOnce(() => {
    throw new Error("outside a request");
  });
  await expect(
    updateTrip(actor, tripId, {
      startDate: "2026-08-01",
      endDate: "2026-08-01",
      resolution: "delete-events",
      confirmation,
    })
  ).resolves.toMatchObject({ id: tripId });
  expect(mocks.removeFiles).not.toHaveBeenCalled();
  expect(warning).toHaveBeenCalled();
  warning.mockRestore();
});
it("writes and removes nothing when the preview asks for confirmation", async () => {
  mocks.applyDateChange.mockRejectedValue(new ConfirmationRequiredError("Confirm.", confirmation));
  await expect(
    updateTrip(actor, tripId, { name: "New", startDate: "2026-08-01", endDate: "2026-08-01" })
  ).rejects.toMatchObject({ confirmation });
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.queueDeletions).not.toHaveBeenCalled();
  expect(mocks.removeFiles).not.toHaveBeenCalled();
  expect(mocks.markChanged).not.toHaveBeenCalled();
});
it("rejects a stale confirmation without writing or removing files", async () => {
  mocks.applyDateChange.mockRejectedValue(new ConflictError("Trip dates changed."));
  await expect(
    updateTrip(actor, tripId, {
      startDate: "2026-08-01",
      endDate: "2026-08-01",
      resolution: "keep-as-unscheduled",
      confirmation,
    })
  ).rejects.toBeInstanceOf(ConflictError);
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.removeFiles).not.toHaveBeenCalled();
});
it("rejects a resolution without its confirmation before starting the write", async () => {
  await expect(
    updateTrip(actor, tripId, { startDate: "2026-08-01", endDate: "2026-08-01", resolution: "delete-events" })
  ).rejects.toBeInstanceOf(ValidationFailedError);
  expect(mocks.run).not.toHaveBeenCalled();
});
it("aborts the date change when the atomic currency conversion fails", async () => {
  mocks.recalculate.mockRejectedValueOnce(new Error("conversion failed"));
  await expect(
    updateTrip(actor, tripId, {
      budgetCurrency: "EUR",
      convertCurrency: true,
      startDate: "2026-08-01",
      endDate: "2026-08-01",
    })
  ).rejects.toThrow("conversion failed");
  expect(mocks.update).not.toHaveBeenCalledWith(trips);
  expect(mocks.removeFiles).not.toHaveBeenCalled();
});
it("does not run the date change for a metadata-only edit", async () => {
  await updateTrip(actor, tripId, { name: "New" });
  expect(mocks.applyDateChange).not.toHaveBeenCalled();
  expect(mocks.after).not.toHaveBeenCalled();
  expect(mocks.removeFiles).not.toHaveBeenCalled();
});

const snapshotTransaction = { snapshot: true };
function readSnapshotInTransaction() {
  mocks.transaction.mockImplementation(async (work: (transaction: unknown) => Promise<unknown>) =>
    work(snapshotTransaction)
  );
}
it("returns the trip snapshot for a viewer after checking the role", async () => {
  readSnapshotInTransaction();
  const payload = { trip: { id: tripId }, accessRole: "viewer" };
  mocks.detail.mockResolvedValue(payload);
  await expect(getTrip(actor, tripId.toUpperCase())).resolves.toBe(payload);
  expect(mocks.requireRole).toHaveBeenCalledWith(tripId, "user", "viewer");
  expect(mocks.detail).toHaveBeenCalledWith(tripId, "user", snapshotTransaction);
});
it("reads the whole snapshot in one read-only repeatable-read transaction, so its ETag covers one state", async () => {
  readSnapshotInTransaction();
  mocks.detail.mockResolvedValue({ trip: { id: tripId } });
  await getTrip(actor, tripId);
  expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
    isolationLevel: "repeatable read",
    accessMode: "read only",
  });
});
it("does not read the snapshot when access is denied", async () => {
  mocks.requireRole.mockRejectedValueOnce(new TripNotFoundError());
  await expect(getTrip(actor, tripId)).rejects.toBeInstanceOf(TripNotFoundError);
  expect(mocks.detail).not.toHaveBeenCalled();
});
it("answers not found when the trip vanished after the access check", async () => {
  readSnapshotInTransaction();
  mocks.detail.mockResolvedValue(null);
  await expect(getTrip(actor, tripId)).rejects.toBeInstanceOf(TripNotFoundError);
});
it("answers 404 when access is lost between the role check and the read", async () => {
  readSnapshotInTransaction();
  mocks.detail.mockRejectedValue(
    Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" })
  );
  await expect(getTrip(actor, tripId)).rejects.toBeInstanceOf(TripNotFoundError);
});
it("rethrows other snapshot read failures", async () => {
  readSnapshotInTransaction();
  mocks.detail.mockRejectedValue(new Error("db down"));
  await expect(getTrip(actor, tripId)).rejects.toThrow("db down");
});

const newId = "223e4567-e89b-12d3-a456-426614174111";
const created = { ownerId: "user", ownerUsername: "traveler" };
let selectResults: unknown[][];

function stubCreate(): void {
  mocks.now.mockReturnValue(new Date("2026-05-13T12:00:00.000Z"));
  const transaction = {
    select: () => ({ from: () => ({ where: async () => selectResults.shift() ?? [] }) }),
  };
  mocks.transaction.mockImplementation(async (work: (tx: unknown) => unknown) => work(transaction));
  mocks.idempotent.mockImplementation(
    async (
      _transaction: unknown,
      _input: unknown,
      steps: { authorize: () => Promise<void>; mutate: () => Promise<unknown> }
    ) => {
      await steps.authorize();
      return { value: await steps.mutate(), replayed: false };
    }
  );
  mocks.createInTransaction.mockImplementation(
    async (_transaction: unknown, _owner: string, prepare: (owner: unknown) => unknown) => {
      const prepared = (await prepare({
        id: "user",
        username: "traveler",
        name: null,
        currency: "USD",
        transitMode: null,
      })) as { buildDayRows: (id: string) => unknown };
      prepared.buildDayRows(newId);
      return { tripId: newId, ...created };
    }
  );
  mocks.generateCover.mockResolvedValue(null);
  mocks.dbUpdate.mockReturnValue({ set: mocks.set });
  mocks.set.mockReturnValue({ where: () => ({ returning: async () => [{ id: newId }] }) });
}

const storedRow = { ...row, id: newId, name: "Paris", tags: [], budgetTotal: null, budgetCurrency: "USD" };

function preparedValues(): { tripValues: Record<string, unknown>; days: unknown } {
  const prepare = mocks.createInTransaction.mock.calls[0][2] as (owner: unknown) => {
    tripValues: Record<string, unknown>;
    buildDayRows: (id: string) => unknown;
  };
  const prepared = prepare({ id: "user", username: "traveler", name: "Traveler", currency: null, transitMode: "walk" });
  return { tripValues: prepared.tripValues, days: prepared.buildDayRows(newId) };
}

it("creates the trip under the client id, then records, covers and revalidates after commit", async () => {
  stubCreate();
  selectResults = [[], [], [storedRow]];
  mocks.generateCover.mockResolvedValue({ coverImageUrl: "https://images.example/a.jpg", coverPhotographer: "Ann" });
  const result = await createTrip(
    actor,
    { id: newId.toUpperCase(), name: "Paris", destinationName: "Paris", destinationCenter: [2.35, 48.85] },
    undefined,
    { acceptLanguage: "en-GB" }
  );
  expect(result).toMatchObject({ id: newId, name: "Paris" });
  expect(mocks.lockIds).toHaveBeenCalledWith(expect.anything(), [`trip:${newId}`]);
  expect(mocks.requireRole).not.toHaveBeenCalled();
  const { tripValues, days } = preparedValues();
  expect(tripValues).toMatchObject({
    id: newId,
    name: "Paris",
    destinationName: "Paris",
    budgetCurrency: "GBP",
    transitMode: "walk",
    tags: [],
  });
  expect(days).toEqual({ tripId: newId, dayNumber: 1, date: null, label: "Day 1" });
  expect(mocks.recordCreated).toHaveBeenCalledWith({ id: "user", username: "traveler" }, newId);
  expect(mocks.generateCover).toHaveBeenCalledWith({
    userId: "user",
    tripId: newId,
    name: "Paris",
    destinationName: "Paris",
    destinationCenter: [2.35, 48.85],
  });
  expect(mocks.dbUpdate).toHaveBeenCalledWith(trips);
  expect(mocks.set).toHaveBeenCalledWith({ coverImageUrl: "https://images.example/a.jpg", coverPhotographer: "Ann" });
  expect(mocks.revalidate).toHaveBeenCalledWith("/trips");
});

it("refuses a recently deleted trip id before creating anything", async () => {
  stubCreate();
  selectResults = [[], []];
  mocks.refuseRecentlyDeleted.mockRejectedValueOnce(new ConflictError("This trip was deleted."));
  await expect(createTrip(actor, { id: newId, name: "Paris" })).rejects.toBeInstanceOf(ConflictError);
  expect(mocks.refuseRecentlyDeleted).toHaveBeenCalledWith(expect.anything(), "trip", newId);
  expect(mocks.createInTransaction).not.toHaveBeenCalled();
  expect(mocks.recordCreated).not.toHaveBeenCalled();
});

it("builds one day per date and writes budgets as strings", async () => {
  stubCreate();
  selectResults = [[], [], [storedRow]];
  await createTrip(actor, { id: newId, name: "Paris", startDate: "2026-08-01", endDate: "2026-08-03", budgetTotal: 0 });
  const { tripValues, days } = preparedValues();
  expect(tripValues.budgetTotal).toBe("0");
  expect(days).toHaveLength(3);
});

it("keeps a failed cover save from failing the create", async () => {
  stubCreate();
  selectResults = [[], [], [storedRow]];
  mocks.generateCover.mockResolvedValue({ coverImageUrl: "https://images.example/a.jpg" });
  mocks.set.mockReturnValue({
    where: () => ({
      returning: async () => {
        throw new Error("write failed");
      },
    }),
  });
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(createTrip(actor, { id: newId, name: "Paris" })).resolves.toMatchObject({ id: newId });
  expect(error).toHaveBeenCalledWith("Cover image save failed:", expect.any(Error));
  expect(mocks.revalidate).toHaveBeenCalledWith("/trips");
  // A photo URL is not a file this app stored, so there is nothing to remove.
  expect(mocks.discardFile).not.toHaveBeenCalled();
  error.mockRestore();
});

it("removes the stored map tile when the cover save fails", async () => {
  stubCreate();
  selectResults = [[], [], [storedRow]];
  const tile = `/api/storage/trip-covers/${newId}/11111111-1111-4111-8111-111111111111.jpg`;
  mocks.generateCover.mockResolvedValue({ coverImageUrl: tile });
  mocks.set.mockReturnValue({
    where: () => ({
      returning: async () => {
        throw new Error("write failed");
      },
    }),
  });
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(createTrip(actor, { id: newId, name: "Paris" })).resolves.toMatchObject({ id: newId });
  expect(mocks.discardFile).toHaveBeenCalledExactlyOnceWith(tile);
  error.mockRestore();
});

it("keeps a cover chosen while generation ran and removes the unused tile", async () => {
  stubCreate();
  selectResults = [[], [], [storedRow]];
  const tile = `/api/storage/trip-covers/${newId}/11111111-1111-4111-8111-111111111111.jpg`;
  mocks.generateCover.mockResolvedValue({ coverImageUrl: tile });
  mocks.set.mockReturnValue({ where: () => ({ returning: async () => [] }) });
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(createTrip(actor, { id: newId, name: "Paris" })).resolves.toMatchObject({ id: newId });
  expect(mocks.discardFile).toHaveBeenCalledExactlyOnceWith(tile);
  expect(error).not.toHaveBeenCalled();
  error.mockRestore();
});

it("leaves a chosen cover alone when a generated photo is not applied", async () => {
  stubCreate();
  selectResults = [[], [], [storedRow]];
  mocks.generateCover.mockResolvedValue({ coverImageUrl: "https://images.example/a.jpg" });
  mocks.set.mockReturnValue({ where: () => ({ returning: async () => [] }) });
  await createTrip(actor, { id: newId, name: "Paris" });
  expect(mocks.discardFile).not.toHaveBeenCalled();
});

it("skips the cover save when none is generated", async () => {
  stubCreate();
  selectResults = [[], [], [storedRow]];
  await createTrip(actor, { id: newId, name: "Paris" });
  expect(mocks.dbUpdate).not.toHaveBeenCalled();
});

it("returns the stored response of a replay without effects", async () => {
  stubCreate();
  selectResults = [[]];
  mocks.idempotent.mockResolvedValueOnce({ value: { id: newId, name: "Paris" }, replayed: true });
  await expect(
    createTrip(actor, { id: newId, name: "Paris" }, { key: "k", method: "POST", path: "/p" })
  ).resolves.toEqual({ id: newId, name: "Paris" });
  expect(mocks.recordCreated).not.toHaveBeenCalled();
  expect(mocks.generateCover).not.toHaveBeenCalled();
  expect(mocks.revalidate).not.toHaveBeenCalled();
});

it("returns the current row for the same id and content with no write and no cover work", async () => {
  stubCreate();
  selectResults = [[{ id: newId }], [storedRow]];
  await expect(createTrip(actor, { id: newId, name: "Paris" })).resolves.toMatchObject({ id: newId, name: "Paris" });
  expect(mocks.requireRole).toHaveBeenCalledWith(newId, "user", "viewer", expect.anything());
  expect(mocks.createInTransaction).not.toHaveBeenCalled();
  expect(mocks.generateCover).not.toHaveBeenCalled();
  expect(mocks.recordCreated).not.toHaveBeenCalled();
  expect(mocks.revalidate).not.toHaveBeenCalled();
});

it("counts currency and transit mode as content only when the request names them", async () => {
  stubCreate();
  const full = {
    ...storedRow,
    startDate: "2026-08-01",
    endDate: "2026-08-02",
    destinationName: "Paris",
    destinationCountry: "France",
    destinationCountryCode: "FR",
    notes: "Notes",
    budgetTotal: "1500.00",
    tags: ["a"],
    transitMode: "walk",
    budgetCurrency: "EUR",
  };
  const body = {
    id: newId,
    name: "Paris",
    startDate: "2026-08-01",
    endDate: "2026-08-02",
    destinationName: "Paris",
    destinationCountry: "France",
    destinationCountryCode: "FR",
    notes: "Notes",
    budgetTotal: 1500,
    tags: ["a"],
  };
  selectResults = [[{ id: newId }], [full]];
  await expect(createTrip(actor, body)).resolves.toMatchObject({ id: newId });
  selectResults = [[{ id: newId }], [full]];
  await expect(createTrip(actor, { ...body, budgetCurrency: "eur", transitMode: "walk" })).resolves.toMatchObject({
    id: newId,
  });
  selectResults = [[{ id: newId }], [full]];
  await expect(createTrip(actor, { ...body, budgetCurrency: "usd" })).rejects.toBeInstanceOf(ConflictError);
  selectResults = [[{ id: newId }], [full]];
  await expect(createTrip(actor, { ...body, transitMode: "drive" })).rejects.toBeInstanceOf(ConflictError);
});

it.each([
  ["name", { name: "Other" }],
  ["start date", { startDate: "2026-08-02" }],
  ["end date", { endDate: "2026-08-09" }],
  ["destination", { destinationName: "Rome" }],
  ["country", { destinationCountry: "Italy" }],
  ["country code", { destinationCountryCode: "IT" }],
  ["notes", { notes: "Other" }],
  ["budget", { budgetTotal: 5 }],
  ["tags", { tags: ["x"] }],
])("rejects reusing an id with a different %s as a conflict, writing nothing", async (_label, change) => {
  stubCreate();
  selectResults = [[{ id: newId }], [storedRow]];
  await expect(createTrip(actor, { id: newId, name: "Paris", ...change })).rejects.toBeInstanceOf(ConflictError);
  expect(mocks.createInTransaction).not.toHaveBeenCalled();
  expect(mocks.generateCover).not.toHaveBeenCalled();
});

it("answers an id owned by a trip the caller cannot see as not found", async () => {
  stubCreate();
  selectResults = [[{ id: newId }]];
  mocks.requireRole.mockRejectedValueOnce(new TripNotFoundError());
  await expect(createTrip(actor, { id: newId, name: "Paris" })).rejects.toBeInstanceOf(TripNotFoundError);
  expect(mocks.createInTransaction).not.toHaveBeenCalled();
});

it.each([
  ["over 45 days", { startDate: "2026-01-01", endDate: "2026-03-01" }],
  ["end before start", { startDate: "2026-02-01", endDate: "2026-01-01" }],
])("rejects a range that is %s before opening a transaction", async (_label, range) => {
  stubCreate();
  await expect(createTrip(actor, { id: newId, name: "Paris", ...range })).rejects.toBeInstanceOf(ValidationFailedError);
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it("accepts an end date with no start date as a dateless trip", async () => {
  stubCreate();
  selectResults = [[], [], [storedRow]];
  await expect(createTrip(actor, { id: newId, name: "Paris", endDate: "2026-02-01" })).resolves.toBeDefined();
  expect(preparedValues().days).toMatchObject({ date: null });
});

it("rejects an unsupported account currency inside the transaction", async () => {
  stubCreate();
  selectResults = [[], []];
  mocks.createInTransaction.mockImplementationOnce(
    async (_transaction: unknown, _owner: string, prepare: (owner: unknown) => unknown) => {
      await prepare({ id: "user", username: "traveler", name: null, currency: "ZZZ", transitMode: null });
      return { tripId: newId, ...created };
    }
  );
  await expect(createTrip(actor, { id: newId, name: "Paris" })).rejects.toBeInstanceOf(ValidationFailedError);
  expect(mocks.recordCreated).not.toHaveBeenCalled();
});

it("falls back to drive for an unknown stored transit mode and to the username for the seat name", async () => {
  stubCreate();
  selectResults = [[], [], [storedRow]];
  let collaboratorName = "";
  mocks.createInTransaction.mockImplementationOnce(
    async (_transaction: unknown, _owner: string, prepare: (owner: unknown) => unknown) => {
      const prepared = (await prepare({
        id: "user",
        username: "traveler",
        name: null,
        currency: "USD",
        transitMode: "bicycle",
      })) as { tripValues: { transitMode: string }; collaboratorName: string };
      collaboratorName = prepared.collaboratorName;
      expect(prepared.tripValues.transitMode).toBe("drive");
      return { tripId: newId, ...created };
    }
  );
  await createTrip(actor, { id: newId, name: "Paris" });
  expect(collaboratorName).toBe("traveler");
});

it("rejects unknown fields and a cover URL before any write", async () => {
  stubCreate();
  await expect(
    createTrip(actor, { id: newId, name: "Paris", coverImageUrl: "https://x.example/a.jpg" })
  ).rejects.toThrow();
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it("lists the caller's trips with status computed from the server clock", async () => {
  const now = new Date("2026-05-13T12:00:00.000Z");
  const entries = [{ trip: { id: "owned" }, todayEvents: [], summaryEvents: [] }];
  mocks.now.mockReturnValue(now);
  mocks.listForUser.mockResolvedValue(entries);
  await expect(listTrips(actor, {})).resolves.toEqual({ trips: entries });
  expect(mocks.listForUser).toHaveBeenCalledWith("user", now);
  await expect(listTrips(actor)).resolves.toEqual({ trips: entries });
  await expect(listTrips(actor, { status: "past" })).rejects.toThrow();
});

function lockableRows(rows: unknown[]) {
  return Object.assign(Promise.resolve(rows), { for: async () => rows });
}

it("deletes under a lock, queues files, then publishes and cleans up after commit", async () => {
  stubCreate();
  const identities = new Map<unknown, string>([
    [days, "day"],
    [events, "event"],
    [reservations, "reservation"],
    [expenses, "expense"],
    [itineraryNotes, "itinerary-note"],
    [itineraryChecklists, "checklist"],
    [checklistItems, "checklist-item"],
    [notes, "trip-note"],
    [tripPackingLists, "packing-list"],
    [packingItems, "packing-item"],
  ]);
  const transaction = {
    select: () => ({
      from: (table: unknown) => ({
        where: () =>
          lockableRows(
            table === documents
              ? [
                  { id: "document", url: "/file" },
                  { id: "no-file", url: null },
                ]
              : table === collaborators
                ? [{ userId: "user" }, { userId: "other" }, { userId: null }]
                : identities.has(table)
                  ? [{ id: identities.get(table) }]
                  : []
          ),
      }),
    }),
    delete: mocks.remove,
  };
  mocks.remove.mockReturnValue({ where: async () => undefined });
  mocks.transaction.mockImplementation(async (work) => {
    const result = await work(transaction);
    expect(mocks.publishTrip).not.toHaveBeenCalled();
    expect(mocks.removeFiles).not.toHaveBeenCalled();
    return result;
  });
  mocks.queueDeletions.mockResolvedValue([{ id: "queued", url: "/file" }]);
  await expect(deleteTrip(actor, tripId, {})).resolves.toBeNull();
  expect(mocks.lock).toHaveBeenCalledWith(transaction, tripId);
  expect(mocks.requireRole).toHaveBeenCalledWith(tripId, "user", "manager", transaction);
  expect(mocks.queueDeletions).toHaveBeenCalledWith(transaction, expect.arrayContaining(["/file"]));
  expect(mocks.remove).toHaveBeenCalledWith(trips);
  // A late create retry with this client id must conflict instead of recreating the trip.
  expect(mocks.recordDeletions).toHaveBeenCalledWith(transaction, "trip", [tripId], "user");
  for (const resource of identities.values()) {
    expect(mocks.recordDeletions).toHaveBeenCalledWith(transaction, resource, [resource], "user");
  }
  expect(mocks.recordDeletions).toHaveBeenCalledWith(transaction, "document", ["document", "no-file"], "user");
  expect(mocks.publishTrip).toHaveBeenCalledOnce();
  expect(mocks.publishUser).toHaveBeenCalledExactlyOnceWith("other", { type: "trip-deleted", tripId });
  expect(mocks.purge).toHaveBeenCalledOnce();
  expect(mocks.publishTrip.mock.invocationCallOrder[0]).toBeLessThan(mocks.purge.mock.invocationCallOrder[0]);
  expect(mocks.after).toHaveBeenCalledOnce();
  expect(mocks.removeFiles).not.toHaveBeenCalled();
  await mocks.after.mock.calls[0][0]();
  expect(mocks.removeFiles).toHaveBeenCalledWith([{ id: "queued", url: "/file" }]);
});

it.each([
  [
    "its own stored file",
    (id: string) => `/api/storage/trip-covers/${id}/11111111-1111-4111-8111-111111111111.jpg`,
    true,
  ],
  ["a photo", () => "https://images.example/a.jpg", false],
  [
    "another trip's file",
    () => `/api/storage/trip-covers/${otherTripId}/11111111-1111-4111-8111-111111111111.jpg`,
    false,
  ],
  ["no cover", () => null, false],
])("queues the trip cover for removal only when it is %s", async (_label, coverFor, queuesCover) => {
  stubCreate();
  const transaction = {
    select: () => ({
      from: (table: unknown) => ({
        where: () =>
          lockableRows(
            table === documents ? [{ url: "/file" }] : table === trips ? [{ coverImageUrl: coverFor(tripId) }] : []
          ),
      }),
    }),
    delete: mocks.remove,
  };
  mocks.remove.mockReturnValue({ where: async () => undefined });
  mocks.transaction.mockImplementationOnce(async (work) => work(transaction));
  mocks.queueDeletions.mockResolvedValueOnce([]);
  await deleteTrip(actor, tripId, {});
  const queuedUrls = mocks.queueDeletions.mock.calls[0][1] as string[];
  expect(queuedUrls[0]).toBe("/file");
  expect(queuedUrls).toHaveLength(queuesCover ? 2 : 1);
  if (queuesCover) expect(queuedUrls[1]).toBe(coverFor(tripId));
});

it("answers the deletion while storage cleanup is still held open", async () => {
  stubCreate();
  const transaction = {
    select: () => ({
      from: (table: unknown) => ({ where: () => lockableRows(table === documents ? [{ url: "/file" }] : []) }),
    }),
    delete: mocks.remove,
  };
  mocks.remove.mockReturnValue({ where: async () => undefined });
  mocks.transaction.mockImplementationOnce(async (work) => work(transaction));
  mocks.queueDeletions.mockResolvedValueOnce([{ id: "queued", url: "/file" }]);
  // Storage is held open until the test releases it; `after` starts the callback without awaiting it, as Next does.
  let releaseStorage!: () => void;
  const storageHeld = new Promise<void>((resolve) => {
    releaseStorage = resolve;
  });
  mocks.removeFiles.mockReturnValueOnce(storageHeld);
  mocks.after.mockImplementationOnce((work: () => Promise<void>) => {
    void work();
  });
  await expect(deleteTrip(actor, tripId, {})).resolves.toBeNull();
  expect(mocks.removeFiles).toHaveBeenCalledWith([{ id: "queued", url: "/file" }]);
  releaseStorage();
  await storageHeld;
});

it("keeps committed deletion successful when cleanup cannot be scheduled", async () => {
  stubCreate();
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  const transaction = {
    select: () => ({ from: () => ({ where: () => lockableRows([]) }) }),
    delete: mocks.remove,
  };
  mocks.remove.mockReturnValue({ where: async () => undefined });
  mocks.transaction.mockImplementationOnce(async (work) => work(transaction));
  mocks.queueDeletions.mockResolvedValueOnce([{ id: "queued", url: "/file" }]);
  mocks.after.mockImplementationOnce(() => {
    throw new Error("no request context");
  });
  await expect(deleteTrip(actor, tripId, {})).resolves.toBeNull();
  expect(mocks.removeFiles).not.toHaveBeenCalled();
  expect(warning).toHaveBeenCalledOnce();
  warning.mockRestore();
});
it("returns success for a missing trip without effects", async () => {
  stubCreate();
  mocks.lock.mockRejectedValueOnce(new TripNotFoundError());
  await expect(deleteTrip(actor, tripId, {})).resolves.toBeNull();
  expect(mocks.requireRole).not.toHaveBeenCalled();
  expect(mocks.publishTrip).not.toHaveBeenCalled();
  expect(mocks.queueDeletions).not.toHaveBeenCalled();
  expect(mocks.recordDeletions).not.toHaveBeenCalled();
});

it("does not delete or publish when access is denied under the lock", async () => {
  stubCreate();
  mocks.requireRole.mockRejectedValueOnce(new Error("denied"));
  await expect(deleteTrip(actor, tripId, {})).rejects.toThrow("denied");
  expect(mocks.publishTrip).not.toHaveBeenCalled();
  expect(mocks.queueDeletions).not.toHaveBeenCalled();
});
it("publishes nothing when the deletion transaction rolls back", async () => {
  stubCreate();
  const transaction = {
    select: () => ({
      from: (table: unknown) => ({
        where: () =>
          lockableRows(
            table === documents
              ? [{ url: "/file" }, { url: null }]
              : table === collaborators
                ? [{ userId: "user" }, { userId: "other" }, { userId: null }]
                : []
          ),
      }),
    }),
    delete: mocks.remove,
  };
  mocks.remove.mockReturnValue({ where: async () => undefined });
  mocks.transaction.mockImplementationOnce(async (work) => {
    await work(transaction);
    throw new Error("commit failed");
  });
  await expect(deleteTrip(actor, tripId, {})).rejects.toThrow("commit failed");
  expect(mocks.publishTrip).not.toHaveBeenCalled();
  expect(mocks.purge).not.toHaveBeenCalled();
  expect(mocks.removeFiles).not.toHaveBeenCalled();
});

it("does not publish, queue or purge on a replay", async () => {
  stubCreate();
  mocks.idempotent.mockResolvedValueOnce({ value: null, replayed: true });
  await expect(deleteTrip(actor, tripId, {}, { key: "k", method: "DELETE", path: "/trip" })).resolves.toBeNull();
  expect(mocks.queueDeletions).not.toHaveBeenCalled();
  expect(mocks.publishTrip).not.toHaveBeenCalled();
  expect(mocks.purge).not.toHaveBeenCalled();
});

it("propagates lock failures instead of treating them as missing rows", async () => {
  stubCreate();
  mocks.lock.mockRejectedValueOnce(new Error("database unavailable"));
  await expect(deleteTrip(actor, tripId, {})).rejects.toThrow("database unavailable");
  expect(mocks.publishTrip).not.toHaveBeenCalled();
});

it.each([
  ["demoted", () => new TripForbiddenError("manager")],
  ["removed", () => new TripNotFoundError()],
])("rechecks authorization after waiting for the lock when the manager is %s", async (_change, errorForChangedRole) => {
  stubCreate();
  let releaseLock!: () => void;
  let notifyWaiting!: () => void;
  const waiting = new Promise<void>((resolve) => {
    notifyWaiting = resolve;
  });
  const lockReleased = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  let roleChanged = false;
  mocks.lock.mockImplementationOnce(async () => {
    notifyWaiting();
    await lockReleased;
  });
  mocks.requireRole.mockImplementationOnce(async () => {
    if (roleChanged) throw errorForChangedRole();
    return "manager";
  });
  const deletion = deleteTrip(actor, tripId, {});
  await waiting;
  expect(mocks.requireRole).not.toHaveBeenCalled();
  roleChanged = true;
  releaseLock();
  await expect(deletion).rejects.toBeInstanceOf(errorForChangedRole().constructor);
  expect(mocks.requireRole).toHaveBeenCalledWith(tripId, actor.userId, "manager", expect.anything());
  expect(mocks.queueDeletions).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.publishTrip).not.toHaveBeenCalled();
  expect(mocks.publishUser).not.toHaveBeenCalled();
  expect(mocks.purge).not.toHaveBeenCalled();
  expect(mocks.removeFiles).not.toHaveBeenCalled();
});

it("does not update trip metadata if an expense write fails", async () => {
  mocks.recalculate.mockResolvedValue([{ expenseId: "foreign", convertedAmount: 92, rate: 0.92 }]);
  mocks.set.mockReturnValueOnce({
    where: async () => {
      throw new Error("expense update failed");
    },
  });
  await expect(
    updateTrip(actor, tripId, { name: "New", budgetCurrency: "EUR", convertCurrency: true })
  ).rejects.toThrow("expense update failed");
  expect(mocks.update).not.toHaveBeenCalledWith(trips);
  expect(mocks.markChanged).not.toHaveBeenCalled();
});
