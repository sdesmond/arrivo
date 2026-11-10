import { beforeEach, expect, it, vi } from "vitest";
import { events, itineraryChecklists, itineraryNotes } from "@/db/schema";
import { ConflictError } from "./conflict-error";
import { appendPosition, applyDayOrder, shiftFromPosition } from "./timeline-positions";

type Table = typeof events | typeof itineraryNotes | typeof itineraryChecklists;
let rows: Map<Table, unknown[]>;
let writes: { table: Table; values: Record<string, unknown> }[];
const fake = {
  select: vi.fn(() => ({ from: (table: Table) => ({ where: async () => rows.get(table) ?? [] }) })),
  update: vi.fn((table: Table) => ({
    set: (values: Record<string, unknown>) => ({
      where: async () => {
        writes.push({ table, values });
      },
    }),
  })),
};
const executor = fake as unknown as Parameters<typeof appendPosition>[0];
const day = "day";
beforeEach(() => {
  vi.clearAllMocks();
  rows = new Map();
  writes = [];
});

it("appends after the highest position across all three tables", async () => {
  rows.set(events, [{ maxEvt: 3 }]);
  rows.set(itineraryNotes, [{ maxNote: 6 }]);
  rows.set(itineraryChecklists, [{ maxCl: 1 }]);
  await expect(appendPosition(executor, day)).resolves.toBe(7);
});

it("appends at 0 on an empty day", async () => {
  rows.set(events, [{ maxEvt: null }]);
  rows.set(itineraryNotes, [{ maxNote: null }]);
  rows.set(itineraryChecklists, [{ maxCl: null }]);
  await expect(appendPosition(executor, day)).resolves.toBe(0);
});

it("shifts events, notes and checklists at or above a position by one", async () => {
  await shiftFromPosition(executor, day, 2);
  expect(writes.map((write) => write.table)).toEqual([events, itineraryNotes, itineraryChecklists]);
  for (const write of writes) expect(Object.keys(write.values)).toEqual(["position"]);
});

const stored = () => {
  rows.set(events, [{ id: "e1", position: 0 }]);
  rows.set(itineraryNotes, [{ id: "n1", position: 1 }]);
  rows.set(itineraryChecklists, [{ id: "c1", position: 2 }]);
};

it("writes positions 0..n-1 for a mixed reorder and reports a change", async () => {
  stored();
  await expect(
    applyDayOrder(executor, day, [
      { type: "checklist", id: "c1" },
      { type: "event", id: "e1" },
      { type: "note", id: "n1" },
    ])
  ).resolves.toBe(true);
  expect(writes).toEqual([
    { table: itineraryChecklists, values: { position: 0 } },
    { table: events, values: { position: 1 } },
    { table: itineraryNotes, values: { position: 2 } },
  ]);
});

it("skips rows whose position already matches", async () => {
  stored();
  await applyDayOrder(executor, day, [
    { type: "event", id: "e1" },
    { type: "checklist", id: "c1" },
    { type: "note", id: "n1" },
  ]);
  expect(writes).toEqual([
    { table: itineraryChecklists, values: { position: 1 } },
    { table: itineraryNotes, values: { position: 2 } },
  ]);
});

it("writes nothing and reports no change for a list already in stored order", async () => {
  stored();
  await expect(
    applyDayOrder(executor, day, [
      { type: "event", id: "e1" },
      { type: "note", id: "n1" },
      { type: "checklist", id: "c1" },
    ])
  ).resolves.toBe(false);
  expect(fake.update).not.toHaveBeenCalled();
});

it("normalizes a day whose stored positions have gaps", async () => {
  rows.set(events, [{ id: "e1", position: 4 }]);
  rows.set(itineraryNotes, [{ id: "n1", position: 9 }]);
  await expect(
    applyDayOrder(executor, day, [
      { type: "event", id: "e1" },
      { type: "note", id: "n1" },
    ])
  ).resolves.toBe(true);
  expect(writes).toEqual([
    { table: events, values: { position: 0 } },
    { table: itineraryNotes, values: { position: 1 } },
  ]);
});

it("accepts an empty list for an empty day without writing", async () => {
  await expect(applyDayOrder(executor, day, [])).resolves.toBe(false);
  expect(fake.update).not.toHaveBeenCalled();
});

it.each([
  ["an item added since the client read", [{ type: "event", id: "e1" }]],
  [
    "an item removed since the client read",
    [
      { type: "event", id: "e1" },
      { type: "note", id: "n1" },
      { type: "checklist", id: "c1" },
      { type: "note", id: "gone" },
    ],
  ],
  [
    "a foreign item of the same list size",
    [
      { type: "event", id: "e1" },
      { type: "note", id: "n1" },
      { type: "checklist", id: "foreign" },
    ],
  ],
  [
    "an id listed under the wrong type",
    [
      { type: "note", id: "e1" },
      { type: "note", id: "n1" },
      { type: "checklist", id: "c1" },
    ],
  ],
] as const)("throws ConflictError and writes nothing for %s", async (_label, items) => {
  stored();
  await expect(applyDayOrder(executor, day, [...items])).rejects.toBeInstanceOf(ConflictError);
  expect(fake.update).not.toHaveBeenCalled();
});
