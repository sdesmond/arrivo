// @vitest-environment node
import { inspect } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  collaborators,
  days,
  documents,
  events,
  expenses,
  invitations,
  itineraryChecklists,
  itineraryNotes,
  trips,
  users,
} from "@/db/schema";
import { headers } from "next/headers";

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

const {
  addPackingItemAction,
  pullTemplatesOntoTripAction,
  removePackingItemAction,
  reorderPackingItemsAction,
  saveTripListAsTemplateAction,
  togglePackingItemAction,
  updatePackingItemAction,
} = vi.hoisted(() => ({
  addPackingItemAction: vi.fn(),
  pullTemplatesOntoTripAction: vi.fn(),
  removePackingItemAction: vi.fn(),
  reorderPackingItemsAction: vi.fn(),
  saveTripListAsTemplateAction: vi.fn(),
  togglePackingItemAction: vi.fn(),
  updatePackingItemAction: vi.fn(),
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
    pullTemplatesOntoTrip: pullTemplatesOntoTripAction,
    removePackingItem: removePackingItemAction,
    reorderPackingItems: reorderPackingItemsAction,
    saveTripListAsTemplate: saveTripListAsTemplateAction,
    togglePackingItem: togglePackingItemAction,
    updatePackingItem: updatePackingItemAction,
  };
});

import { buildTripDateChangeConfirmation, buildTripDateSyncPlan, resolveTripDateRange } from "./date-sync";
import {
  acceptInvitation,
  addPackingItem,
  createTrip,
  deleteTrip,
  declineInvitation,
  dismissInvitation,
  inviteContributor,
  pullTemplatesOntoTrip,
  reorderPackingItems,
  removePackingItem,
  retrieveLocation,
  rescindInvitation,
  saveContributorChanges,
  saveTripListAsTemplate,
  searchAddressLocations,
  searchLocations,
  togglePackingItem,
  updatePackingItem,
  updateTripMetadata,
} from "./actions";
import { searchCoverImages } from "./cover-image-search-actions";
import {
  LiveSyncEventType,
  TransitMode,
  TripDateConflictResolution,
  type InvitationStatus,
  type TripDateChangeConfirmation,
} from "@/data/types";
import { deriveGraphicCover } from "@/lib/utils";

