"use server";

import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { db } from "@/db";
import { credentialAuthorizations, mfaRecoveryCodes, trustedDevices, users } from "@/db/schema";
import { SignInNotice, type MfaEnrollmentStart, type SecondFactorInput } from "@/data/types";
import { requireUser } from "@/lib/auth-helpers";
import { accountTarget, checkThrottle, clearFailures, lockoutMessage, recordFailure } from "@/lib/auth-throttle";
import { decryptField, encryptField, isFieldEncryptionConfigured } from "@/lib/field-encryption";
import { generateTotpSecret, totpUri, verifyTotp } from "@/lib/mfa";
import { replaceRecoveryCodes, verifySecondFactor } from "@/lib/mfa-store";
import { bumpSessionVersion, lockCurrentSecurityVersion } from "@/lib/session-version";
import type { DbTransaction } from "@/lib/server-action-locks";
import { DEVICE_COOKIE, forgetTrustedDevice } from "@/lib/trusted-devices";

type RecoveryCodesResult = { recoveryCodes?: string[]; error?: string };

const ALREADY_ON = "Two-factor authentication is already on.";
const EXPIRED_SESSION = "Session expired. Sign in again.";

async function invalidateResetLinks(transaction: DbTransaction, userId: string): Promise<void> {
  await transaction.execute(sql`update ${credentialAuthorizations} set invalidated_at = now()
    where ${credentialAuthorizations.userId} = ${userId} and ${credentialAuthorizations.purpose} in ('reset', 'recovery')
    and ${credentialAuthorizations.consumedAt} is null and ${credentialAuthorizations.invalidatedAt} is null`);
}
// TOTP secrets are stored encrypted, so setup can't work until the install has a data encryption key.
const NEEDS_KEY =
  "Two-factor authentication needs DATA_ENCRYPTION_KEY set on the server. Ask whoever runs this Arrivo install.";

export async function startMfaEnrollment(): Promise<MfaEnrollmentStart | { error: string }> {
  const session = await requireUser();
  const userId = session.id!;
  if (!isFieldEncryptionConfigured()) return { error: NEEDS_KEY };

  const secret = generateTotpSecret();
  const outcome = await db.transaction(async (transaction) => {
    if (!(await lockCurrentSecurityVersion(transaction, userId, session.sessionVersion)))
      return { error: EXPIRED_SESSION };
    const [user] = await transaction
      .select({ mfaEnabledAt: users.mfaEnabledAt, username: users.username })
      .from(users)
      .where(eq(users.id, userId));
    if (user?.mfaEnabledAt) return { error: ALREADY_ON };
    if (!user) return { error: EXPIRED_SESSION };
    await transaction
      .update(users)
      .set({ totpPendingSecret: encryptField(secret) })
      .where(eq(users.id, userId));
    return { username: user.username };
  });
  if (outcome.error) return { error: outcome.error };
  const qrDataUrl = await QRCode.toDataURL(totpUri(outcome.username ?? "", secret), { margin: 1, width: 200 });
  return { secret, qrDataUrl };
}

export async function confirmMfaEnrollment(code: string): Promise<RecoveryCodesResult> {
  const session = await requireUser();
  const userId = session.id!;
  if (!isFieldEncryptionConfigured()) return { error: NEEDS_KEY };
  const throttleTargets = [accountTarget("mfa", userId)];

  const throttle = await checkThrottle(throttleTargets);
  if (throttle.locked) return { error: lockoutMessage(throttle.retryAfterSeconds) };

  const outcome = await db.transaction(async (transaction): Promise<RecoveryCodesResult> => {
    if (!(await lockCurrentSecurityVersion(transaction, userId, session.sessionVersion)))
      return { error: EXPIRED_SESSION };
    const [user] = await transaction
      .select({ mfaEnabledAt: users.mfaEnabledAt, totpPendingSecret: users.totpPendingSecret })
      .from(users)
      .where(eq(users.id, userId));
    if (user?.mfaEnabledAt) return { error: ALREADY_ON };
    if (!user?.totpPendingSecret) return { error: "Start two-factor setup again." };

    const result = verifyTotp(decryptField(user.totpPendingSecret), code, null);
    if (!result.ok) {
      return { error: "That code didn't work. Check your authenticator app and try again." };
    }

    // Bumping the session version here signs out every session that never passed a second factor, this one
    // included. The client shows the codes, then sends the user to sign in again (requireUser() would reject any
    // further server action on this session, so that last step can't be one).
    await transaction
      .update(users)
      .set({
        totpSecret: user.totpPendingSecret,
        totpPendingSecret: null,
        totpLastStep: result.step,
        mfaEnabledAt: new Date(),
        sessionVersion: sql`${users.sessionVersion} + 1`,
      })
      .where(eq(users.id, userId));
    await invalidateResetLinks(transaction, userId);
    await transaction.execute(sql`delete from ${trustedDevices} where ${trustedDevices.userId} = ${userId}`);
    return { recoveryCodes: await replaceRecoveryCodes(transaction, userId) };
  });
  if (outcome.error === "That code didn't work. Check your authenticator app and try again.")
    await recordFailure(throttleTargets);
  else if (!outcome.error) await clearFailures(throttleTargets);
  return outcome;
}

