// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { packingTemplates } from "@/db/schema";

const { and, db, eq, requireUser, revalidatePath } = vi.hoisted(() => ({
  and: vi.fn((...conditions: unknown[]) => ({ type: "and", conditions })),
  db: {
    delete: vi.fn(),
    update: vi.fn(),
  },
  eq: vi.fn((left: unknown, right: unknown) => ({ type: "eq", left, right })),
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    and,
    eq,
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

import { deleteTemplate, renameTemplate } from "./actions";
import { normalizeTemplateName } from "./template-name";

describe("normalizeTemplateName", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeTemplateName("  Beach Weekend  ")).toBe("Beach Weekend");
  });

  it("rejects empty or whitespace-only names", () => {
    expect(() => normalizeTemplateName("   ")).toThrow("Template name is required.");
  });

  it("rejects names longer than 30 characters", () => {
    expect(() => normalizeTemplateName("x".repeat(31))).toThrow("Template name must be 30 characters or fewer.");
  });
});

describe("template actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "user-1" });
  });

  it("renames a template with user scoping and revalidation", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn(() => ({ where }));
    db.update.mockReturnValue({ set });

    await renameTemplate("template-1", { name: "  Carry-on Only  " });

    expect(db.update).toHaveBeenCalledWith(packingTemplates);
    expect(set).toHaveBeenCalledWith({ name: "Carry-on Only" });
    expect(eq).toHaveBeenCalledWith(packingTemplates.id, "template-1");
    expect(eq).toHaveBeenCalledWith(packingTemplates.userId, "user-1");
    expect(and).toHaveBeenCalled();
    expect(where).toHaveBeenCalledWith({
      type: "and",
      conditions: [
        { type: "eq", left: packingTemplates.id, right: "template-1" },
        { type: "eq", left: packingTemplates.userId, right: "user-1" },
      ],
    });
    expect(revalidatePath).toHaveBeenCalledWith("/packing");
  });

  it("sanitizes unexpected renameTemplate failures", async () => {
    const where = vi.fn().mockRejectedValue(new Error("database exploded"));
    const set = vi.fn(() => ({ where }));
    db.update.mockReturnValue({ set });

    await expect(renameTemplate("template-1", { name: "Carry-on Only" })).rejects.toThrow(
      "An unexpected error occurred. Please try again."
    );
  });

  it("deletes a template with user scoping and revalidation", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    db.delete.mockReturnValue({ where });

    await deleteTemplate("template-1");

    expect(db.delete).toHaveBeenCalledWith(packingTemplates);
    expect(eq).toHaveBeenCalledWith(packingTemplates.id, "template-1");
    expect(eq).toHaveBeenCalledWith(packingTemplates.userId, "user-1");
    expect(and).toHaveBeenCalled();
    expect(where).toHaveBeenCalledWith({
      type: "and",
      conditions: [
        { type: "eq", left: packingTemplates.id, right: "template-1" },
        { type: "eq", left: packingTemplates.userId, right: "user-1" },
      ],
    });
    expect(revalidatePath).toHaveBeenCalledWith("/packing");
  });

  it("sanitizes unexpected deleteTemplate failures", async () => {
    const where = vi.fn().mockRejectedValue(new Error("database exploded"));
    db.delete.mockReturnValue({ where });

    await expect(deleteTemplate("template-1")).rejects.toThrow("An unexpected error occurred. Please try again.");
  });
});
