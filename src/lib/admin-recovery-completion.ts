import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { authThrottle, credentialAuthorizations, trustedDevices, users } from "@/db/schema";
import {
  CredentialAuthorizationPurpose,
  UserRole,
  type AdminRecoveryCompletionInput,
  type AdminRecoveryCompletionResult,
  type AdminRecoveryEnrollmentResult,
  type CredentialSecurityClock,
} from "@/data/types";
import { consumeCredentialAuthorization, type CredentialAuthorizationDatabase } from "@/lib/credential-authorizations";
import { decryptField, encryptField, isFieldEncryptionConfigured } from "@/lib/field-encryption";
import { generateTotpSecret, verifyTotp } from "@/lib/mfa";
import { replaceRecoveryCodes } from "@/lib/mfa-store";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const realClock: CredentialSecurityClock = () => new Date();
const digestToken = (token: string) => createHash("sha256").update(token).digest("hex");

class InvalidCode extends Error {}
class AccountUnavailable extends Error {}

function retryable(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth++) {
    const { code, cause } = current as { code?: unknown; cause?: unknown };
    if (code === "40P01" || code === "40001") return true;
    current = cause;
  }
  return false;
}

/**
 * Creates the replacement TOTP secret for this recovery authorization once, then returns the same one on every
 * later call (the null-only conditional update makes concurrent reloads agree). The secret lives encrypted on the
 * authorization, so opening or abandoning a link never touches the account's active or profile-pending MFA.
 */
export async function startAdminRecoveryEnrollment(
  database: CredentialAuthorizationDatabase,
  token: string,
  clock: CredentialSecurityClock = realClock
): Promise<AdminRecoveryEnrollmentResult> {
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) return { ok: false, reason: "unavailable" };
  if (!isFieldEncryptionConfigured()) return { ok: false, reason: "needs-key" };
  const digest = digestToken(token);
  try {
    return await database.transaction(async (transaction): Promise<AdminRecoveryEnrollmentResult> => {
      const now = clock().toISOString();
      const usable = sql`${credentialAuthorizations.digest} = ${digest}
        and ${credentialAuthorizations.purpose} = ${CredentialAuthorizationPurpose.Recovery}
        and ${credentialAuthorizations.consumedAt} is null and ${credentialAuthorizations.invalidatedAt} is null
        and ${credentialAuthorizations.expiresAt} > ${now}
        and ${users.role} = ${UserRole.Admin} and ${users.passwordHash} is not null`;
      await transaction.execute(sql`update ${credentialAuthorizations}
        set pending_totp_secret = ${encryptField(generateTotpSecret())}
        from ${users}
        where ${users.id} = ${credentialAuthorizations.userId} and ${credentialAuthorizations.pendingTotpSecret} is null
        and ${usable}`);
      const rows = (await transaction.execute(sql`select ${credentialAuthorizations.pendingTotpSecret} as "secret",
        ${users.username} as "username"
        from ${credentialAuthorizations} inner join ${users} on ${users.id} = ${credentialAuthorizations.userId}
        where ${usable}`)) as unknown as { secret: string | null; username: string }[];
      const row = rows[0];
      if (!row?.secret) return { ok: false, reason: "unavailable" };
      return { ok: true, secret: decryptField(row.secret), username: row.username };
    });
  } catch (error) {
    if (retryable(error)) return { ok: false, reason: "retry" };
    throw error;
  }
}

/**
 * Verifies the replacement code against the pending secret and, in the authorization lifecycle's account-locked
 * transaction, replaces password, TOTP secret and recovery codes, bumps `session_version`, forgets trusted devices
 * and (via the lifecycle) invalidates sibling reset/recovery links. Any failure rolls everything back, so a wrong
 * code keeps the pending secret and the link. Codes are returned here only; they cannot be shown again.
 */
export async function completeAdminRecovery(
  database: CredentialAuthorizationDatabase,
  { token, passwordHash, code }: AdminRecoveryCompletionInput,
  clock: CredentialSecurityClock = realClock
): Promise<AdminRecoveryCompletionResult> {
  let completed: { userId: string; username: string; recoveryCodes: string[] } | undefined;
  try {
    const result = await consumeCredentialAuthorization(
      database,
      { token, purpose: CredentialAuthorizationPurpose.Recovery },
      async (transaction, account) => {
        const rows = (await transaction.execute(sql`select ${credentialAuthorizations.pendingTotpSecret} as "secret"
          from ${credentialAuthorizations}
          where ${credentialAuthorizations.digest} = ${digestToken(token)}
          and ${credentialAuthorizations.purpose} = ${CredentialAuthorizationPurpose.Recovery}`)) as unknown as {
          secret: string | null;
        }[];
        const pending = rows[0]?.secret;
        if (!pending) throw new InvalidCode();
        const now = clock();
        const verified = verifyTotp(decryptField(pending), code, null, now.getTime());
        if (!verified.ok) throw new InvalidCode();
        const updated = await transaction.execute(sql`update ${users}
          set password_hash = ${passwordHash}, totp_secret = ${pending}, totp_pending_secret = null,
          totp_last_step = ${verified.step}, mfa_enabled_at = ${now.toISOString()},
          session_version = ${users.sessionVersion} + 1
          where ${users.id} = ${account.userId} and ${users.role} = ${UserRole.Admin} and ${users.passwordHash} is not null
          returning ${users.id}`);
        if (updated.length !== 1) throw new AccountUnavailable();
        await transaction.execute(
          sql`delete from ${trustedDevices} where ${trustedDevices.userId} = ${account.userId}`
        );
        // The active secret now lives on the user; the authorization must not keep an encrypted copy.
        await transaction.execute(sql`update ${credentialAuthorizations} set pending_totp_secret = null
          where ${credentialAuthorizations.digest} = ${digestToken(token)}
          and ${credentialAuthorizations.purpose} = ${CredentialAuthorizationPurpose.Recovery}`);
        // A lockout at the old second factor must not outlive the replacement of that factor.
        await transaction.execute(
          sql`delete from ${authThrottle} where ${authThrottle.key} = ${`mfa:${account.userId}`}`
        );
        completed = {
          userId: account.userId,
          username: account.username,
          recoveryCodes: await replaceRecoveryCodes(transaction, account.userId),
        };
      },
      clock
    );
    if (!result.ok && result.reason === "retry") return { ok: false, reason: "retry" };
    return result.ok && completed ? { ok: true, ...completed } : { ok: false, reason: "unavailable" };
  } catch (error) {
    if (error instanceof InvalidCode) return { ok: false, reason: "invalid-code" };
    if (error instanceof AccountUnavailable) return { ok: false, reason: "unavailable" };
    throw error;
  }
}
