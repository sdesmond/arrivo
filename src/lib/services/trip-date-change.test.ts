// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checklistItems,
  days,
  documents,
  events,
  expenses,
  itineraryChecklists,
  itineraryNotes,
  reservations,
} from "@/db/schema";
import { TripDateConflictResolution, type TripDateChangeConfirmation } from "@/data/types";

const { recordDeletions } = vi.hoisted(() => ({ recordDeletions: vi.fn() }));
vi.mock("./deletion-records", () => ({ recordDeletions }));

import { ConfirmationRequiredError } from "./confirmation-required-error";
import { ConflictError } from "./conflict-error";
import { ValidationFailedError } from "./validation-failed-error";
import { applyTripDateChange } from "./trip-date-change";

type DayRow = { id: string; tripId: string; dayNumber: number; date: string | null; label: string };

interface Fixture {
  checklistItemRows?: Array<{ id: string }>;
  checklistRows?: Array<{ id: string }>;
  eventDocs?: Array<{ id?: string; eventId: string | null; url: string | null }>;
  existingDays: DayRow[];
  expenseRows?: Array<{ id: string }>;
  noteRows?: Array<{ id: string }>;
  reservationDocs?: Array<{ id?: string; eventId: string | null; url: string | null }>;
  reservationRows?: Array<{ id: string; provider: string; type: string; startAt: Date | null; endAt: Date | null }>;
  removedEvents?: Array<{ id: string; name: string; dayId: string | null; position: number }>;
}

function createTransaction({
  checklistItemRows = [],
  checklistRows = [],
  eventDocs = [],
  existingDays,
  expenseRows = [],
  noteRows = [],
  reservationDocs = [],
  reservationRows = [],
  removedEvents = [],
}: Fixture) {
  let documentReads = 0;
  const operations = {
    deletes: [] as unknown[],
    order: [] as string[],
    inserts: [] as Array<{ table: unknown; values: unknown }>,
    updates: [] as Array<{ table: unknown; values: unknown }>,
  };
  const transaction = {
    select: () => ({
      from: (table: unknown) => {
        if (table === days) return { where: () => ({ orderBy: async () => existingDays }) };
        if (table === events) return { where: async () => removedEvents };
        if (table === documents) {
          return {
            where: async () => {
              documentReads += 1;
              // Event documents are read first (only when events were removed), then reservation documents.
              return documentReads <= (removedEvents.length > 0 ? 1 : 0) ? eventDocs : reservationDocs;
            },
          };
        }
        if (table === itineraryNotes) return { where: async () => noteRows };
        if (table === itineraryChecklists) return { where: async () => checklistRows };
        if (table === checklistItems) return { where: async () => checklistItemRows };
        if (table === expenses)
          return {
            where: async () => {
              operations.order.push("select-expenses");
              return expenseRows;
            },
          };
        if (table === reservations) return { where: async () => reservationRows };
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
        operations.order.push(
          table === events ? "delete-events" : table === reservations ? "delete-reservations" : "delete-other"
        );
      },
    }),
    insert: (table: unknown) => ({
      values: async (values: unknown) => {
        operations.inserts.push({ table, values });
      },
    }),
  };
  return { operations, transaction: transaction as never };
}

const twoDays: DayRow[] = [
  { id: "day-1", tripId: "trip-1", dayNumber: 1, date: "2026-08-01", label: "Day 1" },
  { id: "day-2", tripId: "trip-1", dayNumber: 2, date: "2026-08-02", label: "Day 2" },
];
const dated = { startDate: "2026-08-01", endDate: "2026-08-02" };
const dinner = { id: "event-1", name: "Dinner", dayId: "day-2", position: 0 };
const dinnerConfirmation: TripDateChangeConfirmation = {
  removedDates: ["2026-08-02"],
  events: [{ id: "event-1", name: "Dinner", displacedDate: "2026-08-02", docCount: 1 }],
  noteCount: 0,
  checklistCount: 0,
  eventDocumentCount: 1,
};
const shrink = { startDate: "2026-08-01", endDate: "2026-08-01" };

async function applyChange(
  fixture: Fixture,
  input: Parameters<typeof applyTripDateChange>[3],
  trip: { startDate: string | null; endDate: string | null } = dated
) {
  const { operations, transaction } = createTransaction(fixture);
  let result: Awaited<ReturnType<typeof applyTripDateChange>> | undefined;
  let error: unknown;
  try {
    result = await applyTripDateChange(transaction, "trip-1", trip, input, "user-1");
  } catch (caught) {
    error = caught;
  }
  return { operations, result, error };
}

beforeEach(() => vi.clearAllMocks());

