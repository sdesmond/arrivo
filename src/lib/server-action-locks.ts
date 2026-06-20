import { sql } from "drizzle-orm";
import { db } from "@/db";
import { packingTemplates, trips, users } from "@/db/schema";

export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
    "Trip not found."
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
