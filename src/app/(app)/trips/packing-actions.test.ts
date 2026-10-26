// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { assertTripAccess, db, recordTripUpdated, requireUser, revalidatePath } = vi.hoisted(() => ({
  assertTripAccess: vi.fn(),
  db: {
    delete: vi.fn(),
    execute: vi.fn(),
    insert: vi.fn(),
    select: vi.fn(),
    transaction: vi.fn(),
    update: vi.fn(),
  },
  recordTripUpdated: vi.fn(),
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth-helpers", () => ({
  assertTripAccess,
  requireUser,
}));

vi.mock("@/db", () => ({
  db,
}));

vi.mock("next/cache", () => ({
  revalidatePath,
}));

vi.mock("@/lib/trip-activity", () => ({ recordTripUpdated }));

import {
  addPackingItem,
  createPackingList,
  deletePackingList,
  pullTemplatesOntoTrip,
  removePackingItem,
  removePackingSection,
  renamePackingList,
  reorderPackingItems,
  saveTripListAsTemplate,
  togglePackingItem,
  updatePackingItem,
} from "./packing-actions";

function mockSimpleSelect(rows: unknown[]) {
  return {
    from: () => ({
      where: async () => rows,
    }),
  };
}

function mockOrderedSelect(rows: unknown[]) {
  return {
    from: () => ({
      where: () => ({
        orderBy: async () => rows,
      }),
    }),
  };
}

