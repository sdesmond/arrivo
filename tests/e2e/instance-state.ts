import { sql } from "drizzle-orm";
import { instanceState } from "../../src/db/schema";
import { withE2EDb } from "./e2e-db";

export type InstanceStateName = "fresh" | "initialized";

/** Puts the singleton `instance_state` row into the requested state. Only instance-bootstrap.feature may use "fresh". */
export async function setInstanceState(name: InstanceStateName): Promise<void> {
  const initializedAt = name === "fresh" ? null : new Date();
  await withE2EDb(async (db) => {
    await db
      .insert(instanceState)
      .values({ id: true, initializedAt })
      .onConflictDoUpdate({ target: instanceState.id, set: { initializedAt: sql`excluded.initialized_at` } });
  });
}
