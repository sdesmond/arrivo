// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  collaborators,
  days,
  documents,
  events,
  expenses,
  itineraryChecklists,
  itineraryNotes,
  reservations,
  trips,
} from "@/db/schema";
import { headers } from "next/headers";

const { recordTripCreated, recordTripUpdated, recordTripInvitation } = vi.hoisted(() => ({
  recordTripInvitation: vi.fn(),
  recordTripCreated: vi.fn(),
  recordTripUpdated: vi.fn(),
}));
vi.mock("@/lib/trip-activity", () => ({ recordTripCreated, recordTripUpdated, recordTripInvitation }));

const { assertWithinRateLimit } = vi.hoisted(() => ({ assertWithinRateLimit: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ assertWithinRateLimit }));

const { getInvitableUsers } = vi.hoisted(() => ({ getInvitableUsers: vi.fn() }));
vi.mock("@/lib/invitable-users", () => ({ getInvitableUsers }));

const {
  assertTripAccess,
  db,
  publishTripEvent,
  publishUserEvent,
  purgeTripTopic,
  recalculateAll,
  removeTripSubscribersForUser,
  requireUser,
  revalidatePath,
} = vi.hoisted(() => ({
  assertTripAccess: vi.fn(),
  db: {
    delete: vi.fn(),
    insert: vi.fn(),
    select: vi.fn(),
    transaction: vi.fn(),
    update: vi.fn(),
  },
  publishTripEvent: vi.fn(),
  publishUserEvent: vi.fn(),
  purgeTripTopic: vi.fn(),
  recalculateAll: vi.fn(),
  removeTripSubscribersForUser: vi.fn(),
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth-helpers", () => ({
  requireUser,
  assertTripAccess,
}));

vi.mock("@/db", () => ({
  db,
}));

const { recordDeletions } = vi.hoisted(() => ({ recordDeletions: vi.fn() }));
vi.mock("@/lib/services/deletion-records", () => ({ recordDeletions }));

vi.mock("@/lib/trip-events", () => ({
  publishTripEvent,
  publishUserEvent,
  purgeTripTopic,
  removeTripSubscribersForUser,
}));

vi.mock("@/lib/currency", () => ({
  recalculateAll,
}));

vi.mock("next/cache", () => ({
  revalidatePath,
}));

const { adapterDel, adapterPut, getStorageAdapter } = vi.hoisted(() => ({
  adapterDel: vi.fn(),
  adapterPut: vi.fn(),
  getStorageAdapter: vi.fn(),
}));

vi.mock("@/lib/storage/storage-adapter", () => ({
  getStorageAdapter,
}));

const { mockSearchBoxSuggest, mockSearchBoxRetrieve } = vi.hoisted(() => ({
  mockSearchBoxSuggest: vi.fn(),
  mockSearchBoxRetrieve: vi.fn(),
}));

const { addPackingItemAction, saveTripListAsTemplateAction } = vi.hoisted(() => ({
  addPackingItemAction: vi.fn(),
  saveTripListAsTemplateAction: vi.fn(),
}));

vi.mock("@mapbox/search-js-core", () => ({
  // Must use regular functions (not arrows) so `new SearchBoxCore()` works as a constructor
  SearchBoxCore: vi.fn(function (this: Record<string, unknown>) {
    this.suggest = mockSearchBoxSuggest;
    this.retrieve = mockSearchBoxRetrieve;
  }),
  SessionToken: vi.fn(function (this: Record<string, unknown>, id?: string) {
    this.id = id ?? "mock-session-token";
  }),
}));

vi.mock("./packing-actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./packing-actions")>();

  return {
    ...actual,
    addPackingItem: addPackingItemAction,
    saveTripListAsTemplate: saveTripListAsTemplateAction,
  };
});

import { buildTripDateChangeConfirmation, buildTripDateSyncPlan, resolveTripDateRange } from "./date-sync";
import {
  createTrip,
  deleteTrip,
  retrieveLocation,
  saveTripListAsTemplate,
  searchAddressLocations,
  searchLocations,
  updateTripMetadata,
} from "./actions";

import {
  LiveSyncEventType,
  TransitMode,
  TripDateConflictResolution,
  type TripDateChangeConfirmation,
} from "@/data/types";
import { deriveGraphicCover } from "@/lib/utils";
import * as coverSearch from "@/lib/services/cover-search";

describe("manager-gated trip actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "editor-1" });
    assertTripAccess.mockRejectedValue(new Error("not found"));
  });

  it("denies an editor from deleting a trip before any write", async () => {
    await expect(deleteTrip("trip-1")).rejects.toThrow("not found");

    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "editor-1", "manager");
    expect(db.delete).not.toHaveBeenCalled();
    expect(publishTripEvent).not.toHaveBeenCalled();
  });
});

describe("deleteTrip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "manager-1" });
    assertTripAccess.mockResolvedValue("manager");
    db.select.mockReturnValue({
      from: () => ({
        where: async () => [],
      }),
    });
    db.delete.mockReturnValue({
      where: async () => {},
    });
  });

  it("publishes trip-deleted and purges the topic after the delete commits, before revalidating", async () => {
    await deleteTrip("trip-1");

    expect(db.delete).toHaveBeenCalledWith(trips);
    expect(publishTripEvent).toHaveBeenCalledWith("trip-1", {
      type: LiveSyncEventType.TripDeleted,
      tripId: "trip-1",
    });
    expect(purgeTripTopic).toHaveBeenCalledWith("trip-1");
    expect(revalidatePath).toHaveBeenCalledWith("/trips");

    const deleteOrder = db.delete.mock.invocationCallOrder[0];
    const publishOrder = publishTripEvent.mock.invocationCallOrder[0];
    const purgeOrder = purgeTripTopic.mock.invocationCallOrder[0];
    const revalidateOrder = revalidatePath.mock.invocationCallOrder[0];
    expect(deleteOrder).toBeLessThan(publishOrder);
    expect(publishOrder).toBeLessThan(purgeOrder);
    expect(purgeOrder).toBeLessThan(revalidateOrder);
    expect(publishOrder).toBeLessThan(revalidateOrder);
  });

  it("also publishes trip-deleted to each other collaborator's personal channel, but not the acting manager's", async () => {
    db.select.mockReturnValue({
      from: () => ({
        where: async () => [{ userId: "manager-1" }, { userId: "user-editor" }, { userId: null }],
      }),
    });

    await deleteTrip("trip-1");

    expect(publishUserEvent).toHaveBeenCalledExactlyOnceWith("user-editor", {
      type: LiveSyncEventType.TripDeleted,
      tripId: "trip-1",
    });
  });

  it("does not publish or purge when access is denied", async () => {
    assertTripAccess.mockRejectedValue(new Error("not found"));

    await expect(deleteTrip("trip-1")).rejects.toThrow("not found");

    expect(publishTripEvent).not.toHaveBeenCalled();
    expect(purgeTripTopic).not.toHaveBeenCalled();
  });
});

interface TransactionFixture {
  checklistRows?: Array<{ id: string }>;
  eventDocs?: Array<{ eventId: string | null; url: string | null }>;
  existingDays: Array<{ id: string; tripId: string; dayNumber: number; date: string | null; label: string }>;
  expenseRows?: unknown[];
  noteRows?: Array<{ id: string }>;
  reservationDocs?: Array<{ eventId: string | null; url: string | null }>;
  reservationRows?: Array<{ id: string; provider: string; type: string; startAt: Date | null; endAt: Date | null }>;
  removedEvents?: Array<{ id: string; name: string; dayId: string | null; position: number }>;
  tripRow?: { id: string; startDate: string | null; endDate: string | null };
}

function collectSqlParams(node: unknown, found: unknown[] = []): unknown[] {
  if (node === null || typeof node !== "object") return found;
  if (Array.isArray(node)) {
    for (const item of node) collectSqlParams(item, found);
    return found;
  }
  const record = node as { queryChunks?: unknown[]; value?: unknown };
  if (Array.isArray(record.queryChunks)) {
    for (const chunk of record.queryChunks) collectSqlParams(chunk, found);
  } else if (node.constructor?.name === "Param") {
    collectSqlParams(record.value, found);
    if (!Array.isArray(record.value)) found.push(record.value);
  }
  return found;
}

