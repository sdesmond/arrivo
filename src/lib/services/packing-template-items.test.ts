import { beforeEach, expect, it, vi } from "vitest";
import { packingTemplateItems } from "@/db/schema";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  idempotent: vi.fn(),
  lockIds: vi.fn(),
  lockTemplate: vi.fn(),
  revalidate: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  updateReturning: vi.fn(),
  deleteReturning: vi.fn(),
  deleteWhere: vi.fn(),
  recordDeletions: vi.fn(),
  refuseRecentlyDeleted: vi.fn(),
}));
vi.mock("@/lib/server-action-locks", () => ({ lockPackingTemplateForUpdate: mocks.lockTemplate }));
vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/lib/api/idempotency", () => ({ withIdempotency: mocks.idempotent }));
vi.mock("@/lib/request-deadline", () => ({
  guardTransactionDeadline: (_transaction: unknown, work: () => Promise<unknown>) => work(),
}));
vi.mock("./client-ids", () => ({ lockClientIds: mocks.lockIds }));
vi.mock("./deletion-records", () => ({
  recordDeletions: mocks.recordDeletions,
  refuseRecentlyDeleted: mocks.refuseRecentlyDeleted,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { ConflictError } from "./conflict-error";
import { TripNotFoundError } from "./trip-access";
import { ValidationFailedError } from "./validation-failed-error";
import {
  reorderPackingTemplateItems,
  createPackingTemplateItem,
  deletePackingTemplateItem,
  removePackingTemplateSection,
  updatePackingTemplateItem,
} from "./packing-template-items";

const templateId = "123e4567-e89b-12d3-a456-426614174000";
const otherTemplateId = "123e4567-e89b-12d3-a456-426614174009";
const itemId = "123e4567-e89b-12d3-a456-426614174001";
const anchorId = "123e4567-e89b-12d3-a456-426614174002";
const sectionId = "123e4567-e89b-12d3-a456-426614174003";
const actor = { userId: "user" };
const owned = [{ id: templateId }];
const stored = { id: itemId, templateId, text: "Hat", isLabel: false, position: 5, labelId: null };
const section = { ...stored, id: sectionId, text: "Gear", isLabel: true };
const replayRequest = { key: "k", method: "POST", path: "/x" };
let selectResults: unknown[][];
let replayed = false;

beforeEach(() => {
  vi.clearAllMocks();
  selectResults = [];
  replayed = false;
  const transaction = {
    select: () => ({ from: () => ({ where: async () => selectResults.shift() ?? [] }) }),
    insert: mocks.insert,
    update: mocks.update,
    delete: () => ({ where: mocks.deleteWhere }),
  };
  mocks.deleteWhere.mockImplementation(() => Object.assign(Promise.resolve(), { returning: mocks.deleteReturning }));
  mocks.deleteReturning.mockResolvedValue([]);
  mocks.insert.mockReturnValue({ values: mocks.values });
  mocks.values.mockReturnValue({ returning: async () => [stored] });
  mocks.update.mockReturnValue({ set: mocks.set });
  mocks.set.mockReturnValue({
    where: () => Object.assign(Promise.resolve(), { returning: mocks.updateReturning }),
  });
  mocks.updateReturning.mockResolvedValue([{ ...stored, text: "Cap" }]);
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

// create: owned, existing (authorize), existing (mutate), then label / anchor / max
it("appends after the last position, trims the text and revalidates", async () => {
  selectResults = [owned, [], [], [{ position: 4 }]];
  const result = await createPackingTemplateItem(actor, templateId, { id: itemId.toUpperCase(), text: " Hat " });
  expect(result).toEqual(stored);
  expect(mocks.insert).toHaveBeenCalledWith(packingTemplateItems);
  expect(mocks.values).toHaveBeenCalledWith({
    id: itemId,
    templateId,
    text: "Hat",
    isLabel: false,
    labelId: null,
    position: 5,
  });
  expect(mocks.lockIds).toHaveBeenCalledWith(expect.anything(), [`packing-template-item:${itemId}`]);
  expect(mocks.lockTemplate).toHaveBeenCalledWith(expect.anything(), templateId);
  expect(mocks.refuseRecentlyDeleted).toHaveBeenCalledWith(expect.anything(), "packing-template-item", itemId);
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.revalidate).toHaveBeenCalledWith(`/packing/${templateId}`);
});

it("starts an empty template at position zero", async () => {
  selectResults = [owned, [], [], [{ position: null }]];
  await createPackingTemplateItem(actor, templateId, { id: itemId, text: "Hat" });
  expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ position: 0 }));
});

it.each([
  ["beforeItemId", 2, 2],
  ["afterItemId", 2, 3],
])("inserts next to the %s anchor and shifts later items", async (field, anchorPosition, expected) => {
  selectResults = [owned, [], [], [{ ...stored, id: anchorId, position: anchorPosition }]];
  await createPackingTemplateItem(actor, templateId, { id: itemId, text: "Hat", [field]: anchorId });
  expect(mocks.update).toHaveBeenCalledWith(packingTemplateItems);
  expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ position: expected }));
});

