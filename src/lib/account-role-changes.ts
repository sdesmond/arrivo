import { sql } from "drizzle-orm";
import type { db } from "@/db";
import { users } from "@/db/schema";
import { RoleChangeFailure, UserRole, type ChangeUserRoleInput, type ChangeUserRoleOutcome } from "@/data/types";
import {
  assertAnotherCompletedAdmin,
  LastCompletedAdminError,
  lockAppAndUsersForUpdate,
} from "@/lib/account-lifecycle-locks";

export type RoleChangeDatabase = Pick<typeof db, "transaction">;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RETRYABLE_SQLSTATES = new Set(["40P01", "40001"]);
const MAX_CAUSE_DEPTH = 5;

interface AccountRow {
  id: string;
  username: string;
  role: string;
  passwordHash: string | null;
}

const fail = (reason: RoleChangeFailure): ChangeUserRoleOutcome => ({ ok: false, reason });

function isRetryable(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && typeof current === "object" && current !== null; depth++) {
    const { code, cause } = current as { code?: unknown; cause?: unknown };
    if (typeof code === "string" && RETRYABLE_SQLSTATES.has(code)) return true;
    current = cause;
  }
  return false;
}

// Request-independent: the caller authenticates and passes the actor ID. Success carries both usernames as read
// under the lock so the caller can record an event after commit. Authority is rechecked under locks so an
// actor demoted while waiting is refused. Refusals write nothing; unexpected failures propagate and roll back.
export async function changeUserRole(
  database: RoleChangeDatabase,
  actorUserId: string,
  input: ChangeUserRoleInput
): Promise<ChangeUserRoleOutcome> {
  const { role } = input;
  if (!Object.values(UserRole).includes(role)) return fail(RoleChangeFailure.InvalidRole);
  if (!UUID_PATTERN.test(actorUserId)) return fail(RoleChangeFailure.Forbidden);
  const actorId = actorUserId.toLowerCase();
  const targetIsValidId = UUID_PATTERN.test(input.targetUserId);
  const targetId = input.targetUserId.toLowerCase();

  try {
    return await database.transaction(async (transaction): Promise<ChangeUserRoleOutcome> => {
      const ids = targetIsValidId ? [actorId, targetId] : [actorId];
      const scope = await lockAppAndUsersForUpdate(transaction, ids);
      if (!scope.appLocked) return fail(RoleChangeFailure.AppUnavailable);
      if (!scope.lockedUserIds.has(actorId)) return fail(RoleChangeFailure.Forbidden);

      const rows = (await transaction.execute(
        sql`select ${users.id} as "id", ${users.username} as "username", ${users.role} as "role", ${users.passwordHash} as "passwordHash"
          from ${users} where ${users.id} in (${sql.join(
            ids.map((id) => sql`${id}`),
            sql`, `
          )})`
      )) as unknown as AccountRow[];
      const actor = rows.find((row) => row.id === actorId);
      if (!actor || actor.role !== UserRole.Admin || actor.passwordHash === null) {
        return fail(RoleChangeFailure.Forbidden);
      }

      const target = targetIsValidId ? rows.find((row) => row.id === targetId) : undefined;
      if (!target) return fail(RoleChangeFailure.NotFound);

      const snapshots = {
        actor: { id: actor.id, username: actor.username },
        target: { id: target.id, username: target.username },
      };
      const completed = target.passwordHash !== null;
      if (role === UserRole.Admin && !completed) return fail(RoleChangeFailure.UnfinishedAccount);
      if (target.role === role) return { ok: true, userId: target.id, role, changed: false, ...snapshots };

      if (role === UserRole.Member && target.role === UserRole.Admin && completed) {
        try {
          await assertAnotherCompletedAdmin(transaction, target.id);
        } catch (error) {
          if (error instanceof LastCompletedAdminError) return fail(RoleChangeFailure.LastAdmin);
          throw error;
        }
      }

      await transaction.execute(sql`update ${users} set role = ${role} where ${users.id} = ${target.id}`);
      return { ok: true, userId: target.id, role, changed: true, ...snapshots };
    });
  } catch (error) {
    if (isRetryable(error)) return fail(RoleChangeFailure.Retry);
    throw error;
  }
}