describe("manager-gated trip actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "editor-1", email: "editor@example.com" });
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
    requireUser.mockResolvedValue({ id: "manager-1", email: "manager@example.com" });
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

interface SaveContributorChangesFixture {
  collaboratorRows?: Array<{
    id: string;
    tripId: string;
    userId: string | null;
    role: string;
    isCreator: boolean | null;
    email: string;
  }>;
  tripName?: string;
}

function setupSaveContributorChangesDb({
  collaboratorRows = [
    {
      id: "collab-editor",
      tripId: "trip-1",
      userId: "user-peer",
      role: "editor",
      isCreator: false,
      email: "peer@example.com",
    },
  ],
  tripName = "Test Trip",
}: SaveContributorChangesFixture = {}) {
  const operations = {
    deletes: [] as Array<{ table: unknown; condition: unknown }>,
    updates: [] as Array<{ table: unknown; values: unknown; condition: unknown }>,
  };
  const transaction = {
    execute: async () => [{ id: "trip-1" }],
    select: () => ({
      from: (table: unknown) => ({
        where: async () => {
          if (table === collaborators) return collaboratorRows;
          if (table === trips) return [{ name: tripName }];
          throw new Error("Unexpected table read in saveContributorChanges fixture.");
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: async (condition: unknown) => {
        operations.deletes.push({ table, condition });
      },
    }),
    update: (table: unknown) => ({
      set: (values: unknown) => ({
        where: async (condition: unknown) => {
          operations.updates.push({ table, values, condition });
        },
      }),
    }),
  };
  db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
    callback(transaction)
  );
  db.select.mockImplementation(() => {
    throw new Error("Trip name must be read while the contributor transaction is locked.");
  });
  return operations;
}

describe("saveContributorChanges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "manager-1", email: "manager@example.com" });
    assertTripAccess.mockResolvedValue("manager");
  });

  it("applies a role change and a removal in one transaction and revalidates", async () => {
    const operations = setupSaveContributorChangesDb({
      collaboratorRows: [
        {
          id: "collab-editor",
          tripId: "trip-1",
          userId: "user-peer",
          role: "editor",
          isCreator: false,
          email: "peer@example.com",
        },
        {
          id: "collab-viewer",
          tripId: "trip-1",
          userId: "user-viewer",
          role: "viewer",
          isCreator: false,
          email: "viewer@example.com",
        },
      ],
    });

    await expect(
      saveContributorChanges("trip-1", [
        { type: "role", collaboratorId: "collab-editor", fromRole: "editor", toRole: "manager" },
        { type: "remove", collaboratorId: "collab-viewer" },
      ])
    ).resolves.toEqual({ status: "success" });

    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "manager-1", "manager");
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(operations.updates).toEqual([
      expect.objectContaining({ table: collaborators, values: { role: "manager" } }),
    ]);
    expect(operations.deletes).toHaveLength(1);
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
    expect(revalidatePath).toHaveBeenCalledWith("/trips");

    expect(publishUserEvent).toHaveBeenCalledTimes(2);
    expect(publishUserEvent).toHaveBeenCalledWith("user-peer", {
      type: LiveSyncEventType.MembershipChanged,
      tripId: "trip-1",
    });
    expect(publishUserEvent).toHaveBeenCalledWith("user-viewer", {
      type: LiveSyncEventType.MembershipRemoved,
      removedUserId: "user-viewer",
      tripId: "trip-1",
      tripName: "Test Trip",
      removedByName: "manager@example.com",
      removedByEmail: "manager@example.com",
    });
    expect(publishTripEvent).toHaveBeenCalledExactlyOnceWith("trip-1", {
      type: LiveSyncEventType.MembershipChanged,
      tripId: "trip-1",
    });
    expect(removeTripSubscribersForUser).toHaveBeenCalledWith("trip-1", "user-viewer");
  });

  it("publishes membership-changed exactly once even when the batch removes multiple users", async () => {
    const operations = setupSaveContributorChangesDb({
      collaboratorRows: [
        {
          id: "collab-a",
          tripId: "trip-1",
          userId: "user-a",
          role: "editor",
          isCreator: false,
          email: "a@example.com",
        },
        {
          id: "collab-b",
          tripId: "trip-1",
          userId: "user-b",
          role: "viewer",
          isCreator: false,
          email: "b@example.com",
        },
      ],
    });

    await expect(
      saveContributorChanges("trip-1", [
        { type: "remove", collaboratorId: "collab-a" },
        { type: "remove", collaboratorId: "collab-b" },
      ])
    ).resolves.toEqual({ status: "success" });

    expect(operations.deletes).toHaveLength(2);
    expect(publishUserEvent).toHaveBeenCalledTimes(2);
    expect(publishUserEvent).toHaveBeenNthCalledWith(1, "user-a", {
      type: LiveSyncEventType.MembershipRemoved,
      removedUserId: "user-a",
      tripId: "trip-1",
      tripName: "Test Trip",
      removedByName: "manager@example.com",
      removedByEmail: "manager@example.com",
    });
    expect(publishUserEvent).toHaveBeenNthCalledWith(2, "user-b", {
      type: LiveSyncEventType.MembershipRemoved,
      removedUserId: "user-b",
      tripId: "trip-1",
      tripName: "Test Trip",
      removedByName: "manager@example.com",
      removedByEmail: "manager@example.com",
    });
    expect(publishTripEvent).toHaveBeenCalledExactlyOnceWith("trip-1", {
      type: LiveSyncEventType.MembershipChanged,
      tripId: "trip-1",
    });
  });

  it("publishes membership-changed on the trip and changed user's personal topics for a role-only batch", async () => {
    setupSaveContributorChangesDb();

    await expect(
      saveContributorChanges("trip-1", [
        { type: "role", collaboratorId: "collab-editor", fromRole: "editor", toRole: "manager" },
      ])
    ).resolves.toEqual({ status: "success" });

    expect(publishTripEvent).toHaveBeenCalledExactlyOnceWith("trip-1", {
      type: LiveSyncEventType.MembershipChanged,
      tripId: "trip-1",
    });
    expect(publishUserEvent).toHaveBeenCalledExactlyOnceWith("user-peer", {
      type: LiveSyncEventType.MembershipChanged,
      tripId: "trip-1",
    });
    expect(removeTripSubscribersForUser).not.toHaveBeenCalled();
  });

  it("publishes membership-changed on the trip topic even when a removal targets a collaborator with no linked user account", async () => {
    setupSaveContributorChangesDb({
      collaboratorRows: [
        {
          id: "collab-orphan",
          tripId: "trip-1",
          userId: null,
          role: "viewer",
          isCreator: false,
          email: "orphan@example.com",
        },
      ],
    });

    await expect(
      saveContributorChanges("trip-1", [{ type: "remove", collaboratorId: "collab-orphan" }])
    ).resolves.toEqual({ status: "success" });

    expect(publishTripEvent).toHaveBeenCalledExactlyOnceWith("trip-1", {
      type: LiveSyncEventType.MembershipChanged,
      tripId: "trip-1",
    });
    expect(publishUserEvent).not.toHaveBeenCalled();
    expect(removeTripSubscribersForUser).not.toHaveBeenCalled();
  });

  it("skips the personal publish when a role change targets a collaborator with no linked user account", async () => {
    setupSaveContributorChangesDb({
      collaboratorRows: [
        {
          id: "collab-invited",
          tripId: "trip-1",
          userId: null,
          role: "editor",
          isCreator: false,
          email: "invited@example.com",
        },
      ],
    });

    await expect(
      saveContributorChanges("trip-1", [
        { type: "role", collaboratorId: "collab-invited", fromRole: "editor", toRole: "viewer" },
      ])
    ).resolves.toEqual({ status: "success" });

    expect(publishTripEvent).toHaveBeenCalledExactlyOnceWith("trip-1", {
      type: LiveSyncEventType.MembershipChanged,
      tripId: "trip-1",
    });
    expect(publishUserEvent).not.toHaveBeenCalled();
  });

  it("publishes nothing when the batch is rejected", async () => {
    const operations = setupSaveContributorChangesDb({
      collaboratorRows: [
        {
          id: "collab-creator",
          tripId: "trip-1",
          userId: "creator-user",
          role: "manager",
          isCreator: true,
          email: "creator@example.com",
        },
      ],
    });

    const result = await saveContributorChanges("trip-1", [
      { type: "role", collaboratorId: "collab-creator", fromRole: "manager", toRole: "editor" },
    ]);

    expect(result.status).toBe("error");
    expect(operations.deletes).toEqual([]);
    expect(publishTripEvent).not.toHaveBeenCalled();
    expect(publishUserEvent).not.toHaveBeenCalled();
    expect(removeTripSubscribersForUser).not.toHaveBeenCalled();
  });

  it("rejects the whole batch when a change targets the trip creator", async () => {
    const operations = setupSaveContributorChangesDb({
      collaboratorRows: [
        {
          id: "collab-creator",
          tripId: "trip-1",
          userId: "creator-user",
          role: "manager",
          isCreator: true,
          email: "creator@example.com",
        },
      ],
    });

    const result = await saveContributorChanges("trip-1", [
      { type: "role", collaboratorId: "collab-creator", fromRole: "manager", toRole: "editor" },
    ]);

    expect(result).toEqual({
      status: "error",
      message: "The trip creator's seat cannot be changed.",
      stale: false,
    });
    expect(operations.updates).toEqual([]);
    expect(operations.deletes).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects the whole batch when a change targets the caller's own row", async () => {
    const operations = setupSaveContributorChangesDb({
      collaboratorRows: [
        {
          id: "collab-self",
          tripId: "trip-1",
          userId: "manager-1",
          role: "manager",
          isCreator: false,
          email: "manager@example.com",
        },
      ],
    });

    const result = await saveContributorChanges("trip-1", [{ type: "remove", collaboratorId: "collab-self" }]);

    expect(result).toEqual({ status: "error", message: expect.any(String) as string, stale: false });
    expect(operations.deletes).toEqual([]);
    expect(operations.updates).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects the whole batch when a change id does not belong to the trip", async () => {
    const operations = setupSaveContributorChangesDb({
      collaboratorRows: [
        {
          id: "collab-other-trip",
          tripId: "trip-2",
          userId: "user-other",
          role: "viewer",
          isCreator: false,
          email: "other@example.com",
        },
      ],
    });

    const result = await saveContributorChanges("trip-1", [{ type: "remove", collaboratorId: "collab-other-trip" }]);

    expect(result).toEqual({ status: "error", message: expect.any(String) as string, stale: true });
    expect(operations.deletes).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects the whole batch when a role change fails its fromRole guard", async () => {
    const operations = setupSaveContributorChangesDb({
      collaboratorRows: [
        {
          id: "collab-editor",
          tripId: "trip-1",
          userId: "user-peer",
          role: "manager",
          isCreator: false,
          email: "peer@example.com",
        },
      ],
    });

    const result = await saveContributorChanges("trip-1", [
      { type: "role", collaboratorId: "collab-editor", fromRole: "editor", toRole: "viewer" },
    ]);

    expect(result).toEqual({ status: "error", message: expect.any(String) as string, stale: true });
    expect(operations.updates).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects the whole batch when a targeted row no longer exists", async () => {
    const operations = setupSaveContributorChangesDb({ collaboratorRows: [] });

    const result = await saveContributorChanges("trip-1", [{ type: "remove", collaboratorId: "collab-gone" }]);

    expect(result).toEqual({ status: "error", message: expect.any(String) as string, stale: true });
    expect(operations.deletes).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects the whole batch when the same collaboratorId appears twice", async () => {
    const operations = setupSaveContributorChangesDb();

    const result = await saveContributorChanges("trip-1", [
      { type: "role", collaboratorId: "collab-editor", fromRole: "editor", toRole: "manager" },
      { type: "remove", collaboratorId: "collab-editor" },
    ]);

    expect(result.status).toBe("error");
    expect(db.transaction).not.toHaveBeenCalled();
    expect(operations.updates).toEqual([]);
    expect(operations.deletes).toEqual([]);
  });

  it("rejects an invalid change type before opening a transaction", async () => {
    const result = await saveContributorChanges("trip-1", [
      { type: "archive" as "remove", collaboratorId: "collab-editor" },
    ]);

    expect(result.status).toBe("error");
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("does not swallow an unexpected error from within the transaction", async () => {
    setupSaveContributorChangesDb();
    db.transaction.mockImplementation(async () => {
      throw new Error("connection reset");
    });

    await expect(
      saveContributorChanges("trip-1", [{ type: "remove", collaboratorId: "collab-editor" }])
    ).rejects.toThrow("connection reset");
  });

  it("returns success without a transaction for an empty batch", async () => {
    const result = await saveContributorChanges("trip-1", []);

    expect(result).toEqual({ status: "success" });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("rejects a batch over the contributor-changes cap before opening a transaction", async () => {
    const oversizedBatch = Array.from({ length: 51 }, (_unused, index) => ({
      type: "remove" as const,
      collaboratorId: `collab-${index}`,
    }));

    const result = await saveContributorChanges("trip-1", oversizedBatch);

    expect(result).toEqual({ status: "error", message: expect.any(String) as string });
    expect(db.transaction).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects an invalid toRole before opening a transaction", async () => {
    const result = await saveContributorChanges("trip-1", [
      { type: "role", collaboratorId: "collab-editor", fromRole: "editor", toRole: "owner" as "editor" },
    ]);

    expect(result.status).toBe("error");
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("denies a non-manager before opening a transaction", async () => {
    assertTripAccess.mockRejectedValue(new Error("not found"));

    await expect(
      saveContributorChanges("trip-1", [{ type: "remove", collaboratorId: "collab-editor" }])
    ).rejects.toThrow("not found");

    expect(db.transaction).not.toHaveBeenCalled();
  });
});

interface TransactionFixture {
  checklistRows?: Array<{ id: string }>;
  eventDocs?: Array<{ eventId: string | null; url: string | null }>;
  existingDays: Array<{ id: string; tripId: string; dayNumber: number; date: string | null; label: string }>;
  expenseRows?: unknown[];
  noteRows?: Array<{ id: string }>;
  removedEvents?: Array<{ id: string; name: string; dayId: string | null; position: number }>;
  tripRow?: { id: string; startDate: string | null; endDate: string | null };
}

function createTransactionMock({
  checklistRows = [],
  eventDocs = [],
  existingDays,
  expenseRows = [],
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

        if (table === expenses) {
          return {
            where: async () => expenseRows,
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
});

describe("updateTripMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockResolvedValue(undefined);
    getStorageAdapter.mockReturnValue({ put: adapterPut, del: adapterDel });
    adapterDel.mockResolvedValue(undefined);
  });

  it("rejects unsupported budget currencies before mutating", async () => {
    await expect(updateTripMetadata("trip-1", { budgetCurrency: "zzz" })).rejects.toThrow("Invalid budget currency");
    expect(db.transaction).not.toHaveBeenCalled();
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
    const tripUpdate = operations.updates.find((entry) => entry.table === trips);
    expect(tripUpdate?.values).toEqual(expect.objectContaining({ transitMode: TransitMode.Transit }));
  });

  it("rejects an invalid transit mode before mutating", async () => {
    await expect(updateTripMetadata("trip-1", { transitMode: "flying" as TransitMode })).rejects.toThrow(
      "Invalid transit mode"
    );
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
    expect(operations.deletes).toContain(events);
    expect(operations.deletes).toContain(days);
    expect(operations.updates.some((entry) => entry.table === trips)).toBe(true);
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
    expect(revalidatePath).toHaveBeenCalledWith("/trips");
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
});

interface InvitationFixture {
  collaboratorRows?: Array<{ id: string }>;
  invitationRows?: Array<{ id: string; status: string }>;
  userRows?: Array<{ id: string; email: string | null }>;
}

function setupInviteContributorDb({
  collaboratorRows = [],
  invitationRows = [],
  userRows = [{ id: "invitee-1", email: "invitee@example.com" }],
}: InvitationFixture = {}) {
  const operations = {
    deletes: [] as unknown[],
    inserts: [] as Array<{ table: unknown; values: unknown }>,
    updates: [] as Array<{ table: unknown; values: unknown }>,
  };
  const transaction = {
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
    select: () => ({
      from: (table: unknown) => ({
        where: async () => {
          if (table === users) return userRows;
          if (table === collaborators) return collaboratorRows;
          if (table === invitations) return invitationRows;
          throw new Error("Unexpected table read in invitation fixture.");
        },
      }),
    }),
    update: (table: unknown) => ({
      set: (values: unknown) => ({
        where: () => {
          operations.updates.push({ table, values });
          return { returning: async () => [{ id: "invite-1" }] };
        },
      }),
    }),
  };

  db.select.mockReturnValue({
    from: (table: unknown) => ({
      where: async () => {
        if (table === users) return userRows;
        throw new Error("Unexpected non-transactional table read in invitation fixture.");
      },
    }),
  });
  db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
    callback(transaction)
  );

  return operations;
}

describe("inviteContributor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "manager-1", email: "manager@example.com" });
    assertTripAccess.mockResolvedValue(undefined);
  });

  it("creates a normalized, pending viewer invitation for an existing account", async () => {
    const operations = setupInviteContributorDb();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T12:00:00.000Z"));

    try {
      await expect(inviteContributor("trip-1", "  INVITEE@EXAMPLE.COM  ")).resolves.toEqual({ status: "invited" });

      expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "manager-1", "manager");
      expect(operations.inserts).toEqual([
        {
          table: invitations,
          values: expect.objectContaining({
            tripId: "trip-1",
            email: "invitee@example.com",
            role: "viewer",
            status: "pending",
            invitedBy: "manager-1",
            expiresAt: new Date("2026-09-04T12:00:00.000Z"),
          }),
        },
      ]);
      expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns an error without writing when no Packt account matches", async () => {
    const operations = setupInviteContributorDb({ userRows: [] });

    await expect(inviteContributor("trip-1", "missing@example.com")).resolves.toEqual({
      status: "error",
      message: "No Packt account found for this email",
      errorCode: "no-account",
    });

    expect(db.transaction).not.toHaveBeenCalled();
    expect(operations.inserts).toEqual([]);
  });

  it("updates a pending invitation in place and returns resent", async () => {
    const operations = setupInviteContributorDb({ invitationRows: [{ id: "invite-1", status: "pending" }] });

    await expect(inviteContributor("trip-1", "invitee@example.com", "editor")).resolves.toEqual({ status: "resent" });

    expect(operations.inserts).toEqual([]);
    expect(operations.updates).toEqual([
      {
        table: invitations,
        values: expect.objectContaining({ role: "editor", expiresAt: expect.any(Date) }),
      },
    ]);
  });

  it("replaces a declined invitation with a new pending invitation", async () => {
    const operations = setupInviteContributorDb({ invitationRows: [{ id: "invite-1", status: "declined" }] });

    await expect(inviteContributor("trip-1", "invitee@example.com", "editor")).resolves.toEqual({ status: "invited" });

    expect(operations.deletes).toEqual([invitations]);
    expect(operations.inserts).toEqual([
      {
        table: invitations,
        values: expect.objectContaining({ role: "editor", status: "pending" }),
      },
    ]);
  });

  it("returns an error without writing when invitee is already on trip", async () => {
    const operations = setupInviteContributorDb({ collaboratorRows: [{ id: "collaborator-1" }] });

    await expect(inviteContributor("trip-1", "invitee@example.com")).resolves.toEqual({
      status: "error",
      message: "This person is already a collaborator on this trip",
      errorCode: "already-collaborator",
    });

    expect(operations.inserts).toEqual([]);
    expect(operations.updates).toEqual([]);
  });

  it("returns an error without writing when manager invites themself", async () => {
    const operations = setupInviteContributorDb();

    await expect(inviteContributor("trip-1", " MANAGER@example.com ")).resolves.toEqual({
      status: "error",
      message: "You cannot invite yourself to this trip",
      errorCode: "self-invite",
    });

    expect(db.transaction).not.toHaveBeenCalled();
    expect(operations.inserts).toEqual([]);
  });

  it("rejects editors before any write", async () => {
    setupInviteContributorDb();
    assertTripAccess.mockRejectedValue(new Error("not found"));

    await expect(inviteContributor("trip-1", "invitee@example.com")).rejects.toThrow("not found");

    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("returns an error without writing for an invalid role", async () => {
    const operations = setupInviteContributorDb();

    await expect(inviteContributor("trip-1", "invitee@example.com", "owner" as "viewer")).resolves.toEqual({
      status: "error",
      message: "Invalid collaborator role",
      errorCode: "invalid-role",
    });

    expect(operations.inserts).toEqual([]);
  });

  it("returns a friendly error when a concurrent invite wins the unique-index race", async () => {
    db.select.mockReturnValue({
      from: (table: unknown) => ({
        where: async () => {
          if (table === users) return [{ id: "invitee-1", email: "invitee@example.com" }];
          throw new Error("Unexpected non-transactional table read.");
        },
      }),
    });
    db.transaction.mockImplementation(async (callback: (transaction: unknown) => Promise<unknown>) =>
      callback({
        insert: () => ({
          values: async () => {
            throw Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" });
          },
        }),
        select: () => ({
          from: (table: unknown) => ({
            where: async () => {
              if (table === collaborators || table === invitations) return [];
              throw new Error("Unexpected transactional table read.");
            },
          }),
        }),
      })
    );

    await expect(inviteContributor("trip-1", "invitee@example.com")).resolves.toEqual({
      status: "error",
      message: "This person was just invited by someone else. Try again.",
      errorCode: "invite-conflict",
    });
  });
});

interface AcceptDeclineFixture {
  matchedRows?: Array<{ id: string; tripId: string; role: string; email: string; status: string; expiresAt: Date }>;
  diagnosticRow?: { id: string; email: string; status: string; expiresAt: Date } | null;
}

function setupAcceptDeclineDb({ matchedRows = [], diagnosticRow = null }: AcceptDeclineFixture = {}) {
  const operations = {
    inserts: [] as Array<{ table: unknown; values: unknown; conflictUpdate: unknown }>,
    updates: [] as Array<{ table: unknown; values: unknown; condition: unknown }>,
  };

  const transaction = {
    update: vi.fn(),
    insert: vi.fn(),
  };

  transaction.update.mockReturnValue({
    set: (values: unknown) => ({
      where: (condition: unknown) => ({
        returning: async () => {
          operations.updates.push({ table: invitations, values, condition });
          return matchedRows;
        },
      }),
    }),
  });
  db.update.mockImplementation(transaction.update);

  db.select.mockReturnValue({
    from: (table: unknown) => ({
      where: async () => {
        if (table === invitations) return diagnosticRow ? [diagnosticRow] : [];
        throw new Error("Unexpected table read in accept/decline fixture.");
      },
    }),
  });

  transaction.insert.mockReturnValue({
    values: (values: unknown) => ({
      onConflictDoUpdate: async (conflictUpdate: unknown) => {
        operations.inserts.push({ table: collaborators, values, conflictUpdate });
      },
    }),
  });

  db.transaction.mockImplementation(async (callback: (currentTransaction: typeof transaction) => Promise<unknown>) =>
    callback(transaction)
  );

  return operations;
}

describe("acceptInvitation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "user-1", email: "invitee@example.com", name: "Invitee Person" });
  });

  it("accepts a pending, unexpired invitation and creates the collaborator row", async () => {
    const operations = setupAcceptDeclineDb({
      matchedRows: [
        {
          id: "invite-1",
          tripId: "trip-1",
          role: "editor",
          email: "invitee@example.com",
          status: "accepted",
          expiresAt: new Date("2026-09-10T00:00:00.000Z"),
        },
      ],
    });

    await expect(acceptInvitation("invite-1")).resolves.toEqual({ status: "accepted", tripId: "trip-1" });

    expect(operations.inserts).toEqual([
      {
        table: collaborators,
        values: expect.objectContaining({
          tripId: "trip-1",
          userId: "user-1",
          email: "invitee@example.com",
          name: "Invitee Person",
          role: "editor",
          isCreator: false,
        }),
        conflictUpdate: expect.anything(),
      },
    ]);
    expect(operations.updates).toEqual([
      expect.objectContaining({ table: invitations, values: { status: "accepted" }, condition: expect.anything() }),
    ]);
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(revalidatePath).toHaveBeenCalledWith("/trips");
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
    expect(publishTripEvent).toHaveBeenCalledWith("trip-1", {
      type: LiveSyncEventType.MembershipChanged,
      tripId: "trip-1",
    });
    expect(publishUserEvent).toHaveBeenCalledWith("user-1", {
      type: LiveSyncEventType.MembershipChanged,
      tripId: "trip-1",
    });
  });

  it("returns an expired error and creates no collaborator when the invitation is past expiresAt", async () => {
    const operations = setupAcceptDeclineDb({
      diagnosticRow: {
        id: "invite-1",
        email: "invitee@example.com",
        status: "pending",
        expiresAt: new Date("2020-01-01T00:00:00.000Z"),
      },
    });

    await expect(acceptInvitation("invite-1")).resolves.toEqual({
      status: "error",
      message: "This invitation has expired.",
    });
    expect(operations.inserts).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(publishTripEvent).not.toHaveBeenCalled();
    expect(publishUserEvent).not.toHaveBeenCalled();
  });

  it("returns a generic error when the invitation was already accepted or declined", async () => {
    setupAcceptDeclineDb({
      diagnosticRow: {
        id: "invite-1",
        email: "invitee@example.com",
        status: "declined",
        expiresAt: new Date("2026-09-10T00:00:00.000Z"),
      },
    });

    await expect(acceptInvitation("invite-1")).resolves.toEqual({
      status: "error",
      message: "This invitation is no longer pending.",
    });
  });

  it("returns a rescind-specific error when the manager rescinded it moments before the click landed", async () => {
    const operations = setupAcceptDeclineDb({
      diagnosticRow: {
        id: "invite-1",
        email: "invitee@example.com",
        status: "rescinded",
        expiresAt: new Date("2026-09-10T00:00:00.000Z"),
      },
    });

    await expect(acceptInvitation("invite-1")).resolves.toEqual({
      status: "error",
      message: "This invitation was rescinded by the trip owner.",
    });
    expect(operations.inserts).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns an error without creating a duplicate collaborator on a double-click", async () => {
    const operations = setupAcceptDeclineDb({
      matchedRows: [
        {
          id: "invite-1",
          tripId: "trip-1",
          role: "editor",
          email: "invitee@example.com",
          status: "accepted",
          expiresAt: new Date("2026-09-10T00:00:00.000Z"),
        },
      ],
    });
    await expect(acceptInvitation("invite-1")).resolves.toEqual({ status: "accepted", tripId: "trip-1" });
    expect(operations.inserts).toHaveLength(1);

    setupAcceptDeclineDb({
      diagnosticRow: {
        id: "invite-1",
        email: "invitee@example.com",
        status: "accepted",
        expiresAt: new Date("2026-09-10T00:00:00.000Z"),
      },
    });
    await expect(acceptInvitation("invite-1")).resolves.toEqual({
      status: "error",
      message: "This invitation is no longer pending.",
    });
    expect(operations.inserts).toHaveLength(1);
  });

  it("returns a wrong-account error when the invitation belongs to a different email", async () => {
    setupAcceptDeclineDb({
      diagnosticRow: {
        id: "invite-1",
        email: "someone-else@example.com",
        status: "pending",
        expiresAt: new Date("2026-09-10T00:00:00.000Z"),
      },
    });

    await expect(acceptInvitation("invite-1")).resolves.toEqual({
      status: "error",
      message: "This invitation is not addressed to your account.",
    });
  });

  it("returns a not-found error when no invitation matches the given ID", async () => {
    setupAcceptDeclineDb({ diagnosticRow: null });

    await expect(acceptInvitation("missing-invite")).resolves.toEqual({
      status: "error",
      message: "Invitation not found.",
    });
  });
});

describe("declineInvitation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "user-1", email: "invitee@example.com", name: "Invitee Person" });
  });

  it("declines a pending, unexpired invitation without creating a collaborator", async () => {
    const operations = setupAcceptDeclineDb({
      matchedRows: [
        {
          id: "invite-1",
          tripId: "trip-1",
          role: "viewer",
          email: "invitee@example.com",
          status: "declined",
          expiresAt: new Date("2026-09-10T00:00:00.000Z"),
        },
      ],
    });

    await expect(declineInvitation("invite-1")).resolves.toEqual({ status: "declined" });

    expect(operations.inserts).toEqual([]);
    expect(operations.updates).toEqual([
      expect.objectContaining({ table: invitations, values: { status: "declined" }, condition: expect.anything() }),
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/trips");
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
    expect(publishTripEvent).toHaveBeenCalledWith("trip-1", {
      type: LiveSyncEventType.MembershipChanged,
      tripId: "trip-1",
    });
    expect(publishUserEvent).toHaveBeenCalledWith("user-1", {
      type: LiveSyncEventType.MembershipChanged,
      tripId: "trip-1",
    });
  });

  it("returns a generic error when the invitation is already resolved", async () => {
    setupAcceptDeclineDb({
      diagnosticRow: {
        id: "invite-1",
        email: "invitee@example.com",
        status: "accepted",
        expiresAt: new Date("2026-09-10T00:00:00.000Z"),
      },
    });

    await expect(declineInvitation("invite-1")).resolves.toEqual({
      status: "error",
      message: "This invitation is no longer pending.",
    });
    expect(publishTripEvent).not.toHaveBeenCalled();
    expect(publishUserEvent).not.toHaveBeenCalled();
  });

  it("returns an expired error when the invitation can no longer be declined", async () => {
    setupAcceptDeclineDb({
      diagnosticRow: {
        id: "invite-1",
        email: "invitee@example.com",
        status: "pending",
        expiresAt: new Date("2020-01-01T00:00:00.000Z"),
      },
    });

    await expect(declineInvitation("invite-1")).resolves.toEqual({
      status: "error",
      message: "This invitation has expired.",
    });
  });

  it("returns a rescind-specific error when the invitation was withdrawn", async () => {
    setupAcceptDeclineDb({
      diagnosticRow: {
        id: "invite-1",
        email: "invitee@example.com",
        status: "rescinded",
        expiresAt: new Date("2026-09-10T00:00:00.000Z"),
      },
    });

    await expect(declineInvitation("invite-1")).resolves.toEqual({
      status: "error",
      message: "This invitation was rescinded by the trip owner.",
    });
  });

  it("returns a not-found error when the invitation does not exist", async () => {
    setupAcceptDeclineDb({ diagnosticRow: null });

    await expect(declineInvitation("missing-invite")).resolves.toEqual({
      status: "error",
      message: "Invitation not found.",
    });
  });

  it("returns a wrong-account error when the invitation belongs to a different email", async () => {
    setupAcceptDeclineDb({
      diagnosticRow: {
        id: "invite-1",
        email: "someone-else@example.com",
        status: "pending",
        expiresAt: new Date("2026-09-10T00:00:00.000Z"),
      },
    });

    await expect(declineInvitation("invite-1")).resolves.toEqual({
      status: "error",
      message: "This invitation is not addressed to your account.",
    });
  });
});