describe("applyTripDateChange", () => {
  it("previews removed content through ConfirmationRequiredError without writing", async () => {
    const { operations, error } = await applyChange({ existingDays: twoDays, removedEvents: [dinner] }, shrink);
    expect(error).toBeInstanceOf(ConfirmationRequiredError);
    expect((error as ConfirmationRequiredError).confirmation).toEqual({
      removedDates: ["2026-08-02"],
      removedDayLabels: undefined,
      events: [{ id: "event-1", name: "Dinner", displacedDate: "2026-08-02", docCount: 0 }],
      noteCount: 0,
      checklistCount: 0,
      eventDocumentCount: 0,
    });
    expect(operations.deletes).toEqual([]);
    expect(operations.updates).toEqual([]);
    expect(recordDeletions).not.toHaveBeenCalled();
  });

  it("previews notes, checklists and overlapping reservations and lists the reservation", async () => {
    const { error } = await applyChange(
      {
        existingDays: twoDays,
        noteRows: [{ id: "note" }],
        checklistRows: [{ id: "list" }],
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
          { id: "res-3", provider: "Open", type: "other", startAt: null, endAt: null },
        ],
      },
      shrink
    );
    expect((error as ConfirmationRequiredError).confirmation).toEqual(
      expect.objectContaining({
        noteCount: 1,
        checklistCount: 1,
        reservations: [{ id: "res-1", provider: "Delta", type: "flight", date: "2026-08-02" }],
      })
    );
  });

  it("deletes events, reservations and days with records and returns every document url", async () => {
    const { operations, result } = await applyChange(
      {
        existingDays: twoDays,
        removedEvents: [dinner],
        eventDocs: [{ id: "doc-event", eventId: "event-1", url: "/api/storage/event.pdf" }],
        expenseRows: [{ id: "cost-1" }, { id: "cost-2" }],
        reservationDocs: [{ id: "doc-reservation", eventId: null, url: "/api/storage/reservation.pdf" }],
        reservationRows: [
          {
            id: "res-1",
            provider: "Delta",
            type: "flight",
            startAt: new Date("2026-08-02T10:00:00.000Z"),
            endAt: null,
          },
        ],
      },
      {
        ...shrink,
        resolution: TripDateConflictResolution.DeleteEvents,
        confirmation: {
          ...dinnerConfirmation,
          reservations: [{ id: "res-1", provider: "Delta", type: "flight", date: "2026-08-02" }],
          reservationDocumentCount: 1,
        },
      }
    );
    expect(result).toEqual({
      startDate: "2026-08-01",
      endDate: "2026-08-01",
      documentUrls: ["/api/storage/event.pdf", "/api/storage/reservation.pdf"],
    });
    expect(operations.deletes).toEqual([events, reservations, days]);
    expect(recordDeletions).toHaveBeenCalledWith(expect.anything(), "event", ["event-1"], "user-1");
    expect(recordDeletions).toHaveBeenCalledWith(expect.anything(), "reservation", ["res-1"], "user-1");
    // Each expense lookup runs before the delete that cascades them.
    expect(operations.order.filter((step) => step !== "delete-other")).toEqual([
      "select-expenses",
      "delete-events",
      "select-expenses",
      "delete-reservations",
    ]);
    // Once for the event-linked expenses and once for the reservation-linked ones, both before their cascades.
    expect(recordDeletions.mock.calls.filter((call) => call[1] === "expense")).toHaveLength(2);
    expect(recordDeletions).toHaveBeenCalledWith(expect.anything(), "expense", ["cost-1", "cost-2"], "user-1");
    expect(recordDeletions).toHaveBeenCalledWith(expect.anything(), "day", ["day-2"], "user-1");
    // Event and reservation documents go with their rows; both kinds take client ids.
    expect(recordDeletions).toHaveBeenCalledWith(
      expect.anything(),
      "document",
      ["doc-event", "doc-reservation"],
      "user-1"
    );
  });

  it("counts the files of removed reservations in the preview, and leaves the count out when there are none", async () => {
    const reservationRows = [
      {
        id: "res-1",
        provider: "Delta",
        type: "flight",
        startAt: new Date("2026-08-02T10:00:00.000Z"),
        endAt: null,
      },
    ];
    const withFiles = await applyChange(
      {
        existingDays: twoDays,
        reservationRows,
        reservationDocs: [
          { id: "doc-1", eventId: null, url: "/api/storage/a.pdf" },
          { id: "doc-2", eventId: null, url: "/api/storage/b.pdf" },
        ],
      },
      shrink
    );
    expect((withFiles.error as ConfirmationRequiredError).confirmation).toEqual(
      expect.objectContaining({ reservationDocumentCount: 2 })
    );
    const withoutFiles = await applyChange({ existingDays: twoDays, reservationRows }, shrink);
    expect((withoutFiles.error as ConfirmationRequiredError).confirmation).not.toHaveProperty(
      "reservationDocumentCount"
    );
  });

  it.each([TripDateConflictResolution.DeleteEvents, TripDateConflictResolution.KeepAsUnscheduled])(
    "records the notes, checklists and checklist items that go with removed days (%s)",
    async (resolution) => {
      const { error } = await applyChange(
        {
          existingDays: twoDays,
          noteRows: [{ id: "note-1" }],
          checklistRows: [{ id: "checklist-1" }],
          checklistItemRows: [{ id: "item-1" }],
        },
        {
          ...shrink,
          resolution,
          confirmation: {
            removedDates: ["2026-08-02"],
            events: [],
            noteCount: 1,
            checklistCount: 1,
            eventDocumentCount: 0,
          },
        }
      );
      expect(error).toBeUndefined();
      expect(recordDeletions).toHaveBeenCalledWith(expect.anything(), "itinerary-note", ["note-1"], "user-1");
      expect(recordDeletions).toHaveBeenCalledWith(expect.anything(), "checklist", ["checklist-1"], "user-1");
      expect(recordDeletions).toHaveBeenCalledWith(expect.anything(), "checklist-item", ["item-1"], "user-1");
    }
  );

  it.each([
    ["both dates reversed", { startDate: "2026-08-03", endDate: "2026-08-01" }],
    ["a start after the stored end", { startDate: "2026-08-05" }],
    ["an end before the stored start", { endDate: "2026-07-30" }],
  ])("rejects %s without writing instead of swapping the range", async (_label, input) => {
    const { operations, error } = await applyChange({ existingDays: twoDays }, input);
    expect(error).toBeInstanceOf(ValidationFailedError);
    expect(operations.deletes).toEqual([]);
    expect(operations.updates).toEqual([]);
    expect(operations.inserts).toEqual([]);
  });

  it("keeps events as unscheduled with their displaced date and keeps their documents", async () => {
    const { operations, result } = await applyChange(
      {
        existingDays: twoDays,
        removedEvents: [dinner],
        eventDocs: [{ eventId: "event-1", url: "/api/storage/event.pdf" }],
      },
      { ...shrink, resolution: TripDateConflictResolution.KeepAsUnscheduled, confirmation: dinnerConfirmation }
    );
    expect(result).toMatchObject({ documentUrls: [] });
    expect(operations.updates).toContainEqual({
      table: events,
      values: expect.objectContaining({ dayId: null, displacedDate: "2026-08-02" }),
    });
    expect(operations.deletes).toEqual([days]);
    expect(recordDeletions).not.toHaveBeenCalledWith(expect.anything(), "event", expect.anything(), "user-1");
  });

  it("rejects a confirmation that no longer matches the current state", async () => {
    const { operations, error } = await applyChange(
      { existingDays: twoDays, removedEvents: [dinner] },
      { ...shrink, resolution: TripDateConflictResolution.DeleteEvents, confirmation: dinnerConfirmation }
    );
    expect(error).toBeInstanceOf(ConflictError);
    expect(operations.deletes).toEqual([]);
    expect(operations.updates).toEqual([]);
  });

  it("applies a resolution with no confirmation check when nothing was echoed back", async () => {
    const { result } = await applyChange(
      { existingDays: twoDays, removedEvents: [dinner] },
      { ...shrink, resolution: TripDateConflictResolution.KeepAsUnscheduled }
    );
    expect(result).toMatchObject({ startDate: "2026-08-01", endDate: "2026-08-01" });
  });

  it("extends the range by renumbering through a temporary offset and inserting the new day", async () => {
    const { operations, result } = await applyChange(
      { existingDays: twoDays },
      { startDate: "2026-07-31", endDate: "2026-08-02" }
    );
    expect(result).toEqual({ startDate: "2026-07-31", endDate: "2026-08-02", documentUrls: [] });
    expect(operations.inserts).toHaveLength(1);
    expect(operations.updates.map((entry) => entry.values)).toEqual([
      { dayNumber: 1001, label: "Temp Day 1" },
      { dayNumber: 1002, label: "Temp Day 2" },
      { dayNumber: 2, label: "Day 2" },
      { dayNumber: 3, label: "Day 3" },
    ]);
    expect(operations.deletes).toEqual([]);
  });

  it("clears the dates of a dated trip, keeping its day rows", async () => {
    const { operations, result } = await applyChange({ existingDays: twoDays }, { startDate: null, endDate: null });
    expect(result).toEqual({ startDate: null, endDate: null, documentUrls: [] });
    expect(operations.updates).toEqual([{ table: days, values: { date: null } }]);
    expect(operations.deletes).toEqual([]);
  });

  it("leaves a dateless trip dateless when the dates are cleared again", async () => {
    const { operations, result } = await applyChange(
      { existingDays: [{ id: "day-1", tripId: "trip-1", dayNumber: 1, date: null, label: "Day 1" }] },
      { startDate: null, endDate: null },
      { startDate: null, endDate: null }
    );
    expect(result).toEqual({ startDate: null, endDate: null, documentUrls: [] });
    expect(operations.updates).toEqual([]);
  });

  it("dates a dateless trip, mapping its day to the first date and appending the rest", async () => {
    const { operations, result } = await applyChange(
      { existingDays: [{ id: "day-1", tripId: "trip-1", dayNumber: 1, date: null, label: "Day 1" }] },
      { startDate: "2026-08-01", endDate: "2026-08-02" },
      { startDate: null, endDate: null }
    );
    expect(result).toEqual({ startDate: "2026-08-01", endDate: "2026-08-02", documentUrls: [] });
    expect(operations.updates).toEqual([{ table: days, values: { dayNumber: 1, date: "2026-08-01", label: "Day 1" } }]);
    expect(operations.inserts).toHaveLength(1);
  });

  it("asks for confirmation before overflow days of a dateless trip are removed, then deletes them", async () => {
    const datelessDays: DayRow[] = [
      { id: "day-1", tripId: "trip-1", dayNumber: 1, date: null, label: "Day 1" },
      { id: "day-2", tripId: "trip-1", dayNumber: 2, date: null, label: "Day 2" },
    ];
    const noDates = { startDate: null, endDate: null };
    const overflowEvent = { id: "event-1", name: "Dinner", dayId: "day-2", position: 0 };
    const preview = await applyChange(
      { existingDays: datelessDays, removedEvents: [overflowEvent] },
      { startDate: "2026-08-01", endDate: "2026-08-01" },
      noDates
    );
    const confirmation = (preview.error as ConfirmationRequiredError).confirmation as TripDateChangeConfirmation;
    expect(confirmation.removedDayLabels).toEqual(["Day 2"]);
    const applied = await applyChange(
      {
        existingDays: datelessDays,
        removedEvents: [overflowEvent],
        eventDocs: [{ eventId: "event-1", url: "/api/storage/event.pdf" }],
      },
      {
        startDate: "2026-08-01",
        endDate: "2026-08-01",
        resolution: TripDateConflictResolution.DeleteEvents,
        confirmation: {
          ...confirmation,
          events: [{ ...confirmation.events[0], docCount: 1 }],
          eventDocumentCount: 1,
        },
      },
      noDates
    );
    expect(applied.result).toEqual({
      startDate: "2026-08-01",
      endDate: "2026-08-01",
      documentUrls: ["/api/storage/event.pdf"],
    });
    expect(applied.operations.deletes).toEqual([events, days]);
  });

  it("rejects a range over 45 days as a validation failure", async () => {
    const { error } = await applyChange({ existingDays: twoDays }, { startDate: "2026-08-01", endDate: "2026-12-01" });
    expect(error).toBeInstanceOf(ValidationFailedError);
  });

  it("fails on a trip with no days or with mixed dated and dateless days", async () => {
    const empty = await applyChange({ existingDays: [] }, shrink);
    expect(empty.error).toEqual(new Error("Trip has no day rows — invariant violated."));
    const mixed = await applyChange(
      {
        existingDays: [
          { id: "day-1", tripId: "trip-1", dayNumber: 1, date: "2026-08-01", label: "Day 1" },
          { id: "day-2", tripId: "trip-1", dayNumber: 2, date: null, label: "Day 2" },
        ],
      },
      shrink
    );
    expect(mixed.error).toBeInstanceOf(ConflictError);
  });
});

it("keeps affected reservations and expenses without recording their deletion when keeping content", async () => {
  const { error, operations } = await applyChange(
    {
      existingDays: twoDays,
      reservationRows: [
        { id: "res-1", provider: "Hotel", type: "other", startAt: new Date("2026-08-02T10:00:00Z"), endAt: null },
      ],
      expenseRows: [{ id: "cost-1" }],
    },
    { ...shrink, resolution: TripDateConflictResolution.KeepAsUnscheduled }
  );
  expect(error).toBeUndefined();
  expect(operations.deletes).not.toContain(reservations);
  expect(recordDeletions).not.toHaveBeenCalledWith(
    expect.anything(),
    "reservation",
    expect.anything(),
    expect.anything()
  );
  expect(recordDeletions).not.toHaveBeenCalledWith(expect.anything(), "expense", expect.anything(), expect.anything());
});
