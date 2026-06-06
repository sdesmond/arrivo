// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RemovePackingSectionMode } from "@/data/types";
import { packingTemplateItems } from "@/db/schema";

const { and, db, eq, gt, max, requireUser, revalidatePath } = vi.hoisted(() => ({
  and: vi.fn((...conditions: unknown[]) => ({ type: "and", conditions })),
  db: {
    delete: vi.fn(),
    insert: vi.fn(),
    select: vi.fn(),
    transaction: vi.fn(),
    update: vi.fn(),
  },
  eq: vi.fn((left: unknown, right: unknown) => ({ type: "eq", left, right })),
  gt: vi.fn((left: unknown, right: unknown) => ({ type: "gt", left, right })),
  max: vi.fn((column: unknown) => ({ type: "max", column })),
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    and,
    eq,
    gt,
    max,
  };
});

vi.mock("@/db", () => ({
  db,
}));

vi.mock("@/lib/auth-helpers", () => ({
  requireUser,
}));

vi.mock("next/cache", () => ({
  revalidatePath,
}));

import {
  addTemplateItem,
  removeTemplateItem,
  removeTemplateSection,
  reorderTemplateItems,
  updateTemplateItem,
} from "./actions";

function mockSelectWhere(rows: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(rows),
      innerJoin: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(rows),
      })),
    })),
  };
}