describe("packing actions hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockResolvedValue(undefined);
  });

  it.each([["wrong trip"], ["non-label item"]])(
    "rejects addPackingItem for an invalid labelId caused by %s",
    async () => {
      const tx = {
        execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
        insert: vi.fn(),
        select: vi.fn().mockReturnValueOnce(mockSimpleSelect([])),
        update: vi.fn(),
      };
      db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx));

      await expect(addPackingItem("trip-1", { name: "Passport", labelId: "label-1" })).rejects.toThrow(
        "Invalid labelId: referenced row is not a label or belongs to a different trip"
      );

      expect(db.transaction).toHaveBeenCalledOnce();
      expect(db.insert).not.toHaveBeenCalled();
    }
  );

  it("rejects addPackingItem when listId belongs to a different trip", async () => {
    const tx = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      insert: vi.fn(),
      select: vi.fn().mockReturnValueOnce(mockSimpleSelect([])),
      update: vi.fn(),
    };
    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx));

    await expect(addPackingItem("trip-1", { name: "Passport", listId: "list-1" })).rejects.toThrow(
      "Invalid listId: referenced packing list belongs to a different trip"
    );

    expect(tx.execute).toHaveBeenCalledOnce();
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects addPackingItem when labelId belongs to a different packing list", async () => {
    const tx = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      insert: vi.fn(),
      select: vi
        .fn()
        .mockReturnValueOnce(mockSimpleSelect([{ id: "list-1" }]))
        .mockReturnValueOnce(mockSimpleSelect([{ id: "label-1", listId: "list-2" }])),
      update: vi.fn(),
    };
    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx));

    await expect(addPackingItem("trip-1", { name: "Passport", listId: "list-1", labelId: "label-1" })).rejects.toThrow(
      "Invalid labelId: referenced row belongs to a different packing list"
    );

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects contextual addPackingItem when the target item belongs to a different packing list", async () => {
    const tx = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      insert: vi.fn(),
      select: vi
        .fn()
        .mockReturnValueOnce(mockSimpleSelect([{ id: "list-1" }]))
        .mockReturnValueOnce({
          from: () => ({
            where: async () => [{ id: "item-1", tripId: "trip-1", listId: "list-2", position: 0 }],
          }),
        }),
      update: vi.fn(),
    };

    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx));

    await expect(
      addPackingItem("trip-1", { name: "Passport", listId: "list-1", afterItemId: "item-1" })
    ).rejects.toThrow("Target item belongs to a different packing list");

    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("allows addPackingItem when labelId resolves to a label in the same trip", async () => {
    db.select.mockReturnValueOnce(mockSimpleSelect([{ id: "label-1" }]));

    const values = vi.fn().mockResolvedValue(undefined);
    const tx = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      insert: vi.fn(() => ({ values })),
      select: vi
        .fn()
        .mockReturnValueOnce(mockSimpleSelect([{ id: "label-1", listId: null }]))
        .mockReturnValueOnce(mockSimpleSelect([{ maxPos: 1 }])),
      update: vi.fn(),
    };
    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx));

    await addPackingItem("trip-1", { name: "Passport", labelId: "label-1" });

    expect(tx.execute).toHaveBeenCalledOnce();
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: "trip-1",
        name: "Passport",
        labelId: "label-1",
        position: 2,
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
    expect(revalidatePath).toHaveBeenCalledWith("/trips");
    expect(recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user-1", "trip-1");
  });

  it("rejects reorderPackingItems when an entry references an invalid labelId", async () => {
    const tx = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: () => ({
            where: async () => [{ listId: null }],
          }),
        })
        .mockReturnValueOnce({
          from: () => ({
            where: async () => [],
          }),
        }),
      update: vi.fn(),
    };

    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx));

    await expect(reorderPackingItems("trip-1", [{ id: "item-1", labelId: "label-1", position: 0 }])).rejects.toThrow(
      "Invalid labelId: referenced row is not a label or belongs to a different trip"
    );

    expect(tx.update).not.toHaveBeenCalled();
    expect(recordTripUpdated).not.toHaveBeenCalled();
  });

  it("sanitizes unexpected packing action failures", async () => {
    db.select.mockReturnValueOnce(mockSimpleSelect([{ id: "label-1" }]));

    const values = vi.fn().mockRejectedValue(new Error("database exploded"));
    const tx = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      insert: vi.fn(() => ({ values })),
      select: vi
        .fn()
        .mockReturnValueOnce(mockSimpleSelect([{ id: "label-1", listId: null }]))
        .mockReturnValueOnce(mockSimpleSelect([{ maxPos: 0 }])),
      update: vi.fn(),
    };
    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx));

    await expect(addPackingItem("trip-1", { name: "Passport", labelId: "label-1" })).rejects.toThrow(
      "An unexpected error occurred. Please try again."
    );
    expect(recordTripUpdated).not.toHaveBeenCalled();
  });

  it("moves section items to Ungrouped before deleting the section when requested", async () => {
    db.select.mockReset();
    db.select.mockReturnValueOnce(mockSimpleSelect([{ id: "label-1", tripId: "trip-1", isLabel: true }]));

    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const tx = {
      delete: vi.fn(() => ({
        where: deleteWhere,
      })),
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      select: vi.fn().mockReturnValueOnce(mockSimpleSelect([{ id: "label-1", tripId: "trip-1", isLabel: true }])),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: updateWhere,
        })),
      })),
    };

    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx));

    await removePackingSection("label-1", { mode: "move-items-to-ungrouped" });

    expect(tx.execute).toHaveBeenCalledOnce();
    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(updateWhere).toHaveBeenCalledTimes(1);
    expect(tx.delete).toHaveBeenCalledTimes(1);
    expect(deleteWhere).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
    expect(revalidatePath).toHaveBeenCalledWith("/trips");
    expect(recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user-1", "trip-1");
  });

  it("deletes section items along with the section when requested", async () => {
    db.select.mockReset();
    db.select.mockReturnValueOnce(mockSimpleSelect([{ id: "label-1", tripId: "trip-1", isLabel: true }]));

    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    const tx = {
      delete: vi.fn(() => ({
        where: deleteWhere,
      })),
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      select: vi.fn().mockReturnValueOnce(mockSimpleSelect([{ id: "label-1", tripId: "trip-1", isLabel: true }])),
      update: vi.fn(),
    };

    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx));

    await removePackingSection("label-1", { mode: "delete-items" });

    expect(tx.execute).toHaveBeenCalledOnce();
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.delete).toHaveBeenCalledTimes(2);
    expect(deleteWhere).toHaveBeenCalledTimes(2);
    expect(recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user-1", "trip-1");
  });

  it("rejects removePackingSection when locked row is not a section label", async () => {
    db.select.mockReset();
    db.select.mockReturnValueOnce(mockSimpleSelect([{ id: "item-1", tripId: "trip-1", isLabel: false }]));

    const tx = {
      delete: vi.fn(),
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      select: vi.fn().mockReturnValueOnce(mockSimpleSelect([{ id: "item-1", tripId: "trip-1", isLabel: false }])),
      update: vi.fn(),
    };

    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx));

    await expect(removePackingSection("item-1", { mode: "delete-items" })).rejects.toThrow(
      "An unexpected error occurred. Please try again."
    );
  });

  it("stores pulled template items on requested packing list", async () => {
    db.select.mockReset();
    db.select.mockReturnValue(mockSimpleSelect([{ id: "tmpl-1" }]));

    const returning = vi.fn().mockResolvedValue([{ id: "new-1" }]);
    const insertValues = vi.fn(() => ({ returning }));
    const transaction = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      insert: vi.fn(() => ({
        values: insertValues,
      })),
      select: vi
        .fn()
        .mockReturnValueOnce(mockSimpleSelect([{ id: "list-1" }]))
        .mockReturnValueOnce(mockSimpleSelect([]))
        .mockReturnValueOnce(mockSimpleSelect([{ maxPos: null }]))
        .mockReturnValueOnce(
          mockOrderedSelect([{ id: "tmpl-item-1", text: "Passport", isLabel: false, position: 0, labelId: null }])
        ),
    };

    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    await expect(pullTemplatesOntoTrip("trip-1", ["tmpl-1"], "list-1")).resolves.toEqual({ added: 1, skipped: 0 });

    expect(transaction.execute).toHaveBeenCalledOnce();
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: "trip-1",
        listId: "list-1",
        name: "Passport",
      })
    );
    expect(recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user-1", "trip-1");
  });

  it("returns the cached template result when the same idempotency key is reused within 24 hours", async () => {
    const transaction = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      insert: vi.fn(),
      select: vi.fn().mockReturnValueOnce(
        mockSimpleSelect([
          {
            result: { templateId: "tmpl-existing" },
            createdAt: new Date(Date.now() - 5 * 60 * 1000),
          },
        ])
      ),
    };
    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    await expect(saveTripListAsTemplate("trip-1", "Beach", "same-key")).resolves.toEqual({
      templateId: "tmpl-existing",
    });

    expect(db.transaction).toHaveBeenCalledOnce();
    expect(transaction.insert).not.toHaveBeenCalled();
  });

  it("creates distinct templates for different idempotency keys", async () => {
    const firstInsertValues = vi.fn();
    firstInsertValues
      .mockReturnValueOnce({ returning: vi.fn().mockResolvedValue([{ id: "tmpl-1" }]) })
      .mockReturnValueOnce({ returning: vi.fn().mockResolvedValue([{ id: "tmpl-1-item" }]) })
      .mockReturnValueOnce({ onConflictDoNothing: vi.fn().mockResolvedValue(undefined) });
    const firstTransaction = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      insert: vi.fn(() => ({ values: firstInsertValues })),
      select: vi
        .fn()
        .mockReturnValueOnce(mockSimpleSelect([]))
        .mockReturnValueOnce(
          mockOrderedSelect([
            { id: "item-1", name: "Passport", done: false, isLabel: false, position: 0, labelId: null },
          ])
        ),
    };
    const secondInsertValues = vi.fn();
    secondInsertValues
      .mockReturnValueOnce({ returning: vi.fn().mockResolvedValue([{ id: "tmpl-2" }]) })
      .mockReturnValueOnce({ returning: vi.fn().mockResolvedValue([{ id: "tmpl-2-item" }]) })
      .mockReturnValueOnce({ onConflictDoNothing: vi.fn().mockResolvedValue(undefined) });
    const secondTransaction = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      insert: vi.fn(() => ({ values: secondInsertValues })),
      select: vi
        .fn()
        .mockReturnValueOnce(mockSimpleSelect([]))
        .mockReturnValueOnce(
          mockOrderedSelect([
            { id: "item-1", name: "Passport", done: false, isLabel: false, position: 0, labelId: null },
          ])
        ),
    };
    db.transaction
      .mockImplementationOnce(async (callback: (tx: typeof firstTransaction) => Promise<void>) =>
        callback(firstTransaction)
      )
      .mockImplementationOnce(async (callback: (tx: typeof secondTransaction) => Promise<void>) =>
        callback(secondTransaction)
      );

    await expect(saveTripListAsTemplate("trip-1", "Beach", "key-1")).resolves.toEqual({ templateId: "tmpl-1" });
    await expect(saveTripListAsTemplate("trip-1", "Beach", "key-2")).resolves.toEqual({ templateId: "tmpl-2" });

    expect(db.transaction).toHaveBeenCalledTimes(2);
    expect(firstInsertValues).toHaveBeenCalledTimes(3);
    expect(secondInsertValues).toHaveBeenCalledTimes(3);
  });

  it("creates a new template when a cached idempotency key has expired", async () => {
    const insertValues = vi.fn();
    insertValues
      .mockReturnValueOnce({ returning: vi.fn().mockResolvedValue([{ id: "tmpl-new" }]) })
      .mockReturnValueOnce({ returning: vi.fn().mockResolvedValue([{ id: "tmpl-new-item" }]) })
      .mockReturnValueOnce({ onConflictDoNothing: vi.fn().mockResolvedValue(undefined) });
    const transaction = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      insert: vi.fn(() => ({ values: insertValues })),
      select: vi
        .fn()
        .mockReturnValueOnce(
          mockSimpleSelect([
            {
              result: { templateId: "tmpl-old" },
              createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
            },
          ])
        )
        .mockReturnValueOnce(
          mockOrderedSelect([
            { id: "item-1", name: "Passport", done: false, isLabel: false, position: 0, labelId: null },
          ])
        ),
    };
    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    await expect(saveTripListAsTemplate("trip-1", "Beach", "expired-key")).resolves.toEqual({
      templateId: "tmpl-new",
    });

    expect(db.transaction).toHaveBeenCalledOnce();
    expect(insertValues).toHaveBeenCalledTimes(3);
  });
});

