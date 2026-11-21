import { beforeEach, expect, it, vi } from "vitest";
import { packingTemplates } from "@/db/schema";
const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  idempotent: vi.fn(),
  lockIds: vi.fn(),
  list: vi.fn(),
  revalidate: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
}));
vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/lib/api/idempotency", () => ({ withIdempotency: mocks.idempotent }));
vi.mock("@/lib/request-deadline", () => ({
  guardTransactionDeadline: (_transaction: unknown, work: () => Promise<unknown>) => work(),
}));
vi.mock("./client-ids", () => ({ lockClientIds: mocks.lockIds }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/queries", () => ({ listTemplatesForUser: mocks.list }));
import { ConflictError } from "./conflict-error";
import { TripNotFoundError } from "./trip-access";
import { createPackingTemplate, listPackingTemplates } from "./packing-templates";
const id = "123e4567-e89b-12d3-a456-426614174000";
const actor = { userId: "user" };
const stored = { id, userId: "user", name: "Beach", createdAt: new Date("2026-01-01T00:00:00.000Z") };
let selectResults: unknown[][];
let replayed = false;
beforeEach(() => {
  vi.clearAllMocks();
  selectResults = [];
  replayed = false;
  const transaction = {
    select: () => ({ from: () => ({ where: async () => selectResults.shift() ?? [] }) }),
    insert: mocks.insert,
  };
  mocks.insert.mockReturnValue({ values: mocks.values });
  mocks.values.mockReturnValue({ returning: async () => [stored] });
  mocks.transaction.mockImplementation(async (work: (tx: unknown) => unknown) => work(transaction));
  mocks.idempotent.mockImplementation(
    async (
      _tx: unknown,
      _input: unknown,
      steps: { authorize: () => Promise<void>; mutate: () => Promise<unknown> }
    ) => {
      await steps.authorize();
      return { value: await steps.mutate(), replayed };
    }
  );
});
it("lists only the caller's templates", async () => {
  mocks.list.mockResolvedValue([{ id, name: "Beach" }]);
  await expect(listPackingTemplates(actor)).resolves.toEqual({ templates: [{ id, name: "Beach" }] });
  expect(mocks.list).toHaveBeenCalledWith("user");
  await expect(listPackingTemplates(actor, { extra: 1 })).rejects.toThrow();
});
it("creates an owned template with a trimmed name and revalidates", async () => {
  selectResults = [[], []];
  const result = await createPackingTemplate(actor, { id: id.toUpperCase(), name: "  Beach " });
  expect(result).toEqual({ id, name: "Beach", createdAt: "2026-01-01T00:00:00.000Z" });
  expect(mocks.insert).toHaveBeenCalledWith(packingTemplates);
  expect(mocks.values).toHaveBeenCalledWith({ id, userId: "user", name: "Beach" });
  expect(mocks.lockIds).toHaveBeenCalledWith(expect.anything(), [`packing-template:${id}`]);
  expect(mocks.revalidate).toHaveBeenCalledWith("/packing");
});
it("returns the current row without writing on a same-id retry", async () => {
  selectResults = [[{ userId: "user" }], [stored]];
  await expect(createPackingTemplate(actor, { id, name: "Beach" })).resolves.toMatchObject({ id, name: "Beach" });
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
it("conflicts when the id holds a different name", async () => {
  selectResults = [[{ userId: "user" }], [stored]];
  await expect(createPackingTemplate(actor, { id, name: "Other" })).rejects.toBeInstanceOf(ConflictError);
  expect(mocks.insert).not.toHaveBeenCalled();
});
it("answers another user's id as not found", async () => {
  selectResults = [[{ userId: "someone" }]];
  await expect(createPackingTemplate(actor, { id, name: "Beach" })).rejects.toBeInstanceOf(TripNotFoundError);
  expect(mocks.insert).not.toHaveBeenCalled();
});
it("rejects invalid names before any write and skips revalidation on a keyed replay", async () => {
  await expect(createPackingTemplate(actor, { id, name: "  " })).rejects.toThrow();
  expect(mocks.transaction).not.toHaveBeenCalled();
  selectResults = [[], []];
  replayed = true;
  await createPackingTemplate(
    actor,
    { id, name: "Beach" },
    { key: "k", method: "POST", path: "/api/v1/packing-templates" }
  );
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