interface RescindInvitationFixture {
  // The row the atomic UPDATE would have matched — present only when the invitation truly is
  // `pending` and belongs to `tripId`, mirroring the real `WHERE id = ? AND tripId = ? AND status =
  // 'pending'` predicate rather than an independently-asserted outcome.
  matchedRow?: { id: string; tripId: string; status: InvitationStatus } | null;
  // The row the post-failure diagnostic SELECT would find, used only to pick between "not found"
  // (missing or wrong trip) and "no longer pending" (right trip, wrong status).
  diagnosticRow?: { id: string; tripId: string } | null;
}

interface DismissInvitationFixture {
  matchedRow?: { id: string; tripId: string; status: InvitationStatus } | null;
  diagnosticRow?: { id: string; tripId: string } | null;
}

function setupDismissInvitationDb({ matchedRow = null, diagnosticRow = null }: DismissInvitationFixture = {}) {
  const operations = {
    deletes: [] as Array<{ table: unknown; condition: unknown }>,
  };

  db.delete.mockReturnValue({
    where: (condition: unknown) => ({
      returning: async () => {
        operations.deletes.push({ table: invitations, condition });
        return matchedRow ? [matchedRow] : [];
      },
    }),
  });

  db.select.mockReturnValue({
    from: (table: unknown) => ({
      where: async () => {
        if (table === invitations) return diagnosticRow ? [diagnosticRow] : [];
        throw new Error("Unexpected table read in dismiss fixture.");
      },
    }),
  });

  return operations;
}