function createTransactionMock({
  checklistRows = [],
  eventDocs = [],
  existingDays,
  expenseRows = [],
  noteRows = [],
  reservationDocs = [],
  reservationRows = [],
  removedEvents = [],
  tripRow = { id: "trip-1", startDate: "2026-08-01", endDate: "2026-08-02" },
}: TransactionFixture) {
  let documentReads = 0;
  const operations = {
    deletes: [] as unknown[],
    deleteConditions: [] as Array<{ table: unknown; condition: unknown }>,
    inserts: [] as Array<{ table: unknown; values: unknown }>,
    updates: [] as Array<{ table: unknown; values: unknown }>,
  };

  const transaction = {
    execute: async () => [{ id: tripRow?.id ?? "trip-1" }],
    select: () => ({
      from: (table: unknown) => {
        if (table === trips) {
          return {
            where: async () => [tripRow],
          };
        }

        if (table === days) {
          return {
            where: () => ({
              orderBy: async () => existingDays,
            }),
          };
        }

        if (table === events) {
          return {
            where: async () => removedEvents,
          };
        }

        if (table === documents) {
          return {
            where: async () => {
              documentReads += 1;
              // Event docs are read first (only when events were removed), then reservation docs.
              const eventDocsRead = removedEvents.length > 0 ? 1 : 0;
              return documentReads <= eventDocsRead ? eventDocs : reservationDocs;
            },
          };
        }

        if (table === itineraryNotes) {
          return {
            where: async () => noteRows,
          };
        }

        if (table === itineraryChecklists) {
          return {
            where: async () => checklistRows,
          };
        }

        if (table === expenses) {
          return {
            where: async () => expenseRows,
          };
        }

        if (table === reservations) {
          return {
            where: async () => reservationRows,
          };
        }

        throw new Error("Unexpected table read in test fixture.");
      },
    }),
    update: (table: unknown) => ({
      set: (values: unknown) => ({
        where: async () => {
          operations.updates.push({ table, values });
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: async (condition: unknown) => {
        operations.deleteConditions.push({ table, condition });
        operations.deletes.push(table);
      },
    }),
    insert: (table: unknown) => ({
      values: async (values: unknown) => {
        operations.inserts.push({ table, values });
      },
    }),
  };

  return { operations, transaction };
}

describe("resolveTripDateRange", () => {
  it("fills a missing end date from the requested start date", () => {
    expect(resolveTripDateRange({}, { startDate: "2026-07-01" })).toEqual({
      startDate: "2026-07-01",
      endDate: "2026-07-01",
    });
  });

  it("reuses the existing range when the patch omits dates", () => {
    expect(resolveTripDateRange({ startDate: "2026-07-01", endDate: "2026-07-03" }, {})).toEqual({
      startDate: "2026-07-01",
      endDate: "2026-07-03",
    });
  });
});

describe("buildTripDateSyncPlan", () => {
  it("separates added, removed, and retained dates", () => {
    expect(buildTripDateSyncPlan(["2026-07-01", "2026-07-02"], ["2026-07-02", "2026-07-03"])).toEqual({
      desiredDates: ["2026-07-02", "2026-07-03"],
      addedDates: ["2026-07-03"],
      removedDates: ["2026-07-01"],
      retainedDates: ["2026-07-02"],
    });
  });
});

describe("buildTripDateChangeConfirmation", () => {
  it("preserves the confirmation payload structure returned to the client", () => {
    expect(
      buildTripDateChangeConfirmation(
        ["2026-07-04"],
        undefined,
        [{ id: "event-1", name: "Tea ceremony", displacedDate: "2026-07-04", docCount: 2 }],
        1,
        2,
        2
      )
    ).toEqual({
      removedDates: ["2026-07-04"],
      removedDayLabels: undefined,
      events: [{ id: "event-1", name: "Tea ceremony", displacedDate: "2026-07-04", docCount: 2 }],
      noteCount: 1,
      checklistCount: 2,
      eventDocumentCount: 2,
    });
  });

  it("includes reservations only when some are affected", () => {
    const reservationPreview = { id: "res-1", provider: "Delta", type: "flight" as const, date: "2026-07-04" };
    expect(
      buildTripDateChangeConfirmation(["2026-07-04"], undefined, [], 0, 0, 0, [reservationPreview]).reservations
    ).toEqual([reservationPreview]);
    expect(buildTripDateChangeConfirmation(["2026-07-04"], undefined, [], 0, 0, 0, [])).not.toHaveProperty(
      "reservations"
    );
  });
});

describe("updateTripMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockResolvedValue(undefined);
    getStorageAdapter.mockReturnValue({ put: adapterPut, del: adapterDel });
    adapterDel.mockResolvedValue(undefined);
  });

  it("does not record denied metadata edits", async () => {
    assertTripAccess.mockRejectedValueOnce(new Error("not found"));
    await expect(updateTripMetadata("trip-1", { name: "Private trip" })).rejects.toThrow("not found");
    expect(recordTripUpdated).not.toHaveBeenCalled();
  });

  it("does not record metadata edits when the transaction fails", async () => {
    db.transaction.mockRejectedValueOnce(new Error("transaction failed"));
    await expect(updateTripMetadata("trip-1", { name: "Private trip" })).rejects.toThrow("transaction failed");
    expect(recordTripUpdated).not.toHaveBeenCalled();
  });

  it.each([
    [{ name: "  " }, "Trip name is required."],
    [{ name: "x".repeat(101) }, "Trip name must be 100 characters or fewer."],
    [{ notes: "x".repeat(5001) }, "Notes must be 5000 characters or fewer."],
    [{ startDate: "2026-13-01" }, "Invalid start date format. Expected YYYY-MM-DD."],
    [{ budgetTotal: 10 ** 12 }, "Budget is too large."],
  ])("rejects invalid patch %j before mutating", async (patch, message) => {
    await expect(updateTripMetadata("trip-1", patch)).rejects.toThrow(message);
    expect(db.transaction).not.toHaveBeenCalled();
    expect(recordTripUpdated).not.toHaveBeenCalled();
  });

  it("rejects unsupported budget currencies before mutating", async () => {
    await expect(updateTripMetadata("trip-1", { budgetCurrency: "zzz" })).rejects.toThrow("Invalid budget currency");
    expect(db.transaction).not.toHaveBeenCalled();
    expect(recordTripUpdated).not.toHaveBeenCalled();
  });

  it("persists a valid transit mode", async () => {
    const { operations, transaction } = createTransactionMock({
      tripRow: { id: "trip-1", startDate: null, endDate: null },
      existingDays: [{ id: "day-1", tripId: "trip-1", dayNumber: 1, date: null, label: "Day 1" }],
    });
    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    const result = await updateTripMetadata("trip-1", { transitMode: TransitMode.Transit });

    expect(result).toEqual({ status: "saved" });
    expect(recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user-1", "trip-1");
    const tripUpdate = operations.updates.find((entry) => entry.table === trips);
    expect(tripUpdate?.values).toEqual(expect.objectContaining({ transitMode: TransitMode.Transit }));
  });

  it("rejects an invalid transit mode before mutating", async () => {
    await expect(updateTripMetadata("trip-1", { transitMode: "flying" as TransitMode })).rejects.toThrow(
      "Invalid transit mode"
    );
    expect(db.transaction).not.toHaveBeenCalled();
    expect(recordTripUpdated).not.toHaveBeenCalled();
  });

  it.each(["javascript:alert(1)", "JavaScript:alert(1)", "//evil.example/pixel.png", "/api/storage/../../etc/passwd"])(
    "rejects cover URL %j before mutating",
    async (coverImageUrl) => {
      await expect(updateTripMetadata("trip-1", { coverImageUrl })).rejects.toThrow("Invalid cover image URL.");
      expect(db.transaction).not.toHaveBeenCalled();
      expect(recordTripUpdated).not.toHaveBeenCalled();
    }
  );

  it("rejects another trip's stored cover before mutating", async () => {
    await expect(
      updateTripMetadata("trip-1", { coverImageUrl: "/api/storage/trip-covers/trip-2/abc.jpg" })
    ).rejects.toThrow("Invalid cover image URL.");
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("clears the transit mode when the patch sets it to null", async () => {
    const { operations, transaction } = createTransactionMock({
      tripRow: { id: "trip-1", startDate: null, endDate: null },
      existingDays: [{ id: "day-1", tripId: "trip-1", dayNumber: 1, date: null, label: "Day 1" }],
    });
    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    const result = await updateTripMetadata("trip-1", { transitMode: null });

    expect(result).toEqual({ status: "saved" });
    expect(recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user-1", "trip-1");
    const tripUpdate = operations.updates.find((entry) => entry.table === trips);
    expect(tripUpdate?.values).toEqual(expect.objectContaining({ transitMode: null }));
  });

  it("returns confirmation-required before mutating when removed days contain events", async () => {
    const { operations, transaction } = createTransactionMock({
      existingDays: [
        { id: "day-1", tripId: "trip-1", dayNumber: 1, date: "2026-08-01", label: "Day 1" },
        { id: "day-2", tripId: "trip-1", dayNumber: 2, date: "2026-08-02", label: "Day 2" },
      ],
      removedEvents: [{ id: "event-1", name: "Dinner", dayId: "day-2", position: 0 }],
    });
    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    const result = await updateTripMetadata("trip-1", {
      startDate: "2026-08-01",
      endDate: "2026-08-01",
    });

    expect(recordTripUpdated).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "confirmation-required",
      confirmation: {
        removedDates: ["2026-08-02"],
        removedDayLabels: undefined,
        events: [{ id: "event-1", name: "Dinner", displacedDate: "2026-08-02", docCount: 0 }],
        noteCount: 0,
        checklistCount: 0,
        eventDocumentCount: 0,
      },
    });
    expect(operations.deletes).toEqual([]);
    expect(operations.updates).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("saves the destructive resolution when the confirmation payload still matches", async () => {
    const confirmation: TripDateChangeConfirmation = {
      removedDates: ["2026-08-02"],
      removedDayLabels: undefined,
      events: [{ id: "event-1", name: "Dinner", displacedDate: "2026-08-02", docCount: 1 }],
      noteCount: 0,
      checklistCount: 0,
      eventDocumentCount: 1,
    };
    const { operations, transaction } = createTransactionMock({
      existingDays: [
        { id: "day-1", tripId: "trip-1", dayNumber: 1, date: "2026-08-01", label: "Day 1" },
        { id: "day-2", tripId: "trip-1", dayNumber: 2, date: "2026-08-02", label: "Day 2" },
      ],
      eventDocs: [{ eventId: "event-1", url: "https://example.com/doc.pdf" }],
      removedEvents: [{ id: "event-1", name: "Dinner", dayId: "day-2", position: 0 }],
    });
    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    const result = await updateTripMetadata(
      "trip-1",
      { startDate: "2026-08-01", endDate: "2026-08-01" },
      TripDateConflictResolution.DeleteEvents,
      confirmation
    );

    expect(result).toEqual({ status: "saved" });
    expect(recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user-1", "trip-1");
    expect(operations.deletes).toContain(events);
    expect(operations.deletes).toContain(days);
    expect(operations.updates.some((entry) => entry.table === trips)).toBe(true);
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
    expect(revalidatePath).toHaveBeenCalledWith("/trips");
  });

  it("requires confirmation when a removed date holds a reservation and lists it", async () => {
    const { operations, transaction } = createTransactionMock({
      existingDays: [
        { id: "day-1", tripId: "trip-1", dayNumber: 1, date: "2026-08-01", label: "Day 1" },
        { id: "day-2", tripId: "trip-1", dayNumber: 2, date: "2026-08-02", label: "Day 2" },
      ],
      reservationRows: [
        {
          id: "res-1",
          provider: "Delta",
          type: "flight",
          startAt: new Date("2026-08-02T10:00:00.000Z"),
          endAt: new Date("2026-08-02T12:00:00.000Z"),
        },
        {
          id: "res-2",
          provider: "Hilton",
          type: "hotel",
          startAt: new Date("2026-08-01T15:00:00.000Z"),
          endAt: new Date("2026-08-01T16:00:00.000Z"),
        },
      ],
    });
    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    const result = await updateTripMetadata("trip-1", { startDate: "2026-08-01", endDate: "2026-08-01" });

    expect(recordTripUpdated).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "confirmation-required",
      confirmation: expect.objectContaining({
        removedDates: ["2026-08-02"],
        reservations: [{ id: "res-1", provider: "Delta", type: "flight", date: "2026-08-02" }],
      }),
    });
    expect(operations.deletes).toEqual([]);
  });

  it("deletes out-of-range reservations when the user chooses to remove", async () => {
    const reservationRows = [
      {
        id: "res-1",
        provider: "Delta",
        type: "flight",
        startAt: new Date("2026-08-02T10:00:00.000Z"),
        endAt: null,
      },
      {
        id: "res-keep",
        provider: "Hilton",
        type: "lodging",
        startAt: new Date("2026-08-01T10:00:00.000Z"),
        endAt: new Date("2026-08-01T12:00:00.000Z"),
      },
    ];
    const confirmation: TripDateChangeConfirmation = {
      removedDates: ["2026-08-02"],
      removedDayLabels: undefined,
      events: [],
      noteCount: 0,
      checklistCount: 0,
      eventDocumentCount: 0,
      reservations: [{ id: "res-1", provider: "Delta", type: "flight", date: "2026-08-02" }],
    };
    const { operations, transaction } = createTransactionMock({
      existingDays: [
        { id: "day-1", tripId: "trip-1", dayNumber: 1, date: "2026-08-01", label: "Day 1" },
        { id: "day-2", tripId: "trip-1", dayNumber: 2, date: "2026-08-02", label: "Day 2" },
      ],
      reservationRows,
      reservationDocs: [{ eventId: null, url: "https://example.com/boarding-pass.pdf" }],
    });
    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    const result = await updateTripMetadata(
      "trip-1",
      { startDate: "2026-08-01", endDate: "2026-08-01" },
      TripDateConflictResolution.DeleteEvents,
      confirmation
    );

    expect(result).toEqual({ status: "saved" });
    expect(recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user-1", "trip-1");
    expect(operations.deletes).toContain(reservations);
    expect(operations.deletes).toContain(days);
    const reservationDelete = operations.deleteConditions.find((entry) => entry.table === reservations);
    const deleteParams = collectSqlParams(reservationDelete?.condition);
    expect(deleteParams).toContain("res-1");
    expect(deleteParams).not.toContain("res-keep");
    expect(deleteParams).toContain("trip-1");
    expect(adapterDel).toHaveBeenCalledWith("https://example.com/boarding-pass.pdf");
  });

  it("keeps out-of-range reservations when the user chooses to keep", async () => {
    const confirmation: TripDateChangeConfirmation = {
      removedDates: ["2026-08-02"],
      removedDayLabels: undefined,
      events: [],
      noteCount: 0,
      checklistCount: 0,
      eventDocumentCount: 0,
      reservations: [{ id: "res-1", provider: "Delta", type: "flight", date: "2026-08-02" }],
    };
    const { operations, transaction } = createTransactionMock({
      existingDays: [
        { id: "day-1", tripId: "trip-1", dayNumber: 1, date: "2026-08-01", label: "Day 1" },
        { id: "day-2", tripId: "trip-1", dayNumber: 2, date: "2026-08-02", label: "Day 2" },
      ],
      reservationRows: [
        { id: "res-1", provider: "Delta", type: "flight", startAt: new Date("2026-08-02T10:00:00.000Z"), endAt: null },
      ],
    });
    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    const result = await updateTripMetadata(
      "trip-1",
      { startDate: "2026-08-01", endDate: "2026-08-01" },
      TripDateConflictResolution.KeepAsUnscheduled,
      confirmation
    );

    expect(result).toEqual({ status: "saved" });
    expect(recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user-1", "trip-1");
    expect(operations.deletes).not.toContain(reservations);
    expect(operations.deletes).toContain(days);
  });

  it("flags a reservation whose endAt alone falls on a removed date", async () => {
    const { transaction } = createTransactionMock({
      existingDays: [
        { id: "day-1", tripId: "trip-1", dayNumber: 1, date: "2026-08-01", label: "Day 1" },
        { id: "day-2", tripId: "trip-1", dayNumber: 2, date: "2026-08-02", label: "Day 2" },
      ],
      reservationRows: [
        {
          id: "res-1",
          provider: "Hilton",
          type: "lodging",
          startAt: new Date("2026-08-01T15:00:00.000Z"),
          endAt: new Date("2026-08-02T11:00:00.000Z"),
        },
      ],
    });
    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    const result = await updateTripMetadata("trip-1", { startDate: "2026-08-01", endDate: "2026-08-01" });

    expect(recordTripUpdated).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "confirmation-required",
      confirmation: expect.objectContaining({
        reservations: [{ id: "res-1", provider: "Hilton", type: "lodging", date: "2026-08-02" }],
      }),
    });
  });

  it("flags a stay that spans a removed date without either endpoint landing on it", async () => {
    const { transaction } = createTransactionMock({
      tripRow: { id: "trip-1", startDate: "2026-08-02", endDate: "2026-08-04" },
      existingDays: [2, 3, 4].map((dayNumber) => ({
        id: `day-${dayNumber}`,
        tripId: "trip-1",
        dayNumber: dayNumber - 1,
        date: `2026-08-0${dayNumber}`,
        label: `Day ${dayNumber - 1}`,
      })),
      reservationRows: [
        {
          id: "res-1",
          provider: "Hilton",
          type: "lodging",
          startAt: new Date("2026-08-01T15:00:00.000Z"),
          endAt: new Date("2026-08-05T11:00:00.000Z"),
        },
      ],
    });
    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    // The stay (Aug 1-5) was kept earlier while the trip shrank to Aug 2-4; dropping Aug 4 now cuts through it.
    const result = await updateTripMetadata("trip-1", { startDate: "2026-08-02", endDate: "2026-08-03" });

    expect(recordTripUpdated).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "confirmation-required",
      confirmation: expect.objectContaining({
        reservations: [{ id: "res-1", provider: "Hilton", type: "lodging", date: "2026-08-04" }],
      }),
    });
  });

  it("ignores reservations with no dates and reservations entirely inside the kept range", async () => {
    const { transaction } = createTransactionMock({
      existingDays: [
        { id: "day-1", tripId: "trip-1", dayNumber: 1, date: "2026-08-01", label: "Day 1" },
        { id: "day-2", tripId: "trip-1", dayNumber: 2, date: "2026-08-02", label: "Day 2" },
      ],
      reservationRows: [
        { id: "res-undated", provider: "Amtrak", type: "train", startAt: null, endAt: null },
        {
          id: "res-kept",
          provider: "Hilton",
          type: "lodging",
          startAt: new Date("2026-08-01T10:00:00.000Z"),
          endAt: new Date("2026-08-01T12:00:00.000Z"),
        },
      ],
    });
    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    const result = await updateTripMetadata("trip-1", { startDate: "2026-08-01", endDate: "2026-08-01" });

    expect(result).toEqual({ status: "saved" });
    expect(recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user-1", "trip-1");
  });

  it("rejects a stale confirmation when a reservation appeared after the preview", async () => {
    const { operations, transaction } = createTransactionMock({
      existingDays: [
        { id: "day-1", tripId: "trip-1", dayNumber: 1, date: "2026-08-01", label: "Day 1" },
        { id: "day-2", tripId: "trip-1", dayNumber: 2, date: "2026-08-02", label: "Day 2" },
      ],
      removedEvents: [{ id: "event-1", name: "Dinner", dayId: "day-2", position: 0 }],
      reservationRows: [
        {
          id: "res-new",
          provider: "Delta",
          type: "flight",
          startAt: new Date("2026-08-02T10:00:00.000Z"),
          endAt: null,
        },
      ],
    });
    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    await expect(
      updateTripMetadata(
        "trip-1",
        { startDate: "2026-08-01", endDate: "2026-08-01" },
        TripDateConflictResolution.DeleteEvents,
        {
          removedDates: ["2026-08-02"],
          removedDayLabels: undefined,
          events: [{ id: "event-1", name: "Dinner", displacedDate: "2026-08-02", docCount: 0 }],
          noteCount: 0,
          checklistCount: 0,
          eventDocumentCount: 0,
        }
      )
    ).rejects.toThrow(/review the date change again/i);
    expect(operations.deletes).toEqual([]);
  });

  it("does not look for reservations when dateless days overflow into a dated range", async () => {
    const { transaction } = createTransactionMock({
      tripRow: { id: "trip-1", startDate: null, endDate: null },
      existingDays: [
        { id: "day-1", tripId: "trip-1", dayNumber: 1, date: null, label: "Day 1" },
        { id: "day-2", tripId: "trip-1", dayNumber: 2, date: null, label: "Day 2" },
      ],
      reservationRows: [
        {
          id: "res-1",
          provider: "Delta",
          type: "flight",
          startAt: new Date("2026-08-02T10:00:00.000Z"),
          endAt: null,
        },
      ],
    });
    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    const result = await updateTripMetadata("trip-1", { startDate: "2026-08-01", endDate: "2026-08-01" });

    expect(result).toEqual({ status: "saved" });
    expect(recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user-1", "trip-1");
  });

  it("rejects a stale confirmation payload instead of deleting newly changed content", async () => {
    const staleConfirmation: TripDateChangeConfirmation = {
      removedDates: ["2026-08-02"],
      removedDayLabels: undefined,
      events: [{ id: "event-1", name: "Old Dinner", displacedDate: "2026-08-02", docCount: 0 }],
      noteCount: 0,
      checklistCount: 0,
      eventDocumentCount: 0,
    };
    const { operations, transaction } = createTransactionMock({
      existingDays: [
        { id: "day-1", tripId: "trip-1", dayNumber: 1, date: "2026-08-01", label: "Day 1" },
        { id: "day-2", tripId: "trip-1", dayNumber: 2, date: "2026-08-02", label: "Day 2" },
      ],
      removedEvents: [{ id: "event-1", name: "Updated Dinner", dayId: "day-2", position: 0 }],
    });
    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    await expect(
      updateTripMetadata(
        "trip-1",
        { startDate: "2026-08-01", endDate: "2026-08-01" },
        TripDateConflictResolution.DeleteEvents,
        staleConfirmation
      )
    ).rejects.toThrow(/review the date change again/i);
    expect(operations.deletes).toEqual([]);
  });

  it("threads destination fields into the trip update without auto-changing the cover", async () => {
    const { operations, transaction } = createTransactionMock({
      existingDays: [
        { id: "day-1", tripId: "trip-1", dayNumber: 1, date: "2026-08-01", label: "Day 1" },
        { id: "day-2", tripId: "trip-1", dayNumber: 2, date: "2026-08-02", label: "Day 2" },
      ],
    });
    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    const result = await updateTripMetadata("trip-1", {
      destinationName: "Paris, France",
      destinationCountry: "France",
      destinationCountryCode: "FR",
    });

    const tripUpdate = operations.updates.find((entry) => entry.table === trips);
    expect(result).toEqual({ status: "saved" });
    expect(recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user-1", "trip-1");
    expect(tripUpdate?.values).toEqual(
      expect.objectContaining({
        destinationName: "Paris, France",
        destinationCountry: "France",
        destinationCountryCode: "FR",
        coverImageUrl: undefined,
      })
    );
  });

  it("maps existing dateless days to new dates when a dateless trip receives dates (AC11)", async () => {
    const { operations, transaction } = createTransactionMock({
      tripRow: { id: "trip-1", startDate: null, endDate: null },
      existingDays: [
        { id: "day-1", tripId: "trip-1", dayNumber: 1, date: null, label: "Day 1" },
        { id: "day-2", tripId: "trip-1", dayNumber: 2, date: null, label: "Day 2" },
      ],
    });
    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    const result = await updateTripMetadata("trip-1", {
      startDate: "2026-08-01",
      endDate: "2026-08-02",
    });

    expect(result).toEqual({ status: "saved" });
    expect(recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user-1", "trip-1");
    const dayUpdates = operations.updates.filter((entry) => entry.table === days);
    expect(dayUpdates).toHaveLength(2);
    expect(dayUpdates[0].values).toEqual(expect.objectContaining({ dayNumber: 1, date: "2026-08-01", label: "Day 1" }));
    expect(dayUpdates[1].values).toEqual(expect.objectContaining({ dayNumber: 2, date: "2026-08-02", label: "Day 2" }));
    const tripUpdate = operations.updates.find((entry) => entry.table === trips);
    expect(tripUpdate?.values).toEqual(expect.objectContaining({ startDate: "2026-08-01", endDate: "2026-08-02" }));
    expect(operations.inserts).toHaveLength(0);
  });

  it("appends blank days when the new date range is longer than existing dateless days (AC12)", async () => {
    const { operations, transaction } = createTransactionMock({
      tripRow: { id: "trip-1", startDate: null, endDate: null },
      existingDays: [{ id: "day-1", tripId: "trip-1", dayNumber: 1, date: null, label: "Day 1" }],
    });
    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    const result = await updateTripMetadata("trip-1", {
      startDate: "2026-08-01",
      endDate: "2026-08-03",
    });

    expect(result).toEqual({ status: "saved" });
    expect(recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user-1", "trip-1");
    const dayUpdates = operations.updates.filter((entry) => entry.table === days);
    expect(dayUpdates).toHaveLength(1);
    expect(dayUpdates[0].values).toEqual(expect.objectContaining({ dayNumber: 1, date: "2026-08-01", label: "Day 1" }));
    const dayInserts = operations.inserts.filter((entry) => entry.table === days);
    expect(dayInserts).toHaveLength(1);
    const insertedRows = dayInserts[0].values as Array<{ date: string }>;
    expect(insertedRows).toHaveLength(2);
    expect(insertedRows[0].date).toBe("2026-08-02");
    expect(insertedRows[1].date).toBe("2026-08-03");
  });

  it("uses day labels when dateless overflow requires confirmation", async () => {
    const { operations, transaction } = createTransactionMock({
      tripRow: { id: "trip-1", startDate: null, endDate: null },
      existingDays: [
        { id: "day-1", tripId: "trip-1", dayNumber: 1, date: null, label: "Day 1" },
        { id: "day-2", tripId: "trip-1", dayNumber: 2, date: null, label: "Day 2" },
        { id: "day-3", tripId: "trip-1", dayNumber: 3, date: null, label: "Day 3" },
      ],
      removedEvents: [{ id: "event-1", name: "Dinner", dayId: "day-3", position: 0 }],
    });
    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    const result = await updateTripMetadata("trip-1", {
      startDate: "2026-08-01",
      endDate: "2026-08-02",
    });

    expect(recordTripUpdated).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "confirmation-required",
      confirmation: {
        removedDates: [],
        removedDayLabels: ["Day 3"],
        events: [{ id: "event-1", name: "Dinner", displacedDate: undefined, docCount: 0 }],
        noteCount: 0,
        checklistCount: 0,
        eventDocumentCount: 0,
      },
    });
    expect(operations.deletes).toEqual([]);
    expect(operations.updates).toEqual([]);
  });

  it("preserves day rows as dateless when dates are cleared from a scheduled trip (AC13)", async () => {
    const { operations, transaction } = createTransactionMock({
      existingDays: [
        { id: "day-1", tripId: "trip-1", dayNumber: 1, date: "2026-08-01", label: "Day 1" },
        { id: "day-2", tripId: "trip-1", dayNumber: 2, date: "2026-08-02", label: "Day 2" },
      ],
    });
    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    const result = await updateTripMetadata("trip-1", { startDate: null, endDate: null });

    expect(result).toEqual({ status: "saved" });
    expect(recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user-1", "trip-1");
    expect(operations.deletes).toHaveLength(0);
    const dayUpdates = operations.updates.filter((entry) => entry.table === days);
    expect(dayUpdates).toHaveLength(1);
    expect(dayUpdates[0].values).toEqual({ date: null });
    const tripUpdate = operations.updates.find((entry) => entry.table === trips);
    expect(tripUpdate?.values).toEqual(expect.objectContaining({ startDate: null, endDate: null }));
  });

  it("updates only trip metadata (no day mutations) when editing a dateless trip without providing dates", async () => {
    const { operations, transaction } = createTransactionMock({
      tripRow: { id: "trip-1", startDate: null, endDate: null },
      existingDays: [{ id: "day-1", tripId: "trip-1", dayNumber: 1, date: null, label: "Day 1" }],
    });
    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    const result = await updateTripMetadata("trip-1", { name: "Renamed Dateless Trip" });

    expect(result).toEqual({ status: "saved" });
    expect(recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user-1", "trip-1");
    expect(operations.deletes).toHaveLength(0);
    const dayUpdates = operations.updates.filter((entry) => entry.table === days);
    expect(dayUpdates).toHaveLength(0);
    const tripUpdate = operations.updates.find((entry) => entry.table === trips);
    expect(tripUpdate?.values).toEqual(expect.objectContaining({ name: "Renamed Dateless Trip", startDate: null }));
  });

  function makeExpenseRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "expense-1",
      tripId: "trip-1",
      eventId: null,
      reservationId: null,
      category: "food",
      amount: "50",
      currency: "EUR",
      convertedAmountTrip: null,
      conversionRateTrip: null,
      convertedCurrencyTrip: null,
      convertedAmountProfile: null,
      conversionRateProfile: null,
      convertedCurrencyProfile: null,
      date: "2026-08-01",
      note: null,
      createdAt: null,
      updatedAt: null,
      ...overrides,
    };
  }

  it("does not recalculate expenses when convertCurrency is omitted (Leave As Is)", async () => {
    const { operations, transaction } = createTransactionMock({
      existingDays: [
        { id: "day-1", tripId: "trip-1", dayNumber: 1, date: "2026-08-01", label: "Day 1" },
        { id: "day-2", tripId: "trip-1", dayNumber: 2, date: "2026-08-02", label: "Day 2" },
      ],
      expenseRows: [makeExpenseRow({ currency: "EUR" })],
    });
    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    const result = await updateTripMetadata("trip-1", { budgetCurrency: "USD" });

    expect(result).toEqual({ status: "saved" });
    expect(recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user-1", "trip-1");
    expect(recalculateAll).not.toHaveBeenCalled();
    expect(operations.updates.some((entry) => entry.table === expenses)).toBe(false);
    const tripUpdate = operations.updates.find((entry) => entry.table === trips);
    expect(tripUpdate?.values).toEqual(expect.objectContaining({ budgetCurrency: "USD" }));
  });

  it("does not recalculate expenses when convertCurrency is true but budgetCurrency is unchanged", async () => {
    const { operations, transaction } = createTransactionMock({
      existingDays: [
        { id: "day-1", tripId: "trip-1", dayNumber: 1, date: "2026-08-01", label: "Day 1" },
        { id: "day-2", tripId: "trip-1", dayNumber: 2, date: "2026-08-02", label: "Day 2" },
      ],
      expenseRows: [makeExpenseRow({ currency: "EUR" })],
    });
    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    const result = await updateTripMetadata("trip-1", { name: "Renamed" }, undefined, undefined, true);

    expect(result).toEqual({ status: "saved" });
    expect(recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user-1", "trip-1");
    expect(recalculateAll).not.toHaveBeenCalled();
    expect(operations.updates.some((entry) => entry.table === expenses)).toBe(false);
  });

  it("recalculates and persists mismatched expense conversions when convertCurrency is true (Convert)", async () => {
    const { operations, transaction } = createTransactionMock({
      existingDays: [
        { id: "day-1", tripId: "trip-1", dayNumber: 1, date: "2026-08-01", label: "Day 1" },
        { id: "day-2", tripId: "trip-1", dayNumber: 2, date: "2026-08-02", label: "Day 2" },
      ],
      expenseRows: [makeExpenseRow({ id: "expense-1", currency: "EUR" })],
    });
    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );
    recalculateAll.mockResolvedValue([{ expenseId: "expense-1", convertedAmount: 54, rate: 1.08 }]);

    const result = await updateTripMetadata("trip-1", { budgetCurrency: "USD" }, undefined, undefined, true);

    expect(result).toEqual({ status: "saved" });
    expect(recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user-1", "trip-1");
    expect(recalculateAll).toHaveBeenCalledWith(
      [expect.objectContaining({ id: "expense-1", currency: "EUR", amount: 50 })],
      "USD"
    );
    const expenseUpdate = operations.updates.find((entry) => entry.table === expenses);
    expect(expenseUpdate?.values).toEqual(
      expect.objectContaining({
        convertedAmountTrip: "54",
        conversionRateTrip: "1.08",
        convertedCurrencyTrip: "USD",
        updatedAt: expect.any(Date),
      })
    );
    const tripUpdate = operations.updates.find((entry) => entry.table === trips);
    expect(tripUpdate?.values).toEqual(expect.objectContaining({ budgetCurrency: "USD" }));
  });

  it("rolls back the currency change when recalculation fails (all-or-nothing)", async () => {
    const { operations, transaction } = createTransactionMock({
      existingDays: [
        { id: "day-1", tripId: "trip-1", dayNumber: 1, date: "2026-08-01", label: "Day 1" },
        { id: "day-2", tripId: "trip-1", dayNumber: 2, date: "2026-08-02", label: "Day 2" },
      ],
      expenseRows: [makeExpenseRow({ id: "expense-1", currency: "EUR" })],
    });
    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );
    recalculateAll.mockRejectedValue(new Error("Currency conversion failed (HTTP 503)."));

    await expect(updateTripMetadata("trip-1", { budgetCurrency: "USD" }, undefined, undefined, true)).rejects.toThrow(
      "Currency conversion failed (HTTP 503)."
    );

    expect(operations.updates.some((entry) => entry.table === trips)).toBe(false);
    expect(operations.updates.some((entry) => entry.table === expenses)).toBe(false);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("records the removed events and days so a retried create cannot bring them back", async () => {
    const { transaction } = createTransactionMock({
      existingDays: [
        { id: "day-1", tripId: "trip-1", dayNumber: 1, date: "2026-08-01", label: "Day 1" },
        { id: "day-2", tripId: "trip-1", dayNumber: 2, date: "2026-08-02", label: "Day 2" },
      ],
      removedEvents: [{ id: "event-1", name: "Dinner", dayId: "day-2", position: 0 }],
    });
    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    await expect(
      updateTripMetadata(
        "trip-1",
        { startDate: "2026-08-01", endDate: "2026-08-01" },
        TripDateConflictResolution.DeleteEvents,
        {
          removedDates: ["2026-08-02"],
          removedDayLabels: undefined,
          events: [{ id: "event-1", name: "Dinner", displacedDate: "2026-08-02", docCount: 0 }],
          noteCount: 0,
          checklistCount: 0,
          eventDocumentCount: 0,
        }
      )
    ).resolves.toEqual({ status: "saved" });

    expect(recordDeletions).toHaveBeenCalledWith(transaction, "event", ["event-1"], "user-1");
    expect(recordDeletions).toHaveBeenCalledWith(transaction, "day", ["day-2"], "user-1");
  });

  it("records the overflow days and their deleted events when dateless days no longer fit", async () => {
    const { transaction } = createTransactionMock({
      tripRow: { id: "trip-1", startDate: null, endDate: null },
      existingDays: [
        { id: "day-1", tripId: "trip-1", dayNumber: 1, date: null, label: "Day 1" },
        { id: "day-2", tripId: "trip-1", dayNumber: 2, date: null, label: "Day 2" },
        { id: "day-3", tripId: "trip-1", dayNumber: 3, date: null, label: "Day 3" },
      ],
      removedEvents: [{ id: "event-1", name: "Dinner", dayId: "day-3", position: 0 }],
    });
    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    await expect(
      updateTripMetadata("trip-1", { startDate: "2026-08-01", endDate: "2026-08-02" }, "delete-events", {
        removedDates: [],
        removedDayLabels: ["Day 3"],
        events: [{ id: "event-1", name: "Dinner", displacedDate: undefined, docCount: 0 }],
        noteCount: 0,
        checklistCount: 0,
        eventDocumentCount: 0,
      })
    ).resolves.toEqual({ status: "saved" });

    expect(recordDeletions).toHaveBeenCalledWith(transaction, "event", ["event-1"], "user-1");
    expect(recordDeletions).toHaveBeenCalledWith(transaction, "day", ["day-3"], "user-1");
  });

  it("records only the removed days when the events are kept as unscheduled", async () => {
    const { transaction } = createTransactionMock({
      existingDays: [
        { id: "day-1", tripId: "trip-1", dayNumber: 1, date: "2026-08-01", label: "Day 1" },
        { id: "day-2", tripId: "trip-1", dayNumber: 2, date: "2026-08-02", label: "Day 2" },
      ],
      removedEvents: [{ id: "event-1", name: "Dinner", dayId: "day-2", position: 0 }],
    });
    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    await updateTripMetadata(
      "trip-1",
      { startDate: "2026-08-01", endDate: "2026-08-01" },
      TripDateConflictResolution.KeepAsUnscheduled,
      {
        removedDates: ["2026-08-02"],
        removedDayLabels: undefined,
        events: [{ id: "event-1", name: "Dinner", displacedDate: "2026-08-02", docCount: 0 }],
        noteCount: 0,
        checklistCount: 0,
        eventDocumentCount: 0,
      }
    );

    expect(recordDeletions).toHaveBeenCalledExactlyOnceWith(transaction, "day", ["day-2"], "user-1");
  });
});

describe("createTrip", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
    requireUser.mockResolvedValue({
      id: "user-1",
      name: "Test User",
    });
    getStorageAdapter.mockReturnValue({ put: adapterPut, del: adapterDel });
    adapterPut.mockResolvedValue("https://blob.vercel.com/mapbox-covers/trip-1.jpg");
    adapterDel.mockResolvedValue(undefined);
  });

  afterEach(() => {
    db.select.mockReset();
    db.transaction.mockReset();
    db.update.mockReset();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("does not record a rolled-back creation", async () => {
    db.transaction.mockRejectedValueOnce(new Error("transaction failed"));
    await expect(createTrip({ name: "Private trip" })).rejects.toThrow("transaction failed");
    expect(recordTripCreated).not.toHaveBeenCalled();
  });

  it.each([
    [{ name: "" }, "Trip name is required."],
    [{ name: "   " }, "Trip name is required."],
    [{ name: "x".repeat(101) }, "Trip name must be 100 characters or fewer."],
    [{ name: "Tokyo", notes: "x".repeat(5001) }, "Notes must be 5000 characters or fewer."],
    [{ name: "Tokyo", destinationName: "x".repeat(201) }, "Destination must be 200 characters or fewer."],
    [{ name: "Tokyo", tags: ["x".repeat(31)] }, "Tag must be 30 characters or fewer."],
    [{ name: "Tokyo", startDate: "2026-99-99" }, "Invalid start date format. Expected YYYY-MM-DD."],
    [{ name: "Tokyo", endDate: "2026-02-30" }, "Invalid end date format. Expected YYYY-MM-DD."],
    [{ name: "Tokyo", budgetTotal: -5 }, "Budget must be 0 or more."],
    [{ name: "Tokyo", budgetTotal: Number.NaN }, "Budget must be a number."],
  ])("rejects invalid input %j before inserting a trip", async (input, message) => {
    const operations = setupCreateTripDb(null);

    await expect(createTrip(input)).rejects.toThrow(message);
    expect(operations.inserts).toHaveLength(0);
  });

  it("rejects unsupported budget currencies before inserting a trip", async () => {
    const operations = setupCreateTripDb(null);

    await expect(createTrip({ name: "Tokyo", budgetCurrency: "zzz" })).rejects.toThrow("Invalid budget currency");
    expect(operations.inserts).toHaveLength(0);
  });

  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "//evil.example/pixel.png",
    "/api/storage/trip-covers/trip-1/abc.jpg",
  ])("rejects cover URL %j before inserting a trip", async (coverImageUrl) => {
    const operations = setupCreateTripDb(null);

    await expect(createTrip({ name: "Tokyo", coverImageUrl })).rejects.toThrow("Invalid cover image URL.");
    expect(operations.inserts).toHaveLength(0);
  });

  function setupCreateTripDb(
    defaultCoverType: string | null,
    transitMode: string | null = null,
    currency: string | null = "USD"
  ) {
    const operations = {
      inserts: [] as Array<{ table: unknown; values: unknown }>,
      updates: [] as Array<{ table: unknown; values: unknown }>,
    };
    const createdTrip = { id: "trip-1" };
    const transaction = {
      select: () => ({
        from: () => ({
          where: () => ({
            for: async () => [{ id: "user-1", username: "test", name: "Test User", currency, transitMode }],
          }),
        }),
      }),
      insert: (table: unknown) => ({
        values: (values: unknown) => {
          operations.inserts.push({ table, values });
          if (table === trips) {
            return {
              returning: async () => [createdTrip],
            };
          }
          return undefined;
        },
      }),
    };

    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );
    db.select.mockReturnValueOnce({
      from: () => ({
        where: async () => [{ defaultCoverType }],
      }),
    });
    db.update.mockImplementation((table: unknown) => ({
      set: (values: unknown) => ({
        where: async () => {
          operations.updates.push({ table, values });
        },
      }),
    }));

    return operations;
  }

  it("seeds trip transit mode from the user's global preference when input does not specify one", async () => {
    const operations = setupCreateTripDb(null, "walk");

    await expect(createTrip({ name: "Test" })).resolves.toEqual({ tripId: "trip-1" });
    expect(recordTripCreated).toHaveBeenCalledExactlyOnceWith({ id: "user-1", username: "test" }, "trip-1");

    expect(operations.inserts).toContainEqual({
      table: trips,
      values: expect.objectContaining({ transitMode: "walk" }),
    });
  });

  it("defaults to drive when both input and user preference are null", async () => {
    const operations = setupCreateTripDb(null);

    await expect(createTrip({ name: "Test" })).resolves.toEqual({ tripId: "trip-1" });
    expect(recordTripCreated).toHaveBeenCalledExactlyOnceWith({ id: "user-1", username: "test" }, "trip-1");

    expect(operations.inserts).toContainEqual({
      table: trips,
      values: expect.objectContaining({ transitMode: "drive" }),
    });
  });

  it("reads transit mode and currency from inside the transaction, not from a pre-transaction snapshot", async () => {
    const lockPreferenceRowSpy = vi.fn(async () => [
      { id: "user-1", username: "test", name: "Test User", currency: "EUR", transitMode: "transit" },
    ]);
    const transactionSelectSpy = vi.fn(() => ({
      from: () => ({
        where: () => ({ for: lockPreferenceRowSpy }),
      }),
    }));
    const createdTrip = { id: "trip-1" };
    const insertedRows: Array<{ table: unknown; values: unknown }> = [];
    const transaction = {
      select: transactionSelectSpy,
      insert: (table: unknown) => ({
        values: (values: unknown) => {
          insertedRows.push({ table, values });
          if (table === trips) {
            return { returning: async () => [createdTrip] };
          }
          return undefined;
        },
      }),
    };
    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );
    db.select.mockReturnValueOnce({
      from: () => ({
        where: async () => [{ defaultCoverType: null }],
      }),
    });
    db.update.mockImplementation(() => ({
      set: () => ({
        where: async () => {},
      }),
    }));

    await expect(createTrip({ name: "Test" })).resolves.toEqual({ tripId: "trip-1" });
    expect(recordTripCreated).toHaveBeenCalledExactlyOnceWith({ id: "user-1", username: "test" }, "trip-1");

    expect(transactionSelectSpy).toHaveBeenCalledTimes(1);
    expect(lockPreferenceRowSpy).toHaveBeenCalledWith("update");
    expect(insertedRows).toContainEqual({
      table: trips,
      values: expect.objectContaining({ transitMode: "transit", budgetCurrency: "EUR" }),
    });
  });

  it("uses input transit mode over the user preference when explicitly provided", async () => {
    const operations = setupCreateTripDb(null, "walk");

    await expect(createTrip({ name: "Test", transitMode: "transit" })).resolves.toEqual({ tripId: "trip-1" });

    expect(operations.inserts).toContainEqual({
      table: trips,
      values: expect.objectContaining({ transitMode: "transit" }),
    });
  });

  it("falls back to drive when the user's stored transit mode is not a valid TransitMode value", async () => {
    const operations = setupCreateTripDb(null, "bicycle");

    await expect(createTrip({ name: "Test" })).resolves.toEqual({ tripId: "trip-1" });
    expect(recordTripCreated).toHaveBeenCalledExactlyOnceWith({ id: "user-1", username: "test" }, "trip-1");

    expect(operations.inserts).toContainEqual({
      table: trips,
      values: expect.objectContaining({ transitMode: "drive" }),
    });
  });

  it("defaults trip budget currency from the user's preferred currency", async () => {
    const operations = setupCreateTripDb(null);

    await expect(
      createTrip({
        name: "Paris Trip",
        budgetTotal: 1500,
      })
    ).resolves.toEqual({ tripId: "trip-1" });

    expect(operations.inserts).toContainEqual({
      table: trips,
      values: expect.objectContaining({
        budgetCurrency: "USD",
        budgetTotal: "1500",
      }),
    });
  });

  it("falls back to locale-derived currency when the user preference is null", async () => {
    vi.mocked(headers).mockResolvedValueOnce(new Headers({ "accept-language": "en-GB,en;q=0.9" }));
    const operations = setupCreateTripDb(null, null, null);

    await expect(
      createTrip({
        name: "London Trip",
        budgetTotal: 200,
      })
    ).resolves.toEqual({ tripId: "trip-1" });

    expect(operations.inserts).toContainEqual({
      table: trips,
      values: expect.objectContaining({
        budgetCurrency: "GBP",
        budgetTotal: "200",
      }),
    });
  });

  it("stores destination fields and applies the first Unsplash cover when the default is photo", async () => {
    const search = vi.spyOn(coverSearch, "searchCoverImages");
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "test-unsplash-key");
    const operations = setupCreateTripDb(null);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            id: "img-1",
            urls: { regular: "https://images.example/paris.jpg" },
            user: { name: "Photographer", links: { html: "https://unsplash.com/@photographer" } },
            alt_description: "Paris skyline",
            description: null,
          },
        ],
      }),
    });

    await expect(
      createTrip({
        name: "Paris Trip",
        destinationName: "Paris, France",
        destinationCountry: "France",
        destinationCountryCode: "FR",
        destinationCenter: [2.35, 48.85],
      })
    ).resolves.toEqual({ tripId: "trip-1" });

    expect(operations.inserts).toEqual(
      expect.arrayContaining([
        {
          table: trips,
          values: expect.objectContaining({
            destinationName: "Paris, France",
            destinationCountry: "France",
            destinationCountryCode: "FR",
          }),
        },
        {
          table: collaborators,
          values: expect.objectContaining({
            tripId: "trip-1",
            role: "manager",
            isCreator: true,
          }),
        },
      ])
    );
    expect(search).toHaveBeenCalledWith({ userId: "user-1" }, "Paris, France");
    expect(assertWithinRateLimit).toHaveBeenCalledWith("unsplashSearch", "user-1");
    search.mockRestore();
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(operations.updates).toEqual([
      {
        table: trips,
        values: {
          coverImageUrl: "https://images.example/paris.jpg",
          coverPhotographer: "Photographer",
          coverPhotographerUrl: "https://unsplash.com/@photographer",
        },
      },
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/trips");
  });

  it("applies the first stub photo through the service using its caller actor", async () => {
    vi.stubEnv("E2E_UNSPLASH_STUB", "true");
    const search = vi.spyOn(coverSearch, "searchCoverImages");
    const operations = setupCreateTripDb("photo");
    await expect(createTrip({ name: "Paris", destinationName: "Paris" })).resolves.toEqual({ tripId: "trip-1" });
    expect(search).toHaveBeenCalledWith({ userId: "user-1" }, "Paris");
    expect(operations.updates).toEqual([
      {
        table: trips,
        values: {
          coverImageUrl: expect.stringContaining("data:image/svg+xml"),
          coverPhotographer: "Stub Photographer 1",
          coverPhotographerUrl: "https://unsplash.com/@stub-photographer-1",
        },
      },
    ]);
    expect(assertWithinRateLimit).not.toHaveBeenCalledWith("unsplashSearch", expect.anything());
    expect(mockFetch).not.toHaveBeenCalled();
    search.mockRestore();
  });

  it("fetches the Mapbox static tile server-side and stores the adapter URL when the default is map", async () => {
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "mapbox-token");
    vi.spyOn(crypto, "randomUUID").mockReturnValue("cover-1234");
    const operations = setupCreateTripDb("map");
    const fakeBlob = new Blob(["png-bytes"], { type: "image/jpeg" });
    mockFetch.mockResolvedValue({ ok: true, blob: async () => fakeBlob });

    await expect(
      createTrip({
        name: "Map Trip",
        destinationName: "Paris, France",
        destinationCenter: [2.3488, 48.8534],
      })
    ).resolves.toEqual({ tripId: "trip-1" });

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/static/2.3488,48.8534,10/600x400@2x?access_token=mapbox-token"
    );
    expect(adapterPut).toHaveBeenCalledWith("trip-covers/trip-1/cover-1234.jpg", expect.any(File));
    expect(operations.updates).toEqual([
      {
        table: trips,
        values: { coverImageUrl: "https://blob.vercel.com/mapbox-covers/trip-1.jpg" },
      },
    ]);
  });

  it("derives a graphic cover without calling external APIs when the default is graphic", async () => {
    const operations = setupCreateTripDb("graphic");

    await expect(
      createTrip({
        name: "Road Trip",
        destinationName: "Paris, France",
      })
    ).resolves.toEqual({ tripId: "trip-1" });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(operations.updates).toEqual([
      {
        table: trips,
        values: { coverImageUrl: deriveGraphicCover("Road Trip") },
      },
    ]);
  });

  it("swallows cover lookup failures and still completes trip creation", async () => {
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "test-unsplash-key");
    const operations = setupCreateTripDb("photo");
    mockFetch.mockRejectedValue(new Error("Unsplash unavailable"));

    await expect(
      createTrip({
        name: "Fallback Trip",
        destinationName: "Paris, France",
      })
    ).resolves.toEqual({ tripId: "trip-1" });

    expect(operations.updates).toEqual([]);
    expect(revalidatePath).toHaveBeenCalledWith("/trips");
  });

  it("applies graphic cover without loading user preference when no destination is selected (AC6)", async () => {
    const operations = setupCreateTripDb(null);

    await expect(
      createTrip({
        name: "No Destination Trip",
      })
    ).resolves.toEqual({ tripId: "trip-1" });

    expect(db.select).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(operations.updates).toEqual([
      { table: trips, values: { coverImageUrl: deriveGraphicCover("No Destination Trip") } },
    ]);
  });

  it("applies graphic cover preference when trip has coordinates but no destination name", async () => {
    const operations = setupCreateTripDb("graphic");

    await expect(
      createTrip({
        name: "Coordinates Trip",
        destinationCenter: [2.35, 48.85],
      })
    ).resolves.toEqual({ tripId: "trip-1" });

    expect(db.select).toHaveBeenCalledOnce();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(operations.updates).toEqual([
      { table: trips, values: { coverImageUrl: deriveGraphicCover("Coordinates Trip") } },
    ]);
  });

  it("inserts exactly one dateless Day 1 when no dates are provided", async () => {
    const operations = setupCreateTripDb(null);

    await expect(
      createTrip({
        name: "No Date Trip",
      })
    ).resolves.toEqual({ tripId: "trip-1" });

    const dayInserts = operations.inserts.filter((entry) => entry.table === days);
    expect(dayInserts).toHaveLength(1);
    expect(dayInserts[0].values).toEqual(
      expect.objectContaining({ tripId: "trip-1", dayNumber: 1, date: null, label: "Day 1" })
    );
  });

  it("inserts scheduled day rows (not a dateless row) when dates are provided", async () => {
    const operations = setupCreateTripDb(null);

    await expect(
      createTrip({
        name: "Dated Trip",
        startDate: "2026-08-01",
        endDate: "2026-08-02",
      })
    ).resolves.toEqual({ tripId: "trip-1" });

    const dayInserts = operations.inserts.filter((entry) => entry.table === days);
    expect(dayInserts).toHaveLength(1);
    const rows = dayInserts[0].values as Array<{ date: string }>;
    expect(rows).toHaveLength(2);
    expect(rows[0].date).toBe("2026-08-01");
    expect(rows[1].date).toBe("2026-08-02");
  });
});

