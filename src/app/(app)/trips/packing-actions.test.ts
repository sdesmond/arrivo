// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { assertTripAccess, db, requireUser, revalidatePath } = vi.hoisted(() => ({
  assertTripAccess: vi.fn(),
  db: {
    delete: vi.fn(),
    execute: vi.fn(),
    insert: vi.fn(),
    select: vi.fn(),
    transaction: vi.fn(),
    update: vi.fn(),
  },
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

import {
  addPackingItem,
  createPackingList,
  pullTemplatesOntoTrip,
  removePackingItem,
  reorderPackingItems,
  removePackingSection,
  saveTripListAsTemplate,
  togglePackingItem,
  updatePackingItem,
} from "./packing-actions";
import { packingItems } from "@/db/schema";

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
  });

  it("persists the client-supplied id unchanged instead of relying on the DB default", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const tx = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      insert: vi.fn(() => ({ values })),
      select: vi.fn().mockReturnValueOnce(mockSimpleSelect([{ maxPos: -1 }])),
      update: vi.fn(),
    };
    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx));
    const clientId = "ffffffff-ffff-ffff-ffff-ffffffffffff";

    await addPackingItem("trip-1", { id: clientId, name: "Passport" });

    expect(values).toHaveBeenCalledWith(expect.objectContaining({ id: clientId }));
  });

  it("omits the id key from the insert when no client id is supplied, leaving the DB default in effect", async () => {
    let insertedValues: Record<string, unknown> | undefined;
    const tx = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      insert: vi.fn(() => ({
        values: vi.fn(async (values: Record<string, unknown>) => {
          insertedValues = values;
        }),
      })),
      select: vi.fn().mockReturnValueOnce(mockSimpleSelect([{ maxPos: -1 }])),
      update: vi.fn(),
    };
    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx));

    await addPackingItem("trip-1", { name: "Passport" });

    expect(insertedValues).not.toHaveProperty("id");
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

describe("createPackingList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockResolvedValue(undefined);
  });

  function buildCreatePackingListTransaction() {
    let insertedValues: Record<string, unknown> | undefined;
    const tx = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      select: vi.fn().mockReturnValueOnce(mockSimpleSelect([{ maxPos: -1 }])),
      insert: vi.fn(() => ({
        values: vi.fn((values: Record<string, unknown>) => {
          insertedValues = values;
          return { returning: vi.fn(async () => [{ id: "list-1" }]) };
        }),
      })),
    };
    return { tx, getInsertedValues: () => insertedValues };
  }

  it("persists the client-supplied id unchanged instead of relying on the DB default", async () => {
    const { tx, getInsertedValues } = buildCreatePackingListTransaction();
    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx));
    const clientId = "00000000-0000-0000-0000-000000000001";

    const listId = await createPackingList("trip-1", "Beach", clientId);

    expect(listId).toBe("list-1");
    expect(getInsertedValues()).toEqual(expect.objectContaining({ id: clientId }));
  });

  it("omits the id key from the insert when no client id is supplied, leaving the DB default in effect", async () => {
    const { tx, getInsertedValues } = buildCreatePackingListTransaction();
    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx));

    await createPackingList("trip-1", "Beach");

    expect(getInsertedValues()).not.toHaveProperty("id");
  });
});

