import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAssertTripAccess, mockDbSelect, mockDbTransaction, mockRequireUser, mockRevalidatePath, schemaTokens } =
  vi.hoisted(() => {
    const mockAssertTripAccess = vi.fn();
    const mockDbSelect = vi.fn();
    const mockDbTransaction = vi.fn();
    const mockRequireUser = vi.fn();
    const mockRevalidatePath = vi.fn();
    const schemaTokens = {
      checklistItems: {},
      days: {},
      documents: {},
      events: {},
      itineraryChecklists: {},
      itineraryNotes: {},
      trips: {},
    };

    return {
      mockAssertTripAccess,
      mockDbSelect,
      mockDbTransaction,
      mockRequireUser,
      mockRevalidatePath,
      schemaTokens,
    };
  });

vi.mock("@/lib/auth-helpers", () => ({
  assertTripAccess: mockAssertTripAccess,
  requireUser: mockRequireUser,
}));

vi.mock("@/db", () => ({
  db: {
    select: mockDbSelect,
    transaction: mockDbTransaction,
  },
}));

vi.mock("@/db/schema", () => schemaTokens);

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock("@vercel/blob", () => ({
  del: vi.fn(),
  put: vi.fn(),
}));

vi.mock("@/lib/utils", () => ({
  MAX_UPLOAD_BYTES: 25 * 1024 * 1024,
  formatFileSize: vi.fn(),
  inferDocKind: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(() => "and"),
  asc: vi.fn(() => "asc"),
  eq: vi.fn(() => "eq"),
  gte: vi.fn(() => "gte"),
  inArray: vi.fn(() => "inArray"),
  isNull: vi.fn(() => "isNull"),
  max: vi.fn(() => "max"),
  sql: vi.fn(() => "sql"),
}));

import { reorderDayItems } from "./actions";
import { days, events, itineraryChecklists, itineraryNotes } from "@/db/schema";

interface ReorderTransactionFixture {
  currentChecklists?: Array<{ id: string }>;
  currentEvents?: Array<{ id: string }>;
  currentNotes?: Array<{ id: string }>;
}

function createReorderTransactionMock({
  currentChecklists = [],
  currentEvents = [],
  currentNotes = [],
}: ReorderTransactionFixture) {
  const updates: Array<{ position: number; table: unknown }> = [];

  const transaction = {
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => ({
        where: vi.fn(async () => {
          if (table === events) return currentEvents;
          if (table === itineraryNotes) return currentNotes;
          if (table === itineraryChecklists) return currentChecklists;
          throw new Error("Unexpected table read.");
        }),
      })),
    })),
    update: vi.fn((table: unknown) => ({
      set: ({ position }: { position: number }) => ({
        where: vi.fn(async () => {
          updates.push({ position, table });
        }),
      }),
    })),
  };

  return { transaction, updates };
}

describe("reorderDayItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockAssertTripAccess.mockResolvedValue(undefined);
    mockDbSelect.mockReturnValue({
      from: vi.fn((table: unknown) => {
        if (table !== days) {
          throw new Error("Unexpected table read.");
        }

        return {
          where: vi.fn(async () => [{ tripId: "trip-1" }]),
        };
      }),
    });
  });

  it("updates positions when the submitted item set still matches the live day contents", async () => {
    const { transaction, updates } = createReorderTransactionMock({
      currentChecklists: [{ id: "checklist-1" }],
      currentEvents: [{ id: "event-1" }],
      currentNotes: [{ id: "note-1" }],
    });
    mockDbTransaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    await reorderDayItems({
      dayId: "day-1",
      orderedItems: [
        { type: "note", id: "note-1" },
        { type: "event", id: "event-1" },
        { type: "checklist", id: "checklist-1" },
      ],
    });

    expect(updates).toEqual([
      { position: 0, table: itineraryNotes },
      { position: 1, table: events },
      { position: 2, table: itineraryChecklists },
    ]);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("rejects stale reorder payloads before applying any writes", async () => {
    const { transaction, updates } = createReorderTransactionMock({
      currentChecklists: [{ id: "checklist-1" }],
      currentEvents: [{ id: "event-1" }],
      currentNotes: [{ id: "note-1" }],
    });
    mockDbTransaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    await expect(
      reorderDayItems({
        dayId: "day-1",
        orderedItems: [
          { type: "note", id: "note-1" },
          { type: "event", id: "event-1" },
        ],
      })
    ).rejects.toThrow("CONCURRENT_MODIFICATION");

    expect(updates).toEqual([]);
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});
