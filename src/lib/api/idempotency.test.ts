// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { idempotencyKeys } from "@/db/schema";

const mocks = vi.hoisted(() => ({ now: new Date("2026-01-01T00:00:00.000Z") }));
vi.mock("@/lib/mock-date", () => ({ getNow: () => mocks.now }));
vi.mock("@/db", () => ({ db: {} }));

import {
  API_IDEMPOTENCY_NAMESPACE,
  DEFAULT_IDEMPOTENCY_EXPIRY_MS,
  concretePath,
  fingerprintRequest,
  parseIdempotencyKey,
  withIdempotency,
} from "./idempotency";
import type { DbTransaction } from "@/lib/server-action-locks";

const actor = { userId: "user" };
const request = { key: "retry-1", method: "PATCH", path: "/api/v1/items/abc" };
const payload = { isChecked: true };
const storageKey = `${API_IDEMPOTENCY_NAMESPACE}retry-1`;

interface Row {
  key: string;
  userId: string;
  result: unknown;
  createdAt: Date;
}
let rows: Row[];
let executed: string[];
let failInsert: Error | undefined;
let lockError: unknown;
let timeoutStatements: string[];
let upserts: { values: Row; set: unknown }[];

function transactionStub(): DbTransaction {
  return {
    execute: vi.fn(async (statement: { queryChunks?: unknown[] }) => {
      const text = JSON.stringify(statement.queryChunks ?? []);
      if (text.includes("lock_timeout")) timeoutStatements.push(text);
      executed.push(text.includes("pg_advisory_xact_lock") ? "lock" : text.includes("lock_timeout") ? "timeout" : text);
      if (text.includes("pg_advisory_xact_lock") && lockError) throw lockError;
      return [];
    }),
    select: vi.fn(() => ({
      from: (table: unknown) => ({
        where: async () => {
          expect(table).toBe(idempotencyKeys);
          executed.push("lookup");
          return rows.filter((row) => row.key === storageKey && row.userId === actor.userId);
        },
      }),
    })),
    insert: vi.fn((table: unknown) => {
      expect(table).toBe(idempotencyKeys);
      return {
        values: (values: Row) => ({
          onConflictDoUpdate: async (config: { set: unknown }) => {
            executed.push("store");
            if (failInsert) throw failInsert;
            upserts.push({ values, set: config.set });
            rows = rows.filter((row) => !(row.key === values.key && row.userId === values.userId));
            rows.push(values);
          },
        }),
      };
    }),
  } as unknown as DbTransaction;
}

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    fingerprint: fingerprintRequest(request.method, request.path, payload),
    expiresAt: new Date(mocks.now.getTime() + 1000).toISOString(),
    response: { stored: true },
    ...overrides,
  };
}
function seed(result: unknown, key = storageKey) {
  rows.push({ key, userId: actor.userId, result, createdAt: mocks.now });
}
const authorize = vi.fn();
const mutate = vi.fn();
async function run(overrides: { request?: Partial<typeof request> & { expiryMs?: number }; body?: unknown } = {}) {
  return withIdempotency(
    transactionStub(),
    { actor, request: { ...request, ...overrides.request }, payload: overrides.body ?? payload },
    { authorize, mutate }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.now = new Date("2026-01-01T00:00:00.000Z");
  rows = [];
  executed = [];
  upserts = [];
  failInsert = undefined;
  lockError = undefined;
  timeoutStatements = [];
  authorize.mockImplementation(async () => {
    executed.push("authorize");
  });
  mutate.mockImplementation(async () => {
    executed.push("mutate");
    return { fresh: true };
  });
});

it("accepts 1 to 255 character keys and rejects absent-vs-invalid ones with a field error", () => {
  expect(parseIdempotencyKey(null)).toBeUndefined();
  expect(parseIdempotencyKey("a")).toBe("a");
  expect(parseIdempotencyKey(" k ")).toBe("k");
  expect(parseIdempotencyKey("a".repeat(255))).toHaveLength(255);
  for (const bad of ["", "   ", "a".repeat(256)]) {
    expect(() => parseIdempotencyKey(bad)).toThrowError(
      expect.objectContaining({
        status: 422,
        code: "validation_failed",
        fields: { "Idempotency-Key": [expect.any(String)] },
      })
    );
  }
});

