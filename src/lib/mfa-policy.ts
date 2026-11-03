import "server-only";
import { sql } from "drizzle-orm";
import type { db } from "@/db";
import type { MfaPolicy, MfaPolicySaveResult } from "@/data/types";
import { lockAppAndUsersForUpdate } from "./account-lifecycle-locks";
import { isFieldEncryptionConfigured } from "./field-encryption";

type PolicyDatabase = Pick<typeof db, "execute" | "transaction">;

/** One snapshot of the singleton and account; absence never means an optional policy. */
export async function readMfaPolicy(database: Pick<PolicyDatabase, "execute">, userId: string): Promise<MfaPolicy> {
  const rows = await database.execute(sql`
    select state.mfa_required as "instanceRequired", users.mfa_required as "individualRequired",
      users.mfa_enabled_at is not null as enrolled, users.session_version as "sessionVersion"
    from app_state state cross join users where state.id = true and users.id = ${userId}
  `);
  const row = rows[0];
  if (
    !row ||
    typeof row.instanceRequired !== "boolean" ||
    typeof row.individualRequired !== "boolean" ||
    typeof row.enrolled !== "boolean" ||
    typeof row.sessionVersion !== "number"
  ) {
    throw new Error("Two-factor policy is unavailable.");
  }
  return {
    instanceRequired: row.instanceRequired,
    individualRequired: row.individualRequired,
    required: row.instanceRequired || row.individualRequired,
    enrolled: row.enrolled,
    sessionVersion: row.sessionVersion,
  };
}

/** Policy changes serialize with account authority changes and MFA disable. */
export async function saveMfaPolicy(
  database: PolicyDatabase,
  actor: { id: string; sessionVersion?: number },
  required: unknown,
  expected: unknown,
  targetUserId?: string
): Promise<MfaPolicySaveResult> {
  if (
    typeof required !== "boolean" ||
    typeof expected !== "boolean" ||
    (targetUserId !== undefined && (typeof targetUserId !== "string" || !targetUserId.trim()))
  )
    return { status: "invalid" };
  if (required && !isFieldEncryptionConfigured()) return { status: "key-unavailable" };
  return database.transaction(async (transaction): Promise<MfaPolicySaveResult> => {
    const resetIndividuals = targetUserId === undefined && required === false && expected === true;
    let userIds = targetUserId ? [actor.id, targetUserId] : [actor.id];
    if (resetIndividuals) {
      const singleton = await lockAppAndUsersForUpdate(transaction, []);
      if (!singleton.appLocked) return { status: "forbidden" };
      const accounts = await transaction.execute(sql`select id from users order by id`);
      userIds = accounts.map((account) => String(account.id).toLowerCase()).sort();
    }
    const scope = await lockAppAndUsersForUpdate(transaction, userIds);
    if (
      !scope.appLocked ||
      userIds.some((userId) => !scope.lockedUserIds.has(userId.toLowerCase())) ||
      !scope.lockedUserIds.has(actor.id.toLowerCase()) ||
      (targetUserId && !scope.lockedUserIds.has(targetUserId.toLowerCase()))
    )
      return { status: "forbidden" };
    const currentColumn = targetUserId
      ? sql`(select mfa_required from users where id = ${targetUserId})`
      : sql`state.mfa_required`;
    const rows = await transaction.execute(sql`
      select users.role, users.password_hash as "passwordHash", users.session_version as "sessionVersion",
        ${currentColumn} as current from users cross join app_state state
      where users.id = ${actor.id} and state.id = true
    `);
    const current = rows[0];
    if (
      !current ||
      current.role !== "admin" ||
      !current.passwordHash ||
      actor.sessionVersion === undefined ||
      current.sessionVersion !== actor.sessionVersion
    )
      return { status: "forbidden" };
    if (current.current !== expected) return { status: "stale" };
    if (required !== expected) {
      if (targetUserId)
        await transaction.execute(sql`update users set mfa_required = ${required} where id = ${targetUserId}`);
      else {
        await transaction.execute(sql`update app_state set mfa_required = ${required} where id = true`);
        if (resetIndividuals)
          await transaction.execute(sql`update users set mfa_required = false where mfa_required = true`);
      }
    }
    return { status: "ok", required };
  });
}
