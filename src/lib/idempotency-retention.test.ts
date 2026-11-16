// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
vi.mock("@/db", () => ({ db: {} }));
import {
  IDEMPOTENCY_RETENTION_MS,
  IDEMPOTENCY_SWEEP_BATCH,
  IDEMPOTENCY_SWEEP_MAX_BATCHES,
  purgeExpiredIdempotencyKeys,
  type IdempotencyRetentionDatabase,
} from "./idempotency-retention";

const dialect = new PgDialect();
const execute = vi.fn();
const transaction = vi.fn(async (run) => run({ execute }));
const database = { transaction } as unknown as IdempotencyRetentionDatabase;
const now = new Date("2026-11-16T12:00:00.000Z");

/** Each delete statement returns the next batch size; every other statement returns no rows. */
function deleteBatches(...sizes: number[]) {
  execute.mockImplementation(async (query: SQL) =>
    dialect.sqlToQuery(query).sql.includes("delete from")
      ? Array.from({ length: sizes.length > 0 ? sizes.shift()! : IDEMPOTENCY_SWEEP_BATCH }, () => ({ deleted: 1 }))
      : []
  );
}

function statements() {
  return execute.mock.calls.map(([query]) => dialect.sqlToQuery(query as SQL));
}

describe("idempotency key retention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    execute.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("keeps replay records for 24 hours", () => {
    expect(IDEMPOTENCY_RETENTION_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("deletes only rows older than the retention and skips rows a writer holds", async () => {
    deleteBatches(2);
    await purgeExpiredIdempotencyKeys(database, now);
    expect(transaction).toHaveBeenCalledOnce();
    const [timeout, removal] = statements();
    expect(timeout.sql).toContain("statement_timeout");
    expect(removal.sql).toContain("created_at <");
    expect(removal.sql).toContain("for update skip locked");
    expect(removal.params).toContain(new Date(now.getTime() - IDEMPOTENCY_RETENTION_MS).toISOString());
    expect(removal.params).toContain(IDEMPOTENCY_SWEEP_BATCH);
  });

  it("keeps deleting while batches come back full", async () => {
    deleteBatches(IDEMPOTENCY_SWEEP_BATCH, IDEMPOTENCY_SWEEP_BATCH, 3);
    await purgeExpiredIdempotencyKeys(database, now);
    expect(transaction).toHaveBeenCalledTimes(3);
  });

  it("stops after its batch cap so one pass stays bounded", async () => {
    deleteBatches();
    await purgeExpiredIdempotencyKeys(database, now);
    expect(transaction).toHaveBeenCalledTimes(IDEMPOTENCY_SWEEP_MAX_BATCHES);
  });

  it("contains failures without logging their values", async () => {
    execute.mockRejectedValueOnce(new Error("private"));
    await expect(purgeExpiredIdempotencyKeys(database, now)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith("[idempotency-retention] sweep failed (Error)");
    execute.mockRejectedValueOnce("private");
    await purgeExpiredIdempotencyKeys(database, now);
    expect(console.error).toHaveBeenLastCalledWith("[idempotency-retention] sweep failed (UnknownError)");
  });

  it("defaults to the app database and the current time", async () => {
    // The mocked default client has no transaction method, so the call fails inside the guarded pass.
    await expect(purgeExpiredIdempotencyKeys()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith("[idempotency-retention] sweep failed (TypeError)");
  });
});