describe("saveTripListAsTemplate behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockResolvedValue(undefined);
  });

  it("throws 'Template name is required' when name is blank", async () => {
    await expect(saveTripListAsTemplate("trip-1", "   ")).rejects.toThrow("Template name is required");
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("throws when name exceeds 30 characters", async () => {
    await expect(saveTripListAsTemplate("trip-1", "a".repeat(31))).rejects.toThrow(
      "Template name must be 30 characters or fewer"
    );
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("calls requireUser and assertTripAccess with editor role before proceeding", async () => {
    requireUser.mockResolvedValue({ id: "user-42" });
    const authTx = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-42" }]),
      select: vi.fn().mockReturnValue(mockOrderedSelect([])),
      insert: vi.fn(),
    };
    db.transaction.mockImplementation(async (callback: (tx: typeof authTx) => Promise<void>) => callback(authTx));

    await expect(saveTripListAsTemplate("trip-42", "Vacation")).rejects.toThrow(
      "Cannot save an empty packing list as a template"
    );

    expect(authTx.execute).toHaveBeenCalledOnce();
    expect(requireUser).toHaveBeenCalledOnce();
    expect(assertTripAccess).toHaveBeenCalledWith("trip-42", "user-42", "editor");
  });

  it("throws 'Cannot save an empty packing list as a template' for a trip with no items", async () => {
    const emptyTx = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      select: vi.fn().mockReturnValue(mockOrderedSelect([])),
      insert: vi.fn(),
    };
    db.transaction.mockImplementation(async (callback: (tx: typeof emptyTx) => Promise<void>) => callback(emptyTx));

    await expect(saveTripListAsTemplate("trip-1", "Beach")).rejects.toThrow(
      "Cannot save an empty packing list as a template"
    );
    expect(emptyTx.insert).not.toHaveBeenCalled();
  });

  it("creates a template and returns its id for a trip with two plain items", async () => {
    const insertValues = vi
      .fn()
      .mockReturnValueOnce({ returning: vi.fn().mockResolvedValue([{ id: "tmpl-new" }]) })
      .mockReturnValueOnce({ returning: vi.fn().mockResolvedValue([{ id: "item-a" }]) })
      .mockReturnValueOnce({ returning: vi.fn().mockResolvedValue([{ id: "item-b" }]) });
    const happyTx = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      insert: vi.fn(() => ({ values: insertValues })),
      select: vi.fn().mockReturnValue(
        mockOrderedSelect([
          { id: "p-1", name: "Shirt", done: false, isLabel: false, position: 0, labelId: null },
          { id: "p-2", name: "Pants", done: false, isLabel: false, position: 1, labelId: null },
        ])
      ),
    };
    db.transaction.mockImplementation(async (callback: (tx: typeof happyTx) => Promise<void>) => callback(happyTx));

    await expect(saveTripListAsTemplate("trip-1", "Vacation")).resolves.toEqual({ templateId: "tmpl-new" });
    expect(happyTx.insert).toHaveBeenCalledTimes(3);
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
    expect(revalidatePath).toHaveBeenCalledWith("/trips");
  });

  it("does not copy done state to template items", async () => {
    const insertValues = vi
      .fn()
      .mockReturnValueOnce({ returning: vi.fn().mockResolvedValue([{ id: "tmpl-1" }]) })
      .mockReturnValueOnce({ returning: vi.fn().mockResolvedValue([{ id: "item-1" }]) });
    const doneTx = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      insert: vi.fn(() => ({ values: insertValues })),
      select: vi
        .fn()
        .mockReturnValue(
          mockOrderedSelect([{ id: "p-1", name: "Shirt", done: true, isLabel: false, position: 0, labelId: null }])
        ),
    };
    db.transaction.mockImplementation(async (callback: (tx: typeof doneTx) => Promise<void>) => callback(doneTx));

    await saveTripListAsTemplate("trip-1", "Vacation");

    const templateItemArg = insertValues.mock.calls[1][0] as Record<string, unknown>;
    expect(templateItemArg).not.toHaveProperty("done");
  });

  it("maps original labelId to new template item id for non-label items", async () => {
    const insertValues = vi
      .fn()
      .mockReturnValueOnce({ returning: vi.fn().mockResolvedValue([{ id: "tmpl-1" }]) })
      .mockReturnValueOnce({ returning: vi.fn().mockResolvedValue([{ id: "tmpl-label-1" }]) })
      .mockReturnValueOnce({ returning: vi.fn().mockResolvedValue([{ id: "tmpl-item-1" }]) });
    const labelTx = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      insert: vi.fn(() => ({ values: insertValues })),
      select: vi.fn().mockReturnValue(
        mockOrderedSelect([
          { id: "trip-label", name: "Clothing", done: false, isLabel: true, position: 0, labelId: null },
          { id: "trip-shirt", name: "Shirt", done: false, isLabel: false, position: 1, labelId: "trip-label" },
        ])
      ),
    };
    db.transaction.mockImplementation(async (callback: (tx: typeof labelTx) => Promise<void>) => callback(labelTx));

    await saveTripListAsTemplate("trip-1", "Vacation");

    expect(insertValues).toHaveBeenNthCalledWith(3, expect.objectContaining({ labelId: "tmpl-label-1" }));
  });

  it("does not insert into packingItems during template creation", async () => {
    const insertValues = vi
      .fn()
      .mockReturnValueOnce({ returning: vi.fn().mockResolvedValue([{ id: "tmpl-1" }]) })
      .mockReturnValueOnce({ returning: vi.fn().mockResolvedValue([{ id: "item-1" }]) });
    const readonlyTx = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      insert: vi.fn(() => ({ values: insertValues })),
      select: vi
        .fn()
        .mockReturnValue(
          mockOrderedSelect([{ id: "p-1", name: "Shirt", done: false, isLabel: false, position: 0, labelId: null }])
        ),
    };
    db.transaction.mockImplementation(async (callback: (tx: typeof readonlyTx) => Promise<void>) =>
      callback(readonlyTx)
    );

    await saveTripListAsTemplate("trip-1", "Vacation");

    expect(readonlyTx.insert).toHaveBeenCalledTimes(2);
    expect(db.insert).not.toHaveBeenCalled();
    expect(recordTripUpdated).not.toHaveBeenCalled();
  });

  it("trims whitespace from the template name before saving", async () => {
    const insertValues = vi
      .fn()
      .mockReturnValueOnce({ returning: vi.fn().mockResolvedValue([{ id: "tmpl-1" }]) })
      .mockReturnValueOnce({ returning: vi.fn().mockResolvedValue([{ id: "item-1" }]) });
    const trimTx = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      insert: vi.fn(() => ({ values: insertValues })),
      select: vi
        .fn()
        .mockReturnValue(
          mockOrderedSelect([{ id: "p-1", name: "Shirt", done: false, isLabel: false, position: 0, labelId: null }])
        ),
    };
    db.transaction.mockImplementation(async (callback: (tx: typeof trimTx) => Promise<void>) => callback(trimTx));

    await saveTripListAsTemplate("trip-1", "  Beach  ");

    expect(insertValues).toHaveBeenNthCalledWith(1, expect.objectContaining({ name: "Beach" }));
  });
});

