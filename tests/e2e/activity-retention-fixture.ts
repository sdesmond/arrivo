import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schemaTables from "../../src/db/schema";
import { expect } from "@playwright/test";
import {
  cleanupActivity,
  ACTIVITY_MAINTENANCE_LOCK,
  type ActivityMaintenanceDatabase,
} from "../../src/lib/activity-maintenance";
import { saveActivityRetention, readActivityRetention } from "../../src/lib/activity-retention";
import { mergeActivityInterval } from "../../src/lib/activity-batches";
import { createLockGate } from "./role-service-fixture";

export async function createActivityRetentionFixture() {
  const schema = `retention_${randomUUID().replaceAll("-", "")}`;
  const client = postgres(process.env.E2E_DATABASE_URL!, {
    connection: { search_path: schema, application_name: schema },
  });
  const database = drizzle(client, { schema: schemaTables });
  const actorId = randomUUID();
  const tripId = randomUUID();
  await client.unsafe(`create schema "${schema}"`);
  for (const table of ["instance_state", "activity_events", "users"]) {
    await client.unsafe(`create table "${schema}".${table} (like public.${table} including all)`);
  }
  await client`insert into instance_state (id,initialized_at) values (true,now())`;
  await client`insert into users (id,username,role,password_hash) values (${actorId},'fixture-admin','admin','hash')`;
  const age = (days: number) => new Date(Date.now() - days * 86_400_000);
  const record = (occurredAt: Date, handle = database) =>
    mergeActivityInterval(
      handle,
      { type: "trip_updated", actor: { id: actorId, username: "fixture-admin" }, tripId },
      occurredAt
    );
  const rows = () => client`select id, started_at, ended_at from activity_events order by ended_at,id`;
  const seed = async (endedAt: Date, startedAt = endedAt) => {
    const result =
      await client`insert into activity_events (type,started_at,ended_at,actor_id,actor_username,trip_id) values ('trip_updated',${startedAt.toISOString()},${endedAt.toISOString()},${actorId},'fixture-admin',${tripId}) returning id`;
    return result[0].id as string;
  };
  async function verify(testCase: string) {
    if (testCase === "migration") {
      // Apply actual generated migration to a populated pre-upgrade singleton.
      await client`alter table instance_state drop constraint instance_state_activity_retention_days`;
      await client`alter table instance_state drop column activity_retention_days`;
      const migration = await readFile("drizzle/0006_handy_living_lightning.sql", "utf8");
      for (const statement of migration.split("--> statement-breakpoint")) await client.unsafe(statement);
      expect((await client`select activity_retention_days from instance_state`)[0].activity_retention_days).toBe(90);
      for (const days of [0, 31, 999])
        await expect(client`update instance_state set activity_retention_days=${days}`).rejects.toThrow();
      return;
    }
    if (testCase === "cutoff and overlapping batches") {
      const expiredId = await seed(age(91));
      const overlapId = await seed(age(89), age(100));
      const now = new Date();
      const equalityId = await seed(new Date(now.getTime() - 90 * 86_400_000));
      await cleanupActivity(database, now);
      const stored = await rows();
      expect(stored.map((row) => row.id)).not.toContain(expiredId);
      expect(stored.map((row) => row.id)).toContain(overlapId);
      expect(stored.map((row) => row.id)).toContain(equalityId);
      return;
    }
    if (testCase === "bounded oldest deletion") {
      await client`insert into activity_events (type,started_at,ended_at) select 'sign_in',now()-interval '100 days'-sequence*interval '1 second',now()-interval '100 days'-sequence*interval '1 second' from generate_series(1,501) sequence`;
      const newest = (await client`select id from activity_events order by ended_at desc limit 1`)[0].id;
      await cleanupActivity(database);
      expect((await rows()).map((row) => row.id)).toEqual([newest]);
      return;
    }
    if (testCase === "nonwaiting maintenance contention") {
      await seed(age(100));
      await database.transaction(async (transaction) => {
        await transaction.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(current_schema() || ':' || ${ACTIVITY_MAINTENANCE_LOCK}, 0))`
        );
        const start = Date.now();
        await cleanupActivity(database);
        expect(Date.now() - start).toBeLessThan(1000);
        expect(await rows()).toHaveLength(1);
      });
      return;
    }
    if (testCase === "statement failure isolation") {
      await seed(age(100));
      await client`alter table activity_events rename to unavailable_activity`;
      await expect(cleanupActivity(database)).resolves.toBeUndefined();
      await client`alter table unavailable_activity rename to activity_events`;
      expect(await rows()).toHaveLength(1);
      return;
    }
    if (testCase === "writer first race") {
      // Close enough to cutoff that a recent edit can extend the expired batch across it.
      const before = new Date(Date.now() - 90 * 86_400_000 - 60_000);
      const after = new Date(before.getTime() + 120_000);
      await seed(before);
      const gate = createLockGate();
      const gated = {
        transaction: (run: (handle: never) => Promise<void>) =>
          database.transaction(async (transaction) => {
            const proxy = new Proxy(transaction, {
              get(target, property, receiver) {
                if (property === "update")
                  return (...args: Parameters<typeof transaction.update>) => ({
                    set: (values: Parameters<ReturnType<typeof transaction.update>["set"]>[0]) => ({
                      where: async (
                        condition: Parameters<ReturnType<ReturnType<typeof transaction.update>["set"]>["where"]>[0]
                      ) => {
                        await gate.arrive();
                        return target
                          .update(...args)
                          .set(values)
                          .where(condition);
                      },
                    }),
                  });
                const value = Reflect.get(target, property, receiver);
                return typeof value === "function" ? value.bind(target) : value;
              },
            });
            return run(proxy as never);
          }),
      } as unknown as typeof database;
      const writer = record(after, gated);
      await gate.reached;
      try {
        await cleanupActivity(database);
        expect(await rows()).toHaveLength(1);
      } finally {
        gate.release();
      }
      await writer;
      expect(new Date((await rows())[0].ended_at as string)).toEqual(after);
      return;
    }
    if (testCase === "cleanup first race") {
      const before = new Date(Date.now() - 90 * 86_400_000 - 60_000);
      const after = new Date(before.getTime() + 120_000);
      await seed(before);
      const gate = createLockGate();
      const gated = {
        transaction: (run: (handle: never) => Promise<void>) =>
          database.transaction(async (transaction) => {
            let count = 0;
            const proxy = new Proxy(transaction, {
              get(target, property, receiver) {
                const value = Reflect.get(target, property, receiver);
                if (property !== "execute") return typeof value === "function" ? value.bind(target) : value;
                return async (...args: Parameters<typeof transaction.execute>) => {
                  const result = await target.execute(...args);
                  if (++count === 4) await gate.arrive();
                  return result;
                };
              },
            });
            return run(proxy as never);
          }),
      } as unknown as ActivityMaintenanceDatabase;
      const cleanup = cleanupActivity(gated);
      await gate.reached;
      const writer = record(after);
      try {
        await expect
          .poll(async () =>
            Number(
              (
                await client`select count(*) from pg_stat_activity where application_name=${schema} and wait_event_type='Lock'`
              )[0].count
            )
          )
          .toBeGreaterThan(0);
      } finally {
        gate.release();
      }
      await Promise.all([cleanup, writer]);
      expect(await rows()).toHaveLength(1);
      expect(new Date((await rows())[0].ended_at as string)).toEqual(after);
      return;
    }
    if (testCase === "stale policy and rollback") {
      expect(await saveActivityRetention(database, actorId, 30, 180)).toEqual({ status: "stale" });
      await client`create function reject_policy() returns trigger language plpgsql as 'begin raise exception ''refuse''; end'`;
      await client`create trigger reject_policy before update on instance_state for each row execute function reject_policy()`;
      await expect(saveActivityRetention(database, actorId, 30, 90)).rejects.toThrow();
      expect(await readActivityRetention(database, actorId)).toMatchObject({ status: "ok", days: 90 });
      return;
    }
    if (testCase === "expired history stays readable") {
      const id = await seed(age(100));
      expect(await readActivityRetention(database, actorId)).toMatchObject({ expired: true });
      expect((await rows())[0].id).toBe(id);
      await cleanupActivity(database);
      expect(await readActivityRetention(database, actorId)).toMatchObject({ expired: false });
      return;
    }
    throw new Error(`Unknown retention case: ${testCase}`);
  }
  return {
    verify,
    async close() {
      try {
        await client.unsafe(`drop schema if exists "${schema}" cascade`);
      } finally {
        await client.end();
      }
    },
  };
}
export type ActivityRetentionFixture = Awaited<ReturnType<typeof createActivityRetentionFixture>>;

/** Hold a session lock across each UI scenario and restore shared policy afterwards. */
export async function holdSharedRetentionPolicy(days: number) {
  const client = postgres(process.env.E2E_DATABASE_URL!, { max: 1 });
  await client`select pg_advisory_lock(hashtextextended('retention-e2e-shared-policy',0))`;
  const original = (await client`select activity_retention_days from instance_state where id=true`)[0]
    .activity_retention_days;
  await client`update instance_state set activity_retention_days=${days} where id=true`;
  return async () => {
    try {
      await client`update instance_state set activity_retention_days=${original} where id=true`;
      await client`select pg_advisory_unlock(hashtextextended('retention-e2e-shared-policy',0))`;
    } finally {
      await client.end();
    }
  };
}
