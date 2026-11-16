import "dotenv/config";
import { randomUUID } from "node:crypto";
import { setTimeout as wait } from "node:timers/promises";
import { sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { expect } from "@playwright/test";
import * as schemaTables from "../../src/db/schema";
import { guardTransactionDeadline, runWithRequestDeadline } from "../../src/lib/request-deadline";
import { RequestDeadlineError } from "../../src/lib/services/request-deadline-error";

/** A private schema holding one probe table, so each case sees only its own rows and locks. */
export async function createRequestDeadlineFixture() {
  const schema = `deadline_${randomUUID().replaceAll("-", "")}`;
  const connection = { search_path: schema, application_name: schema };
  // One connection, so a leaked session setting would show on the next query.
  const client = postgres(process.env.E2E_DATABASE_URL!, { max: 1, connection, onnotice: () => {} });
  const database = drizzle(client, { schema: schemaTables });
  await client.unsafe(`create schema "${schema}"`);
  await client.unsafe(`create table "${schema}".deadline_probe (id text primary key)`);

  const ids = async () => (await client`select id from deadline_probe order by id`).map((row) => row.id as string);
  /** Runs `work` in one guarded transaction; `run` executes a statement inside it. */
  const guarded = (budgetMs: number, work: (run: (statement: SQL) => Promise<unknown>) => Promise<unknown>) =>
    runWithRequestDeadline(budgetMs, () =>
      database.transaction((transaction) =>
        guardTransactionDeadline(transaction, () => work((statement) => transaction.execute(statement)))
      )
    );
  const insert = (id: string) => sql`insert into deadline_probe (id) values (${id})`;

  async function verify(testCase: string) {
    if (testCase === "commit in time") {
      await guarded(5_000, (run) => run(insert("kept")));
      expect(await ids()).toEqual(["kept"]);
      // The statement cap is transaction-local, so the pooled connection keeps its default afterwards.
      expect((await client`show statement_timeout`)[0].statement_timeout).toBe("0");
      return;
    }
    if (testCase === "slow statement") {
      const start = Date.now();
      await expect(
        guarded(300, async (run) => {
          await run(insert("slow"));
          await run(sql`select pg_sleep(3)`);
        })
      ).rejects.toBeInstanceOf(RequestDeadlineError);
      expect(Date.now() - start).toBeLessThan(2_000);
      expect(await ids()).toEqual([]);
      return;
    }
    if (testCase === "lock held by another writer") {
      await client`insert into deadline_probe (id) values ('held')`;
      const holder = postgres(process.env.E2E_DATABASE_URL!, { max: 1, connection });
      try {
        await holder.begin(async (transaction) => {
          await transaction`select id from deadline_probe where id = 'held' for update`;
          const start = Date.now();
          await expect(
            guarded(300, async (run) => {
              await run(insert("blocked"));
              await run(sql`update deadline_probe set id = id where id = 'held'`);
            })
          ).rejects.toBeInstanceOf(RequestDeadlineError);
          expect(Date.now() - start).toBeLessThan(2_000);
        });
      } finally {
        await holder.end();
      }
      expect(await ids()).toEqual(["held"]);
      return;
    }
    if (testCase === "work that ends after the deadline") {
      await expect(
        guarded(200, async (run) => {
          await run(insert("late"));
          await wait(400);
        })
      ).rejects.toBeInstanceOf(RequestDeadlineError);
      expect(await ids()).toEqual([]);
      return;
    }
    throw new Error(`Unknown request deadline case: ${testCase}`);
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
export type RequestDeadlineFixture = Awaited<ReturnType<typeof createRequestDeadlineFixture>>;
