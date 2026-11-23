import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { validateTarget, summarize } from "./benchmark-template-reorder.mjs";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

it("measures real template reorder transactions against an isolated database", async () => {
  validateTarget(
    process.env.DATABASE_URL,
    process.env.BENCHMARK_CONFIRMED === "yes" && process.env.DATABASE_URL === process.env.BENCHMARK_DATABASE_URL
  );
  const { db } = await import("@/db");
  const { users, packingTemplates, packingTemplateItems } = await import("@/db/schema");
  const { reorderPackingTemplateItems } = await import("@/lib/services/packing-template-items");
  const { runWithRequestDeadline, REQUEST_DEADLINE_MS } = await import("@/lib/request-deadline");
  const { RequestDeadlineError } = await import("@/lib/services/request-deadline-error");
  const userId = randomUUID();
  const templateId = randomUUID();
  const actor = { userId };
  try {
    await db.insert(users).values({ id: userId, username: `benchmark-${userId}` });
    await db.insert(packingTemplates).values({ id: templateId, userId, name: "Benchmark" });
    const version = await db.execute("select version() as version");
    process.stdout.write(
      JSON.stringify({
        postgres: version[0].version,
        node: process.version,
        deadlineMs: REQUEST_DEADLINE_MS,
        note: "Real service and database; local connection, no HTTP transport",
      }) + "\n"
    );
    for (const count of [100, 500, 1000, 2000]) {
      const items = Array.from({ length: count }, (_, position) => ({
        id: randomUUID(),
        templateId,
        text: `Item ${position}`,
        position,
        labelId: null,
      }));
      await db.insert(packingTemplateItems).values(items);
      const read = () =>
        db
          .select({
            id: packingTemplateItems.id,
            position: packingTemplateItems.position,
            labelId: packingTemplateItems.labelId,
          })
          .from(packingTemplateItems)
          .where(eq(packingTemplateItems.templateId, templateId));
      const results: { elapsedMs: number; outcome: string; rolledBack: boolean }[] = [];
      for (const budget of [REQUEST_DEADLINE_MS, REQUEST_DEADLINE_MS, REQUEST_DEADLINE_MS]) {
        const before = (await read()).sort((first, second) => first.position - second.position);
        const rotated = [...before.slice(1), before[0]].map(({ id, labelId }) => ({ id, labelId }));
        const start = performance.now();
        let outcome = "committed";
        let rolledBack = false;
        try {
          await runWithRequestDeadline(budget, () =>
            reorderPackingTemplateItems(actor, templateId, { items: rotated, expectedItems: before })
          );
        } catch (error) {
          if (!(error instanceof RequestDeadlineError)) throw error;
          outcome = "deadline";
          const after = (await read()).sort((first, second) => first.position - second.position);
          rolledBack = JSON.stringify(after) === JSON.stringify(before);
          expect(rolledBack).toBe(true);
        }
        const elapsedMs = +(performance.now() - start).toFixed(2);
        results.push({ elapsedMs, outcome, rolledBack });
      }
      // An AFTER trigger proves the update ran before its statement was cancelled.
      const suffix = randomUUID().replaceAll("-", "");
      const trigger = `benchmark_trigger_${suffix}`;
      const fn = `benchmark_sleep_${suffix}`;
      await db.execute(
        sql.raw(
          `create function "${fn}"() returns trigger language plpgsql as $$ begin perform pg_sleep(2); return new; end $$`
        )
      );
      await db.execute(
        sql.raw(
          `create trigger "${trigger}" after update on packing_template_items for each row when (new.template_id = '${templateId}'::uuid) execute function "${fn}"()`
        )
      );
      try {
        const before = (await read()).sort((first, second) => first.position - second.position);
        const rotated = [...before.slice(1), before[0]].map(({ id, labelId }) => ({ id, labelId }));
        const start = performance.now();
        const request = runWithRequestDeadline(1000, () =>
          reorderPackingTemplateItems(actor, templateId, { items: rotated, expectedItems: before })
        ).then(
          () => null,
          (error: unknown) => error
        );
        let observedUpdate = false;
        while (performance.now() - start < 900) {
          const activity = await db.execute(
            sql`select 1 from pg_stat_activity where datname = current_database() and wait_event = 'PgSleep' and query like 'update "packing_template_items"%'`
          );
          if (activity.length) {
            observedUpdate = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        const error = await request;
        expect(observedUpdate).toBe(true);
        expect(error).toBeInstanceOf(RequestDeadlineError);
        const after = (await read()).sort((first, second) => first.position - second.position);
        const rolledBack = JSON.stringify(after) === JSON.stringify(before);
        expect(rolledBack).toBe(true);
        results.push({ elapsedMs: +(performance.now() - start).toFixed(2), outcome: "deadline", rolledBack });
      } finally {
        await db.execute(sql.raw(`drop trigger "${trigger}" on packing_template_items`));
        await db.execute(sql.raw(`drop function "${fn}"()`));
      }
      process.stdout.write(
        JSON.stringify({
          count,
          budgetsMs: [REQUEST_DEADLINE_MS, REQUEST_DEADLINE_MS, REQUEST_DEADLINE_MS, 1000],
          ...summarize(results),
          results,
        }) + "\n"
      );
      await db.delete(packingTemplateItems).where(eq(packingTemplateItems.templateId, templateId));
    }
  } finally {
    await db.delete(users).where(eq(users.id, userId));
    await globalThis.__pgClient?.end();
  }
});