it("files an item under a section of the same template and drops the label of a section", async () => {
  selectResults = [owned, [], [], [{ id: sectionId }], [{ position: 0 }]];
  await createPackingTemplateItem(actor, templateId, { id: itemId, text: "Hat", labelId: sectionId });
  expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ labelId: sectionId, isLabel: false }));
  selectResults = [owned, [], [], [{ position: 0 }]];
  await createPackingTemplateItem(actor, templateId, { id: anchorId, text: "Zone", isLabel: true });
  expect(mocks.values).toHaveBeenLastCalledWith(expect.objectContaining({ labelId: null, isLabel: true }));
});

it("rejects a label or anchor outside the template without writing", async () => {
  selectResults = [owned, [], [], []];
  await expect(
    createPackingTemplateItem(actor, templateId, { id: itemId, text: "Hat", labelId: sectionId })
  ).rejects.toBeInstanceOf(ValidationFailedError);
  selectResults = [owned, [], [], []];
  await expect(
    createPackingTemplateItem(actor, templateId, { id: itemId, text: "Hat", afterItemId: anchorId })
  ).rejects.toBeInstanceOf(ValidationFailedError);
  selectResults = [owned, [], [], [{ ...stored, id: anchorId, templateId: otherTemplateId }]];
  await expect(
    createPackingTemplateItem(actor, templateId, { id: itemId, text: "Hat", beforeItemId: anchorId })
  ).rejects.toBeInstanceOf(ValidationFailedError);
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
});

it("returns the stored row for a same-content retry and conflicts on different content", async () => {
  selectResults = [owned, [stored], [stored]];
  await expect(createPackingTemplateItem(actor, templateId, { id: itemId, text: "Hat" })).resolves.toEqual(stored);
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.revalidate).not.toHaveBeenCalled();
  for (const [row, body] of [
    [stored, { id: itemId, text: "Cap" }],
    [stored, { id: itemId, text: "Hat", isLabel: true }],
    [
      { ...stored, labelId: sectionId },
      { id: itemId, text: "Hat" },
    ],
    [
      { ...stored, templateId: otherTemplateId },
      { id: itemId, text: "Hat" },
    ],
  ] as const) {
    selectResults = [owned, [row], [row], [{ id: otherTemplateId }]];
    await expect(createPackingTemplateItem(actor, templateId, body)).rejects.toBeInstanceOf(ConflictError);
  }
  expect(mocks.insert).not.toHaveBeenCalled();
});

it("does not resurrect a recently deleted id", async () => {
  selectResults = [owned, [], []];
  mocks.refuseRecentlyDeleted.mockRejectedValueOnce(new ConflictError("deleted"));
  await expect(createPackingTemplateItem(actor, templateId, { id: itemId, text: "Hat" })).rejects.toBeInstanceOf(
    ConflictError
  );
  expect(mocks.insert).not.toHaveBeenCalled();
});

it("answers a foreign template or a foreign item id as not found", async () => {
  selectResults = [[]];
  await expect(createPackingTemplateItem(actor, templateId, { id: itemId, text: "Hat" })).rejects.toBeInstanceOf(
    TripNotFoundError
  );
  selectResults = [owned, [{ ...stored, templateId: otherTemplateId }], []];
  await expect(createPackingTemplateItem(actor, templateId, { id: itemId, text: "Hat" })).rejects.toBeInstanceOf(
    TripNotFoundError
  );
  expect(mocks.insert).not.toHaveBeenCalled();
});

it("treats a template deleted before the lock as not found and rethrows other lock errors", async () => {
  selectResults = [owned];
  mocks.lockTemplate.mockRejectedValueOnce(new Error("Template not found."));
  await expect(createPackingTemplateItem(actor, templateId, { id: itemId, text: "Hat" })).rejects.toBeInstanceOf(
    TripNotFoundError
  );
  selectResults = [owned];
  mocks.lockTemplate.mockRejectedValueOnce(new Error("deadlock"));
  await expect(createPackingTemplateItem(actor, templateId, { id: itemId, text: "Hat" })).rejects.toThrow("deadlock");
  selectResults = [owned];
  mocks.lockTemplate.mockRejectedValueOnce("odd");
  await expect(createPackingTemplateItem(actor, templateId, { id: itemId, text: "Hat" })).rejects.toBe("odd");
});

