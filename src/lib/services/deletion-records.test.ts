// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const now = new Date("2026-11-16T12:00:00.000Z");
vi.mock("@/lib/mock-date", () => ({ getNow: () => now }));

import { idempotencyKeys } from "@/db/schema";
import { IDEMPOTENCY_RETENTION_MS } from "@/lib/idempotency-retention";
import type { DbTransaction } from "@/lib/server-action-locks";
import { DELETION_RECORD_NAMESPACE, recordDeletion, wasRecentlyDeleted } from "./deletion-records";

const documentId = "123E4567-E89B-12D3-A456-426614174000";
const recordKey = `${DELETION_RECORD_NAMESPACE}document:${documentId.toLowerCase()}`;

function fakeTransaction(rows: { key: string }[] = []) {
  const calls = {
    table: undefined as unknown,
    values: undefined as unknown,
    upsert: undefined as unknown,
    where: undefined as SQL | undefined,
    limit: undefined as number | undefined,
  };
  const transaction = {
    insert: (table: unknown) => {
      calls.table = table;
      return {
        values: (values: unknown) => {
          calls.values = values;
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
  expect(calls.values).toEqual({ key: recordKey, userId: "user-1", result: {}, createdAt: now });
  expect(calls.upsert).toEqual({
    target: [idempotencyKeys.key, idempotencyKeys.userId],
    set: { createdAt: now },
  });
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
