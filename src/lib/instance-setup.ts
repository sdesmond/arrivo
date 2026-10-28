import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { instanceState } from "@/db/schema";

/** Durable initialization is authoritative; a missing singleton fails closed. */
export async function isInstanceSetupOpen(): Promise<boolean> {
  const [state] = await db
    .select({ initializedAt: instanceState.initializedAt })
    .from(instanceState)
    .where(eq(instanceState.id, true));
  return state?.initializedAt === null;
}
