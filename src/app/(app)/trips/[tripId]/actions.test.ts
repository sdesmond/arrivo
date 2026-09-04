// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAssertTripAccess,
  mockDbInsert,
  mockDbSelect,
  mockDbTransaction,
  mockDbUpdate,
  mockDbExecute,
  mockDbDelete,
  mockRequireUser,
  mockRevalidatePath,
  mockAdapterDel,
  mockAdapterPut,
  mockDeriveGraphicCover,
  mockDismissInvitation,
  mockGetContributorsAndInvitations,
  mockGetStorageAdapter,
  mockRescindInvitation,
  mockResendInvitation,
  mockSaveContributorChanges,
  schemaTokens,
} = vi.hoisted(() => {
  const mockAssertTripAccess = vi.fn();
  const mockDbSelect = vi.fn();
  const mockDbInsert = vi.fn();
  const mockDbTransaction = vi.fn();
  const mockDbUpdate = vi.fn();
  const mockDbExecute = vi.fn();
  const mockDbDelete = vi.fn();
  const mockRequireUser = vi.fn();
  const mockRevalidatePath = vi.fn();
  const mockAdapterDel = vi.fn();
  const mockAdapterPut = vi.fn();
  const mockDeriveGraphicCover = vi.fn((title: string) => `graphic:${title}`);
  const mockDismissInvitation = vi.fn();
  const mockGetContributorsAndInvitations = vi.fn();
  const mockGetStorageAdapter = vi.fn();
  const mockRescindInvitation = vi.fn();
  const mockResendInvitation = vi.fn();
  const mockSaveContributorChanges = vi.fn();
  const schemaTokens: Record<string, unknown> = {
    checklistItems: {},
    days: {},
    documents: {},
    events: {},
    itineraryChecklists: {},
    itineraryNotes: {},
    notes: {},
    trips: {},
  };

  return {
    mockAssertTripAccess,
    mockDbSelect,
    mockDbInsert,
    mockDbTransaction,
    mockDbUpdate,
    mockDbExecute,
    mockDbDelete,
    mockRequireUser,
    mockRevalidatePath,
    mockAdapterDel,
    mockAdapterPut,
    mockDeriveGraphicCover,
    mockDismissInvitation,
    mockGetContributorsAndInvitations,
    mockGetStorageAdapter,
    mockRescindInvitation,
    mockResendInvitation,
    mockSaveContributorChanges,
    schemaTokens,
  };
});

vi.mock("@/lib/auth-helpers", () => ({
  assertTripAccess: mockAssertTripAccess,
  requireUser: mockRequireUser,
}));

vi.mock("@/db", () => ({
  db: {
    execute: mockDbExecute,
    delete: mockDbDelete,
    insert: mockDbInsert,
    select: mockDbSelect,
    transaction: mockDbTransaction,
    update: mockDbUpdate,
  },
}));

vi.mock("@/db/schema", () => schemaTokens);

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock("@/lib/storage/storage-adapter", () => ({
  getStorageAdapter: mockGetStorageAdapter,
}));

vi.mock("@/lib/invitations", () => ({
  resendInvitation: mockResendInvitation,
}));

vi.mock("@/lib/queries", () => ({
  getContributorsAndInvitations: mockGetContributorsAndInvitations,
}));

vi.mock("../actions", () => ({
  dismissInvitation: mockDismissInvitation,
  rescindInvitation: mockRescindInvitation,
  saveContributorChanges: mockSaveContributorChanges,
}));

vi.mock("@/lib/utils", () => ({
  MAX_COVER_IMAGE_UPLOAD_BYTES: 12 * 1024 * 1024,
  MAX_UPLOAD_BYTES: 25 * 1024 * 1024,
  deriveGraphicCover: mockDeriveGraphicCover,
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

import {
  addChecklistFromPackingSource,
  addDay,
  createEvent,
  deleteTripNote,
  createTripNote,
  dismissShareInvitation,
  getShareDialogData,
  removeDocument,
  removeLastDay,
  removeTripCover,
  reorderDayItems,
  reorderTripNotes,
  setTripCoverWithAttribution,
  uploadCoverImage,
  updateTripNote,
  rescindShareInvitation,
  resendShareInvitation,
  saveContributorChanges,
} from "./actions";
import { days, events, itineraryChecklists, itineraryNotes, notes, trips } from "@/db/schema";

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
    execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
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

function createSimpleSelect(rows: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(async () => rows),
    })),
  };
}