describe("packing actions behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockResolvedValue(undefined);
  });

  it("adds a packing label with the next position after access checks", async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined);
    const tx = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      select: vi.fn().mockReturnValueOnce(mockSimpleSelect([{ maxPos: 2 }])),
      insert: vi.fn(() => ({ values: insertValues })),
    };
    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx));

    await addPackingItem("trip-1", { name: "Documents", isLabel: true });

    expect(requireUser).toHaveBeenCalled();
    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
    expect(tx.insert).toHaveBeenCalledWith(packingItems);
    expect(insertValues).toHaveBeenCalledWith({
      tripId: "trip-1",
      listId: null,
      name: "Documents",
      done: false,
      isLabel: true,
      position: 3,
      labelId: null,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
    expect(revalidatePath).toHaveBeenCalledWith("/trips");
  });

  it("assigns position 0 and ungrouped when the trip has no existing packing items", async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined);
    const tx = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      select: vi.fn().mockReturnValueOnce(mockSimpleSelect([{ maxPos: null }])),
      insert: vi.fn(() => ({ values: insertValues })),
    };
    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx));

    await addPackingItem("trip-1", { name: "Passport" });

    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ position: 0, labelId: null }));
  });

  it("quick-add appends a plain item ungrouped at the bottom (AC4), not under the last section", async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined);
    const tx = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      select: vi.fn().mockReturnValueOnce(mockSimpleSelect([{ maxPos: 4 }])),
      insert: vi.fn(() => ({ values: insertValues })),
    };
    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx));

    await addPackingItem("trip-1", { name: "Phone charger" });

    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ position: 5, labelId: null }));
  });

  it("removes a packing entry only after loading the item and checking trip access", async () => {
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    db.select.mockReturnValueOnce(mockSimpleSelect([{ id: "pack-1", tripId: "trip-1" }]));
    db.delete.mockReturnValueOnce({ where: deleteWhere });

    await removePackingItem("pack-1");

    expect(requireUser).toHaveBeenCalled();
    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
    expect(db.delete).toHaveBeenCalledWith(packingItems);
    expect(deleteWhere).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
    expect(revalidatePath).toHaveBeenCalledWith("/trips");
  });

  it("toggles a packing entry and revalidates both the trip detail and trips list", async () => {
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    db.select.mockReturnValueOnce(mockSimpleSelect([{ tripId: "trip-1" }]));
    const tx = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      select: vi.fn().mockReturnValueOnce(mockSimpleSelect([{ id: "pack-1", tripId: "trip-1", done: false }])),
      update: vi.fn(() => ({ set: () => ({ where: updateWhere }) })),
    };
    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx));

    await togglePackingItem("pack-1");

    expect(requireUser).toHaveBeenCalled();
    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
    expect(tx.update).toHaveBeenCalledWith(packingItems);
    expect(updateWhere).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
    expect(revalidatePath).toHaveBeenCalledWith("/trips");
  });

  it("reorders packing entries after access checks and revalidates the trip detail route", async () => {
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const tx = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      select: vi
        .fn()
        .mockReturnValueOnce(mockSimpleSelect([{ listId: null }]))
        .mockReturnValueOnce(mockSimpleSelect([{ listId: null }]))
        .mockReturnValueOnce(mockSimpleSelect([{ id: "label-1", listId: null }]))
        .mockReturnValueOnce(mockSimpleSelect([{ listId: null }])),
      update: vi.fn(() => ({
        set: (values: unknown) => ({
          where: async () => {
            updateWhere(values);
          },
        }),
      })),
    };
    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx));

    await reorderPackingItems("trip-1", [
      { id: "pack-2", labelId: null, position: 0 },
      { id: "pack-1", labelId: "label-1", position: 1 },
      { id: "pack-3", labelId: null, position: 2 },
    ]);

    expect(requireUser).toHaveBeenCalled();
    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
    expect(tx.update).toHaveBeenCalledTimes(3);
    expect(updateWhere).toHaveBeenNthCalledWith(1, { position: 0, labelId: null });
    expect(updateWhere).toHaveBeenNthCalledWith(2, { position: 1, labelId: "label-1" });
    expect(updateWhere).toHaveBeenNthCalledWith(3, { position: 2, labelId: null });
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
    expect(revalidatePath).toHaveBeenCalledWith("/trips");
  });

  it("reorderPackingItems is a no-op for an empty ordering", async () => {
    await reorderPackingItems("trip-1", []);

    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
    expect(db.transaction).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("updatePackingItem trims the name before updating it in DB", async () => {
    const updateSet = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));
    db.select.mockReturnValueOnce(mockSimpleSelect([{ id: "pack-1", tripId: "trip-1", name: "Passport" }]));
    db.update.mockReturnValueOnce({ set: updateSet });

    await updatePackingItem("pack-1", { name: "  Passport (renewed)  " });

    expect(requireUser).toHaveBeenCalled();
    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
    expect(db.update).toHaveBeenCalledWith(packingItems);
    expect(updateSet).toHaveBeenCalledWith({ name: "Passport (renewed)" });
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
    expect(revalidatePath).toHaveBeenCalledWith("/trips");
  });

  it("updatePackingItem throws when item not found", async () => {
    db.select.mockReturnValueOnce(mockSimpleSelect([]));

    await expect(updatePackingItem("nonexistent", { name: "New name" })).rejects.toThrow("Packing item not found");

    expect(assertTripAccess).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("updatePackingItem rejects a blank trimmed name", async () => {
    await expect(updatePackingItem("pack-1", { name: "   " })).rejects.toThrow("Packing item name is required");

    expect(assertTripAccess).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("addPackingItem with afterItemId inserts at targetPos + 1 and shifts later items", async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined);
    const shiftWhere = vi.fn().mockResolvedValue(undefined);
    const tx = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      select: vi.fn(() => mockSimpleSelect([{ id: "label-1", tripId: "trip-1", position: 2 }])),
      update: vi.fn(() => ({ set: () => ({ where: shiftWhere }) })),
      insert: vi.fn(() => ({ values: insertValues })),
    };
    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx));

    await addPackingItem("trip-1", { name: "Visa", afterItemId: "label-1" });

    expect(requireUser).toHaveBeenCalled();
    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
    expect(tx.select).toHaveBeenCalled();
    expect(tx.update).toHaveBeenCalled();
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ name: "Visa", position: 3, tripId: "trip-1" }));
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
    expect(revalidatePath).toHaveBeenCalledWith("/trips");
  });

  it("addPackingItem stores the section labelId for a contextual add under a label", async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined);
    const tx = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      select: vi.fn(() => mockSimpleSelect([{ id: "label-1", tripId: "trip-1", position: 2 }])),
      update: vi.fn(() => ({ set: () => ({ where: vi.fn().mockResolvedValue(undefined) }) })),
      insert: vi.fn(() => ({ values: insertValues })),
    };
    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx));

    await addPackingItem("trip-1", { name: "Visa", afterItemId: "label-1", labelId: "label-1" });

    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ labelId: "label-1" }));
  });

  it("addPackingItem forces labelId to null for a section label even if one is passed", async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined);
    const tx = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      select: vi.fn().mockReturnValueOnce(mockSimpleSelect([{ maxPos: 1 }])),
      insert: vi.fn(() => ({ values: insertValues })),
    };
    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx));

    await addPackingItem("trip-1", { name: "Toiletries", isLabel: true, labelId: "label-1" });

    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ isLabel: true, labelId: null }));
  });

  it("addPackingItem with beforeItemId inserts before the target to create an ungrouped item", async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined);
    const shiftWhere = vi.fn().mockResolvedValue(undefined);
    const tx = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      select: vi.fn(() => mockSimpleSelect([{ id: "label-1", tripId: "trip-1", position: 0 }])),
      update: vi.fn(() => ({ set: () => ({ where: shiftWhere }) })),
      insert: vi.fn(() => ({ values: insertValues })),
    };
    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx));

    await addPackingItem("trip-1", { name: " Travel adapter ", beforeItemId: "label-1" });

    expect(tx.select).toHaveBeenCalled();
    expect(tx.update).toHaveBeenCalled();
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Travel adapter", position: 0, tripId: "trip-1" })
    );
  });

  it("addPackingItem with afterItemId throws when target item not found", async () => {
    const tx = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      select: vi.fn(() => mockSimpleSelect([])),
    };
    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx));

    await expect(addPackingItem("trip-1", { name: "Visa", afterItemId: "bad-id" })).rejects.toThrow(
      "Target item not found"
    );
  });

  it("addPackingItem rejects a blank trimmed name", async () => {
    await expect(addPackingItem("trip-1", { name: "   " })).rejects.toThrow("Packing item name is required");

    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe("pullTemplatesOntoTrip dedup and label mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockResolvedValue(undefined);
  });

  it("returns {added:0,skipped:0} immediately for empty templateIds without DB calls", async () => {
    const result = await pullTemplatesOntoTrip("trip-1", []);

    expect(result).toEqual({ added: 0, skipped: 0 });
    expect(db.select).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("enforces requireUser and assertTripAccess with editor role", async () => {
    db.select.mockReturnValueOnce(mockSimpleSelect([{ id: "tmpl-1" }]));
    const tx = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      select: vi
        .fn()
        .mockReturnValueOnce(mockSimpleSelect([]))
        .mockReturnValueOnce(mockSimpleSelect([{ maxPos: null }]))
        .mockReturnValueOnce(mockOrderedSelect([])),
      insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: "new-1" }]) })) })),
    };
    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx));

    await pullTemplatesOntoTrip("trip-1", ["tmpl-1"]);

    expect(requireUser).toHaveBeenCalled();
    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
  });

  it("inserts all template items when the trip list is empty", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "new-1" }]);
    const insertValues = vi.fn(() => ({ returning }));
    const tx = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      select: vi
        .fn()
        .mockReturnValueOnce(mockSimpleSelect([]))
        .mockReturnValueOnce(mockSimpleSelect([{ maxPos: null }]))
        .mockReturnValueOnce(
          mockOrderedSelect([
            { id: "ti-1", text: "Passport", isLabel: false, position: 0, labelId: null },
            { id: "ti-2", text: "Phone Charger", isLabel: false, position: 1, labelId: null },
          ])
        ),
      insert: vi.fn(() => ({ values: insertValues })),
    };
    db.select.mockReturnValueOnce(mockSimpleSelect([{ id: "tmpl-1" }]));
    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx));

    const result = await pullTemplatesOntoTrip("trip-1", ["tmpl-1"]);

    expect(result).toEqual({ added: 2, skipped: 0 });
    expect(insertValues).toHaveBeenCalledTimes(2);
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
    expect(revalidatePath).toHaveBeenCalledWith("/trips");
  });

  it("skips a duplicate when existing item name matches case-insensitively", async () => {
    const insertValues = vi.fn();
    const tx = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      select: vi
        .fn()
        .mockReturnValueOnce(mockSimpleSelect([{ name: "Sunscreen", id: "existing-1", isLabel: false }]))
        .mockReturnValueOnce(mockSimpleSelect([{ maxPos: 0 }]))
        .mockReturnValueOnce(
          mockOrderedSelect([{ id: "ti-1", text: "sunscreen", isLabel: false, position: 0, labelId: null }])
        ),
      insert: vi.fn(() => ({ values: insertValues })),
    };
    db.select.mockReturnValueOnce(mockSimpleSelect([{ id: "tmpl-1" }]));
    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx));

    const result = await pullTemplatesOntoTrip("trip-1", ["tmpl-1"]);

    expect(result).toEqual({ added: 0, skipped: 1 });
    expect(insertValues).not.toHaveBeenCalled();
  });

  it("deduplicates across two templates sharing an item text", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "new-1" }]);
    const insertValues = vi.fn(() => ({ returning }));
    const tx = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      select: vi
        .fn()
        .mockReturnValueOnce(mockSimpleSelect([]))
        .mockReturnValueOnce(mockSimpleSelect([{ maxPos: null }]))
        .mockReturnValueOnce(
          mockOrderedSelect([{ id: "ti-1", text: "Toothbrush", isLabel: false, position: 0, labelId: null }])
        )
        .mockReturnValueOnce(
          mockOrderedSelect([{ id: "ti-2", text: "Toothbrush", isLabel: false, position: 0, labelId: null }])
        ),
      insert: vi.fn(() => ({ values: insertValues })),
    };
    db.select.mockReturnValueOnce(mockSimpleSelect([{ id: "tmpl-1" }, { id: "tmpl-2" }]));
    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx));

    const result = await pullTemplatesOntoTrip("trip-1", ["tmpl-1", "tmpl-2"]);

    expect(result).toEqual({ added: 1, skipped: 1 });
  });

  it("silently skips a template not owned by the current user", async () => {
    const tx = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      select: vi
        .fn()
        .mockReturnValueOnce(mockSimpleSelect([]))
        .mockReturnValueOnce(mockSimpleSelect([{ maxPos: null }])),
      insert: vi.fn(),
    };
    db.select.mockReturnValueOnce(mockSimpleSelect([])); // no owned templates returned
    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx));

    const result = await pullTemplatesOntoTrip("trip-1", ["foreign-tmpl"]);

    expect(result).toEqual({ added: 0, skipped: 0 });
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("appends after the last existing item position", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "new-1" }]);
    const insertValues = vi.fn(() => ({ returning }));
    const tx = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      select: vi
        .fn()
        .mockReturnValueOnce(mockSimpleSelect([{ name: "Laptop", id: "existing-1", isLabel: false }]))
        .mockReturnValueOnce(mockSimpleSelect([{ maxPos: 3 }]))
        .mockReturnValueOnce(
          mockOrderedSelect([{ id: "ti-1", text: "Tent", isLabel: false, position: 0, labelId: null }])
        ),
      insert: vi.fn(() => ({ values: insertValues })),
    };
    db.select.mockReturnValueOnce(mockSimpleSelect([{ id: "tmpl-1" }]));
    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx));

    await pullTemplatesOntoTrip("trip-1", ["tmpl-1"]);

    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ position: 4 }));
  });

  it("maps label cross-references: inserted label id becomes labelId for child items", async () => {
    const labelReturning = vi.fn().mockResolvedValue([{ id: "new-label-id" }]);
    const itemReturning = vi.fn().mockResolvedValue([{ id: "new-item-id" }]);
    let insertCallIndex = 0;
    const insertValues = vi.fn(() => {
      insertCallIndex++;
      return { returning: insertCallIndex === 1 ? labelReturning : itemReturning };
    });
    const tx = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      select: vi
        .fn()
        .mockReturnValueOnce(mockSimpleSelect([]))
        .mockReturnValueOnce(mockSimpleSelect([{ maxPos: null }]))
        .mockReturnValueOnce(
          mockOrderedSelect([
            { id: "label-tmpl-id", text: "Toiletries", isLabel: true, position: 0, labelId: null },
            { id: "item-tmpl-id", text: "Toothbrush", isLabel: false, position: 1, labelId: "label-tmpl-id" },
          ])
        ),
      insert: vi.fn(() => ({ values: insertValues })),
    };
    db.select.mockReturnValueOnce(mockSimpleSelect([{ id: "tmpl-1" }]));
    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx));

    await pullTemplatesOntoTrip("trip-1", ["tmpl-1"]);

    expect(insertValues).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ labelId: "new-label-id", name: "Toothbrush" })
    );
  });

  it("reuses an existing label id when a duplicate template label matches an existing label", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "new-item-id" }]);
    const insertValues = vi.fn(() => ({ returning }));
    const tx = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      select: vi
        .fn()
        .mockReturnValueOnce(mockSimpleSelect([{ name: "Toiletries", id: "existing-label-id", isLabel: true }]))
        .mockReturnValueOnce(mockSimpleSelect([{ maxPos: 1 }]))
        .mockReturnValueOnce(
          mockOrderedSelect([
            { id: "label-tmpl-id", text: "Toiletries", isLabel: true, position: 0, labelId: null },
            { id: "item-tmpl-id", text: "Toothbrush", isLabel: false, position: 1, labelId: "label-tmpl-id" },
          ])
        ),
      insert: vi.fn(() => ({ values: insertValues })),
    };
    db.select.mockReturnValueOnce(mockSimpleSelect([{ id: "tmpl-1" }]));
    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx));

    const result = await pullTemplatesOntoTrip("trip-1", ["tmpl-1"]);

    expect(result).toEqual({ added: 1, skipped: 1 });
    expect(insertValues).toHaveBeenCalledOnce();
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ labelId: "existing-label-id", name: "Toothbrush" })
    );
  });

  it("does not attach children to a non-label row when a duplicate template label matches plain text", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "new-item-id" }]);
    const insertValues = vi.fn(() => ({ returning }));
    const tx = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      select: vi
        .fn()
        .mockReturnValueOnce(mockSimpleSelect([{ name: "Toiletries", id: "existing-item-id", isLabel: false }]))
        .mockReturnValueOnce(mockSimpleSelect([{ maxPos: 1 }]))
        .mockReturnValueOnce(
          mockOrderedSelect([
            { id: "label-tmpl-id", text: "Toiletries", isLabel: true, position: 0, labelId: null },
            { id: "item-tmpl-id", text: "Toothbrush", isLabel: false, position: 1, labelId: "label-tmpl-id" },
          ])
        ),
      insert: vi.fn(() => ({ values: insertValues })),
    };
    db.select.mockReturnValueOnce(mockSimpleSelect([{ id: "tmpl-1" }]));
    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx));

    const result = await pullTemplatesOntoTrip("trip-1", ["tmpl-1"]);

    expect(result).toEqual({ added: 1, skipped: 1 });
    expect(insertValues).toHaveBeenCalledOnce();
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ labelId: null, name: "Toothbrush" }));
  });
});