function setupRescindInvitationDb({ matchedRow = null, diagnosticRow = null }: RescindInvitationFixture = {}) {
  const operations = {
    updates: [] as Array<{ table: unknown; values: unknown; condition: unknown }>,
  };

  db.update.mockReturnValue({
    set: (values: unknown) => ({
      where: (condition: unknown) => ({
        returning: async () => {
          operations.updates.push({ table: invitations, values, condition });
          return matchedRow ? [matchedRow] : [];
        },
      }),
    }),
  });

  db.select.mockReturnValue({
    from: (table: unknown) => ({
      where: async () => {
        if (table === invitations) return diagnosticRow ? [diagnosticRow] : [];
        throw new Error("Unexpected table read in rescind fixture.");
      },
    }),
  });

  return operations;
}

describe("rescindInvitation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "manager-1", email: "manager@example.com" });
    assertTripAccess.mockResolvedValue(undefined);
  });

  it("rescinds a pending invitation belonging to the managed trip", async () => {
    const operations = setupRescindInvitationDb({
      matchedRow: { id: "invite-1", tripId: "trip-1", status: "rescinded" },
    });

    await expect(rescindInvitation("trip-1", "invite-1")).resolves.toEqual({ status: "success" });

    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "manager-1", "manager");
    expect(operations.updates).toEqual([
      expect.objectContaining({ table: invitations, values: { status: "rescinded" }, condition: expect.anything() }),
    ]);
    expect(inspect(operations.updates[0]?.condition, { depth: 8 })).toContain("pending");
    expect(revalidatePath).toHaveBeenCalledWith("/trips");
    expect(publishTripEvent).toHaveBeenCalledWith("trip-1", {
      type: LiveSyncEventType.MembershipChanged,
      tripId: "trip-1",
    });
    expect(publishUserEvent).not.toHaveBeenCalled();
  });

  it.each(["rescinded", "accepted", "declined"])("rejects an already-%s invitation", async () => {
    const operations = setupRescindInvitationDb({
      diagnosticRow: { id: "invite-1", tripId: "trip-1" },
    });

    await expect(rescindInvitation("trip-1", "invite-1")).resolves.toEqual({
      status: "error",
      message: "Invitation is no longer pending.",
    });

    // The invitation's real status never reaches the atomic UPDATE's WHERE clause in this fixture —
    // it only drives which branch of `rescindInvitation` we're documenting via the test title (the
    // %s in each case name). What actually proves the UPDATE's status guard exists is the predicate
    // assertion below:
    // a production change that dropped `eq(invitations.status, "pending")` would still return zero
    // rows here (since `matchedRow` is unset), but this assertion on the composed WHERE clause fails.
    expect(inspect(operations.updates[0]?.condition, { depth: 8 })).toContain("pending");
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(publishTripEvent).not.toHaveBeenCalled();
  });

  it("rejects an invitation that belongs to a different trip", async () => {
    setupRescindInvitationDb({
      diagnosticRow: { id: "invite-2", tripId: "trip-2" },
    });

    await expect(rescindInvitation("trip-1", "invite-2")).resolves.toEqual({
      status: "error",
      message: "Invitation not found.",
    });

    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects an editor before reading or writing invitations", async () => {
    assertTripAccess.mockRejectedValue(new Error("not found"));

    await expect(rescindInvitation("trip-1", "invite-1")).rejects.toThrow("not found");

    expect(db.update).not.toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
  });

  it("returns not found for a missing invitation", async () => {
    setupRescindInvitationDb();

    await expect(rescindInvitation("trip-1", "missing-invite")).resolves.toEqual({
      status: "error",
      message: "Invitation not found.",
    });

    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("dismissInvitation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "manager-1", email: "manager@example.com" });
    assertTripAccess.mockResolvedValue(undefined);
  });

  it("hard-deletes a non-pending invitation belonging to the managed trip", async () => {
    const operations = setupDismissInvitationDb({
      matchedRow: { id: "invite-1", tripId: "trip-1", status: "declined" },
    });

    await expect(dismissInvitation("trip-1", "invite-1")).resolves.toEqual({ status: "success" });

    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "manager-1", "manager");
    expect(operations.deletes).toHaveLength(1);
    const deletionCondition = inspect(operations.deletes[0]?.condition, { depth: 8 });
    expect(deletionCondition).toContain("pending");
    expect(deletionCondition).toContain("trip-1");
    expect(revalidatePath).toHaveBeenCalledWith("/trips");
  });

  it("rejects a pending invitation without deletion success or revalidation", async () => {
    const operations = setupDismissInvitationDb({
      diagnosticRow: { id: "invite-1", tripId: "trip-1" },
    });

    await expect(dismissInvitation("trip-1", "invite-1")).resolves.toEqual({
      status: "error",
      message: "Invitation is still pending.",
    });

    expect(operations.deletes).toHaveLength(1);
    expect(inspect(operations.deletes[0]?.condition, { depth: 8 })).toContain("pending");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects an invitation from another trip without revealing its state", async () => {
    setupDismissInvitationDb({ diagnosticRow: { id: "invite-2", tripId: "trip-2" } });

    await expect(dismissInvitation("trip-1", "invite-2")).resolves.toEqual({
      status: "error",
      message: "Invitation not found.",
    });

    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a missing invitation without revalidating", async () => {
    setupDismissInvitationDb();

    await expect(dismissInvitation("trip-1", "missing-invite")).resolves.toEqual({
      status: "error",
      message: "Invitation not found.",
    });

    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a non-manager before reading or deleting invitations", async () => {
    assertTripAccess.mockRejectedValue(new Error("not found"));

    await expect(dismissInvitation("trip-1", "invite-1")).rejects.toThrow("not found");

    expect(db.delete).not.toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
  });
});

