import "server-only";
import { db } from "@/db";
import { collaborators, invitations, users } from "@/db/schema";
import { and, asc, isNotNull, ne, sql } from "drizzle-orm";
import type { InvitableUsersResult } from "@/data/types";

/**
 * Accounts a manager can pick in the share dialog: password set (finished setup), not the caller,
 * not already on the trip and without a pending invitation. Declined and rescinded invitees stay
 * listed so they can be invited again. Callers must have asserted manager access first.
 */
export async function getInvitableUsers(tripId: string, userId: string): Promise<InvitableUsersResult> {
  const [invitable, otherAccounts] = await Promise.all([
    db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(
        and(
          ne(users.id, userId),
          isNotNull(users.passwordHash),
          sql`not exists (select 1 from ${collaborators} where ${collaborators.tripId} = ${tripId} and ${collaborators.userId} = ${users.id})`,
          sql`not exists (select 1 from ${invitations} where ${invitations.tripId} = ${tripId} and ${invitations.inviteeId} = ${users.id} and ${invitations.status} = 'pending')`
        )
      )
      .orderBy(asc(sql`lower(${users.username})`)),
    db.select({ id: users.id }).from(users).where(ne(users.id, userId)).limit(1),
  ]);

  return { users: invitable, hasOtherUsers: otherAccounts.length > 0 };
}
