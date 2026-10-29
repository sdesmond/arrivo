import { sql } from "drizzle-orm";

import { users } from "@/db/schema";
import {
  CredentialAuthorizationPurpose,
  UserRole,
  type CredentialSecurityClock,
  type PasswordResetIssuanceOutcome,
} from "@/data/types";
import { lockAppAndUsersForUpdate } from "@/lib/account-lifecycle-locks";
import {
  issueCredentialAuthorizationInTransaction,
  type CredentialAuthorizationDatabase,
} from "@/lib/credential-authorizations";
export type { CredentialAuthorizationDatabase } from "@/lib/credential-authorizations";

type Failure = Extract<PasswordResetIssuanceOutcome, { ok: false }>;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const realClock: CredentialSecurityClock = () => new Date();
class RollbackWithFailure extends Error {
  constructor(readonly failure: Failure) {
    super("Password reset issuance refused.");
  }
}
function retryable(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth++) {
    const { code, cause } = current as { code?: unknown; cause?: unknown };
    if (code === "40P01" || code === "40001") return true;
    current = cause;
  }
  return false;
}

/** Replaces authorization for another completed account. The caller owns the trusted origin and Activity. */
export async function issuePasswordReset(
  database: CredentialAuthorizationDatabase,
  actorUserId: string,
  targetUserId: string,
  sessionVersion: number | undefined,
  clock: CredentialSecurityClock = realClock
): Promise<PasswordResetIssuanceOutcome> {
  if (!UUID_PATTERN.test(actorUserId)) return { ok: false, reason: "forbidden" };
  if (!UUID_PATTERN.test(targetUserId)) return { ok: false, reason: "changed-state" };
  const actorId = actorUserId.toLowerCase();
  const userId = targetUserId.toLowerCase();
  if (actorId === userId) return { ok: false, reason: "changed-state" };
  try {
    return await database.transaction(async (transaction): Promise<PasswordResetIssuanceOutcome> => {
      const scope = await lockAppAndUsersForUpdate(transaction, [actorId, userId]);
      if (!scope.appLocked) return { ok: false, reason: "app-unavailable" };
      const accounts = (await transaction.execute(sql`select ${users.id} as "id", ${users.username} as "username",
        ${users.role} as "role", ${users.passwordHash} as "passwordHash", ${users.sessionVersion} as "sessionVersion" from ${users}
        where ${users.id} in (${actorId}, ${userId})`)) as unknown as {
        id: string;
        username: string;
        role: string;
        passwordHash: string | null;
        sessionVersion: number;
      }[];
      const actor = accounts.find((account) => account.id === actorId);
      if (
        !actor ||
        actor.role !== UserRole.Admin ||
        actor.passwordHash === null ||
        sessionVersion === undefined ||
        actor.sessionVersion !== sessionVersion
      )
        return { ok: false, reason: "forbidden" };
      const target = accounts.find((account) => account.id === userId);
      if (!target || target.passwordHash === null) return { ok: false, reason: "changed-state" };
      const issued = await issueCredentialAuthorizationInTransaction(
        transaction,
        { kind: "admin", actorUserId: actorId },
        { userId, purpose: CredentialAuthorizationPurpose.Reset },
        clock
      );
      if (!issued.ok)
        throw new RollbackWithFailure({
          ok: false,
          reason: issued.reason === "invalid" ? "changed-state" : issued.reason,
        });
      return {
        ok: true,
        userId: target.id,
        username: target.username,
        token: issued.token,
        expiresAt: issued.expiresAt,
        actor: { id: actor.id, username: actor.username },
      };
    });
  } catch (error) {
    if (error instanceof RollbackWithFailure) return error.failure;
    if (retryable(error)) return { ok: false, reason: "retry" };
    throw error;
  }
}