describe("searchLocations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "test-mapbox-token");
    requireUser.mockResolvedValue({ id: "user-1" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("maps Search Box API response to the action return shape", async () => {
    mockSearchBoxSuggest.mockResolvedValue({
      suggestions: [
        {
          name: "Tokyo",
          place_formatted: "Tokyo, Japan",
          full_address: "Tokyo, Tokyo, Japan",
          mapbox_id: "dXJuOm1hcGJveA==",
          context: { country: { name: "Japan", country_code: "JP" } },
        },
      ],
    });

    await expect(searchLocations("Tokyo", "test-session-token")).resolves.toEqual([
      {
        placeName: "Tokyo, Japan",
        country: "Japan",
        countryCode: "JP",
        mapboxId: "dXJuOm1hcGJveA==",
      },
    ]);
    expect(requireUser).toHaveBeenCalled();
    expect(mockSearchBoxSuggest).toHaveBeenCalledWith("Tokyo", expect.objectContaining({ limit: 5 }));
  });

  it("includes place when it differs from the feature name (neighborhood)", async () => {
    mockSearchBoxSuggest.mockResolvedValue({
      suggestions: [
        {
          name: "10th arrondissement",
          place_formatted: "Paris, Île-de-France, France",
          full_address: "10th arrondissement, Paris, Île-de-France, France",
          mapbox_id: "abc",
          context: {
            place: { name: "Paris" },
            country: { name: "France", country_code: "FR" },
          },
        },
      ],
    });

    const result = await searchLocations("10th arrondissement", "sess");
    expect(result[0].placeName).toBe("10th arrondissement, Paris, France");
  });

  it("includes the region (state) between name and country", async () => {
    mockSearchBoxSuggest.mockResolvedValue({
      suggestions: [
        {
          name: "Heber City",
          place_formatted: "Utah, United States",
          full_address: "Heber City, Utah, United States",
          mapbox_id: "abc",
          context: {
            region: { name: "Utah", region_code: "UT" },
            country: { name: "United States", country_code: "US" },
          },
        },
      ],
    });

    const result = await searchLocations("Heber", "sess");
    expect(result[0].placeName).toBe("Heber City, Utah, United States");
  });

  it("does not duplicate the region when it matches the place", async () => {
    mockSearchBoxSuggest.mockResolvedValue({
      suggestions: [
        {
          name: "Brooklyn",
          place_formatted: "New York, New York, United States",
          full_address: "Brooklyn, New York, New York, United States",
          mapbox_id: "abc",
          context: {
            place: { name: "New York" },
            region: { name: "New York", region_code: "NY" },
            country: { name: "United States", country_code: "US" },
          },
        },
      ],
    });

    const result = await searchLocations("Brooklyn", "sess");
    expect(result[0].placeName).toBe("Brooklyn, New York, United States");
  });

  it("returns only the country when feature name matches place and country", async () => {
    mockSearchBoxSuggest.mockResolvedValue({
      suggestions: [
        {
          name: "France",
          place_formatted: "",
          full_address: "",
          mapbox_id: "abc",
          context: {
            country: { name: "France", country_code: "FR" },
          },
        },
      ],
    });

    const result = await searchLocations("France", "sess");
    expect(result[0].placeName).toBe("France");
  });

  it("returns only name when context is empty", async () => {
    mockSearchBoxSuggest.mockResolvedValue({
      suggestions: [
        {
          name: "Tokyo",
          place_formatted: "Tokyo, Japan",
          full_address: "",
          mapbox_id: "abc",
          context: {},
        },
      ],
    });

    const result = await searchLocations("Tokyo", "sess");
    expect(result[0].placeName).toBe("Tokyo");
  });

  it("throws when the Mapbox token is missing", async () => {
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "");

    await expect(searchLocations("Tokyo", "sess")).rejects.toThrow("MAPBOX_ACCESS_TOKEN is not configured");
    expect(requireUser).not.toHaveBeenCalled();
    expect(mockSearchBoxSuggest).not.toHaveBeenCalled();
  });

  it("returns the deterministic E2E stub suggestion when configured", async () => {
    vi.stubEnv("E2E_MAPBOX_STUB", "true");
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "");

    await expect(searchLocations("Par", "sess")).resolves.toEqual([
      {
        placeName: "Paris, France",
        country: "France",
        countryCode: "FR",
        mapboxId: "stub-paris-id",
      },
    ]);
    expect(mockSearchBoxSuggest).not.toHaveBeenCalled();
  });

  it("throws when query is empty", async () => {
    await expect(searchLocations("  ", "sess")).rejects.toThrow("Search query must not be empty");
    expect(requireUser).not.toHaveBeenCalled();
    expect(mockSearchBoxSuggest).not.toHaveBeenCalled();
  });

  it("throws when suggest network request fails", async () => {
    mockSearchBoxSuggest.mockRejectedValue(new Error("Network failure"));

    await expect(searchLocations("Tokyo", "sess")).rejects.toThrow("Location search failed: Network failure");
  });

  it("returns empty array when suggestions are empty", async () => {
    mockSearchBoxSuggest.mockResolvedValue({ suggestions: [] });

    await expect(searchLocations("Tokyo", "sess")).resolves.toEqual([]);
  });
});

