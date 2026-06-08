// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { assertTripAccess, db, requireUser, revalidatePath } = vi.hoisted(() => ({
  assertTripAccess: vi.fn(),
  db: {
    delete: vi.fn(),
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
  pullTemplatesOntoTrip,
  removePackingSection,
  reorderPackingItems,
  saveTripListAsTemplate,
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
      db.select.mockReturnValueOnce(mockSimpleSelect([]));

      await expect(addPackingItem("trip-1", { name: "Passport", labelId: "label-1" })).rejects.toThrow(
        "Invalid labelId: referenced row is not a label or belongs to a different trip"
      );

      expect(db.transaction).not.toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
    }
  );

  it("rejects addPackingItem when listId belongs to a different trip", async () => {
    db.select.mockReturnValueOnce(mockSimpleSelect([]));

    await expect(addPackingItem("trip-1", { name: "Passport", listId: "list-1" })).rejects.toThrow(
      "Invalid listId: referenced packing list belongs to a different trip"
    );

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects addPackingItem when labelId belongs to a different packing list", async () => {
    db.select
      .mockReturnValueOnce(mockSimpleSelect([{ id: "list-1" }]))
      .mockReturnValueOnce(mockSimpleSelect([{ id: "label-1", listId: "list-2" }]));

    await expect(addPackingItem("trip-1", { name: "Passport", listId: "list-1", labelId: "label-1" })).rejects.toThrow(
      "Invalid labelId: referenced row belongs to a different packing list"
    );

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects contextual addPackingItem when the target item belongs to a different packing list", async () => {
    db.select.mockReturnValueOnce(mockSimpleSelect([{ id: "list-1" }]));

    const tx = {
      insert: vi.fn(),
      select: vi.fn(() => ({
        from: () => ({
          where: async () => [{ id: "item-1", tripId: "trip-1", listId: "list-2", position: 0 }],
        }),
      })),
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
    db.select
      .mockReturnValueOnce(mockSimpleSelect([{ id: "label-1" }]))
      .mockReturnValueOnce(mockSimpleSelect([{ maxPos: 1 }]));

    const values = vi.fn().mockResolvedValue(undefined);
    db.insert.mockReturnValue({ values });

    await addPackingItem("trip-1", { name: "Passport", labelId: "label-1" });

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

  it("stores pulled template items on the requested packing list", async () => {
    db.select
      .mockReturnValueOnce(mockSimpleSelect([{ id: "list-1" }]))
      .mockReturnValueOnce(mockSimpleSelect([]))
      .mockReturnValueOnce(mockSimpleSelect([{ id: "tmpl-1" }]));

    const returning = vi.fn().mockResolvedValue([{ id: "new-1" }]);
    const insertValues = vi.fn(() => ({ returning }));
    const transaction = {
      insert: vi.fn(() => ({ values: insertValues })),
      select: vi
        .fn()
        .mockReturnValueOnce(mockSimpleSelect([{ maxPos: null }]))
        .mockReturnValueOnce(
          mockOrderedSelect([{ id: "tmpl-item-1", text: "Passport", isLabel: false, position: 0, labelId: null }])
        ),
    };

    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    await expect(pullTemplatesOntoTrip("trip-1", ["tmpl-1"], "list-1")).resolves.toEqual({ added: 1, skipped: 0 });

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: "trip-1",
        listId: "list-1",
        name: "Passport",
      })
    );
  });

  it("rejects reorderPackingItems when an entry references an invalid labelId", async () => {
    const tx = {
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
    db.select
      .mockReturnValueOnce(mockSimpleSelect([{ id: "label-1" }]))
      .mockReturnValueOnce(mockSimpleSelect([{ maxPos: 0 }]));

    const values = vi.fn().mockRejectedValue(new Error("database exploded"));
    db.insert.mockReturnValue({ values });

    await expect(addPackingItem("trip-1", { name: "Passport", labelId: "label-1" })).rejects.toThrow(
      "An unexpected error occurred. Please try again."
    );
  });

  it("moves section items to Ungrouped before deleting the section when requested", async () => {
    db.select.mockReturnValueOnce(
      mockSimpleSelect([{ id: "label-1", tripId: "trip-1", isLabel: true, name: "Documents" }])
    );

    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const tx = {
      delete: vi.fn(() => ({
        where: deleteWhere,
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: updateWhere,
        })),
      })),
    };

    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx));

    await removePackingSection("label-1", { mode: "move-items-to-ungrouped" });

    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(updateWhere).toHaveBeenCalledTimes(1);
    expect(tx.delete).toHaveBeenCalledTimes(1);
    expect(deleteWhere).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
    expect(revalidatePath).toHaveBeenCalledWith("/trips");
  });

  it("deletes section items along with the section when requested", async () => {
    db.select.mockReturnValueOnce(
      mockSimpleSelect([{ id: "label-1", tripId: "trip-1", isLabel: true, name: "Documents" }])
    );

    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    const tx = {
      delete: vi.fn(() => ({
        where: deleteWhere,
      })),
      update: vi.fn(),
    };

    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx));

    await removePackingSection("label-1", { mode: "delete-items" });

    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.delete).toHaveBeenCalledTimes(2);
    expect(deleteWhere).toHaveBeenCalledTimes(2);
  });

  it("rejects removePackingSection when the target row is not a section label", async () => {
    db.select.mockReturnValueOnce(
      mockSimpleSelect([{ id: "item-1", tripId: "trip-1", isLabel: false, name: "Passport" }])
    );

    await expect(removePackingSection("item-1", { mode: "delete-items" })).rejects.toThrow(
      "An unexpected error occurred. Please try again."
    );

    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("returns the cached template result when the same idempotency key is reused within 24 hours", async () => {
    const transaction = {
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

  it("throws when name exceeds 100 characters", async () => {
    await expect(saveTripListAsTemplate("trip-1", "a".repeat(101))).rejects.toThrow(
      "Template name must be 100 characters or fewer"
    );
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("calls requireUser and assertTripAccess with editor role before proceeding", async () => {
    requireUser.mockResolvedValue({ id: "user-42" });
    const authTx = {
      select: vi.fn().mockReturnValue(mockOrderedSelect([])),
      insert: vi.fn(),
    };
    db.transaction.mockImplementation(async (callback: (tx: typeof authTx) => Promise<void>) => callback(authTx));

    await expect(saveTripListAsTemplate("trip-42", "Vacation")).rejects.toThrow(
      "Cannot save an empty packing list as a template"
    );

    expect(requireUser).toHaveBeenCalledOnce();
    expect(assertTripAccess).toHaveBeenCalledWith("trip-42", "user-42", "editor");
  });

  it("throws 'Cannot save an empty packing list as a template' for a trip with no items", async () => {
    const emptyTx = {
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
