// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { REQUEST_TIMEOUT_MS, UPLOAD_TIMEOUT_MS } from "@/lib/api/client";
import type { DbTransaction } from "@/lib/server-action-locks";
import { RequestDeadlineError } from "@/lib/services/request-deadline-error";
import {
  DEADLINE_MARGIN_MS,
  REQUEST_DEADLINE_MS,
  UPLOAD_DEADLINE_MS,
  guardTransactionDeadline,
  remainingRequestMs,
  runWithRequestDeadline,
} from "./request-deadline";

let clock = 1_000;
beforeEach(() => {
  clock = 1_000;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
});
afterEach(() => vi.restoreAllMocks());

function fakeTransaction() {
  const statements: { sql: string; params: unknown[] }[] = [];
  const transaction = {
    execute: vi.fn(async (statement: SQL) => {
      const { sql, params } = new PgDialect().sqlToQuery(statement);
      statements.push({ sql, params });
      return [];
    }),
  } as unknown as DbTransaction;
  return { transaction, statements };
}

it("stops the server well before the client gives up on a JSON write or an upload", () => {
  expect(REQUEST_DEADLINE_MS).toBe(REQUEST_TIMEOUT_MS - DEADLINE_MARGIN_MS);
  expect(DEADLINE_MARGIN_MS).toBeGreaterThanOrEqual(10_000);
  // Next can buffer an upload body before the handler starts, so an upload keeps a wider margin.
  expect(UPLOAD_TIMEOUT_MS - UPLOAD_DEADLINE_MS).toBeGreaterThanOrEqual(30_000);
});

it("has no deadline outside a request scope", () => {
  expect(remainingRequestMs()).toBeUndefined();
});

it("counts down the time left inside a request scope and forgets it afterwards", async () => {
  await runWithRequestDeadline(5_000, async () => {
    expect(remainingRequestMs()).toBe(5_000);
    clock += 1_500;
    await Promise.resolve();
    expect(remainingRequestMs()).toBe(3_500);
  });
  expect(remainingRequestMs()).toBeUndefined();
});

it("keeps concurrent request scopes apart", async () => {
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => (releaseFirst = resolve));
  const first = runWithRequestDeadline(1_000, async () => {
    await firstGate;
    return remainingRequestMs();
  });
  const second = runWithRequestDeadline(9_000, async () => remainingRequestMs());
  releaseFirst();
  expect(await Promise.all([first, second])).toEqual([1_000, 9_000]);
});

it("runs a transaction untouched outside a request scope", async () => {
  const { transaction, statements } = fakeTransaction();
  await expect(guardTransactionDeadline(transaction, async () => "done")).resolves.toBe("done");
  expect(statements).toEqual([]);
});

it("caps each statement at the time left, rounded up, and returns the result made in time", async () => {
  const { transaction, statements } = fakeTransaction();
  const result = await runWithRequestDeadline(2_000.4, () =>
    guardTransactionDeadline(transaction, async () => {
      clock += 1_000;
      return "done";
    })
  );
  expect(result).toBe("done");
  expect(statements).toEqual([{ sql: "select set_config('statement_timeout', $1, true)", params: ["2001ms"] }]);
});

it("refuses to start a transaction once the deadline has passed", async () => {
  const { transaction, statements } = fakeTransaction();
  const work = vi.fn();
  await expect(runWithRequestDeadline(0, () => guardTransactionDeadline(transaction, work))).rejects.toBeInstanceOf(
    RequestDeadlineError
  );
  expect(work).not.toHaveBeenCalled();
  expect(statements).toEqual([]);
});

it("rolls back work that finishes after the deadline instead of committing late", async () => {
  const { transaction } = fakeTransaction();
  await expect(
    runWithRequestDeadline(1_000, () =>
      guardTransactionDeadline(transaction, async () => {
        clock += 1_000;
        return "late";
      })
    )
  ).rejects.toBeInstanceOf(RequestDeadlineError);
});

it.each([
  ["a statement cancelled by the timeout", { code: "57014" }],
  ["a cancelled statement wrapped by the driver", new Error("query failed", { cause: { code: "57014" } })],
])("reports %s as the deadline", async (_name, failure) => {
  const { transaction } = fakeTransaction();
  await expect(
    runWithRequestDeadline(1_000, () =>
      guardTransactionDeadline(transaction, async () => {
        throw failure;
      })
    )
  ).rejects.toBeInstanceOf(RequestDeadlineError);
});

it.each([
  ["any other failure", new Error("db down")],
  ["a non-object failure", "weird"],
  ["a lock timeout", { code: "55P03" }],
])("passes %s through unchanged", async (_name, failure) => {
  const { transaction } = fakeTransaction();
  await expect(
    runWithRequestDeadline(1_000, () =>
      guardTransactionDeadline(transaction, async () => {
        throw failure;
      })
    )
  ).rejects.toBe(failure);
});