describe("searchAddressLocations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "test-mapbox-token");
    requireUser.mockResolvedValue({ id: "user-1" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("maps Search Box suggest results to address lookup suggestions", async () => {
    mockSearchBoxSuggest.mockResolvedValue({
      suggestions: [
        {
          name: "Tokyo Tower",
          full_address: "4 Chome-2-8 Shibakoen, Minato City, Tokyo, Japan",
          mapbox_id: "tokyo-tower-id",
        },
        {
          name: "Paris",
          place_formatted: "Paris, France",
          context: { country: { name: "France", country_code: "FR" } },
          mapbox_id: "paris-id",
        },
      ],
    });

    await expect(searchAddressLocations("Tok", "sess")).resolves.toEqual([
      {
        name: "Tokyo Tower",
        fullAddress: "4 Chome-2-8 Shibakoen, Minato City, Tokyo, Japan",
        mapboxId: "tokyo-tower-id",
      },
      {
        name: "Paris",
        fullAddress: "Paris, France",
        mapboxId: "paris-id",
      },
    ]);
    expect(requireUser).toHaveBeenCalled();
  });

  it("returns the E2E stub lookup suggestion when configured", async () => {
    vi.stubEnv("E2E_MAPBOX_STUB", "true");
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "");

    await expect(searchAddressLocations("Par", "sess")).resolves.toEqual([
      {
        name: "Paris",
        fullAddress: "Paris, France",
        mapboxId: "stub-paris-id",
        resolvedLocation: {
          name: "Paris",
          fullAddress: "Paris, France",
          placeName: "Paris, France",
          country: "France",
          countryCode: "FR",
          center: [2.3488, 48.8534],
        },
      },
    ]);
    expect(mockSearchBoxSuggest).not.toHaveBeenCalled();
  });

  it("throws when the query is empty", async () => {
    await expect(searchAddressLocations("  ", "sess")).rejects.toThrow("Search query must not be empty");
    expect(requireUser).not.toHaveBeenCalled();
  });

  it("throws when the Mapbox token is missing", async () => {
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "");

    await expect(searchAddressLocations("Tokyo", "sess")).rejects.toThrow("MAPBOX_ACCESS_TOKEN is not configured");
    expect(requireUser).not.toHaveBeenCalled();
  });
});