it("rejects invalid input before opening a transaction and skips revalidation on a keyed replay", async () => {
  for (const [id, body] of [
    [templateId, { id: itemId, text: "  " }],
    [templateId, { id: itemId, text: "x".repeat(31) }],
    ["bad", { id: itemId, text: "Hat" }],
  ] as const)
    await expect(createPackingTemplateItem(actor, id, body)).rejects.toThrow();
  expect(mocks.transaction).not.toHaveBeenCalled();
  selectResults = [owned, [], [], [{ position: 1 }]];
  replayed = true;
  await createPackingTemplateItem(actor, templateId, { id: itemId, text: "Hat" }, replayRequest);
  expect(mocks.revalidate).not.toHaveBeenCalled();
});

// update: item, owned (lockOwnedItem), owned (lockOwnedTemplate); mutate: item, owned
it("updates the text and revalidates the editor", async () => {
  selectResults = [[stored], owned, owned, [stored], owned];
  await expect(updatePackingTemplateItem(actor, itemId, { text: " Cap " })).resolves.toEqual({
    ...stored,
    text: "Cap",
  });
  expect(mocks.set).toHaveBeenCalledWith({ text: "Cap" });
  expect(mocks.revalidate).toHaveBeenCalledWith(`/packing/${templateId}`);
});

it("returns an unchanged item without writing and skips revalidation on replay", async () => {
  selectResults = [[stored], owned, owned, [stored], owned];
  await expect(updatePackingTemplateItem(actor, itemId, { text: "Hat" })).resolves.toEqual(stored);
  expect(mocks.update).not.toHaveBeenCalled();
  selectResults = [[stored], owned, owned, [stored], owned];
  replayed = true;
  await updatePackingTemplateItem(actor, itemId, { text: "Cap" }, replayRequest);
  expect(mocks.revalidate).not.toHaveBeenCalled();
});

it("answers a missing or foreign item as not found on update", async () => {
  selectResults = [[]];
  await expect(updatePackingTemplateItem(actor, itemId, { text: "Cap" })).rejects.toBeInstanceOf(TripNotFoundError);
  selectResults = [[stored], []];
  await expect(updatePackingTemplateItem(actor, itemId, { text: "Cap" })).rejects.toBeInstanceOf(TripNotFoundError);
  selectResults = [[stored], owned, owned, []];
  await expect(updatePackingTemplateItem(actor, itemId, { text: "Cap" })).rejects.toBeInstanceOf(TripNotFoundError);
  selectResults = [[stored], owned, owned, [stored], []];
  await expect(updatePackingTemplateItem(actor, itemId, { text: "Cap" })).rejects.toBeInstanceOf(TripNotFoundError);
  expect(mocks.update).not.toHaveBeenCalled();
  await expect(updatePackingTemplateItem(actor, itemId, { text: "" })).rejects.toThrow();
});

// delete: item, owned, owned; mutate: item, owned
it("deletes an owned item, records the deletion and revalidates", async () => {
  selectResults = [[stored], owned, owned, [stored], owned];
  await expect(deletePackingTemplateItem(actor, itemId)).resolves.toBeNull();
  expect(mocks.deleteWhere).toHaveBeenCalledOnce();
  expect(mocks.recordDeletions).toHaveBeenCalledWith(expect.anything(), "packing-template-item", [itemId], "user");
  expect(mocks.revalidate).toHaveBeenCalledWith(`/packing/${templateId}`);
});

it("answers a missing or foreign item with nothing written", async () => {
  selectResults = [[]];
  await expect(deletePackingTemplateItem(actor, itemId, {})).resolves.toBeNull();
  selectResults = [[stored], []];
  await expect(deletePackingTemplateItem(actor, itemId)).resolves.toBeNull();
  selectResults = [[stored], owned, owned, [stored], []];
  await expect(deletePackingTemplateItem(actor, itemId)).resolves.toBeNull();
  expect(mocks.deleteWhere).not.toHaveBeenCalled();
  expect(mocks.recordDeletions).not.toHaveBeenCalled();
  expect(mocks.revalidate).not.toHaveBeenCalled();
  selectResults = [[stored], owned, owned, [stored], owned];
  replayed = true;
  await deletePackingTemplateItem(actor, itemId, {}, replayRequest);
  expect(mocks.revalidate).not.toHaveBeenCalled();
  await expect(deletePackingTemplateItem(actor, itemId, { extra: 1 })).rejects.toThrow();
});