describe("createTrip", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
    requireUser.mockResolvedValue({
      id: "user-1",
      email: "test@example.com",
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

  it("rejects unsupported budget currencies before inserting a trip", async () => {
    const operations = setupCreateTripDb(null);

    await expect(createTrip({ name: "Tokyo", budgetCurrency: "zzz" })).rejects.toThrow("Invalid budget currency");
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
            for: async () => [{ id: "user-1", email: "test@example.com", name: "Test User", currency, transitMode }],
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

    expect(operations.inserts).toContainEqual({
      table: trips,
      values: expect.objectContaining({ transitMode: "walk" }),
    });
  });

  it("defaults to drive when both input and user preference are null", async () => {
    const operations = setupCreateTripDb(null);

    await expect(createTrip({ name: "Test" })).resolves.toEqual({ tripId: "trip-1" });

    expect(operations.inserts).toContainEqual({
      table: trips,
      values: expect.objectContaining({ transitMode: "drive" }),
    });
  });

  it("reads transit mode and currency from inside the transaction, not from a pre-transaction snapshot", async () => {
    const lockPreferenceRowSpy = vi.fn(async () => [
      { id: "user-1", email: "test@example.com", name: "Test User", currency: "EUR", transitMode: "transit" },
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

describe("searchCoverImages", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "test-unsplash-key");
    requireUser.mockResolvedValue({ id: "user-1" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("maps Unsplash response to the action return shape", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            id: "abc123",
            urls: { regular: "https://images.unsplash.com/abc" },
            user: {
              name: "John Photographer",
              links: { html: "https://unsplash.com/@john-photographer" },
            },
            alt_description: "Tokyo skyline",
            description: null,
          },
        ],
      }),
    });

    await expect(searchCoverImages("Tokyo")).resolves.toEqual([
      {
        id: "abc123",
        url: "https://images.unsplash.com/abc",
        photographer: "John Photographer",
        photographerUrl: "https://unsplash.com/@john-photographer",
        alt: "Tokyo skyline",
      },
    ]);
    expect(requireUser).toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.unsplash.com/search/photos?query=Tokyo+travel&orientation=landscape&page=1&per_page=19",
      {
        signal: expect.any(AbortSignal),
        headers: {
          Authorization: "Client-ID test-unsplash-key",
        },
      }
    );
  });

  it("simplifies verbose location queries to city + region before calling Unsplash", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });

    await searchCoverImages("Heber City, Utah, United States");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("query=Heber%20City%2C%20Utah+travel"),
      expect.anything()
    );
  });

  it("leaves 2-part location queries unchanged", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });

    await searchCoverImages("Paris, France");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("query=Paris%2C%20France+travel"),
      expect.anything()
    );
  });

  it("leaves single-part queries unchanged", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });

    await searchCoverImages("Tokyo");

    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("query=Tokyo+travel"), expect.anything());
  });

  it("throws when Unsplash returns a non-ok status", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401 });

    await expect(searchCoverImages("Tokyo")).rejects.toThrow("Unsplash search error: 401");
  });

  it("throws when the Unsplash key is missing", async () => {
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "");

    await expect(searchCoverImages("Tokyo")).rejects.toThrow("UNSPLASH_ACCESS_KEY is not configured");
    expect(requireUser).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws when query is empty", async () => {
    await expect(searchCoverImages("")).rejects.toThrow("Search query must not be empty");
    expect(requireUser).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws when fetch network request fails", async () => {
    mockFetch.mockRejectedValue(new Error("Network failure"));

    await expect(searchCoverImages("Tokyo")).rejects.toThrow("Unsplash search request failed: Network failure");
  });

  it("throws when response JSON is malformed", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    });

    await expect(searchCoverImages("Tokyo")).rejects.toThrow("Unsplash search request failed");
  });

  it("returns empty array when results are empty", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });

    await expect(searchCoverImages("Tokyo")).resolves.toEqual([]);
  });

  it("uses description as fallback when alt_description is null", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            id: "xyz",
            urls: { regular: "https://images.unsplash.com/xyz" },
            user: { name: "Jane", links: { html: "https://unsplash.com/@jane" } },
            alt_description: null,
            description: "A beautiful view",
          },
        ],
      }),
    });

    const result = await searchCoverImages("Paris");
    expect(result[0].alt).toBe("A beautiful view");
  });

  it("uses empty string when both alt_description and description are null", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            id: "xyz",
            urls: { regular: "https://images.unsplash.com/xyz" },
            user: { name: "Jane", links: { html: "https://unsplash.com/@jane" } },
            alt_description: null,
            description: null,
          },
        ],
      }),
    });

    const result = await searchCoverImages("Paris");
    expect(result[0].alt).toBe("");
  });

  it("returns stub photographer profile urls in E2E mode", async () => {
    vi.stubEnv("E2E_UNSPLASH_STUB", "true");
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "");

    const results = await searchCoverImages("Paris", { page: 1, perPage: 2 });

    expect(results).toEqual([
      expect.objectContaining({
        id: "stub-paris-1",
        photographer: "Stub Photographer 1",
        photographerUrl: "https://unsplash.com/@stub-photographer-1",
        alt: "Paris travel photo 1",
      }),
      expect.objectContaining({
        id: "stub-paris-2",
        photographer: "Stub Photographer 2",
        photographerUrl: "https://unsplash.com/@stub-photographer-2",
        alt: "Paris travel photo 2",
      }),
    ]);
    expect(results[0]?.url).toContain("data:image/svg+xml");
    expect(results[1]?.url).toContain("data:image/svg+xml");

    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("packing action delegation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    addPackingItemAction.mockResolvedValue(undefined);
    pullTemplatesOntoTripAction.mockResolvedValue({ added: 1, skipped: 0 });
    removePackingItemAction.mockResolvedValue(undefined);
    reorderPackingItemsAction.mockResolvedValue(undefined);
    togglePackingItemAction.mockResolvedValue(undefined);
    updatePackingItemAction.mockResolvedValue(undefined);
    saveTripListAsTemplateAction.mockResolvedValue({ templateId: "tmpl-new" });
  });

  it("delegates addPackingItem with the same arguments", async () => {
    await expect(addPackingItem("trip-1", { name: "Passport" })).resolves.toBeUndefined();
    expect(addPackingItemAction).toHaveBeenCalledWith("trip-1", { name: "Passport" });
  });

  it("delegates updatePackingItem with the same arguments", async () => {
    await expect(updatePackingItem("item-1", { name: "Updated" })).resolves.toBeUndefined();
    expect(updatePackingItemAction).toHaveBeenCalledWith("item-1", { name: "Updated" });
  });

  it("delegates togglePackingItem with the same arguments", async () => {
    await expect(togglePackingItem("item-1")).resolves.toBeUndefined();
    expect(togglePackingItemAction).toHaveBeenCalledWith("item-1");
  });

  it("delegates removePackingItem with the same arguments", async () => {
    await expect(removePackingItem("item-1")).resolves.toBeUndefined();
    expect(removePackingItemAction).toHaveBeenCalledWith("item-1");
  });

  it("delegates reorderPackingItems with the same arguments", async () => {
    const orderedItems = [{ id: "item-1", labelId: null, position: 0 }];
    await expect(reorderPackingItems("trip-1", orderedItems)).resolves.toBeUndefined();
    expect(reorderPackingItemsAction).toHaveBeenCalledWith("trip-1", orderedItems);
  });

  it("delegates pullTemplatesOntoTrip with the same arguments", async () => {
    await expect(pullTemplatesOntoTrip("trip-1", ["tmpl-1"], "list-1")).resolves.toEqual({ added: 1, skipped: 0 });
    expect(pullTemplatesOntoTripAction).toHaveBeenCalledWith("trip-1", ["tmpl-1"], "list-1");
  });
});

describe("saveTripListAsTemplate", () => {
  beforeEach(() => {
    vi.resetAllMocks();
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