// Changes to an enrolled account need both factors, so a borrowed unlocked session alone can't remove them.
async function checkPasswordAndCode(
  transaction: DbTransaction,
  userId: string,
  { password, code }: SecondFactorInput
): Promise<string | null> {
  const [user] = await transaction
    .select({
      passwordHash: users.passwordHash,
      totpSecret: users.totpSecret,
      totpLastStep: users.totpLastStep,
      mfaEnabledAt: users.mfaEnabledAt,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!user?.mfaEnabledAt) return "Two-factor authentication is not on.";

  const passwordOk = !!user.passwordHash && (await bcrypt.compare(password, user.passwordHash));
  const codeOk =
    passwordOk &&
    (await verifySecondFactor(
      { id: userId, totpSecret: user.totpSecret, totpLastStep: user.totpLastStep },
      code,
      Date.now(),
      transaction
    ));
  if (!codeOk) {
    return "Password or code is incorrect.";
  }
  return null;
}

async function changeMfa(input: SecondFactorInput, disable: boolean): Promise<RecoveryCodesResult> {
  const session = await requireUser();
  const userId = session.id!;
  const throttleTargets = [accountTarget("mfa", userId)];
  const throttle = await checkThrottle(throttleTargets);
  if (throttle.locked) return { error: lockoutMessage(throttle.retryAfterSeconds) };
  const outcome = await db.transaction(async (transaction): Promise<RecoveryCodesResult> => {
    if (!(await lockCurrentSecurityVersion(transaction, userId, session.sessionVersion)))
      return { error: EXPIRED_SESSION };
    const error = await checkPasswordAndCode(transaction, userId, input);
    if (error) return { error };
    await invalidateResetLinks(transaction, userId);
    if (!disable) return { recoveryCodes: await replaceRecoveryCodes(transaction, userId) };
    await transaction
      .update(users)
      .set({
        totpSecret: null,
        totpPendingSecret: null,
        totpLastStep: null,
        mfaEnabledAt: null,
        sessionVersion: sql`${users.sessionVersion} + 1`,
      })
      .where(eq(users.id, userId));
    await transaction.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
    await transaction.execute(sql`delete from ${trustedDevices} where ${trustedDevices.userId} = ${userId}`);
    return {};
  });
  if (outcome.error === "Password or code is incorrect.") await recordFailure(throttleTargets);
  else if (!outcome.error) await clearFailures(throttleTargets);
  if (!outcome.error && disable) await signOut({ redirectTo: `/sign-in?notice=${SignInNotice.MfaDisabled}` });
  return outcome;
}

export async function regenerateRecoveryCodes(input: SecondFactorInput): Promise<RecoveryCodesResult> {
  return changeMfa(input, false);
}

export async function disableMfa(input: SecondFactorInput): Promise<{ error?: string }> {
  return changeMfa(input, true);
}

export async function signOutEverywhere(): Promise<void> {
  const session = await requireUser();
  const current = await db.transaction(async (transaction) => {
    if (!(await lockCurrentSecurityVersion(transaction, session.id!, session.sessionVersion))) return false;
    await bumpSessionVersion(session.id!, transaction);
    return true;
  });
  if (!current) redirect("/sign-in");
  await signOut({ redirectTo: `/sign-in?notice=${SignInNotice.SignedOutEverywhere}` });
}

// Removing a browser signs it out too (its session token names the device). Removing the one making this request
// signs this session out right away instead of leaving it to fail on the next page.
export async function removeTrustedDevice(deviceId: string): Promise<void> {
  const session = await requireUser();
  const cookieJar = await cookies();
  const outcome = await db.transaction(async (transaction) => {
    if (!(await lockCurrentSecurityVersion(transaction, session.id!, session.sessionVersion))) return null;
    return forgetTrustedDevice(session.id!, deviceId, cookieJar.get(DEVICE_COOKIE)?.value, transaction);
  });
  if (!outcome) redirect("/sign-in");
  if (outcome.wasCurrent) {
    cookieJar.delete(DEVICE_COOKIE);
    await signOut({ redirectTo: "/sign-in" });
    return;
  }
  revalidatePath("/profile");
}
