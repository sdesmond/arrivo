// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const { packingTemplates, sql, trips, users } = vi.hoisted(() => ({
  packingTemplates: { id: "packing_templates.id" },
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
  trips: { id: "trips.id" },
  users: { id: "users.id" },
}));

vi.mock("drizzle-orm", () => ({
  sql,
}));

vi.mock("@/db", () => {
  throw new Error("Lock helpers must not load the database singleton at runtime.");
});

vi.mock("@/db/schema", () => ({
  packingTemplates,
  trips,
  users,
}));

import { lockPackingTemplateForUpdate, lockTripForUpdate, lockUserForUpdate } from "./server-action-locks";

function createTransaction(rows: unknown[]) {
  return {
    execute: vi.fn().mockResolvedValue(rows),
  };
}

describe("server-action-locks", () => {
  it("locks a trip row and resolves when it exists", async () => {
    const transaction = createTransaction([{ id: "trip-1" }]);

    await expect(lockTripForUpdate(transaction as never, "trip-1")).resolves.toBeUndefined();

    expect(transaction.execute).toHaveBeenCalledWith(
      expect.objectContaining({ values: expect.arrayContaining(["trip-1"]) })
    );
  });

  it("throws when a trip row is missing", async () => {
    const transaction = createTransaction([]);

    await expect(lockTripForUpdate(transaction as never, "missing-trip")).rejects.toThrow("Trip not found.");
  });

  it("locks a user row and passes user id into the statement", async () => {
    const transaction = createTransaction([{ id: "user-1" }]);

    await lockUserForUpdate(transaction as never, "user-1");

    expect(transaction.execute).toHaveBeenCalledWith(
      expect.objectContaining({ values: expect.arrayContaining(["user-1"]) })
    );
  });

  it("throws when a user row is missing", async () => {
    const transaction = createTransaction([]);

    await expect(lockUserForUpdate(transaction as never, "missing-user")).rejects.toThrow("User not found.");
  });

  it("locks a packing template row and passes template id into the statement", async () => {
    const transaction = createTransaction([{ id: "template-1" }]);

    await lockPackingTemplateForUpdate(transaction as never, "template-1");

    expect(transaction.execute).toHaveBeenCalledWith(
      expect.objectContaining({ values: expect.arrayContaining(["template-1"]) })
    );
  });

  it("throws when a packing template row is missing", async () => {
    const transaction = createTransaction([]);

    await expect(lockPackingTemplateForUpdate(transaction as never, "missing-template")).rejects.toThrow(
      "Template not found."
    );
  });
});
