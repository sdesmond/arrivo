import { sql } from "drizzle-orm";
import type { db } from "@/db";
import { appState, users } from "@/db/schema";
import { UserRole, type BootstrapAccountValues, type BootstrapResult } from "@/data/types";

export type BootstrapDatabase = Pick<typeof db, "transaction">;

// Creates the first account as admin and marks the app initialized in one transaction. The singleton row is
// locked first (AD-2), so concurrent first signups serialize and only one sees the app as fresh. A unique
// violation on the username propagates and rolls everything back, leaving the app fresh.
export async function bootstrapFirstAccount(
  database: BootstrapDatabase,
  values: BootstrapAccountValues
): Promise<BootstrapResult> {
  return database.transaction(async (transaction) => {
    const rows = await transaction.execute(
      sql`select ${appState.initializedAt} as "initializedAt" from ${appState} where ${appState.id} = true for update`
    );
    const state = rows[0] as { initializedAt: Date | null } | undefined;
    if (!state || state.initializedAt !== null) return { ok: false, reason: "closed" } as const;

    const [created] = await transaction
      .insert(users)
      .values({ ...values, role: UserRole.Admin })
      .returning({ id: users.id, username: users.username });
    await transaction
      .update(appState)
      .set({ initializedAt: new Date() })
      .where(sql`${appState.id} = true`);

    return { ok: true, userId: created.id, username: created.username } as const;
  });
}
