import "server-only";
import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { idempotencyKeys } from "@/db/schema";
import type { Actor, IdempotentRequest } from "@/data/types";
import { getNow } from "@/lib/mock-date";
import type { DbTransaction } from "@/lib/server-action-locks";
import { isUuid } from "@/lib/validation-limits";
import { ApiError } from "./errors";

/** Prefix that keeps API replay rows apart from the raw keys `packing-actions.ts` stores in the same table. */
export const API_IDEMPOTENCY_NAMESPACE = "api:v1:";
export const DEFAULT_IDEMPOTENCY_EXPIRY_MS = 24 * 60 * 60 * 1000;
export const IDEMPOTENCY_KEY_MAX = 255;
// Below the 4 s activity-batch bound: a retry queued behind its own in-flight twin gives up with a retryable 409.
export const IDEMPOTENCY_LOCK_TIMEOUT_MS = 3_000;
const ENVELOPE_VERSION = 1;
const LOCK_TIMEOUT_SQLSTATE = "55P03";

interface ReplayEnvelope {
  version: typeof ENVELOPE_VERSION;
  fingerprint: string;
  expiresAt: string;
  response: unknown;
}

/** Returns `undefined` when the header is absent; throws a 422 field error when it is empty or oversized. */
export function parseIdempotencyKey(header: string | null): string | undefined {
  if (header === null) return undefined;
  const key = header.trim();
  if (key.length === 0 || key.length > IDEMPOTENCY_KEY_MAX) {
    throw new ApiError(422, "validation_failed", "Check the submitted fields.", {
      "Idempotency-Key": [`Must be 1 to ${IDEMPOTENCY_KEY_MAX} characters.`],
    });
  }
  return key;
}

/** Fills a contract path template with validated params; the same resource always yields the same string. */
export function concretePath(template: string, params: Record<string, string>): string {
  const filled = template.replace(/:([A-Za-z][A-Za-z0-9]*)/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`Missing path parameter "${name}".`);
    return encodeURIComponent(isUuid(value) ? value.toLowerCase() : value);
  });
  return filled.length > 1 ? filled.replace(/\/+$/, "") : filled;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, canonicalize(entry)])
    );
  }
  return value;
}

/** Hash of method, concrete path and validated payload: object key order never matters, array order does. */
export function fingerprintRequest(method: string, path: string, payload: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify([method.toUpperCase(), path, canonicalize(payload) ?? null]))
    .digest("hex");
}

function readEnvelope(stored: unknown): ReplayEnvelope {
  if (stored !== null && typeof stored === "object" && !Array.isArray(stored)) {
    const candidate = stored as Record<string, unknown>;
    if (
      candidate.version === ENVELOPE_VERSION &&
      typeof candidate.fingerprint === "string" &&
      typeof candidate.expiresAt === "string" &&
      !Number.isNaN(Date.parse(candidate.expiresAt)) &&
      "response" in candidate
    ) {
      return candidate as unknown as ReplayEnvelope;
    }
  }
  // Fail closed: never overwrite or interpret a row this module did not write.
  throw new Error("Idempotency record is malformed.");
}

function isLockTimeout(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 3 && current !== null && typeof current === "object"; depth += 1) {
    if ((current as { code?: unknown }).code === LOCK_TIMEOUT_SQLSTATE) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

async function lockActorKey(transaction: DbTransaction, userId: string, storageKey: string): Promise<void> {
  const lockKey = JSON.stringify([userId, storageKey]);
  await transaction.execute(sql`select set_config('lock_timeout', ${`${IDEMPOTENCY_LOCK_TIMEOUT_MS}ms`}, true)`);
  try {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
  } catch (error) {
    if (isLockTimeout(error)) {
      throw new ApiError(409, "conflict", "A request with this Idempotency-Key is still in progress. Retry shortly.");
    }
    throw error;
  }
  // Later locks (the trip row) keep their existing unbounded behavior.
  await transaction.execute(sql`select set_config('lock_timeout', '0', true)`);
}

export interface IdempotencySteps<Result> {
  /** Must acquire any resource locks and re-verify the actor's access; runs before any stored result is read. */
  authorize: () => Promise<void>;
  mutate: () => Promise<Result>;
}

/**
 * Runs `mutate` once per actor + key + request fingerprint, inside the caller's transaction so the mutation and its
 * replay record commit or roll back together. Without a `request` it just authorizes and mutates. Callers run
 * after-commit effects only when `replayed` is false.
 */
export async function withIdempotency<Result>(
  transaction: DbTransaction,
  input: { actor: Actor; request?: IdempotentRequest; payload: unknown },
  steps: IdempotencySteps<Result>
): Promise<{ value: Result; replayed: boolean }> {
  const { actor, request, payload } = input;
  if (!request) {
    await steps.authorize();
    return { value: await steps.mutate(), replayed: false };
  }
  const expiryMs = request.expiryMs ?? DEFAULT_IDEMPOTENCY_EXPIRY_MS;
  if (!Number.isFinite(expiryMs) || expiryMs <= 0) throw new RangeError("Idempotency expiry must be positive.");
  const storageKey = `${API_IDEMPOTENCY_NAMESPACE}${request.key}`;
  const fingerprint = fingerprintRequest(request.method, request.path, payload);

  await lockActorKey(transaction, actor.userId, storageKey);
  await steps.authorize();

  const now = getNow();
  const [existing] = await transaction
    .select({ result: idempotencyKeys.result })
    .from(idempotencyKeys)
    .where(and(eq(idempotencyKeys.key, storageKey), eq(idempotencyKeys.userId, actor.userId)));
  if (existing) {
    const stored = readEnvelope(existing.result);
    if (Date.parse(stored.expiresAt) > now.getTime()) {
      if (stored.fingerprint !== fingerprint) {
        throw new ApiError(409, "conflict", "This Idempotency-Key was already used for a different request.");
      }
      return { value: stored.response as Result, replayed: true };
    }
  }

  const value = await steps.mutate();
  const envelope: ReplayEnvelope = {
    version: ENVELOPE_VERSION,
    fingerprint,
    expiresAt: new Date(now.getTime() + expiryMs).toISOString(),
    response: value,
  };
  await transaction
    .insert(idempotencyKeys)
    .values({ key: storageKey, userId: actor.userId, result: envelope, createdAt: now })
    .onConflictDoUpdate({
      target: [idempotencyKeys.key, idempotencyKeys.userId],
      set: { result: envelope, createdAt: now },
    });
  return { value, replayed: false };
}