beforeEach(() => {
  mockGetStorageAdapter.mockReturnValue({ put: mockAdapterPut, del: mockAdapterDel });
  mockAdapterDel.mockResolvedValue(undefined);
});

describe("share invitation actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ id: "manager-1" });
    mockResendInvitation.mockResolvedValue({ status: "success", expiresAt: "2026-09-04T12:00:00.000Z" });
    mockRescindInvitation.mockResolvedValue({ status: "success" });
    mockDismissInvitation.mockResolvedValue({ status: "success" });
    mockSaveContributorChanges.mockResolvedValue({ status: "success" });
    mockGetContributorsAndInvitations.mockResolvedValue({ collaborators: [], invitations: [] });
  });

  it("delegates to getContributorsAndInvitations with the caller's id", async () => {
    await expect(getShareDialogData("trip-1")).resolves.toEqual({ collaborators: [], invitations: [] });

    expect(mockGetContributorsAndInvitations).toHaveBeenCalledWith("trip-1", "manager-1");
  });

  it("propagates a rejection from getContributorsAndInvitations", async () => {
    mockGetContributorsAndInvitations.mockRejectedValue(new Error("not found"));

    await expect(getShareDialogData("trip-1")).rejects.toThrow("not found");
  });

  it("delegates a resend before revalidating the trip", async () => {
    await expect(resendShareInvitation("trip-1", "invite-1")).resolves.toEqual({
      status: "success",
      expiresAt: "2026-09-04T12:00:00.000Z",
    });

    expect(mockResendInvitation).toHaveBeenCalledWith("invite-1", "trip-1", "manager-1");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("delegates a rescind before revalidating the trip", async () => {
    await expect(rescindShareInvitation("trip-1", "invite-1")).resolves.toEqual({ status: "success" });

    expect(mockRescindInvitation).toHaveBeenCalledWith("trip-1", "invite-1");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("delegates a dismissal and revalidates the trip after success", async () => {
    await expect(dismissShareInvitation("trip-1", "invite-1")).resolves.toEqual({ status: "success" });

    expect(mockDismissInvitation).toHaveBeenCalledWith("trip-1", "invite-1");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("does not revalidate when a dismissal result is rejected", async () => {
    mockDismissInvitation.mockResolvedValue({ status: "error", message: "Invitation is still pending." });

    await expect(dismissShareInvitation("trip-1", "invite-1")).resolves.toEqual({
      status: "error",
      message: "Invitation is still pending.",
    });

    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("propagates a rejection from underlying share invitation actions without revalidating", async () => {
    mockResendInvitation.mockRejectedValue(new Error("not found"));
    mockRescindInvitation.mockRejectedValue(new Error("not found"));
    mockDismissInvitation.mockRejectedValue(new Error("not found"));

    await expect(resendShareInvitation("trip-1", "invite-1")).rejects.toThrow("not found");
    await expect(rescindShareInvitation("trip-1", "invite-1")).rejects.toThrow("not found");
    await expect(dismissShareInvitation("trip-1", "invite-1")).rejects.toThrow("not found");

    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("delegates saveContributorChanges and revalidates the detail route on success", async () => {
    const changes: import("@/data/types").ContributorChange[] = [
      { type: "role", collaboratorId: "collab-1", fromRole: "editor", toRole: "viewer" },
      { type: "remove", collaboratorId: "collab-2" },
    ];

    await expect(saveContributorChanges("trip-1", changes)).resolves.toEqual({ status: "success" });

    expect(mockSaveContributorChanges).toHaveBeenCalledWith("trip-1", changes);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("does not revalidate when a saveContributorChanges batch is rejected", async () => {
    mockSaveContributorChanges.mockResolvedValue({ status: "error", message: "Batch rejected." });

    await expect(saveContributorChanges("trip-1", [{ type: "remove", collaboratorId: "collab-1" }])).resolves.toEqual({
      status: "error",
      message: "Batch rejected.",
    });

    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});

describe("createEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockAssertTripAccess.mockResolvedValue(undefined);
    mockDbSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(async () => [{ tripId: "trip-1" }]),
      })),
    });
  });

  it("locks trip before reading append positions for new events", async () => {
    const insertedValues: Array<Record<string, unknown>> = [];
    const transaction = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      insert: vi.fn(() => ({
        values: vi.fn(async (values: Record<string, unknown>) => {
          insertedValues.push(values);
        }),
      })),
      select: vi
        .fn()
        .mockReturnValueOnce(createSimpleSelect([{ id: "day-1" }]))
        .mockReturnValueOnce(createSimpleSelect([{ maxEvt: 2 }]))
        .mockReturnValueOnce(createSimpleSelect([{ maxNote: 1 }]))
        .mockReturnValueOnce(createSimpleSelect([{ maxCl: 0 }])),
      update: vi.fn(),
    };
    mockDbTransaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    await createEvent("day-1", { name: "Museum" });

    expect(transaction.execute).toHaveBeenCalledOnce();
    expect(transaction.execute.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.select.mock.invocationCallOrder[0]
    );
    expect(insertedValues).toEqual([
      expect.objectContaining({
        dayId: "day-1",
        tripId: "trip-1",
        name: "Museum",
        position: 3,
      }),
    ]);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("fails when the day disappears before locked insert work begins", async () => {
    const transaction = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      insert: vi.fn(),
      select: vi.fn().mockReturnValueOnce(createSimpleSelect([])),
      update: vi.fn(),
    };
    mockDbTransaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    await expect(createEvent("day-1", { name: "Museum" })).rejects.toThrow("Day not found");

    expect(transaction.insert).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});

describe("createTripNote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockAssertTripAccess.mockResolvedValue(undefined);
  });

  function createTripNoteTransactionMock() {
    const insertedValues: Array<Record<string, unknown>> = [];
    const shiftedTables: unknown[] = [];
    const transaction = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      insert: vi.fn((table: unknown) => ({
        values: vi.fn(async (values: Record<string, unknown>) => {
          expect(table).toBe(notes);
          insertedValues.push(values);
        }),
      })),
      update: vi.fn((table: unknown) => ({
        set: vi.fn(() => ({
          where: vi.fn(async () => {
            shiftedTables.push(table);
          }),
        })),
      })),
    };
    return { transaction, insertedValues, shiftedTables };
  }

  it("asserts editor access before writing", async () => {
    const { transaction } = createTripNoteTransactionMock();
    mockDbTransaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    await createTripNote("trip-1", { title: "Pack sunscreen" });

    expect(mockAssertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
  });

  it("propagates denied access (e.g. a viewer) without writing", async () => {
    mockAssertTripAccess.mockRejectedValue(new Error("denied"));

    await expect(createTripNote("trip-1", { title: "Pack sunscreen" })).rejects.toThrow("denied");

    expect(mockDbTransaction).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a fully-blank note without touching the transaction", async () => {
    await expect(createTripNote("trip-1", { title: "   ", body: "" })).rejects.toThrow("Note is blank");

    expect(mockDbTransaction).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("locks the trip, shifts existing notes, and inserts the new note at position 0", async () => {
    const { transaction, insertedValues, shiftedTables } = createTripNoteTransactionMock();
    mockDbTransaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    await createTripNote("trip-1", { title: "  Pack sunscreen  ", body: "  Reef-safe only  " });

    expect(transaction.execute).toHaveBeenCalledOnce();
    expect(transaction.execute.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.update.mock.invocationCallOrder[0]
    );
    expect(shiftedTables).toEqual([notes]);
    expect(insertedValues).toEqual([
      {
        tripId: "trip-1",
        position: 0,
        title: "Pack sunscreen",
        body: "Reef-safe only",
      },
    ]);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("trims whitespace-only body to undefined while keeping a non-blank title", async () => {
    const { transaction, insertedValues } = createTripNoteTransactionMock();
    mockDbTransaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    await createTripNote("trip-1", { title: "Pack sunscreen", body: "   " });

    expect(insertedValues).toEqual([
      {
        tripId: "trip-1",
        position: 0,
        title: "Pack sunscreen",
        body: undefined,
      },
    ]);
  });
});

describe("updateTripNote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockAssertTripAccess.mockResolvedValue(undefined);
  });

  it("resolves the trip from the note, asserts editor access, trims content, and revalidates without reordering", async () => {
    const updatedValues: Array<Record<string, unknown>> = [];
    mockDbSelect.mockReturnValue(createSimpleSelect([{ tripId: "trip-1" }]));
    mockDbUpdate.mockReturnValue({
      set: vi.fn((values: Record<string, unknown>) => {
        updatedValues.push(values);
        return { where: vi.fn(async () => undefined) };
      }),
    });

    await updateTripNote("note-1", { title: "  Pack sunscreen  ", body: "  Reef-safe only  " });

    expect(mockAssertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
    expect(mockDbUpdate).toHaveBeenCalledWith(notes);
    expect(updatedValues).toEqual([
      {
        title: "Pack sunscreen",
        body: "Reef-safe only",
        updatedAt: expect.any(Date),
      },
    ]);
    expect(updatedValues[0]).not.toHaveProperty("position");
    expect(mockDbTransaction).not.toHaveBeenCalled();
    expect(mockRevalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("persists an explicit clear as null while preserving non-blank content", async () => {
    const set = vi.fn(() => ({ where: vi.fn(async () => undefined) }));
    mockDbSelect.mockReturnValue(createSimpleSelect([{ tripId: "trip-1" }]));
    mockDbUpdate.mockReturnValue({ set });

    await updateTripNote("note-1", { title: "  Pack sunscreen  ", body: "   " });

    expect(set).toHaveBeenCalledWith({
      title: "Pack sunscreen",
      body: null,
      updatedAt: expect.any(Date),
    });
  });

  it("leaves omitted fields untouched instead of clearing them", async () => {
    const setValues: Array<Record<string, unknown>> = [];
    const set = vi.fn((values: Record<string, unknown>) => {
      setValues.push(values);
      return { where: vi.fn(async () => undefined) };
    });
    mockDbSelect.mockReturnValue(createSimpleSelect([{ tripId: "trip-1" }]));
    mockDbUpdate.mockReturnValue({ set });

    await updateTripNote("note-1", { title: "Pack sunscreen" });

    expect(set).toHaveBeenCalledWith({
      title: "Pack sunscreen",
      updatedAt: expect.any(Date),
    });
    expect(setValues[0]).not.toHaveProperty("body");
  });

  it("propagates denied access without writing", async () => {
    mockAssertTripAccess.mockRejectedValue(new Error("denied"));
    mockDbSelect.mockReturnValue(createSimpleSelect([{ tripId: "trip-1" }]));

    await expect(updateTripNote("note-1", { title: "Pack sunscreen" })).rejects.toThrow("denied");
    expect(mockDbUpdate).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a fully blank update after authorization without writing", async () => {
    mockDbSelect.mockReturnValue(createSimpleSelect([{ tripId: "trip-1" }]));

    await expect(updateTripNote("note-1", { title: "   ", body: "" })).rejects.toThrow("Note is blank");

    expect(mockAssertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
    expect(mockDbUpdate).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("silently no-ops when the note does not exist", async () => {
    mockDbSelect.mockReturnValue(createSimpleSelect([]));

    await updateTripNote("missing-note", { title: "Pack sunscreen" });

    expect(mockAssertTripAccess).not.toHaveBeenCalled();
    expect(mockDbUpdate).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});

describe("deleteTripNote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockAssertTripAccess.mockResolvedValue(undefined);
  });

  it("resolves note trip access, deletes the note, and revalidates", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    mockDbSelect.mockReturnValue(createSimpleSelect([{ tripId: "trip-1" }]));
    mockDbDelete.mockReturnValue({ where });

    await deleteTripNote("note-1");

    expect(mockAssertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
    expect(mockDbDelete).toHaveBeenCalledWith(notes);
    expect(where).toHaveBeenCalledOnce();
    expect(mockRevalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("silently no-ops when the note is missing", async () => {
    mockDbSelect.mockReturnValue(createSimpleSelect([]));

    await deleteTripNote("missing-note");

    expect(mockAssertTripAccess).not.toHaveBeenCalled();
    expect(mockDbDelete).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("propagates denied access without deleting", async () => {
    mockDbSelect.mockReturnValue(createSimpleSelect([{ tripId: "trip-1" }]));
    mockAssertTripAccess.mockRejectedValue(new Error("denied"));

    await expect(deleteTripNote("note-1")).rejects.toThrow("denied");

    expect(mockDbDelete).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});

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

    expect(transaction.execute).toHaveBeenCalledOnce();
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

describe("reorderTripNotes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockAssertTripAccess.mockResolvedValue(undefined);
  });

  function createNoteReorderTransactionMock(currentNotes: Array<{ id: string }>) {
    const updates: Array<{ position: number; table: unknown }> = [];
    const transaction = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => {
          if (table !== notes) {
            throw new Error("Unexpected table read.");
          }
          return { where: vi.fn(async () => currentNotes) };
        }),
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

  it("locks the trip, validates editor access, rewrites scoped positions, and revalidates", async () => {
    const { transaction, updates } = createNoteReorderTransactionMock([
      { id: "note-1" },
      { id: "note-2" },
      { id: "note-3" },
    ]);
    mockDbTransaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    await reorderTripNotes({
      tripId: "trip-1",
      orderedNoteIds: ["note-3", "note-1", "note-2"],
    });

    expect(mockAssertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
    expect(transaction.execute).toHaveBeenCalledOnce();
    expect(updates).toEqual([
      { position: 0, table: notes },
      { position: 1, table: notes },
      { position: 2, table: notes },
    ]);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("rejects a stale payload missing a current note before applying any writes", async () => {
    const { transaction, updates } = createNoteReorderTransactionMock([{ id: "note-1" }, { id: "note-2" }]);
    mockDbTransaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    await expect(reorderTripNotes({ tripId: "trip-1", orderedNoteIds: ["note-1"] })).rejects.toThrow(
      "CONCURRENT_MODIFICATION"
    );

    expect(updates).toEqual([]);
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a payload with a duplicate note id before applying any writes", async () => {
    const { transaction, updates } = createNoteReorderTransactionMock([{ id: "note-1" }, { id: "note-2" }]);
    mockDbTransaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    await expect(reorderTripNotes({ tripId: "trip-1", orderedNoteIds: ["note-1", "note-1"] })).rejects.toThrow(
      "CONCURRENT_MODIFICATION"
    );

    expect(updates).toEqual([]);
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a payload containing a foreign note id before applying any writes", async () => {
    const { transaction, updates } = createNoteReorderTransactionMock([{ id: "note-1" }, { id: "note-2" }]);
    mockDbTransaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    await expect(reorderTripNotes({ tripId: "trip-1", orderedNoteIds: ["note-1", "note-foreign"] })).rejects.toThrow(
      "CONCURRENT_MODIFICATION"
    );

    expect(updates).toEqual([]);
  });

  it("propagates access denial before touching the transaction", async () => {
    mockAssertTripAccess.mockRejectedValue(new Error("Forbidden"));

    await expect(reorderTripNotes({ tripId: "trip-1", orderedNoteIds: [] })).rejects.toThrow("Forbidden");

    expect(mockDbTransaction).not.toHaveBeenCalled();
  });

  it("succeeds as a no-op when both the current and submitted note sets are empty", async () => {
    const { transaction, updates } = createNoteReorderTransactionMock([]);
    mockDbTransaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    await reorderTripNotes({ tripId: "trip-1", orderedNoteIds: [] });

    expect(updates).toEqual([]);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });
});

describe("addChecklistFromPackingSource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockAssertTripAccess.mockResolvedValue(undefined);
  });

  it("rejects when the provided day belongs to a different trip", async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn((table: unknown) => {
        if (table !== days) {
          throw new Error("Unexpected table read.");
        }

        return {
          where: vi.fn(async () => [{ tripId: "trip-2" }]),
        };
      }),
    });

    await expect(addChecklistFromPackingSource("trip-1", "day-1", 0, "packing-list", "list-1")).rejects.toThrow(
      "Day does not belong to this trip"
    );

    expect(mockAssertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
    expect(mockDbTransaction).not.toHaveBeenCalled();
    expect(mockDbInsert).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});

describe("uploadCoverImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockAssertTripAccess.mockResolvedValue(undefined);
    mockAdapterPut.mockResolvedValue("https://blob.vercel.dev/cover.png");
    mockDbSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [{ coverImageUrl: null }]),
        })),
      })),
    });
    mockDbUpdate.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn(async () => undefined),
      })),
    });
  });

  it("rejects non-image files before uploading", async () => {
    const formData = new FormData();
    formData.append("file", new File(["pdf"], "notes.pdf", { type: "application/pdf" }));

    await expect(uploadCoverImage("trip-1", formData)).rejects.toThrow(
      "Unsupported cover image type. Choose JPG, PNG, WEBP, HEIC, GIF, or AVIF."
    );

    expect(mockAdapterPut).not.toHaveBeenCalled();
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it("rejects oversized image files before uploading", async () => {
    const oversized = new File(["img"], "cover.png", { type: "image/png" });
    Object.defineProperty(oversized, "size", { value: 12 * 1024 * 1024 + 1 });
    const formData = new FormData();
    formData.append("file", oversized);

    await expect(uploadCoverImage("trip-1", formData)).rejects.toThrow("Cover image exceeds 12 MB limit");

    expect(mockAdapterPut).not.toHaveBeenCalled();
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it("cleans up an uploaded file when the trip update fails", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("upload-1234");
    const formData = new FormData();
    formData.append("file", new File(["img"], "cover.png", { type: "image/png" }));
    mockDbUpdate.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn(async () => {
          throw new Error("db failed");
        }),
      })),
    });

    await expect(uploadCoverImage("trip-1", formData)).rejects.toThrow("db failed");

    expect(mockAdapterPut).toHaveBeenCalledWith("trip-covers/trip-1/upload-1234.png", expect.any(File));
    expect(mockAdapterDel).toHaveBeenCalledWith("https://blob.vercel.dev/cover.png");
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("updates the trip cover and revalidates on success", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("upload-1234");
    const formData = new FormData();
    formData.append("file", new File(["img"], "cover.png", { type: "image/png" }));

    await expect(uploadCoverImage("trip-1", formData)).resolves.toBe("https://blob.vercel.dev/cover.png");

    expect(mockAssertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
    expect(mockDbUpdate).toHaveBeenCalledWith(trips);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("cleans up the previous cover unconditionally when replacing a cover image", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("upload-1234");
    const formData = new FormData();
    formData.append("file", new File(["img"], "new-cover.png", { type: "image/png" }));
    mockDbSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [{ coverImageUrl: "https://blob.vercel.dev/old-cover.png" }]),
        })),
      })),
    });

    await expect(uploadCoverImage("trip-1", formData)).resolves.toBe("https://blob.vercel.dev/cover.png");

    expect(mockAdapterDel).toHaveBeenCalledWith("https://blob.vercel.dev/old-cover.png");
  });

  it("deletes the previous cover even when it is an external url (adapter no-ops)", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("upload-1234");
    const formData = new FormData();
    formData.append("file", new File(["img"], "new-cover.png", { type: "image/png" }));
    mockDbSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [{ coverImageUrl: "https://images.example.com/old-cover.png" }]),
        })),
      })),
    });

    await expect(uploadCoverImage("trip-1", formData)).resolves.toBe("https://blob.vercel.dev/cover.png");

    expect(mockAdapterDel).toHaveBeenCalledWith("https://images.example.com/old-cover.png");
  });
});

