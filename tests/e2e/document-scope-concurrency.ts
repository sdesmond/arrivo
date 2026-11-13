import "dotenv/config";
import postgres from "postgres";

const BLOCKED_POLL_MS = 25;
const BLOCKED_TIMEOUT_MS = 15_000;

export interface HeldTripLock {
  /** Waits until at least `count` backends are queued, directly or behind another waiter, on this lock. */
  waitForBlockedWriters(count: number): Promise<void>;
  /** Releases the lock and closes every connection this helper opened. Safe to call more than once. */
  release(): Promise<void>;
}

/**
 * Holds the row lock every trip write queues on, so a scenario decides which of two writers reaches it first: start one,
 * wait until it is blocked, start the other, then release. Only waiters chained to this helper's own backend count, so
 * other scenarios running in the same database never satisfy or disturb the wait.
 */
export async function holdScenarioTripLock(tripId: string): Promise<HeldTripLock> {
  const client = postgres(process.env.E2E_DATABASE_URL!, { max: 2 });
  let released = false;
  const connection = await client.reserve();
  let holderPid: number;
  try {
    await connection.unsafe("begin");
    const [holder] = await connection.unsafe("select pg_backend_pid() as pid");
    holderPid = holder.pid as number;
    await connection.unsafe("select id from trips where id = $1 for update", [tripId]);
  } catch (error) {
    await connection.unsafe("rollback").catch(() => undefined);
    connection.release();
    await client.end();
    throw error;
  }

  async function release() {
    if (released) return;
    released = true;
    try {
      await connection.unsafe("rollback");
    } finally {
      connection.release();
      await client.end();
    }
  }

  return {
    release,
    async waitForBlockedWriters(count) {
      const deadline = Date.now() + BLOCKED_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const rows = await client.unsafe(
          `with recursive queued(pid) as (
             select pid from pg_stat_activity
             where datname = current_database() and wait_event_type = 'Lock' and $1::int = any(pg_blocking_pids(pid))
             union
             select waiting.pid from pg_stat_activity waiting
             join queued on queued.pid = any(pg_blocking_pids(waiting.pid))
             where waiting.datname = current_database() and waiting.wait_event_type = 'Lock'
           )
           select count(*)::int as blocked from queued`,
          [holderPid]
        );
        if ((rows[0].blocked as number) >= count) return;
        await new Promise((resolve) => setTimeout(resolve, BLOCKED_POLL_MS));
      }
      throw new Error(`Fewer than ${count} writers became blocked on the trip lock.`);
    },
  };
}
