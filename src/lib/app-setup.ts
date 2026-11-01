import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appState } from "@/db/schema";

/** Durable initialization is authoritative; a missing singleton fails closed. */
export async function isAppSetupOpen(): Promise<boolean> {
  const [state] = await db
    .select({ initializedAt: appState.initializedAt })
    .from(appState)
    .where(eq(appState.id, true));
  return state?.initializedAt === null;
}