describe("retrieveLocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "test-mapbox-token");
    requireUser.mockResolvedValue({ id: "user-1" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("maps Search Box retrieve response to RetrievedLocation", async () => {
    mockSearchBoxRetrieve.mockResolvedValue({
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [139.69, 35.68] },
          properties: {
            name: "Tokyo",
            place_formatted: "Tokyo, Japan",
            full_address: "Tokyo, Tokyo, Japan",
            context: { country: { name: "Japan", country_code: "JP" } },
          },
        },
      ],
    });

    await expect(retrieveLocation("dXJuOm1hcGJveA==", "test-session-token")).resolves.toEqual({
      name: "Tokyo",
      fullAddress: "Tokyo, Tokyo, Japan",
      placeName: "Tokyo, Japan",
      country: "Japan",
      countryCode: "JP",
      center: [139.69, 35.68],
    });
    expect(requireUser).toHaveBeenCalled();
  });

  it("includes place in placeName for neighborhood results", async () => {
    mockSearchBoxRetrieve.mockResolvedValue({
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [2.35, 48.86] },
          properties: {
            name: "10th arrondissement",
            place_formatted: "Paris, Île-de-France, France",
            full_address: "10th arrondissement, Paris, Île-de-France, France",
            context: {
              place: { name: "Paris" },
              country: { name: "France", country_code: "FR" },
            },
          },
        },
      ],
    });

    await expect(retrieveLocation("some-id", "sess")).resolves.toEqual({
      name: "10th arrondissement",
      fullAddress: "10th arrondissement, Paris, Île-de-France, France",
      placeName: "10th arrondissement, Paris, France",
      country: "France",
      countryCode: "FR",
      center: [2.35, 48.86],
    });
  });

  it("includes the region (state) in placeName", async () => {
    mockSearchBoxRetrieve.mockResolvedValue({
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [-111.41, 40.51] },
          properties: {
            name: "Heber City",
            place_formatted: "Utah, United States",
            full_address: "Heber City, Utah, United States",
            context: {
              region: { name: "Utah", region_code: "UT" },
              country: { name: "United States", country_code: "US" },
            },
          },
        },
      ],
    });

    await expect(retrieveLocation("some-id", "sess")).resolves.toEqual({
      name: "Heber City",
      fullAddress: "Heber City, Utah, United States",
      placeName: "Heber City, Utah, United States",
      country: "United States",
      countryCode: "US",
      center: [-111.41, 40.51],
    });
  });

  it("returns the E2E stub location when configured", async () => {
    vi.stubEnv("E2E_MAPBOX_STUB", "true");
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "");

    await expect(retrieveLocation("stub-paris-id", "sess")).resolves.toEqual({
      name: "Paris",
      fullAddress: "Paris, France",
      placeName: "Paris, France",
      country: "France",
      countryCode: "FR",
      center: [2.3488, 48.8534],
    });
    expect(mockSearchBoxRetrieve).not.toHaveBeenCalled();
  });

  it("throws when the Mapbox token is missing", async () => {
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "");

    await expect(retrieveLocation("some-id", "sess")).rejects.toThrow("MAPBOX_ACCESS_TOKEN is not configured");
    expect(requireUser).not.toHaveBeenCalled();
  });

  it("throws when mapboxId is empty", async () => {
    await expect(retrieveLocation("", "sess")).rejects.toThrow("mapboxId is required");
    expect(requireUser).not.toHaveBeenCalled();
  });

  it("throws when no feature is returned", async () => {
    mockSearchBoxRetrieve.mockResolvedValue({ features: [] });

    await expect(retrieveLocation("some-id", "sess")).rejects.toThrow("No feature returned from retrieve");
  });

  it("throws when retrieve network request fails", async () => {
    mockSearchBoxRetrieve.mockRejectedValue(new Error("Network failure"));

    await expect(retrieveLocation("some-id", "sess")).rejects.toThrow("Location retrieve failed: Network failure");
  });
});

