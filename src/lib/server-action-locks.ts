import { sql } from "drizzle-orm";
import type { db } from "@/db";
import { packingTemplates, trips, users } from "@/db/schema";

export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Exported so callers can tell "trip row already gone" apart from unexpected lock failures.
export const TRIP_NOT_FOUND_MESSAGE = "Trip not found.";

async function ensureLockedRow(
  transaction: DbTransaction,
  statement: ReturnType<typeof sql>,
  notFoundMessage: string
): Promise<void> {
  const rows = await transaction.execute(statement);

  if (rows.length === 0) {
    throw new Error(notFoundMessage);
  }
}

export async function lockTripForUpdate(transaction: DbTransaction, tripId: string): Promise<void> {
  await ensureLockedRow(
    transaction,
    sql`select ${trips.id} from ${trips} where ${trips.id} = ${tripId} for update`,
    TRIP_NOT_FOUND_MESSAGE
  );
}

export async function lockUserForUpdate(transaction: DbTransaction, userId: string): Promise<void> {
  await ensureLockedRow(
    transaction,
    sql`select ${users.id} from ${users} where ${users.id} = ${userId} for update`,
    "User not found."
  );
}

export async function lockPackingTemplateForUpdate(transaction: DbTransaction, templateId: string): Promise<void> {
  await ensureLockedRow(
    transaction,
    sql`select ${packingTemplates.id} from ${packingTemplates} where ${packingTemplates.id} = ${templateId} for update`,
    "Template not found."
  );
}