describe("packing activity events", () => {
  function mockTransactionOnce<Tx>(tx: Tx): void {
    db.transaction.mockImplementation(async (callback: (transaction: Tx) => Promise<unknown>) => callback(tx));
  }

  beforeEach(() => {
    vi.clearAllMocks();
    db.select.mockReset();
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockResolvedValue(undefined);
  });

  it("records once when a packing item is renamed", async () => {
    db.select.mockReturnValueOnce(mockSimpleSelect([{ tripId: "trip-1" }]));
    db.update.mockReturnValue({ set: () => ({ where: async () => undefined }) });

    await updatePackingItem("item-1", { name: "Socks" });

    expect(recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user-1", "trip-1");
  });

  it("records nothing when renaming a missing packing item", async () => {
    db.select.mockReturnValueOnce(mockSimpleSelect([]));

    await expect(updatePackingItem("item-1", { name: "Socks" })).rejects.toThrow();

    expect(recordTripUpdated).not.toHaveBeenCalled();
  });

  it("records once when a packing item is toggled", async () => {
    db.select.mockReturnValueOnce(mockSimpleSelect([{ tripId: "trip-1" }]));
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    mockTransactionOnce({
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      select: vi.fn().mockReturnValueOnce(mockSimpleSelect([{ id: "item-1", done: false }])),
      update: vi.fn(() => ({ set: () => ({ where: updateWhere }) })),
    });

    await togglePackingItem("item-1");

    expect(updateWhere).toHaveBeenCalledOnce();
    expect(recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user-1", "trip-1");
  });

  it("records nothing when the toggled item is gone before the lock", async () => {
    db.select.mockReturnValueOnce(mockSimpleSelect([{ tripId: "trip-1" }]));
    mockTransactionOnce({
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      select: vi.fn().mockReturnValueOnce(mockSimpleSelect([])),
      update: vi.fn(),
    });

    await togglePackingItem("item-1");

    expect(recordTripUpdated).not.toHaveBeenCalled();
  });

  it("records nothing when toggling a missing item", async () => {
    db.select.mockReturnValueOnce(mockSimpleSelect([]));

    await togglePackingItem("item-1");

    expect(recordTripUpdated).not.toHaveBeenCalled();
  });

  it("records once when a packing item is removed", async () => {
    db.select.mockReturnValueOnce(mockSimpleSelect([{ id: "item-1", tripId: "trip-1" }]));
    db.delete.mockReturnValue({ where: async () => undefined });

    await removePackingItem("item-1");

    expect(recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user-1", "trip-1");
  });

  it("records nothing when removing a missing item", async () => {
    db.select.mockReturnValueOnce(mockSimpleSelect([]));

    await removePackingItem("item-1");

    expect(recordTripUpdated).not.toHaveBeenCalled();
  });

  it("records nothing when the section is gone before the lock", async () => {
    db.select.mockReturnValueOnce(mockSimpleSelect([{ tripId: "trip-1" }]));
    mockTransactionOnce({
      delete: vi.fn(),
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      select: vi.fn().mockReturnValueOnce(mockSimpleSelect([])),
      update: vi.fn(),
    });

    await removePackingSection("label-1", { mode: "delete-items" });

    expect(recordTripUpdated).not.toHaveBeenCalled();
  });

  it("records nothing when the section does not exist", async () => {
    db.select.mockReturnValueOnce(mockSimpleSelect([]));

    await removePackingSection("label-1", { mode: "delete-items" });

    expect(recordTripUpdated).not.toHaveBeenCalled();
  });

  it("records once after a non-empty reorder", async () => {
    mockTransactionOnce({
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      select: vi.fn().mockReturnValueOnce(mockSimpleSelect([{ listId: null }])),
      update: vi.fn(() => ({ set: () => ({ where: async () => undefined }) })),
    });

    await reorderPackingItems("trip-1", [{ id: "item-1", labelId: null, position: 0 }]);

    expect(recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user-1", "trip-1");
  });

  it("records nothing for an empty reorder", async () => {
    await reorderPackingItems("trip-1", []);

    expect(db.transaction).not.toHaveBeenCalled();
    expect(recordTripUpdated).not.toHaveBeenCalled();
  });

  it("records nothing when a template pull adds zero items", async () => {
    db.select.mockReturnValueOnce(mockSimpleSelect([{ id: "tmpl-1" }]));
    mockTransactionOnce({
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      select: vi
        .fn()
        .mockReturnValueOnce(mockSimpleSelect([{ name: "Passport", id: "item-1", isLabel: false }]))
        .mockReturnValueOnce(mockSimpleSelect([{ maxPos: 0 }]))
        .mockReturnValueOnce(
          mockOrderedSelect([{ id: "tmpl-item-1", text: "Passport", isLabel: false, position: 0, labelId: null }])
        ),
      insert: vi.fn(),
    });

    await expect(pullTemplatesOntoTrip("trip-1", ["tmpl-1"])).resolves.toEqual({ added: 0, skipped: 1 });

    expect(recordTripUpdated).not.toHaveBeenCalled();
  });

  it("records nothing when no templates are requested", async () => {
    await expect(pullTemplatesOntoTrip("trip-1", [])).resolves.toEqual({ added: 0, skipped: 0 });

    expect(recordTripUpdated).not.toHaveBeenCalled();
  });

  it("records once when a packing list is created", async () => {
    mockTransactionOnce({
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      select: vi.fn().mockReturnValueOnce(mockSimpleSelect([{ maxPos: 0 }])),
      insert: vi.fn(() => ({ values: () => ({ returning: async () => [{ id: "list-1" }] }) })),
    });

    await expect(createPackingList("trip-1", "Carry-on")).resolves.toBe("list-1");

    expect(recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user-1", "trip-1");
  });

  it("records nothing when list creation fails validation", async () => {
    await expect(createPackingList("trip-1", "  ")).rejects.toThrow("List name is required");

    expect(recordTripUpdated).not.toHaveBeenCalled();
  });

  it("records once when a packing list is renamed", async () => {
    db.select.mockReturnValueOnce(mockSimpleSelect([{ tripId: "trip-1" }]));
    db.update.mockReturnValue({ set: () => ({ where: async () => undefined }) });

    await renamePackingList("list-1", "Checked bag");

    expect(recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user-1", "trip-1");
  });

  it("records nothing when renaming a missing list", async () => {
    db.select.mockReturnValueOnce(mockSimpleSelect([]));

    await expect(renamePackingList("list-1", "Checked bag")).rejects.toThrow("Packing list not found");

    expect(recordTripUpdated).not.toHaveBeenCalled();
  });

  it("records once when a packing list is deleted", async () => {
    db.select.mockReturnValueOnce(mockSimpleSelect([{ tripId: "trip-1" }]));
    mockTransactionOnce({
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      delete: vi.fn(() => ({ where: async () => undefined })),
    });

    await deletePackingList("list-1");

    expect(recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user-1", "trip-1");
  });

  it("records nothing when deleting a missing list", async () => {
    db.select.mockReturnValueOnce(mockSimpleSelect([]));

    await deletePackingList("list-1");

    expect(recordTripUpdated).not.toHaveBeenCalled();
  });
});
