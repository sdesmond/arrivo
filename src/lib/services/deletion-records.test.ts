// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const now = new Date("2026-11-16T12:00:00.000Z");
vi.mock("@/lib/mock-date", () => ({ getNow: () => now }));

import { idempotencyKeys } from "@/db/schema";
import { IDEMPOTENCY_RETENTION_MS } from "@/lib/idempotency-retention";
import type { DbTransaction } from "@/lib/server-action-locks";
import { ConflictError } from "./conflict-error";
import {
  DELETION_RECORD_NAMESPACE,
  recordDeletion,
  recordDeletions,
  refuseRecentlyDeleted,
  wasRecentlyDeleted,
} from "./deletion-records";

const documentId = "123E4567-E89B-12D3-A456-426614174000";
const recordKey = `${DELETION_RECORD_NAMESPACE}document:${documentId.toLowerCase()}`;

function fakeTransaction(rows: { key: string }[] = []) {
  const calls = {
    table: undefined as unknown,
    values: undefined as unknown,
    batches: [] as unknown[][],
    upsert: undefined as unknown,
    where: undefined as SQL | undefined,
    limit: undefined as number | undefined,
  };
  const transaction = {
    insert: (table: unknown) => {
      calls.table = table;
      return {
        values: (values: unknown[]) => {
          calls.values = values;
          calls.batches.push(values);
          return {
            onConflictDoUpdate: async (upsert: unknown) => {
              calls.upsert = upsert;
            },
          };
        },
      };
    },
    select: () => ({
      from: (table: unknown) => {
        calls.table = table;
        return {
          where: (condition: SQL) => {
            calls.where = condition;
            return {
              limit: async (count: number) => {
                calls.limit = count;
                return rows;
              },
            };
          },
        };
      },
    }),
  } as unknown as DbTransaction;
  return { transaction, calls };
}

beforeEach(() => vi.clearAllMocks());

it("records a deletion under its own namespace in idempotency_keys, refreshing an earlier record", async () => {
  const { transaction, calls } = fakeTransaction();
  await recordDeletion(transaction, "document", documentId, "user-1");
  expect(calls.table).toBe(idempotencyKeys);
  expect(calls.values).toEqual([{ key: recordKey, userId: "user-1", result: {}, createdAt: now }]);
  expect(calls.upsert).toEqual({
    target: [idempotencyKeys.key, idempotencyKeys.userId],
    set: { createdAt: now },
  });
});

it("records several deletions of one resource in a single insert", async () => {
  const { transaction, calls } = fakeTransaction();
  await recordDeletions(transaction, "event", [documentId, "223e4567-e89b-12d3-a456-426614174000"], "user-1");
  expect(calls.values).toEqual([
    {
      key: `${DELETION_RECORD_NAMESPACE}event:${documentId.toLowerCase()}`,
      userId: "user-1",
      result: {},
      createdAt: now,
    },
    {
      key: `${DELETION_RECORD_NAMESPACE}event:223e4567-e89b-12d3-a456-426614174000`,
      userId: "user-1",
      result: {},
      createdAt: now,
    },
  ]);
  expect(calls.upsert).toEqual({
    target: [idempotencyKeys.key, idempotencyKeys.userId],
    set: { createdAt: now },
  });
});

it("writes nothing for an empty list", async () => {
  const { transaction, calls } = fakeTransaction();
  await recordDeletions(transaction, "day", [], "user-1");
  expect(calls.table).toBeUndefined();
});

it("batches a cascade whose rows would exceed the database parameter limit", async () => {
  const { transaction, calls } = fakeTransaction();
  const ids = Array.from({ length: 16_384 }, (_, index) => `item-${index}`);
  await recordDeletions(transaction, "packing-item", ids, "user-1");

  expect(calls.batches.length).toBeGreaterThan(1);
  for (const batch of calls.batches) expect(batch.length * 4 + 1).toBeLessThan(65_534);
  expect(calls.batches.flat()).toEqual(
    ids.map((id) => ({ key: `deleted:packing-item:${id}`, userId: "user-1", result: {}, createdAt: now }))
  );
});

it.each([
  ["document", "This document was deleted. Upload the file again to add it as a new document."],
  ["event", "This event was deleted. Save again to add it as a new event."],
  ["reservation", "This reservation was deleted. Save again to add it as a new reservation."],
  ["expense", "This expense was deleted. Save again to add it as a new expense."],
  ["day", "This day was deleted. Add a day again to create a new one."],
  ["checklist", "This checklist was deleted. Save again to add it as a new checklist."],
  ["checklist-item", "This item was deleted. Add it again to create a new item."],
  ["itinerary-note", "This note was deleted. Save again to add it as a new note."],
  ["trip-note", "This note was deleted. Save again to add it as a new note."],
  ["trip", "This trip was deleted. Create it again to start a new trip."],
  ["packing-item", "This packing item was deleted. Add it again to create a new one."],
  ["packing-list", "This packing list was deleted. Create it again to start a new list."],
  ["packing-template", "This template was deleted. Create it again to start a new template."],
  ["packing-template-item", "This template item was deleted. Add it again to create a new one."],
] as const)("refuses a recently deleted %s id as a conflict", async (resource, message) => {
  const { transaction, calls } = fakeTransaction([{ key: "any" }]);
  const refusal = refuseRecentlyDeleted(transaction, resource, documentId);
  await expect(refusal).rejects.toBeInstanceOf(ConflictError);
  await expect(refuseRecentlyDeleted(transaction, resource, documentId)).rejects.toThrow(message);
  const query = new PgDialect().sqlToQuery(calls.where!);
  expect(query.params[0]).toBe(`${DELETION_RECORD_NAMESPACE}${resource}:${documentId.toLowerCase()}`);
});

it("lets an id with no recent deletion through", async () => {
  const { transaction } = fakeTransaction([]);
  await expect(refuseRecentlyDeleted(transaction, "event", documentId)).resolves.toBeUndefined();
});

it("keeps deletion records apart from API replay keys", () => {
  expect(DELETION_RECORD_NAMESPACE).not.toBe("api:v1:");
  expect(recordKey.startsWith("api:v1:")).toBe(false);
});

it.each([
  [[{ key: recordKey }], true],
  [[], false],
])("reports a record younger than the retention as a recent deletion", async (rows, expected) => {
  const { transaction, calls } = fakeTransaction(rows);
  await expect(wasRecentlyDeleted(transaction, "document", documentId)).resolves.toBe(expected);
  expect(calls.table).toBe(idempotencyKeys);
  expect(calls.limit).toBe(1);
  const query = new PgDialect().sqlToQuery(calls.where!);
  expect(query.sql).toContain('"key" = $1');
  expect(query.sql).toContain('"created_at" > $2');
  expect(query.params[0]).toBe(recordKey);
  expect(query.params[1]).toBe(new Date(now.getTime() - IDEMPOTENCY_RETENTION_MS).toISOString());
});
