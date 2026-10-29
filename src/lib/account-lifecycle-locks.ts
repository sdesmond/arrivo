import { sql } from "drizzle-orm";
import { appState, trips, users } from "@/db/schema";
import { UserRole } from "@/data/types";
import type { DbTransaction } from "@/lib/server-action-locks";

export interface LockedAccountScope {
  appLocked: boolean;
  lockedUserIds: Set<string>;
}

export class LastCompletedAdminError extends Error {
  constructor() {
    super("At least one other completed admin is required.");
    this.name = "LastCompletedAdminError";
  }
}

// Lock order (AD-2): app singleton first, then the affected users in sorted, deduplicated ID order. Callers that
// also lock trips do so afterwards. Rows that do not exist are reported, not thrown, so callers pick the refusal.
// Runs inside the caller's transaction; never opens one.
export async function lockAppAndUsersForUpdate(
  transaction: DbTransaction,
  userIds: readonly string[]
): Promise<LockedAccountScope> {
  const appRows = await transaction.execute(
    sql`select ${appState.id} from ${appState} where ${appState.id} = true for update`
  );
  const lockedUserIds = new Set<string>();
  if (appRows.length === 0) return { appLocked: false, lockedUserIds };

  for (const userId of [...new Set(userIds.map((id) => id.toLowerCase()))].sort()) {
    const rows = await transaction.execute(
      sql`select ${users.id} from ${users} where ${users.id} = ${userId} for update`
    );
    if (rows.length > 0) lockedUserIds.add(userId);
  }
  return { appLocked: true, lockedUserIds };
}

export type UsersAndTripLock =
  | { locked: true }
  | { locked: false; missing: "user"; userId: string }
  | { locked: false; missing: "trip" };

// Lock order (AD-7) for writers that touch accounts and one trip without taking the app singleton: the users in
// sorted, deduplicated ID order, then the trip. The same order account deletion uses, so a writer and a deletion
// can wait on each other but never form a cycle. Stops at the first missing row and reports it. Runs inside the
// caller's transaction; never opens one.
export async function lockUsersThenTripForUpdate(
  transaction: DbTransaction,
  userIds: readonly string[],
  tripId: string
): Promise<UsersAndTripLock> {
  for (const userId of [...new Set(userIds.map((id) => id.toLowerCase()))].sort()) {
    const rows = await transaction.execute(
      sql`select ${users.id} from ${users} where ${users.id} = ${userId} for update`
    );
    if (rows.length === 0) return { locked: false, missing: "user", userId };
  }
  const tripRows = await transaction.execute(
    sql`select ${trips.id} from ${trips} where ${trips.id} = ${tripId} for update`
  );
  if (tripRows.length === 0) return { locked: false, missing: "trip" };
  return { locked: true };
}

// Throws unless an admin other than `excludedUserId` has finished their account (password set). Callers must hold the
// singleton lock from lockAppAndUsersForUpdate, which serializes every admin-removing mutation, and call this
// before mutating so a throw leaves nothing to undo beyond the caller's own rollback.
export async function assertAnotherCompletedAdmin(transaction: DbTransaction, excludedUserId: string): Promise<void> {
  const rows = await transaction.execute(
    sql`select ${users.id} from ${users}
      where ${users.role} = ${UserRole.Admin} and ${users.passwordHash} is not null and ${users.id} <> ${excludedUserId}
      limit 1`
  );
  if (rows.length === 0) throw new LastCompletedAdminError();
}