describe("packing action delegation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    addPackingItemAction.mockResolvedValue(undefined);
    saveTripListAsTemplateAction.mockResolvedValue({ templateId: "tmpl-new" });
  });

  it("delegates to packing-actions with the same arguments", async () => {
    await expect(saveTripListAsTemplate("trip-1", "My Template", "idem-1")).resolves.toEqual({
      templateId: "tmpl-new",
    });

    expect(saveTripListAsTemplateAction).toHaveBeenCalledWith("trip-1", "My Template", "idem-1");
  });

  it("allows callers to omit the idempotency key", async () => {
    await expect(saveTripListAsTemplate("trip-1", "Beach Holiday")).resolves.toEqual({
      templateId: "tmpl-new",
    });

    expect(saveTripListAsTemplateAction).toHaveBeenCalledWith("trip-1", "Beach Holiday", undefined);
  });

  it("surfaces delegate failures unchanged", async () => {
    saveTripListAsTemplateAction.mockRejectedValueOnce(new Error("Template name is required"));

    await expect(saveTripListAsTemplate("trip-1", "   ")).rejects.toThrow("Template name is required");
  });
});

describe("Mapbox and Unsplash proxy budgets and caps", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "test-mapbox-token");
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "test-unsplash-key");
    requireUser.mockResolvedValue({ id: "user-1" });
    assertWithinRateLimit.mockImplementation(() => undefined);
    mockSearchBoxSuggest.mockResolvedValue({ suggestions: [] });
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const overBudget = () =>
    assertWithinRateLimit.mockImplementation(() => {
      throw new Error("Too many requests. Try again in a moment.");
    });

  it.each([
    ["searchLocations", () => searchLocations("Tokyo", "sess")],
    ["searchAddressLocations", () => searchAddressLocations("Tokyo", "sess")],
    ["retrieveLocation", () => retrieveLocation("mapbox-id", "sess")],
  ])("%s spends the signed-in user's Mapbox search budget before calling Mapbox", async (_name, call) => {
    overBudget();

    await expect(call()).rejects.toThrow("Too many requests");

    expect(assertWithinRateLimit).toHaveBeenCalledWith("mapboxSearch", "user-1");
    expect(mockSearchBoxSuggest).not.toHaveBeenCalled();
    expect(mockSearchBoxRetrieve).not.toHaveBeenCalled();
  });
});
