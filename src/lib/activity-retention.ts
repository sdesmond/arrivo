import { sql } from "drizzle-orm";
import type { db } from "@/db";
import {
  ACTIVITY_RETENTION_DAYS,
  type ActivityRetentionDays,
  type ActivityRetentionReadResult,
  type ActivityRetentionCommitResult,
} from "@/data/types";
import { lockInstanceAndUsersForUpdate } from "./account-lifecycle-locks";

export type ActivityRetentionDatabase = Pick<typeof db, "execute" | "transaction">;

export function isRetentionDays(value: unknown): value is ActivityRetentionDays {
  return typeof value === "number" && (ACTIVITY_RETENTION_DAYS as readonly number[]).includes(value);
}

/** One statement gives authority, policy, cutoff inspection and real timestamp one MVCC snapshot. */
export async function readActivityRetention(
  database: ActivityRetentionDatabase,
  actorId: string
): Promise<ActivityRetentionReadResult> {
  const rows = await database.execute(sql`
    select state.activity_retention_days as days, statement_timestamp() as "checkedAt",
      exists(select 1 from activity_events where ended_at < statement_timestamp() - state.activity_retention_days * interval '1 day') as expired
    from instance_state state
    where state.id = true and exists(select 1 from users where id = ${actorId} and role = 'admin' and password_hash is not null)
  `);
  const row = rows[0];
  if (!row) return { status: "forbidden" };
  return {
    status: "ok",
    days: row.days as ActivityRetentionDays,
    expired: row.expired as boolean,
    checkedAt: new Date(row.checkedAt as string | Date).toISOString(),
  };
}

/** Returning from transaction means commit succeeded; caller alone schedules post-commit side effects. */
export async function saveActivityRetention(
  database: ActivityRetentionDatabase,
  actorId: string,
  days: unknown,
  expectedDays: unknown
): Promise<ActivityRetentionCommitResult> {
  if (!isRetentionDays(days) || !isRetentionDays(expectedDays)) return { status: "invalid" };
  return database.transaction(async (transaction): Promise<ActivityRetentionCommitResult> => {
    const scope = await lockInstanceAndUsersForUpdate(transaction, [actorId]);
    if (!scope.instanceLocked || !scope.lockedUserIds.has(actorId.toLowerCase())) return { status: "forbidden" };
    const rows = await transaction.execute(sql`
      select users.id, users.username, users.role, users.password_hash as "passwordHash", state.activity_retention_days as days
      from users cross join instance_state state where users.id = ${actorId} and state.id = true
    `);
    const actor = rows[0];
    if (!actor || actor.role !== "admin" || actor.passwordHash === null) return { status: "forbidden" };
    if (actor.days !== expectedDays) return { status: "stale" };
    const changed = days !== expectedDays;
    if (changed)
      await transaction.execute(sql`update instance_state set activity_retention_days = ${days} where id = true`);
    return { status: "ok", days, changed, actor: { id: actor.id as string, username: actor.username as string } };
  });
}
