import { sql } from "drizzle-orm";
import type { db } from "@/db";
import { users } from "@/db/schema";
import { UserRole, type DeleteUnfinishedAccountOutcome } from "@/data/types";
import { lockAppAndUsersForUpdate } from "@/lib/account-lifecycle-locks";

export type UnfinishedAccountDeletionDatabase = Pick<typeof db, "transaction">;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function retryable(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth++) {
    const { code, cause } = current as { code?: unknown; cause?: unknown };
    if (code === "40P01" || code === "40001") return true;
    current = cause;
  }
  return false;
}

/** Deletes an account that never finished setup; its credential authorizations cascade. The caller owns Activity. */
export async function deleteUnfinishedAccount(
  database: UnfinishedAccountDeletionDatabase,
  actorUserId: string,
  targetUserId: string
): Promise<DeleteUnfinishedAccountOutcome> {
  if (!UUID_PATTERN.test(actorUserId)) return { ok: false, reason: "forbidden" };
  if (!UUID_PATTERN.test(targetUserId)) return { ok: false, reason: "changed-state" };
  const actorId = actorUserId.toLowerCase();
  const userId = targetUserId.toLowerCase();
  try {
    return await database.transaction(async (transaction): Promise<DeleteUnfinishedAccountOutcome> => {
      const scope = await lockAppAndUsersForUpdate(transaction, [actorId, userId]);
      if (!scope.appLocked) return { ok: false, reason: "app-unavailable" };
      const accounts = (await transaction.execute(sql`select ${users.id} as "id", ${users.username} as "username",
        ${users.role} as "role", ${users.passwordHash} as "passwordHash" from ${users}
        where ${users.id} in (${actorId}, ${userId})`)) as unknown as {
        id: string;
        username: string;
        role: string;
        passwordHash: string | null;
      }[];
      const actor = accounts.find((account) => account.id === actorId);
      if (!actor || actor.role !== UserRole.Admin || actor.passwordHash === null)
        return { ok: false, reason: "forbidden" };
      const target = accounts.find((account) => account.id === userId);
      if (!target || target.passwordHash !== null) return { ok: false, reason: "changed-state" };
      const deleted = await transaction.execute(
        sql`delete from ${users} where ${users.id} = ${userId} and ${users.passwordHash} is null returning ${users.id}`
      );
      if (deleted.length === 0) return { ok: false, reason: "changed-state" };
      return {
        ok: true,
        userId: target.id,
        username: target.username,
        actor: { id: actor.id, username: actor.username },
      };
    });
  } catch (error) {
    if (retryable(error)) return { ok: false, reason: "retry" };
    throw error;
  }
}