describe("setTripCoverWithAttribution", () => {
  const mockWhere = vi.fn();
  const mockSet = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockAssertTripAccess.mockResolvedValue(undefined);
    mockWhere.mockResolvedValue(undefined);
    mockSet.mockReturnValue({ where: mockWhere });
    mockDbUpdate.mockReturnValue({
      set: mockSet,
    });
  });

  it("persists cover url and attribution fields", async () => {
    await setTripCoverWithAttribution(
      "trip-1",
      "https://images.example.com/cover.jpg",
      "Jane Lens",
      "https://unsplash.com/@janelens"
    );

    expect(mockAssertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
    expect(mockDbUpdate).toHaveBeenCalledWith(trips);
    expect(mockSet).toHaveBeenCalledWith({
      coverImageUrl: "https://images.example.com/cover.jpg",
      coverPhotographer: "Jane Lens",
      coverPhotographerUrl: "https://unsplash.com/@janelens",
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("clears attribution when photographer fields are null", async () => {
    await setTripCoverWithAttribution("trip-1", "graphic:Summer Trip", null, null);

    expect(mockSet).toHaveBeenCalledWith({
      coverImageUrl: "graphic:Summer Trip",
      coverPhotographer: null,
      coverPhotographerUrl: null,
    });
  });
});

describe("removeTripCover", () => {
  const mockWhere = vi.fn();
  const mockSet = vi.fn();
  let transactionExecute: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockAssertTripAccess.mockResolvedValue(undefined);
    transactionExecute = vi.fn().mockResolvedValue([{ id: "trip-1" }]);
    mockDbSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [{ name: "Summer Trip" }]),
        })),
      })),
    });
    mockWhere.mockResolvedValue(undefined);
    mockSet.mockReturnValue({ where: mockWhere });
    mockDbUpdate.mockReturnValue({
      set: mockSet,
    });
    mockDbTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<void>) =>
      callback({ execute: transactionExecute, select: mockDbSelect, update: mockDbUpdate })
    );
  });

  it("replaces the cover with a derived graphic and clears attribution", async () => {
    await removeTripCover("trip-1");

    expect(mockAssertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
    expect(transactionExecute).toHaveBeenCalledOnce();
    expect(mockDeriveGraphicCover).toHaveBeenCalledWith("Summer Trip");
    expect(mockSet).toHaveBeenCalledWith({
      coverImageUrl: "graphic:Summer Trip",
      coverPhotographer: null,
      coverPhotographerUrl: null,
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("throws when the trip no longer exists", async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => []),
        })),
      })),
    });

    await expect(removeTripCover("trip-1")).rejects.toThrow("Trip not found");

    expect(mockDbUpdate).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});

