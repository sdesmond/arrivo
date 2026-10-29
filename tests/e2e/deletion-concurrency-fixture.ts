import "dotenv/config";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { AccountDeletionDatabase } from "../../src/lib/account-deletion";
import type { MembershipDatabase } from "../../src/lib/membership-writes";
import type { CollaboratorRole, UserRole } from "../../src/data/types";
import { cloneUserMother } from "./e2e-seed-data";
import type { LockGate } from "./role-service-fixture";

// Tables the lifecycle service and the membership writers touch. Foreign keys between them are copied from the
// public schema so cascades, key-share locks and deadlocks behave as they do in production.
const TABLES = ["users", "app_state", "trips", "collaborators", "invitations", "documents", "days"];
const SCHEMA_IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/;
const BLOCKED_POLL_MS = 25;
const BLOCKED_TIMEOUT_MS = 15_000;

export type ConcurrencyDatabase = AccountDeletionDatabase & MembershipDatabase;

export interface ConcurrencyUserSpec {
  key: string;
  role: UserRole;
}

export interface GatedDatabaseOptions {
  gate: LockGate & { arrive(): Promise<void> };
  /** The gate fires once the transaction has run this many `execute` statements (its lock acquisitions). */
  afterExecutes: number;
}

export interface HeldInsert {
  release(): Promise<void>;
}

export interface DeletionConcurrencyFixture {
  schema: string;
  seedUsers(specs: ConcurrencyUserSpec[]): Promise<void>;
  userId(key: string): string;
  seedTrip(key: string, ownerKey: string): Promise<string>;
  tripId(key: string): string;
  addMember(tripKey: string, userKey: string, role: CollaboratorRole): Promise<void>;
  seedInvitation(
    key: string,
    tripKey: string,
    inviteeKey: string,
    inviterKey: string,
    role: CollaboratorRole
  ): Promise<void>;
  invitationId(key: string): string;
  accountExists(key: string): Promise<boolean>;
  tripOwner(tripKey: string): Promise<string | null>;
  tripCount(): Promise<number>;
  collaboratorId(tripKey: string, userKey: string): Promise<string>;
  ownedTripCount(userKey: string): Promise<number>;
  membershipRole(tripKey: string, userKey: string): Promise<{ role: string; isCreator: boolean } | null>;
  invitationStatus(key: string): Promise<string | null>;
  invitationCount(): Promise<number>;
  /** Collaborator rows whose account is gone (set null by the foreign key) — a ghost member. */
  ghostMemberCount(): Promise<number>;
  database(gated?: GatedDatabaseOptions): ConcurrencyDatabase;
  /** Holds an uncommitted collaborator insert so a writer reaching the same (trip, user) key queues behind it. */
  holdCollaboratorInsert(tripKey: string, userKey: string): Promise<HeldInsert>;
  /** Waits until at least `count` transactions in this schema are blocked on locks held by another. */
  waitForBlockedTransactions(count?: number): Promise<void>;
  close(): Promise<void>;
}

