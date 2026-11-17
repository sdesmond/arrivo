import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

export type E2EDb = ReturnType<typeof drizzle>;

export async function withE2EDb<T>(fn: (db: E2EDb) => Promise<T>): Promise<T> {
  // Short-lived and opened per step by every worker at once; a small pool keeps 8 workers plus the app servers inside
  // Postgres's default max_connections (100). Three still allows a transaction alongside a plain query.
  const client = postgres(process.env.E2E_DATABASE_URL!, { max: 3 });
  const db = drizzle(client);

  try {
    return await fn(db);
  } finally {
    await client.end();
  }
}

const DEADLOCK_DETECTED = "40P01";
const DDL_ATTEMPTS = 5;

function isDeadlock(error: unknown): boolean {
  // Drizzle wraps the driver error, so the Postgres code can sit on the error or on its cause.
  let current: unknown = error;
  while (current && typeof current === "object") {
    if ((current as { code?: unknown }).code === DEADLOCK_DETECTED) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Runs one DDL statement that a scenario issues against a table other scenarios write to (a scenario-owned trigger on
 * a shared table). Its exclusive table lock can deadlock with a parallel scenario's transaction or DDL; Postgres then
 * aborts this statement only, so retrying it is safe.
 */
export async function runSharedTableDdl(run: () => Promise<unknown>): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await run();
      return;
    } catch (error) {
      if (attempt >= DDL_ATTEMPTS || !isDeadlock(error)) throw error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100 * attempt));
    }
  }
}
