"use server";

import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { eq, sql } from "drizzle-orm";
import { signOut } from "@/auth";
import { db } from "@/db";
import { mfaRecoveryCodes, users } from "@/db/schema";
import { SignInNotice, type MfaEnrollmentStart, type SecondFactorInput } from "@/data/types";
import { requireUser } from "@/lib/auth-helpers";
import { accountTarget, checkThrottle, clearFailures, lockoutMessage, recordFailure } from "@/lib/auth-throttle";
import { decryptField, encryptField } from "@/lib/field-encryption";
import { generateTotpSecret, totpUri, verifyTotp } from "@/lib/mfa";
import { replaceRecoveryCodes, verifySecondFactor } from "@/lib/mfa-store";
import { bumpSessionVersion } from "@/lib/session-version";
import { forgetTrustedDevice as deleteTrustedDevice } from "@/lib/trusted-devices";
import { revalidatePath } from "next/cache";

type RecoveryCodesResult = { recoveryCodes?: string[]; error?: string };

const ALREADY_ON = "Two-factor authentication is already on.";

export async function startMfaEnrollment(): Promise<MfaEnrollmentStart | { error: string }> {
  const session = await requireUser();
  const userId = session.id!;

  const [user] = await db.select({ mfaEnabledAt: users.mfaEnabledAt }).from(users).where(eq(users.id, userId));
  if (user?.mfaEnabledAt) return { error: ALREADY_ON };

  // Held as pending until the user proves their app has it, so a half-finished setup never locks them out.
  const secret = generateTotpSecret();
  await db
    .update(users)
    .set({ totpPendingSecret: encryptField(secret) })
    .where(eq(users.id, userId));

  const qrDataUrl = await QRCode.toDataURL(totpUri(session.email ?? "", secret), { margin: 1, width: 200 });
  return { secret, qrDataUrl };
}

export async function confirmMfaEnrollment(code: string): Promise<RecoveryCodesResult> {
  const session = await requireUser();
  const userId = session.id!;
  const throttleTargets = [accountTarget("mfa", userId)];

  const throttle = await checkThrottle(throttleTargets);
  if (throttle.locked) return { error: lockoutMessage(throttle.retryAfterSeconds) };

  const [user] = await db
    .select({ mfaEnabledAt: users.mfaEnabledAt, totpPendingSecret: users.totpPendingSecret })
    .from(users)
    .where(eq(users.id, userId));
  if (user?.mfaEnabledAt) return { error: ALREADY_ON };
  if (!user?.totpPendingSecret) return { error: "Start two-factor setup again." };

  const result = verifyTotp(decryptField(user.totpPendingSecret), code, null);
  if (!result.ok) {
    await recordFailure(throttleTargets);
    return { error: "That code didn't work. Check your authenticator app and try again." };
  }
  await clearFailures(throttleTargets);

  // Bumping the session version here signs out every session that never passed a second factor, this one
  // included. The client shows the codes, then sends the user to sign in again (proxy.ts would reject any
  // further request on this session, so that last step can't be a server action).
  const recoveryCodes = await db.transaction(async (transaction) => {
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
    return replaceRecoveryCodes(transaction, userId);
  });
  return { recoveryCodes };
}

// Changes to an enrolled account need both factors, so a borrowed unlocked session alone can't remove them.
async function checkPasswordAndCode(userId: string, { password, code }: SecondFactorInput): Promise<string | null> {
  const throttleTargets = [accountTarget("mfa", userId)];
  const throttle = await checkThrottle(throttleTargets);
  if (throttle.locked) return lockoutMessage(throttle.retryAfterSeconds);

  const [user] = await db
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
    (await verifySecondFactor({ id: userId, totpSecret: user.totpSecret, totpLastStep: user.totpLastStep }, code));
  if (!codeOk) {
    await recordFailure(throttleTargets);
    return "Password or code is incorrect.";
  }

  await clearFailures(throttleTargets);
  return null;
}

export async function regenerateRecoveryCodes(input: SecondFactorInput): Promise<RecoveryCodesResult> {
  const session = await requireUser();
  const error = await checkPasswordAndCode(session.id!, input);
  if (error) return { error };

  // One transaction, so a failed insert can't leave the user with their old codes deleted and no new ones.
  return { recoveryCodes: await db.transaction((transaction) => replaceRecoveryCodes(transaction, session.id!)) };
}

export async function disableMfa(input: SecondFactorInput): Promise<{ error?: string }> {
  const session = await requireUser();
  const userId = session.id!;
  const error = await checkPasswordAndCode(userId, input);
  if (error) return { error };

  await db.transaction(async (transaction) => {
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
  });

  await signOut({ redirectTo: `/sign-in?notice=${SignInNotice.MfaDisabled}` });
  return {};
}

export async function signOutEverywhere(): Promise<void> {
  const session = await requireUser();
  await bumpSessionVersion(session.id!);
  await signOut({ redirectTo: `/sign-in?notice=${SignInNotice.SignedOutEverywhere}` });
}

export async function forgetTrustedDevice(deviceId: string): Promise<void> {
  const session = await requireUser();
  await deleteTrustedDevice(session.id!, deviceId);
  revalidatePath("/profile");
}
