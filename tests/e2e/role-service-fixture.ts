import "dotenv/config";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { AccountDeletionDatabase } from "../../src/lib/account-deletion";
import type { RoleChangeDatabase } from "../../src/lib/account-role-changes";
import type { UserRole } from "../../src/data/types";
import { cloneUserMother } from "./e2e-seed-data";

// Tables account deletion reads or writes besides users and instance_state.
const TRIP_TABLES = ["trips", "collaborators", "invitations", "documents"];
const SCHEMA_IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/;
const BLOCKED_POLL_MS = 25;
const BLOCKED_TIMEOUT_MS = 15_000;

export interface RoleServiceUserSpec {
  key: string;
  role: UserRole;
  /** Completed accounts have a password hash; unfinished ones do not. */
  completed: boolean;
}

export interface LockGate {
  /** Resolves once the gated transaction holds the instance singleton lock. */
  reached: Promise<void>;
  release(): void;
}

export function createLockGate(): LockGate & { arrive(): Promise<void> } {
  let markReached!: () => void;
  let release!: () => void;
  const reached = new Promise<void>((resolve) => (markReached = resolve));
  const released = new Promise<void>((resolve) => (release = resolve));
  return {
    reached,
    release,
    arrive: async () => {
      markReached();
      await released;
    },
  };
}

export interface RoleServiceFixture {
  schema: string;
  seedUsers(specs: RoleServiceUserSpec[]): Promise<void>;
  userId(key: string): string;
  roleOf(key: string): Promise<string>;
  adminCount(): Promise<number>;
  accountExists(key: string): Promise<boolean>;
  /** Service database bound to the scenario schema; `gate` pauses the transaction right after the singleton lock. */
  database(gate?: LockGate & { arrive(): Promise<void> }): RoleChangeDatabase & AccountDeletionDatabase;
  /** Waits until some transaction in this schema is blocked on a lock held by another. */
  waitForBlockedTransaction(): Promise<void>;
  close(): Promise<void>;
}

// Each scenario gets its own schema holding copies of the public users/instance_state tables, so the baseline
// admin never masks a last-admin defect and the shared tables are never mutated. The service's search_path excludes
// public, so a table missing from the schema fails the query instead of silently touching shared data.
export async function createRoleServiceFixture(): Promise<RoleServiceFixture> {
  const schema = `role_svc_${randomUUID().replaceAll("-", "")}`;
  if (!SCHEMA_IDENTIFIER.test(schema)) throw new Error(`Unsafe schema name: ${schema}`);

  // application_name scopes blocked-lock polling to this fixture's own connections.
  const client = postgres(process.env.E2E_DATABASE_URL!, { connection: { application_name: schema } });
  const root = drizzle(client);
  const userIds = new Map<string, string>();
  let closed = false;

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
    await client.unsafe(`create table "${schema}".users (like public.users including all)`);
    await client.unsafe(`create table "${schema}".instance_state (like public.instance_state including all)`);
    for (const table of TRIP_TABLES) {
      await client.unsafe(`create table "${schema}"."${table}" (like public."${table}" including all)`);
    }
    await client.unsafe(`insert into "${schema}".instance_state (id, initialized_at) values (true, now())`);
  } catch (error) {
    await close();
    throw error;
  }

  async function roleRows() {
    return (await client.unsafe(`select id, role from "${schema}".users`)) as unknown as { id: string; role: string }[];
  }

  function userId(key: string): string {
    const id = userIds.get(key);
    if (!id) throw new Error(`Unknown role-service user "${key}".`);
    return id;
  }

  return {
    schema,
    async seedUsers(specs) {
      for (const spec of specs) {
        const seed = cloneUserMother("default");
        const [row] = await client.unsafe(
          `insert into "${schema}".users (username, name, password_hash, role) values ($1, $2, $3, $4) returning id`,
          [`${spec.key}-${schema}`.slice(0, 63), seed.user.name, spec.completed ? "not-a-real-hash" : null, spec.role]
        );
        userIds.set(spec.key, row.id as string);
      }
    },
    userId,
    async roleOf(key) {
      const id = userId(key);
      const row = (await roleRows()).find((item) => item.id === id);
      if (!row) throw new Error(`User "${key}" is gone.`);
      return row.role;
    },
    async accountExists(key) {
      const id = userId(key);
      return (await roleRows()).some((row) => row.id === id);
    },
    async adminCount() {
      return (await roleRows()).filter((row) => row.role === "admin").length;
    },
    database(gate) {
      return {
        transaction: (run: (transaction: never) => Promise<unknown>) =>
          root.transaction(async (transaction) => {
            await transaction.execute(sql`select set_config('search_path', ${schema}, true)`);
            if (!gate) return run(transaction as never);
            let first = true;
            const gated = new Proxy(transaction, {
              get(target, property, receiver) {
                const value = Reflect.get(target, property, receiver);
                if (property !== "execute") return typeof value === "function" ? value.bind(target) : value;
                return async (...args: unknown[]) => {
                  const result = await (value as (...inner: unknown[]) => Promise<unknown>).apply(target, args);
                  if (first) {
                    first = false;
                    await gate.arrive();
                  }
                  return result;
                };
              },
            });
            return run(gated as never);
          }),
      } as unknown as RoleChangeDatabase & AccountDeletionDatabase;
    },
    async waitForBlockedTransaction() {
      const deadline = Date.now() + BLOCKED_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const rows = await client.unsafe(
          `select count(*)::int as blocked from pg_stat_activity
           where datname = current_database() and application_name = '${schema}' and wait_event_type = 'Lock' and cardinality(pg_blocking_pids(pid)) > 0`
        );
        if ((rows[0].blocked as number) > 0) return;
        await new Promise((resolve) => setTimeout(resolve, BLOCKED_POLL_MS));
      }
      throw new Error("No transaction became blocked on a lock.");
    },
    close,
  };
}