it("builds a concrete, normalized path from the contract template", () => {
  expect(concretePath("/api/v1/items/:itemId/", { itemId: "ABCDEF12-0000-4000-8000-000000000000" })).toBe(
    "/api/v1/items/abcdef12-0000-4000-8000-000000000000"
  );
  expect(concretePath("/api/v1/a/:one/b/:two", { one: "x y", two: "z" })).toBe("/api/v1/a/x%20y/b/z");
});

it("fingerprints method, path and payload with stable object ordering and ordered arrays", () => {
  const base = fingerprintRequest("PATCH", "/p", { a: 1, b: { c: [1, 2], d: 3 } });
  expect(fingerprintRequest("patch", "/p", { b: { d: 3, c: [1, 2] }, a: 1 })).toBe(base);
  expect(fingerprintRequest("PATCH", "/p", { a: 1, b: { c: [2, 1], d: 3 } })).not.toBe(base);
  expect(fingerprintRequest("PUT", "/p", { a: 1, b: { c: [1, 2], d: 3 } })).not.toBe(base);
  expect(fingerprintRequest("PATCH", "/q", { a: 1, b: { c: [1, 2], d: 3 } })).not.toBe(base);
  expect(fingerprintRequest("PATCH", "/p", null)).toMatch(/^[0-9a-f]{64}$/);
});

it("runs authorization and mutation directly when no key was sent", async () => {
  const result = await withIdempotency(transactionStub(), { actor, payload }, { authorize, mutate });
  expect(result).toEqual({ value: { fresh: true }, replayed: false });
  expect(executed).toEqual(["authorize", "mutate"]);
});

it("locks actor/key, authorizes, looks up, mutates and stores a versioned envelope", async () => {
  const result = await run();
  expect(result).toEqual({ value: { fresh: true }, replayed: false });
  expect(executed).toEqual(["timeout", "lock", "timeout", "authorize", "lookup", "mutate", "store"]);
  const [{ values, set }] = upserts;
  expect(values).toMatchObject({ key: storageKey, userId: "user", createdAt: mocks.now });
  expect(values.result).toEqual({
    version: 1,
    fingerprint: fingerprintRequest("PATCH", request.path, payload),
    expiresAt: new Date(mocks.now.getTime() + DEFAULT_IDEMPOTENCY_EXPIRY_MS).toISOString(),
    response: { fresh: true },
  });
  expect(set).toEqual({ result: values.result, createdAt: mocks.now });
});

it("bounds the actor/key lock wait at 3 seconds, locally, then restores an unbounded wait for later locks", async () => {
  await run();
  expect(timeoutStatements).toHaveLength(2);
  expect(timeoutStatements[0]).toContain('"3000ms"');
  expect(timeoutStatements[0]).toContain(", true)");
  expect(timeoutStatements[1]).toContain("'0', true)");
});

it("never touches the raw legacy key", async () => {
  seed({ templateId: "legacy" }, "retry-1");
  await run();
  expect(rows.find((row) => row.key === "retry-1")?.result).toEqual({ templateId: "legacy" });
  expect(rows.find((row) => row.key === storageKey)).toBeDefined();
});

it("replays the stored JSON without mutating when actor, key and fingerprint match", async () => {
  seed(envelope());
  await expect(run()).resolves.toEqual({ value: { stored: true }, replayed: true });
  expect(mutate).not.toHaveBeenCalled();
  expect(upserts).toEqual([]);
});

it("authorizes before looking at the stored result", async () => {
  seed(envelope());
  authorize.mockRejectedValueOnce(new Error("role lost"));
  await expect(run()).rejects.toThrow("role lost");
  expect(executed).not.toContain("lookup");
  expect(mutate).not.toHaveBeenCalled();
});

