import { sql } from "drizzle-orm";
import { appState } from "../../src/db/schema";
import { withE2EDb } from "./e2e-db";

export type AppStateName = "fresh" | "initialized";

/** Puts the singleton `app_state` row into the requested state. Only app-bootstrap.feature may use "fresh". */
export async function setAppState(name: AppStateName): Promise<void> {
  const initializedAt = name === "fresh" ? null : new Date();
  await withE2EDb(async (db) => {
    await db
      .insert(appState)
      .values({ id: true, initializedAt })
      .onConflictDoUpdate({ target: appState.id, set: { initializedAt: sql`excluded.initialized_at` } });
  });
}