describe("template item actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "user-1" });
  });

  it("adds a template item at the end and revalidates the editor route", async () => {
    db.select
      .mockReturnValueOnce(mockSelectWhere([{ id: "template-1" }]))
      .mockReturnValueOnce(mockSelectWhere([{ maxPos: 2 }]));

    const returning = vi.fn().mockResolvedValue([{ id: "item-3" }]);
    const values = vi.fn(() => ({ returning }));
    db.insert.mockReturnValue({ values });

    await expect(addTemplateItem("template-1", { text: "  Passport  " })).resolves.toEqual({ id: "item-3" });

    expect(requireUser).toHaveBeenCalledOnce();
    expect(values).toHaveBeenCalledWith({
      templateId: "template-1",
      text: "Passport",
      isLabel: false,
      position: 3,
      labelId: null,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/packing/template-1");
  });

  it("sanitizes unexpected addTemplateItem failures", async () => {
    db.select
      .mockReturnValueOnce(mockSelectWhere([{ id: "template-1" }]))
      .mockReturnValueOnce(mockSelectWhere([{ maxPos: 2 }]));

    const returning = vi.fn().mockRejectedValue(new Error("database exploded"));
    const values = vi.fn(() => ({ returning }));
    db.insert.mockReturnValue({ values });

    await expect(addTemplateItem("template-1", { text: "Passport" })).rejects.toThrow(
      "An unexpected error occurred. Please try again."
    );
  });

  it("rejects add when the template is not owned by the current user", async () => {
    db.select.mockReturnValueOnce(mockSelectWhere([]));

    await expect(addTemplateItem("template-1", { text: "Passport" })).rejects.toThrow("Template not found.");

    expect(db.insert).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects add when the trimmed text is blank", async () => {
    db.select.mockReturnValueOnce(mockSelectWhere([{ id: "template-1" }]));

    await expect(addTemplateItem("template-1", { text: "   " })).rejects.toThrow("Item text is required.");

    expect(db.insert).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects add when the text exceeds 100 characters", async () => {
    db.select.mockReturnValueOnce(mockSelectWhere([{ id: "template-1" }]));

    await expect(addTemplateItem("template-1", { text: "a".repeat(101) })).rejects.toThrow(
      "Item text must be 100 characters or fewer."
    );

    expect(db.insert).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("inserts after a target item and shifts later positions", async () => {
    db.select.mockReturnValueOnce(mockSelectWhere([{ id: "template-1" }]));

    const insertReturning = vi.fn().mockResolvedValue([{ id: "item-2" }]);
    const tx = {
      insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: insertReturning })) })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([{ id: "label-1", templateId: "template-1", position: 0 }]),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn().mockResolvedValue(undefined),
        })),
      })),
    };

    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<{ id: string }>) =>
      callback(tx)
    );

    await addTemplateItem("template-1", {
      text: "Visa",
      afterItemId: "label-1",
      labelId: "label-1",
    });

    expect(db.transaction).toHaveBeenCalledOnce();
    expect(insertReturning).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/packing/template-1");
  });

  it("updates a template item with ownership scoping and revalidation", async () => {
    db.select.mockReturnValueOnce(mockSelectWhere([{ templateId: "template-1" }]));

    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn(() => ({ where }));
    db.update.mockReturnValue({ set });

    await updateTemplateItem("item-1", { text: "  SPF 50 Sunscreen  " });

    expect(set).toHaveBeenCalledWith({ text: "SPF 50 Sunscreen" });
    expect(where).toHaveBeenCalledWith({ type: "eq", left: packingTemplateItems.id, right: "item-1" });
    expect(revalidatePath).toHaveBeenCalledWith("/packing/template-1");
  });

  it("sanitizes unexpected updateTemplateItem failures", async () => {
    db.select.mockReturnValueOnce(mockSelectWhere([{ templateId: "template-1" }]));

    const where = vi.fn().mockRejectedValue(new Error("database exploded"));
    const set = vi.fn(() => ({ where }));
    db.update.mockReturnValue({ set });

    await expect(updateTemplateItem("item-1", { text: "Passport" })).rejects.toThrow(
      "An unexpected error occurred. Please try again."
    );
  });

  it("rejects update when the trimmed text is blank", async () => {
    db.select.mockReturnValueOnce(mockSelectWhere([{ templateId: "template-1" }]));

    await expect(updateTemplateItem("item-1", { text: "   " })).rejects.toThrow("Item text is required.");

    expect(db.update).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("removes a template item with ownership scoping and revalidation", async () => {
    db.select.mockReturnValueOnce(mockSelectWhere([{ templateId: "template-1" }]));

    const where = vi.fn().mockResolvedValue(undefined);
    db.delete.mockReturnValue({ where });

    await removeTemplateItem("item-1");

    expect(db.delete).toHaveBeenCalledWith(packingTemplateItems);
    expect(where).toHaveBeenCalledWith({ type: "eq", left: packingTemplateItems.id, right: "item-1" });
    expect(revalidatePath).toHaveBeenCalledWith("/packing/template-1");
  });

  it("sanitizes unexpected removeTemplateItem failures", async () => {
    db.select.mockReturnValueOnce(mockSelectWhere([{ templateId: "template-1" }]));

    const where = vi.fn().mockRejectedValue(new Error("database exploded"));
    db.delete.mockReturnValue({ where });

    await expect(removeTemplateItem("item-1")).rejects.toThrow("An unexpected error occurred. Please try again.");
  });

  it("removes a template section and moves its items to ungrouped", async () => {
    db.select
      .mockReturnValueOnce(mockSelectWhere([{ templateId: "template-1" }]))
      .mockReturnValueOnce(mockSelectWhere([{ id: "label-1", templateId: "template-1", isLabel: true }]));

    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    const tx = {
      delete: vi.fn(() => ({ where: deleteWhere })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: updateWhere,
        })),
      })),
    };

    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx));

    await removeTemplateSection("label-1", { mode: RemovePackingSectionMode.MoveItemsToUngrouped });

    expect(tx.update).toHaveBeenCalledWith(packingTemplateItems);
    expect(updateWhere).toHaveBeenCalled();
    expect(tx.delete).toHaveBeenCalledWith(packingTemplateItems);
    expect(deleteWhere).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/packing/template-1");
  });

  it("removes a template section and deletes its items", async () => {
    db.select
      .mockReturnValueOnce(mockSelectWhere([{ templateId: "template-1" }]))
      .mockReturnValueOnce(mockSelectWhere([{ id: "label-1", templateId: "template-1", isLabel: true }]));

    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    const tx = {
      delete: vi.fn(() => ({ where: deleteWhere })),
      update: vi.fn(),
    };

    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx));

    await removeTemplateSection("label-1", { mode: RemovePackingSectionMode.DeleteItems });

    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.delete).toHaveBeenCalledTimes(2);
    expect(deleteWhere).toHaveBeenCalledTimes(2);
    expect(revalidatePath).toHaveBeenCalledWith("/packing/template-1");
  });

  it("reorderTemplateItems is a no-op for an empty ordering", async () => {
    db.select.mockReturnValueOnce(mockSelectWhere([{ id: "template-1" }]));

    await reorderTemplateItems("template-1", []);

    expect(db.transaction).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("reorders template items in a transaction and revalidates", async () => {
    db.select.mockReturnValueOnce(mockSelectWhere([{ id: "template-1" }]));

    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn(() => ({ where }));
    const tx = {
      update: vi.fn(() => ({ set })),
    };

    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx));

    await reorderTemplateItems("template-1", [
      { id: "label-1", labelId: null, position: 0 },
      { id: "item-1", labelId: "label-1", position: 1 },
    ]);

    expect(tx.update).toHaveBeenCalledWith(packingTemplateItems);
    expect(set).toHaveBeenCalledWith({ position: 0, labelId: null });
    expect(set).toHaveBeenCalledWith({ position: 1, labelId: "label-1" });
    expect(and).toHaveBeenCalledWith(
      { type: "eq", left: packingTemplateItems.id, right: "label-1" },
      { type: "eq", left: packingTemplateItems.templateId, right: "template-1" }
    );
    expect(revalidatePath).toHaveBeenCalledWith("/packing/template-1");
  });

  it("sanitizes unexpected reorderTemplateItems failures", async () => {
    db.select.mockReturnValueOnce(mockSelectWhere([{ id: "template-1" }]));

    db.transaction.mockRejectedValue(new Error("database exploded"));

    await expect(reorderTemplateItems("template-1", [{ id: "item-1", labelId: null, position: 0 }])).rejects.toThrow(
      "An unexpected error occurred. Please try again."
    );
  });
});