export async function createDeletionConcurrencyFixture(): Promise<DeletionConcurrencyFixture> {
  const schema = `del_conc_${randomUUID().replaceAll("-", "")}`;
  if (!SCHEMA_IDENTIFIER.test(schema)) throw new Error(`Unsafe schema name: ${schema}`);

  // application_name scopes blocked-lock polling to this fixture's own connections.
  const client = postgres(process.env.E2E_DATABASE_URL!, { connection: { application_name: schema }, max: 10 });
  const root = drizzle(client);
  const userIds = new Map<string, string>();
  const tripIds = new Map<string, string>();
  const invitationIds = new Map<string, string>();
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
    for (const table of TABLES) {
      await client.unsafe(`create table "${schema}"."${table}" (like public."${table}" including all)`);
    }
    const foreignKeys = (await client.unsafe(
      `select conrelid::regclass::text as child, conname, pg_get_constraintdef(oid) as definition,
         confrelid::regclass::text as parent
       from pg_constraint
       where contype = 'f' and connamespace = 'public'::regnamespace`
    )) as unknown as { child: string; conname: string; definition: string; parent: string }[];
    for (const foreignKey of foreignKeys) {
      if (!TABLES.includes(foreignKey.child) || !TABLES.includes(foreignKey.parent)) continue;
      const definition = foreignKey.definition.replace(
        /REFERENCES (?:public\.)?"?(\w+)"?\(/,
        (_match, table: string) => `REFERENCES "${schema}"."${table}"(`
      );
      await client.unsafe(
        `alter table "${schema}"."${foreignKey.child}" add constraint "${foreignKey.conname}" ${definition}`
      );
    }
    await client.unsafe(`insert into "${schema}".app_state (id, initialized_at) values (true, now())`);
  } catch (error) {
    await close();
    throw error;
  }

  const lookup = (map: Map<string, string>, key: string, label: string): string => {
    const id = map.get(key);
    if (!id) throw new Error(`Unknown ${label} "${key}".`);
    return id;
  };
  const userId = (key: string) => lookup(userIds, key, "user");
  const tripId = (key: string) => lookup(tripIds, key, "trip");
  const invitationId = (key: string) => lookup(invitationIds, key, "invitation");

  return {
    schema,
    async seedUsers(specs) {
      for (const spec of specs) {
        const seed = cloneUserMother("default");
        const [row] = await client.unsafe(
          `insert into "${schema}".users (username, name, password_hash, role) values ($1, $2, $3, $4) returning id`,
          [`${spec.key}-${schema}`.slice(0, 63), seed.user.name, "not-a-real-hash", spec.role]
        );
        userIds.set(spec.key, row.id as string);
      }
    },
    userId,
    async seedTrip(key, ownerKey) {
      const owner = userId(ownerKey);
      const [trip] = await client.unsafe(
        `insert into "${schema}".trips (name, owner_id) values ($1, $2) returning id`,
        [`Trip ${key}`, owner]
      );
      const id = trip.id as string;
      tripIds.set(key, id);
      await client.unsafe(
        `insert into "${schema}".collaborators (trip_id, user_id, name, initials, role, is_creator)
         values ($1, $2, $3, 'OW', 'manager', true)`,
        [id, owner, ownerKey]
      );
      await client.unsafe(`insert into "${schema}".days (trip_id, day_number, label) values ($1, 1, 'Day 1')`, [id]);
      return id;
    },
    tripId,
    async addMember(tripKey, userKey, role) {
      await client.unsafe(
        `insert into "${schema}".collaborators (trip_id, user_id, name, initials, role, is_creator)
         values ($1, $2, $3, 'ME', $4, false)`,
        [tripId(tripKey), userId(userKey), userKey, role]
      );
    },
    async seedInvitation(key, tripKey, inviteeKey, inviterKey, role) {
      const [row] = await client.unsafe(
        `insert into "${schema}".invitations (trip_id, invitee_id, invited_by, role, status, expires_at)
         values ($1, $2, $3, $4, 'pending', now() + interval '3 days') returning id`,
        [tripId(tripKey), userId(inviteeKey), userId(inviterKey), role]
      );
      invitationIds.set(key, row.id as string);
    },
    invitationId,
    async accountExists(key) {
      const rows = await client.unsafe(`select 1 from "${schema}".users where id = $1`, [userId(key)]);
      return rows.length > 0;
    },
    async tripOwner(tripKey) {
      const rows = await client.unsafe(`select owner_id from "${schema}".trips where id = $1`, [tripId(tripKey)]);
      return rows.length > 0 ? (rows[0].owner_id as string) : null;
    },
    async tripCount() {
      const rows = await client.unsafe(`select count(*)::int as total from "${schema}".trips`);
      return rows[0].total as number;
    },
    async collaboratorId(tripKey, userKey) {
      const rows = await client.unsafe(`select id from "${schema}".collaborators where trip_id = $1 and user_id = $2`, [
        tripId(tripKey),
        userId(userKey),
      ]);
      if (rows.length === 0) throw new Error(`"${userKey}" is not on trip "${tripKey}".`);
      return rows[0].id as string;
    },
    async ownedTripCount(userKey) {
      const rows = await client.unsafe(`select count(*)::int as total from "${schema}".trips where owner_id = $1`, [
        userId(userKey),
      ]);
      return rows[0].total as number;
    },
    async membershipRole(tripKey, userKey) {
      const rows = await client.unsafe(
        `select role, is_creator from "${schema}".collaborators where trip_id = $1 and user_id = $2`,
        [tripId(tripKey), userId(userKey)]
      );
      return rows.length > 0 ? { role: rows[0].role as string, isCreator: rows[0].is_creator as boolean } : null;
    },
    async invitationStatus(key) {
      const rows = await client.unsafe(`select status from "${schema}".invitations where id = $1`, [invitationId(key)]);
      return rows.length > 0 ? (rows[0].status as string) : null;
    },
    async invitationCount() {
      const rows = await client.unsafe(`select count(*)::int as total from "${schema}".invitations`);
      return rows[0].total as number;
    },
    async ghostMemberCount() {
      const rows = await client.unsafe(
        `select count(*)::int as total from "${schema}".collaborators where user_id is null`
      );
      return rows[0].total as number;
    },
    database(gated) {
      return {
        transaction: (run: (transaction: never) => Promise<unknown>) =>
          root.transaction(async (transaction) => {
            await transaction.execute(sql`select set_config('search_path', ${schema}, true)`);
            if (!gated) return run(transaction as never);
            let executed = 0;
            const proxied = new Proxy(transaction, {
              get(target, property, receiver) {
                const value = Reflect.get(target, property, receiver);
                if (property !== "execute") return typeof value === "function" ? value.bind(target) : value;
                return async (...args: unknown[]) => {
                  const result = await (value as (...inner: unknown[]) => Promise<unknown>).apply(target, args);
                  executed += 1;
                  if (executed === gated.afterExecutes) await gated.gate.arrive();
                  return result;
                };
              },
            });
            return run(proxied as never);
          }),
      } as unknown as ConcurrencyDatabase;
    },
    async holdCollaboratorInsert(tripKey, userKey) {
      const connection = await client.reserve();
      try {
        await connection.unsafe("begin");
        await connection.unsafe(
          `insert into "${schema}".collaborators (trip_id, user_id, name, initials, role, is_creator)
           values ($1, $2, 'held', 'HE', 'viewer', false)`,
          [tripId(tripKey), userId(userKey)]
        );
      } catch (error) {
        await connection.unsafe("rollback").catch(() => undefined);
        connection.release();
        throw error;
      }
      return {
        async release() {
          try {
            await connection.unsafe("rollback");
          } finally {
            connection.release();
          }
        },
      };
    },
    async waitForBlockedTransactions(count = 1) {
      const deadline = Date.now() + BLOCKED_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const rows = await client.unsafe(
          `select count(*)::int as blocked from pg_stat_activity
           where datname = current_database() and application_name = '${schema}' and wait_event_type = 'Lock' and cardinality(pg_blocking_pids(pid)) > 0`
        );
        if ((rows[0].blocked as number) >= count) return;
        await new Promise((resolve) => setTimeout(resolve, BLOCKED_POLL_MS));
      }
      throw new Error(`Fewer than ${count} transactions became blocked on a lock.`);
    },
    close,
  };
}