it.each([
  ["method", { method: "PUT" }, payload],
  ["resource", { path: "/api/v1/items/other" }, payload],
  ["payload", {}, { isChecked: false }],
])("returns 409 without mutating or disclosing the result when the %s differs", async (_name, change, body) => {
  seed(envelope());
  const failure = await run({ request: change, body }).catch((error: unknown) => error);
  expect(failure).toMatchObject({ status: 409, code: "conflict" });
  expect(JSON.stringify(failure)).not.toContain("stored");
  expect(mutate).not.toHaveBeenCalled();
  expect(upserts).toEqual([]);
});

it("keeps records of different actors independent", async () => {
  rows.push({ key: storageKey, userId: "someone-else", result: envelope(), createdAt: mocks.now });
  await expect(run()).resolves.toMatchObject({ replayed: false });
  expect(mutate).toHaveBeenCalledOnce();
  expect(rows.filter((row) => row.key === storageKey)).toHaveLength(2);
});

it("treats the exact expiry instant as expired and replaces the record atomically", async () => {
  seed(envelope({ expiresAt: mocks.now.toISOString(), response: { stale: true } }));
  await expect(run({ body: { isChecked: false } })).resolves.toEqual({ value: { fresh: true }, replayed: false });
  expect(upserts).toHaveLength(1);
  expect(rows).toHaveLength(1);
  expect(rows[0].result).toMatchObject({ response: { fresh: true } });
});

it("still replays one millisecond before expiry", async () => {
  seed(envelope({ expiresAt: new Date(mocks.now.getTime() + 1).toISOString() }));
  await expect(run()).resolves.toMatchObject({ replayed: true });
});

it("honors a configured expiry and rejects invalid ones", async () => {
  await run({ request: { expiryMs: 5000 } });
  expect(upserts[0].values.result).toMatchObject({ expiresAt: new Date(mocks.now.getTime() + 5000).toISOString() });
  for (const expiryMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    await expect(run({ request: { expiryMs } })).rejects.toBeInstanceOf(RangeError);
  }
  expect(mutate).toHaveBeenCalledOnce();
});

it.each([
  ["a legacy-shaped result", { templateId: "legacy" }],
  ["a null result", null],
  ["an unknown version", envelope({ version: 2 })],
  ["a missing fingerprint", envelope({ fingerprint: undefined })],
  ["a bad expiry", envelope({ expiresAt: "soon" })],
  ["a non-string expiry", envelope({ expiresAt: 5 })],
  ["a missing response", Object.fromEntries(Object.entries(envelope()).filter(([field]) => field !== "response"))],
])("fails closed on %s in the namespaced slot", async (_name, stored) => {
  seed(stored);
  await expect(run()).rejects.toThrow("Idempotency record is malformed.");
  expect(mutate).not.toHaveBeenCalled();
  expect(rows[0].result).toEqual(stored);
});

it("leaves nothing stored and allows a retry when the mutation fails", async () => {
  mutate.mockRejectedValueOnce(new Error("boom"));
  await expect(run()).rejects.toThrow("boom");
  expect(rows).toEqual([]);
  await expect(run()).resolves.toMatchObject({ replayed: false });
});

it("fails the request when the record cannot be written so the caller rolls back", async () => {
  failInsert = new Error("insert failed");
  await expect(run()).rejects.toThrow("insert failed");
  expect(rows).toEqual([]);
  failInsert = undefined;
  await expect(run()).resolves.toMatchObject({ replayed: false });
});

it("maps a lock timeout to a retryable conflict and rethrows other lock failures", async () => {
  lockError = Object.assign(new Error("canceling statement due to lock timeout"), { code: "55P03" });
  await expect(run()).rejects.toMatchObject({ status: 409, code: "conflict" });
  lockError = new Error("wrapped", { cause: { code: "55P03" } });
  await expect(run()).rejects.toMatchObject({ status: 409, code: "conflict" });
  lockError = new Error("db down");
  await expect(run()).rejects.toThrow("db down");
  lockError = "weird";
  await expect(run()).rejects.toBe("weird");
  expect(authorize).not.toHaveBeenCalled();
});
