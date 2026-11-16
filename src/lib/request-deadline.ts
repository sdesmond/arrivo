import { AsyncLocalStorage } from "node:async_hooks";
import { sql } from "drizzle-orm";
import { REQUEST_TIMEOUT_MS, UPLOAD_TIMEOUT_MS } from "@/lib/api/client";
import type { DbTransaction } from "@/lib/server-action-locks";
import { RequestDeadlineError } from "@/lib/services/request-deadline-error";

/**
 * Aborting `fetch` does not stop the server, so a write the client gave up on could commit later and land after the
 * write that followed it. Each API request gets a deadline this far ahead of the client's timeout, and a transaction
 * that cannot commit before it rolls back instead.
 */
export const DEADLINE_MARGIN_MS = 10_000;
export const REQUEST_DEADLINE_MS = REQUEST_TIMEOUT_MS - DEADLINE_MARGIN_MS;
/** Next may buffer an upload body before the handler starts, a delay the server cannot see, so uploads keep 30 s. */
export const UPLOAD_DEADLINE_MS = UPLOAD_TIMEOUT_MS - 30_000;
const STATEMENT_CANCELED_SQLSTATE = "57014";

/** The deadline as a `performance.now()` instant; a monotonic clock, unaffected by the dev date picker. */
const deadlines = new AsyncLocalStorage<number>();

/** Runs one request with a deadline `budgetMs` from now. */
export function runWithRequestDeadline<Result>(budgetMs: number, callback: () => Promise<Result>): Promise<Result> {
  return deadlines.run(performance.now() + budgetMs, callback);
}

/** Milliseconds left before the current request's deadline, or undefined outside an API request (server actions). */
export function remainingRequestMs(): number | undefined {
  const deadline = deadlines.getStore();
  return deadline === undefined ? undefined : deadline - performance.now();
}

function isStatementCanceled(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 3 && current !== null && typeof current === "object"; depth += 1) {
    if ((current as { code?: unknown }).code === STATEMENT_CANCELED_SQLSTATE) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Runs `work` as the body of `transaction` so it commits only before the request deadline. Each statement, lock waits
 * included, is cancelled once it outlasts the time left, and work that finishes too late throws, so the transaction
 * rolls back. Outside an API request it just runs `work`.
 */
export async function guardTransactionDeadline<Result>(
  transaction: DbTransaction,
  work: () => Promise<Result>
): Promise<Result> {
  const remaining = remainingRequestMs();
  if (remaining === undefined) return work();
  if (remaining <= 0) throw new RequestDeadlineError();
  await transaction.execute(sql`select set_config('statement_timeout', ${`${Math.ceil(remaining)}ms`}, true)`);
  let result: Result;
  try {
    result = await work();
  } catch (error) {
    if (isStatementCanceled(error)) throw new RequestDeadlineError();
    throw error;
  }
  if ((remainingRequestMs() ?? 0) <= 0) throw new RequestDeadlineError();
  return result;
}
