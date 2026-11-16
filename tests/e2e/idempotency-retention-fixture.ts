import "dotenv/config";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { expect } from "@playwright/test";
import * as schemaTables from "../../src/db/schema";
import {
  IDEMPOTENCY_RETENTION_MS,
  IDEMPOTENCY_SWEEP_BATCH,
  purgeExpiredIdempotencyKeys,
} from "../../src/lib/idempotency-retention";

/** A private schema holding an empty copy of `idempotency_keys`, so each case sees only its own rows. */
export async function createIdempotencyRetentionFixture() {
  const schema = `idempotency_${randomUUID().replaceAll("-", "")}`;
  const connection = { search_path: schema, application_name: schema };
  const client = postgres(process.env.E2E_DATABASE_URL!, { connection });
  const database = drizzle(client, { schema: schemaTables });
  await client.unsafe(`create schema "${schema}"`);
  await client.unsafe(`create table "${schema}".idempotency_keys (like public.idempotency_keys including all)`);

  const now = new Date();
  const aged = (ageMs: number) => new Date(now.getTime() - ageMs).toISOString();
  const expired = aged(IDEMPOTENCY_RETENTION_MS + 60_000);
  const seed = (key: string, createdAt: string) =>
    client`insert into idempotency_keys (key,user_id,result,created_at) values (${key},'fixture-user','{}'::jsonb,${createdAt}::timestamptz)`;
  const keys = async () =>
    (await client`select key from idempotency_keys order by key`).map((row) => row.key as string);

  async function verify(testCase: string) {
    if (testCase === "cutoff") {
      await seed("api:v1:expired", expired);
      // Packing's save-as-template keys carry no namespace and share the table.
      await seed("legacy-expired", expired);
      await seed("api:v1:at-cutoff", aged(IDEMPOTENCY_RETENTION_MS));
      await seed("api:v1:fresh", aged(60_000));
      await purgeExpiredIdempotencyKeys(database, now);
      expect(await keys()).toEqual(["api:v1:at-cutoff", "api:v1:fresh"]);
      return;
    }
    if (testCase === "more than one batch") {
      await client`insert into idempotency_keys (key,user_id,result,created_at) select 'bulk-' || sequence,'fixture-user','{}'::jsonb,${expired}::timestamptz from generate_series(1,${IDEMPOTENCY_SWEEP_BATCH * 2 + 1}) sequence`;
      await seed("api:v1:fresh", aged(60_000));
      await purgeExpiredIdempotencyKeys(database, now);
      expect(await keys()).toEqual(["api:v1:fresh"]);
      return;
    }
    if (testCase === "row held by a writer") {
      await seed("api:v1:held", expired);
      await seed("api:v1:expired", expired);
      const holder = postgres(process.env.E2E_DATABASE_URL!, { max: 1, connection });
      try {
        await holder.begin(async (transaction) => {
          await transaction`select key from idempotency_keys where key='api:v1:held' for update`;
          const start = Date.now();
          await purgeExpiredIdempotencyKeys(database, now);
          expect(Date.now() - start).toBeLessThan(1000);
          expect(await keys()).toEqual(["api:v1:held"]);
        });
      } finally {
        await holder.end();
      }
      return;
    }
    if (testCase === "statement failure isolation") {
      await seed("api:v1:expired", expired);
      await client`alter table idempotency_keys rename to unavailable_keys`;
      await expect(purgeExpiredIdempotencyKeys(database, now)).resolves.toBeUndefined();
      await client`alter table unavailable_keys rename to idempotency_keys`;
      expect(await keys()).toEqual(["api:v1:expired"]);
      return;
    }
    throw new Error(`Unknown idempotency retention case: ${testCase}`);
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
export type IdempotencyRetentionFixture = Awaited<ReturnType<typeof createIdempotencyRetentionFixture>>;
