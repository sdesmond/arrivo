// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { packingTemplateItems } from "@/db/schema";

const { and, db, eq, gt, max, requireUser, revalidatePath } = vi.hoisted(() => ({
  and: vi.fn((...conditions: unknown[]) => ({ type: "and", conditions })),
  db: {
    delete: vi.fn(),
    execute: vi.fn(),
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

import { reorderTemplateItems } from "./actions";

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
      execute: vi.fn().mockResolvedValue([{ id: "template-1" }]),
      select: vi.fn().mockReturnValueOnce(mockSelectWhere([{ id: "label-1" }])),
      update: vi.fn(() => ({ set })),
    };

    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx));

    await reorderTemplateItems("template-1", [
      { id: "label-1", labelId: null, position: 0 },
      { id: "item-1", labelId: "label-1", position: 1 },
    ]);

    expect(tx.execute).toHaveBeenCalledOnce();
    expect(tx.update).toHaveBeenCalledWith(packingTemplateItems);
    expect(set).toHaveBeenCalledWith({ position: 0, labelId: null });
    expect(set).toHaveBeenCalledWith({ position: 1, labelId: "label-1" });
    expect(and).toHaveBeenCalledWith(
      { type: "eq", left: packingTemplateItems.id, right: "label-1" },
      { type: "eq", left: packingTemplateItems.templateId, right: "template-1" }
    );
    expect(revalidatePath).toHaveBeenCalledWith("/packing/template-1");
  });

  it("rejects reorder when a labelId is not a section of the template", async () => {
    db.select.mockReturnValueOnce(mockSelectWhere([{ id: "template-1" }]));

    const set = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));
    const tx = {
      execute: vi.fn().mockResolvedValue([{ id: "template-1" }]),
      select: vi.fn().mockReturnValueOnce(mockSelectWhere([])),
      update: vi.fn(() => ({ set })),
    };
    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx));

    await expect(
      reorderTemplateItems("template-1", [{ id: "item-1", labelId: "other-template-label", position: 0 }])
    ).rejects.toThrow("Invalid labelId.");

    expect(tx.update).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("sanitizes unexpected reorderTemplateItems failures", async () => {
    db.select.mockReturnValueOnce(mockSelectWhere([{ id: "template-1" }]));

    db.transaction.mockRejectedValue(new Error("database exploded"));

    await expect(reorderTemplateItems("template-1", [{ id: "item-1", labelId: null, position: 0 }])).rejects.toThrow(
      "An unexpected error occurred. Please try again."
    );
  });
});
