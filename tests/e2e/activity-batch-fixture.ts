import "dotenv/config";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { ActivityEventType } from "../../src/data/types";
import { mergeActivityInterval, type ActivityBatchDatabase } from "../../src/lib/activity-batches";
import type { LockGate } from "./role-service-fixture";

const SCHEMA_IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/;
const BLOCKED_POLL_MS = 25;
const BLOCKED_TIMEOUT_MS = 15_000;
/** Offsets are relative to this instant, so scenarios read as "milliseconds after the first edit". */
const ORIGIN_MS = Date.parse("2026-10-26T12:00:00.000Z");

export interface TripEdit {
  /** Scenario-local actor name; each gets a stable account ID. */
  actor: string;
  /** Username snapshot at event time; defaults to the actor name. */
  username?: string;
  trip: string;
  offsetMs: number;
}

export interface BatchRow {
  actor: string;
  username: string;
  trip: string;
  startMs: number;
  endMs: number;
}

export interface ActivityBatchFixture {
  schema: string;
  /** Persists one trip-updated event through the production merge service. `gate` pauses right after the lock. */
  record(edit: TripEdit, gate?: LockGate & { arrive(): Promise<void> }): Promise<void>;
  rows(): Promise<BatchRow[]>;
  /** Waits until some transaction in this schema is blocked on a lock held by another. */
  waitForBlockedTransaction(): Promise<void>;
  close(): Promise<void>;
}

// Each scenario gets its own schema holding a copy of the public activity_events table, so scenarios never see each
// other's rows and the shared table is never mutated. The service's search_path excludes public, so a missing table
// fails the query instead of silently touching shared data.
export async function createActivityBatchFixture(): Promise<ActivityBatchFixture> {
  const schema = `activity_batch_${randomUUID().replaceAll("-", "")}`;
  if (!SCHEMA_IDENTIFIER.test(schema)) throw new Error(`Unsafe schema name: ${schema}`);

  // application_name scopes blocked-lock polling to this fixture's own connections.
  const client = postgres(process.env.E2E_DATABASE_URL!, { connection: { application_name: schema } });
  const root = drizzle(client);
  const accountIds = new Map<string, string>();
  const tripIds = new Map<string, string>();
  let closed = false;

  const stableId = (ids: Map<string, string>, key: string) => {
    if (!ids.has(key)) ids.set(key, randomUUID());
    return ids.get(key)!;
  };

  async function close() {
    if (closed) return;
    closed = true;
    try {
      await client.unsafe(`drop schema if exists "${schema}" cascade`);
    } finally {
      await client.end();
    }
  }

  try {
    await client.unsafe(`create schema "${schema}"`);
    await client.unsafe(`create table "${schema}".activity_events (like public.activity_events including all)`);
  } catch (error) {
    await close();
    throw error;
  }

  function database(gate?: LockGate & { arrive(): Promise<void> }): ActivityBatchDatabase {
    return {
      transaction: (run: (transaction: never) => Promise<unknown>) =>
        root.transaction(async (transaction) => {
          await transaction.execute(sql`select set_config('search_path', ${schema}, true)`);
          if (!gate) return run(transaction as never);
          // The service's first statement bounds the lock wait; the gate fires after its second, once the lock is held.
          let executed = 0;
          const gated = new Proxy(transaction, {
            get(target, property, receiver) {
              const value = Reflect.get(target, property, receiver);
              if (property !== "execute") return typeof value === "function" ? value.bind(target) : value;
              return async (...args: unknown[]) => {
                const result = await (value as (...inner: unknown[]) => Promise<unknown>).apply(target, args);
                if (++executed === 2) await gate.arrive();
                return result;
              };
            },
          });
          return run(gated as never);
        }),
    } as unknown as ActivityBatchDatabase;
  }

  return {
    schema,
    async record(edit, gate) {
      await mergeActivityInterval(
        database(gate),
        {
          type: ActivityEventType.TripUpdated,
          actor: { id: stableId(accountIds, edit.actor), username: edit.username ?? edit.actor },
          tripId: stableId(tripIds, edit.trip),
        },
        new Date(ORIGIN_MS + edit.offsetMs)
      );
    },
    async rows() {
      const stored = await client.unsafe(
        `select actor_id, actor_username, trip_id,
           (extract(epoch from started_at) * 1000)::bigint as started_ms,
           (extract(epoch from ended_at) * 1000)::bigint as ended_ms
         from "${schema}".activity_events
         order by started_at, actor_username, trip_id`
      );
      const nameOf = (ids: Map<string, string>, id: string) => [...ids].find(([, value]) => value === id)![0];
      return stored.map((row) => ({
        actor: nameOf(accountIds, row.actor_id as string),
        username: row.actor_username as string,
        trip: nameOf(tripIds, row.trip_id as string),
        startMs: Number(row.started_ms) - ORIGIN_MS,
        endMs: Number(row.ended_ms) - ORIGIN_MS,
      }));
    },
    async waitForBlockedTransaction() {
      const deadline = Date.now() + BLOCKED_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const blocked = await client.unsafe(
          `select count(*)::int as blocked from pg_stat_activity
           where datname = current_database() and application_name = '${schema}' and wait_event_type = 'Lock' and cardinality(pg_blocking_pids(pid)) > 0`
        );
        if ((blocked[0].blocked as number) > 0) return;
        await new Promise((resolve) => setTimeout(resolve, BLOCKED_POLL_MS));
      }
      throw new Error("No transaction became blocked on a lock.");
    },
    close,
  };
}