function buildAddDayTransaction({
  tripStartDate,
  existingDays,
}: {
  tripStartDate: string | null;
  existingDays: Array<{ id: string; dayNumber: number; date: string | null }>;
}) {
  const inserts: Array<{ tripId: string; dayNumber: number; date: string | null; label: string }> = [];
  const tripUpdates: Array<{ endDate: string }> = [];

  const transaction = {
    execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => ({
        where: vi.fn(() => {
          if (table === trips) return Promise.resolve([{ startDate: tripStartDate }]);
          if (table === days)
            return {
              orderBy: vi.fn(() => Promise.resolve(existingDays)),
            };
          return Promise.resolve([]);
        }),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(
        (row: { tripId: string; dayNumber: number; date: string | null; label: string }) => (
          inserts.push(row),
          Promise.resolve()
        )
      ),
    })),
    update: vi.fn(() => ({
      set: vi.fn((payload: { endDate: string }) => ({
        where: vi.fn(() => (tripUpdates.push(payload), Promise.resolve())),
      })),
    })),
  };

  return { transaction, inserts, tripUpdates };
}

describe("addDay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockAssertTripAccess.mockResolvedValue(undefined);
  });

  it("appends a dateless day when the trip has no start date", async () => {
    const { transaction, inserts, tripUpdates } = buildAddDayTransaction({
      tripStartDate: null,
      existingDays: [{ id: "day-1", dayNumber: 1, date: null }],
    });
    mockDbTransaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    await addDay("trip-1");

    expect(transaction.execute).toHaveBeenCalledOnce();
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ tripId: "trip-1", dayNumber: 2, date: null, label: "Day 2" });
    expect(tripUpdates).toHaveLength(0);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("appends a dated day and updates trip endDate when the trip is scheduled", async () => {
    const { transaction, inserts, tripUpdates } = buildAddDayTransaction({
      tripStartDate: "2026-07-01",
      existingDays: [
        { id: "day-1", dayNumber: 1, date: "2026-07-01" },
        { id: "day-2", dayNumber: 2, date: "2026-07-02" },
      ],
    });
    mockDbTransaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    await addDay("trip-1");

    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ tripId: "trip-1", dayNumber: 3, date: "2026-07-03", label: "Day 3" });
    expect(tripUpdates).toHaveLength(1);
    expect(tripUpdates[0]).toMatchObject({ endDate: "2026-07-03" });
  });
});

