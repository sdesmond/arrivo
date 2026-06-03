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

import { addPackingItem, reorderPackingItems, saveTripListAsTemplate } from "./packing-actions";

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

  it("rejects reorderPackingItems when an entry references an invalid labelId", async () => {
    const tx = {
      select: vi.fn(() => ({
        from: () => ({
          where: async () => [],
        }),
      })),
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
