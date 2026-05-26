import { beforeEach, describe, expect, it, vi } from "vitest";
import { days, documents, events, itineraryChecklists, itineraryNotes, trips } from "@/db/schema";

const { assertTripAccess, db, redirect, requireUser, revalidatePath } = vi.hoisted(() => ({
  assertTripAccess: vi.fn(),
  db: {
    transaction: vi.fn(),
  },
  redirect: vi.fn(),
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

vi.mock("next/cache", () => ({
  revalidatePath,
}));

vi.mock("next/navigation", () => ({
  redirect,
}));

vi.mock("@vercel/blob", () => ({
  del: vi.fn(),
}));

import { buildTripDateChangeConfirmation, buildTripDateSyncPlan, resolveTripDateRange } from "./date-sync";
import { updateTripMetadata } from "./actions";
import { TripDateConflictResolution, type TripDateChangeConfirmation } from "@/data/types";

interface TransactionFixture {
  checklistRows?: Array<{ id: string }>;
  eventDocs?: Array<{ eventId: string | null; url: string | null }>;
  existingDays: Array<{ id: string; tripId: string; dayNumber: number; date: string | null; label: string }>;
  noteRows?: Array<{ id: string }>;
  removedEvents?: Array<{ id: string; name: string; dayId: string | null; position: number }>;
  tripRow?: { id: string; startDate: string | null; endDate: string | null };
}

function createTransactionMock({
  checklistRows = [],
  eventDocs = [],
  existingDays,
  noteRows = [],
  removedEvents = [],
  tripRow = { id: "trip-1", startDate: "2026-08-01", endDate: "2026-08-02" },
}: TransactionFixture) {
  const operations = {
    deletes: [] as unknown[],
    inserts: [] as Array<{ table: unknown; values: unknown }>,
    updates: [] as Array<{ table: unknown; values: unknown }>,
  };

  const transaction = {
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
            where: async () => eventDocs,
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
      where: async () => {
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
        [{ id: "event-1", name: "Tea ceremony", displacedDate: "2026-07-04", docCount: 2 }],
        1,
        2,
        2
      )
    ).toEqual({
      removedDates: ["2026-07-04"],
      events: [{ id: "event-1", name: "Tea ceremony", displacedDate: "2026-07-04", docCount: 2 }],
      noteCount: 1,
      checklistCount: 2,
      eventDocumentCount: 2,
    });
  });
});

describe("updateTripMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.UPLOAD_STUB = "true";
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockResolvedValue(undefined);
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

    expect(result).toEqual({
      status: "confirmation-required",
      confirmation: {
        removedDates: ["2026-08-02"],
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
    expect(operations.deletes).toContain(events);
    expect(operations.deletes).toContain(days);
    expect(operations.updates.some((entry) => entry.table === trips)).toBe(true);
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
    expect(revalidatePath).toHaveBeenCalledWith("/trips");
  });

  it("rejects a stale confirmation payload instead of deleting newly changed content", async () => {
    const staleConfirmation: TripDateChangeConfirmation = {
      removedDates: ["2026-08-02"],
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
});