function buildRemoveLastDayTransaction({
  existingDays,
  dayEvents = [],
  dayNotes = [],
  dayChecklists = [],
  eventDocuments = [],
}: {
  existingDays: Array<{ id: string; dayNumber: number; date: string | null }>;
  dayEvents?: Array<{ id: string }>;
  dayNotes?: Array<{ id: string }>;
  dayChecklists?: Array<{ id: string }>;
  eventDocuments?: Array<{ url: string | null }>;
}) {
  const deletes: Array<{ id: string }> = [];
  const tripUpdates: Array<{ endDate: string }> = [];
  let selectCallIndex = 0;

  const selectResults: Array<unknown> = [
    existingDays,
    dayEvents,
    dayNotes,
    dayChecklists,
    ...(dayEvents.length > 0 ? [eventDocuments] : []),
  ];

  const transaction = {
    execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => {
          const result = selectResults[selectCallIndex++] ?? [];
          if (Array.isArray(result) && result.length > 0 && "dayNumber" in (result[0] as object)) {
            return { orderBy: vi.fn(() => Promise.resolve(result)) };
          }
          return Promise.resolve(result);
        }),
        orderBy: vi.fn(() => Promise.resolve(selectResults[selectCallIndex++] ?? [])),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn((condition: unknown) => {
        deletes.push({ id: condition as unknown as string });
        return Promise.resolve();
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((payload: { endDate: string }) => ({
        where: vi.fn(() => (tripUpdates.push(payload), Promise.resolve())),
      })),
    })),
  };

  return { transaction, deletes, tripUpdates };
}