it("deletes a section's items and records every removed id", async () => {
  selectResults = [[section], owned, owned, [section], owned];
  mocks.deleteReturning.mockResolvedValueOnce([{ id: itemId }, { id: anchorId }]);
  await expect(removePackingTemplateSection(actor, sectionId, { mode: "delete-items" })).resolves.toBeNull();
  expect(mocks.deleteReturning).toHaveBeenCalledOnce();
  expect(mocks.deleteWhere).toHaveBeenCalledTimes(2);
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.recordDeletions).toHaveBeenCalledWith(
    expect.anything(),
    "packing-template-item",
    [itemId, anchorId, sectionId],
    "user"
  );
  expect(mocks.revalidate).toHaveBeenCalledWith(`/packing/${templateId}`);
});

it("ungroups a section's items and records only the section", async () => {
  selectResults = [[section], owned, owned, [section], owned];
  await expect(removePackingTemplateSection(actor, sectionId, { mode: "move-items-to-ungrouped" })).resolves.toBeNull();
  expect(mocks.set).toHaveBeenCalledWith({ labelId: null });
  expect(mocks.deleteReturning).not.toHaveBeenCalled();
  expect(mocks.deleteWhere).toHaveBeenCalledOnce();
  expect(mocks.recordDeletions).toHaveBeenCalledWith(expect.anything(), "packing-template-item", [sectionId], "user");
});

it("answers a non-section as not found and a missing or foreign section with nothing written", async () => {
  selectResults = [[stored], owned, owned];
  await expect(removePackingTemplateSection(actor, itemId, { mode: "delete-items" })).rejects.toBeInstanceOf(
    TripNotFoundError
  );
  selectResults = [[section], owned, owned, [stored], owned];
  await expect(removePackingTemplateSection(actor, itemId, { mode: "delete-items" })).rejects.toBeInstanceOf(
    TripNotFoundError
  );
  selectResults = [[]];
  await expect(removePackingTemplateSection(actor, sectionId, { mode: "delete-items" })).resolves.toBeNull();
  selectResults = [[section], []];
  await expect(removePackingTemplateSection(actor, sectionId, { mode: "delete-items" })).resolves.toBeNull();
  selectResults = [[section], owned, owned, [section], []];
  await expect(removePackingTemplateSection(actor, sectionId, { mode: "delete-items" })).resolves.toBeNull();
  selectResults = [[section], owned, owned, []];
  await expect(removePackingTemplateSection(actor, sectionId, { mode: "delete-items" })).resolves.toBeNull();
  expect(mocks.deleteWhere).not.toHaveBeenCalled();
  expect(mocks.recordDeletions).not.toHaveBeenCalled();
  selectResults = [[section], owned, owned, [section], owned];
  replayed = true;
  await removePackingTemplateSection(actor, sectionId, { mode: "delete-items" }, replayRequest);
  expect(mocks.revalidate).not.toHaveBeenCalled();
  await expect(removePackingTemplateSection(actor, sectionId, { mode: "bad" })).rejects.toThrow();
});

it("reorders the complete template and rejects stale ids or invalid sections before writes", async () => {
  const body = {
    expectedItems: [
      { id: sectionId, position: 5, labelId: null },
      { id: itemId, position: 5, labelId: null },
    ],
    items: [
      { id: sectionId, labelId: null },
      { id: itemId, labelId: sectionId },
    ],
  };
  selectResults = [owned, [stored, section]];
  expect(await reorderPackingTemplateItems(actor, templateId, body)).toEqual(body);
  expect(mocks.set).toHaveBeenCalledTimes(2);
  vi.clearAllMocks();
  selectResults = [owned, [stored, section]];
  await expect(
    reorderPackingTemplateItems(actor, templateId, { ...body, items: [body.items[0]] })
  ).rejects.toBeInstanceOf(ConflictError);
  expect(mocks.update).not.toHaveBeenCalled();
  selectResults = [owned, [stored, section]];
  await expect(
    reorderPackingTemplateItems(actor, templateId, {
      ...body,
      items: [{ id: sectionId, labelId: itemId }, body.items[1]],
    })
  ).rejects.toBeInstanceOf(ValidationFailedError);
  expect(mocks.update).not.toHaveBeenCalled();
});

