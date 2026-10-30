import { sql } from "drizzle-orm";
import { users, activityEvents } from "@/db/schema";
import {
  ActivityEventType,
  CredentialAuthorizationPurpose,
  UserRole,
  type AdminRecoveryIssuanceInput,
  type AdminRecoveryIssuanceOutcome,
  type CredentialIssuanceAuthority,
  type CredentialSecurityClock,
} from "@/data/types";
import { lockAppAndUsersForUpdate } from "@/lib/account-lifecycle-locks";
import {
  issueCredentialAuthorizationInTransaction,
  type CredentialAuthorizationDatabase,
} from "@/lib/credential-authorizations";
import { normalizeUsername, validateUsername } from "@/lib/username";
import { withTimeout } from "@/lib/with-timeout";

type Failure = Extract<AdminRecoveryIssuanceOutcome, { ok: false }>;
const realClock: CredentialSecurityClock = () => new Date();
class RollbackWithFailure extends Error {
  constructor(readonly failure: Failure) {
    super("Admin recovery issuance refused.");
  }
}
function trustedOrigin(origin: string): string | undefined {
  if (typeof origin !== "string" || !/^https?:\/\/[^/?#\\\s@]+\/?$/i.test(origin)) return;
  try {
    const parsed = new URL(origin);
    if (
      !parsed.hostname ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    )
      return;
    return parsed.origin;
  } catch {
    return;
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

/** Request-independent operator service. The adapter supplies authority, browser origin, and database. */
export async function issueAdminRecovery(
  database: CredentialAuthorizationDatabase,
  authority: CredentialIssuanceAuthority,
  input: AdminRecoveryIssuanceInput,
  clock: CredentialSecurityClock = realClock
): Promise<AdminRecoveryIssuanceOutcome> {
  if (authority?.kind !== "trusted-operator") return { ok: false, reason: "forbidden" };
  if (typeof input.username !== "string" || validateUsername(input.username))
    return { ok: false, reason: "invalid-username" };
  const username = normalizeUsername(input.username);
  const origin = trustedOrigin(input.origin);
  if (!origin) return { ok: false, reason: "invalid-origin" };
  let outcome: AdminRecoveryIssuanceOutcome;
  try {
    outcome = await database.transaction(async (transaction): Promise<AdminRecoveryIssuanceOutcome> => {
      // Resolve once before waiting; never substitute a new account that later acquires this username.
      const initial = (await transaction.execute(
        sql`select ${users.id} as "id" from ${users} where lower(${users.username}) = ${username}`
      )) as unknown as { id: string }[];
      if (!initial[0]) return { ok: false, reason: "changed-state" };
      const userId = initial[0].id;
      const scope = await lockAppAndUsersForUpdate(transaction, [userId]);
      if (!scope.appLocked) return { ok: false, reason: "app-unavailable" };
      if (!scope.lockedUserIds.has(userId)) return { ok: false, reason: "changed-state" };
      const rows = (await transaction.execute(
        sql`select ${users.id} as "id", ${users.username} as "username", ${users.role} as "role", ${users.passwordHash} as "passwordHash" from ${users} where ${users.id} = ${userId}`
      )) as unknown as { id: string; username: string; role: string; passwordHash: string | null }[];
      const target = rows[0];
      if (!target || target.username !== username || target.role !== UserRole.Admin || target.passwordHash === null)
        return { ok: false, reason: "changed-state" };
      const issued = await issueCredentialAuthorizationInTransaction(
        transaction,
        authority,
        { userId, purpose: CredentialAuthorizationPurpose.Recovery },
        clock
      );
      if (!issued.ok)
        throw new RollbackWithFailure({
          ok: false,
          reason: issued.reason === "invalid" ? "changed-state" : issued.reason,
        });
      const url = new URL("/account-recovery", origin);
      url.searchParams.set("token", issued.token);
      return {
        ok: true,
        userId: target.id,
        username: target.username,
        url: url.toString(),
        expiresAt: issued.expiresAt,
      };
    });
  } catch (error) {
    if (error instanceof RollbackWithFailure) return error.failure;
    if (retryable(error)) return { ok: false, reason: "retry" };
    throw error;
  }
  if (!outcome.ok) return outcome;
  const committed = outcome;
  try {
    await withTimeout(
      database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('statement_timeout', ${"5000"}, true)`);
        const occurredAt = clock().toISOString();
        await transaction.execute(sql`insert into ${activityEvents} (started_at, ended_at, type, actor_id, actor_username, target_id, target_username)
        values (${occurredAt}, ${occurredAt}, ${ActivityEventType.AdminRecoveryLinkGenerated}, null, ${"Server operator (CLI)"}, ${committed.userId}, ${committed.username})`);
      }),
      5_000,
      "Activity write timed out"
    );
  } catch {
    // Optional history must never hide a committed link; driver errors may contain secrets.
  }
  return committed;
}