describe("removeLastDay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockAssertTripAccess.mockResolvedValue(undefined);
  });

  it("throws when the trip has only one day (AC8)", async () => {
    const { transaction } = buildRemoveLastDayTransaction({
      existingDays: [{ id: "day-1", dayNumber: 1, date: null }],
    });
    mockDbTransaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) => {
      await callback(transaction);
    });

    await expect(removeLastDay("trip-1")).rejects.toThrow("Cannot remove the only remaining day.");
  });

  it("removes last day of a multi-day dateless trip without updating trip dates", async () => {
    const existingDays = [
      { id: "day-1", dayNumber: 1, date: null },
      { id: "day-2", dayNumber: 2, date: null },
    ];
    const { transaction, deletes, tripUpdates } = buildRemoveLastDayTransaction({ existingDays });
    mockDbTransaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) => {
      await callback(transaction);
    });

    const result = await removeLastDay("trip-1");

    expect(transaction.execute).toHaveBeenCalledOnce();
    expect(result.status).toBe("removed");
    expect(deletes).toHaveLength(1);
    expect(tripUpdates).toHaveLength(0);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("removes last day of a scheduled multi-day trip and updates trip endDate", async () => {
    const existingDays = [
      { id: "day-1", dayNumber: 1, date: "2026-07-01" },
      { id: "day-2", dayNumber: 2, date: "2026-07-02" },
    ];
    const { transaction, deletes, tripUpdates } = buildRemoveLastDayTransaction({ existingDays });
    mockDbTransaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) => {
      await callback(transaction);
    });

    const result = await removeLastDay("trip-1");

    expect(result.status).toBe("removed");
    expect(deletes).toHaveLength(1);
    expect(tripUpdates).toHaveLength(1);
    expect(tripUpdates[0]).toMatchObject({ endDate: "2026-07-01" });
  });

  it("returns confirmation-required when last day has planned content", async () => {
    const existingDays = [
      { id: "day-1", dayNumber: 1, date: null },
      { id: "day-2", dayNumber: 2, date: null },
    ];
    const { transaction, deletes } = buildRemoveLastDayTransaction({
      existingDays,
      dayEvents: [{ id: "event-1" }],
      eventDocuments: [],
    });
    mockDbTransaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) => {
      await callback(transaction);
    });

    const result = await removeLastDay("trip-1");

    expect(result).toEqual({ status: "confirmation-required", hasPlannedContent: true });
    expect(deletes).toHaveLength(0);
  });
});

describe("removeDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockAssertTripAccess.mockResolvedValue(undefined);
  });

  it("still deletes the document row when the adapter del rejects", async () => {
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    mockDbDelete.mockReturnValue({ where: deleteWhere });
    mockAdapterDel.mockRejectedValueOnce(new Error("storage unavailable"));
    mockDbSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(async () => [
          { id: "doc-1", tripId: "trip-1", eventId: null, url: "/api/storage/trip-documents/trip-1/doc.pdf" },
        ]),
      })),
    });

    await expect(removeDocument("doc-1")).resolves.toBeUndefined();

    expect(mockAdapterDel).toHaveBeenCalledWith("/api/storage/trip-documents/trip-1/doc.pdf");
    expect(deleteWhere).toHaveBeenCalled();
    expect(mockRevalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });
});