it("skips unchanged order and does not revalidate a replay", async () => {
  const body = {
    expectedItems: [
      { id: sectionId, position: 0, labelId: null },
      { id: itemId, position: 1, labelId: sectionId },
    ],
    items: [
      { id: sectionId, labelId: null },
      { id: itemId, labelId: sectionId },
    ],
  };
  selectResults = [
    owned,
    [
      { ...section, position: 0 },
      { ...stored, position: 1, labelId: sectionId },
    ],
  ];
  expect(await reorderPackingTemplateItems(actor, templateId, body)).toEqual(body);
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.revalidate).not.toHaveBeenCalled();
  replayed = true;
  selectResults = [
    owned,
    [
      { ...section, position: 0 },
      { ...stored, position: 1, labelId: sectionId },
    ],
  ];
  await reorderPackingTemplateItems(actor, templateId, body, replayRequest);
  expect(mocks.revalidate).not.toHaveBeenCalled();
});

it("refuses foreign templates, duplicates, extra ids and invalid labels without writes", async () => {
  const body = {
    expectedItems: [
      { id: sectionId, position: 5, labelId: null },
      { id: itemId, position: 5, labelId: null },
    ],
    items: [
      { id: sectionId, labelId: null },
      { id: itemId, labelId: null },
    ],
  };
  selectResults = [[]];
  await expect(reorderPackingTemplateItems(actor, templateId, body)).rejects.toBeInstanceOf(TripNotFoundError);
  await expect(
    reorderPackingTemplateItems(actor, templateId, { ...body, items: [body.items[0], body.items[0]] })
  ).rejects.toThrow();
  for (const badId of [anchorId, otherTemplateId]) {
    selectResults = [owned, [section, stored]];
    await expect(
      reorderPackingTemplateItems(actor, templateId, { ...body, items: [body.items[0], { id: badId, labelId: null }] })
    ).rejects.toBeInstanceOf(ConflictError);
    selectResults = [owned, [section, stored]];
    await expect(
      reorderPackingTemplateItems(actor, templateId, {
        ...body,
        items: [body.items[0], { id: itemId, labelId: badId }],
      })
    ).rejects.toBeInstanceOf(ValidationFailedError);
  }
  selectResults = [owned, [section, stored]];
  await expect(
    reorderPackingTemplateItems(actor, templateId, { ...body, items: [body.items[0], { id: itemId, labelId: itemId }] })
  ).rejects.toBeInstanceOf(ValidationFailedError);
  expect(mocks.update).not.toHaveBeenCalled();
});

it("rejects stale positions and section assignments even when ids match", async () => {
  const items = [
    { id: sectionId, labelId: null },
    { id: itemId, labelId: sectionId },
  ];
  const expectedItems = [
    { id: sectionId, position: 0, labelId: null },
    { id: itemId, position: 5, labelId: null },
  ];
  for (const changed of [
    { ...stored, position: 6 },
    { ...stored, labelId: sectionId },
  ]) {
    selectResults = [owned, [{ ...section, position: 0 }, changed]];
    await expect(reorderPackingTemplateItems(actor, templateId, { items, expectedItems })).rejects.toBeInstanceOf(
      ConflictError
    );
    expect(mocks.update).not.toHaveBeenCalled();
  }
});

it("compares position gaps and ties exactly", async () => {
  const expectedItems = [
    { id: sectionId, position: 5, labelId: null },
    { id: itemId, position: 5, labelId: null },
  ];
  const body = {
    items: [
      { id: sectionId, labelId: null },
      { id: itemId, labelId: null },
    ],
    expectedItems,
  };
  selectResults = [owned, [section, stored]];
  expect(await reorderPackingTemplateItems(actor, templateId, body)).toEqual(body);
  selectResults = [owned, [section, { ...stored, position: 6 }]];
  mocks.update.mockClear();
  await expect(reorderPackingTemplateItems(actor, templateId, body)).rejects.toBeInstanceOf(ConflictError);
  expect(mocks.update).not.toHaveBeenCalled();
});

it("returns a replay without comparing the now-changed snapshot", async () => {
  const body = { items: [{ id: itemId, labelId: null }], expectedItems: [{ id: itemId, position: 5, labelId: null }] };
  mocks.idempotent.mockImplementationOnce(async (_tx, _input, steps) => {
    await steps.authorize();
    return { value: body, replayed: true };
  });
  selectResults = [owned];
  expect(await reorderPackingTemplateItems(actor, templateId, body, replayRequest)).toEqual(body);
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
