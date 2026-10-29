import { sql } from "drizzle-orm";
import { trustedDevices, users } from "@/db/schema";
import { CredentialAuthorizationPurpose, type CredentialSecurityClock } from "@/data/types";
import { consumeCredentialAuthorization, type CredentialAuthorizationDatabase } from "@/lib/credential-authorizations";

export interface PasswordResetInput {
  token: string;
  passwordHash: string;
}

export type PasswordResetResult =
  | { ok: true; userId: string; username: string }
  | { ok: false; reason: "unavailable" | "retry" };

class AccountUnavailable extends Error {}

/** The authorization lifecycle owns the account lock and rolls all writes back together. */
export async function completePasswordReset(
  database: CredentialAuthorizationDatabase,
  { token, passwordHash }: PasswordResetInput,
  clock?: CredentialSecurityClock
): Promise<PasswordResetResult> {
  let completed: { userId: string; username: string } | undefined;
  try {
    const result = await consumeCredentialAuthorization(
      database,
      { token, purpose: CredentialAuthorizationPurpose.Reset },
      async (transaction, account) => {
        const updated = await transaction.execute(sql`update ${users}
          set password_hash = ${passwordHash}, session_version = ${users.sessionVersion} + 1, totp_pending_secret = null
          where ${users.id} = ${account.userId} and ${users.passwordHash} is not null returning ${users.id}`);
        if (updated.length !== 1) throw new AccountUnavailable();
        await transaction.execute(
          sql`delete from ${trustedDevices} where ${trustedDevices.userId} = ${account.userId}`
        );
        completed = { userId: account.userId, username: account.username };
      },
      clock
    );
    if (!result.ok && result.reason === "retry") return { ok: false, reason: "retry" };
    return result.ok && completed ? { ok: true, ...completed } : { ok: false, reason: "unavailable" };
  } catch (error) {
    if (error instanceof AccountUnavailable) return { ok: false, reason: "unavailable" };
    throw error;
  }
}
