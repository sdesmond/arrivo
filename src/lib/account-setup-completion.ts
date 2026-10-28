import { sql } from "drizzle-orm";
import { users } from "@/db/schema";
import { CredentialAuthorizationPurpose, type CredentialSecurityClock } from "@/data/types";
import { consumeCredentialAuthorization, type CredentialAuthorizationDatabase } from "@/lib/credential-authorizations";

export interface AccountSetupCompletionInput {
  token: string;
  name: string;
  passwordHash: string;
}

export type AccountSetupCompletionResult =
  | { ok: true; userId: string; username: string }
  | { ok: false; reason: "unavailable" | "retry" };

const UNAVAILABLE: AccountSetupCompletionResult = { ok: false, reason: "unavailable" };

class PasswordAlreadySet extends Error {}

/**
 * Saves name and password hash and consumes the setup link in one account-locked transaction. The guarded update
 * (`password_hash is null`) means a repeated or concurrent completion changes nothing and reads as unavailable.
 * A dead link or already-complete account is the generic unavailable result; a retryable conflict stays distinct.
 */
export async function completeAccountSetup(
  database: CredentialAuthorizationDatabase,
  { token, name, passwordHash }: AccountSetupCompletionInput,
  clock?: CredentialSecurityClock
): Promise<AccountSetupCompletionResult> {
  let completed: { userId: string; username: string } | undefined;
  try {
    const result = await consumeCredentialAuthorization(
      database,
      { token, purpose: CredentialAuthorizationPurpose.Setup },
      async (transaction, account) => {
        const updated = await transaction.execute(
          sql`update ${users} set name = ${name}, password_hash = ${passwordHash}
            where ${users.id} = ${account.userId} and ${users.passwordHash} is null
            returning ${users.id}`
        );
        if (updated.length !== 1) throw new PasswordAlreadySet();
        completed = { userId: account.userId, username: account.username };
      },
      clock
    );
    // A transient conflict saved nothing and the link is still live: the caller can offer another try.
    if (!result.ok && result.reason === "retry") return { ok: false, reason: "retry" };
    if (!result.ok || !completed) return UNAVAILABLE;
    return { ok: true, ...completed };
  } catch (error) {
    if (error instanceof PasswordAlreadySet) return UNAVAILABLE;
    throw error;
  }
}
