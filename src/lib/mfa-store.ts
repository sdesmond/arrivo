import "server-only";
import { and, count, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { mfaRecoveryCodes, users } from "@/db/schema";
import type { MfaStatus } from "@/data/types";
import { decryptField } from "./field-encryption";
import { generateRecoveryCodes, hashRecoveryCode, isRecoveryCodeFormat, verifyTotp } from "./mfa";
import type { DbTransaction } from "./server-action-locks";

export interface SecondFactorUser {
  id: string;
  totpSecret: string | null;
  totpLastStep: number | null;
}

// Both paths are single conditional UPDATEs, so two concurrent sign-ins can't spend the same code twice.
async function consumeTotpCode(user: SecondFactorUser & { totpSecret: string }, code: string, now: number) {
  const result = verifyTotp(decryptField(user.totpSecret), code, user.totpLastStep, now);
  if (!result.ok) return false;

  const updated = await db
    .update(users)
    .set({ totpLastStep: result.step })
    .where(and(eq(users.id, user.id), or(isNull(users.totpLastStep), lt(users.totpLastStep, result.step))))
    .returning({ id: users.id });
  return updated.length > 0;
}

async function consumeRecoveryCode(userId: string, code: string) {
  const updated = await db
    .update(mfaRecoveryCodes)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(mfaRecoveryCodes.userId, userId),
        eq(mfaRecoveryCodes.codeHash, hashRecoveryCode(code)),
        isNull(mfaRecoveryCodes.usedAt)
      )
    )
    .returning({ id: mfaRecoveryCodes.id });
  return updated.length > 0;
}

// Accepts either a 6-digit authenticator code or a one-time recovery code.
export async function verifySecondFactor(user: SecondFactorUser, code: string, now = Date.now()): Promise<boolean> {
  if (!user.totpSecret) return false;
  if (isRecoveryCodeFormat(code)) return consumeRecoveryCode(user.id, code);
  return consumeTotpCode({ ...user, totpSecret: user.totpSecret }, code, now);
}

// Returns the plaintext codes for one-time display; only their hashes are stored.
export async function replaceRecoveryCodes(executor: DbTransaction | typeof db, userId: string): Promise<string[]> {
  const codes = generateRecoveryCodes();
  await executor.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
  await executor.insert(mfaRecoveryCodes).values(codes.map((code) => ({ userId, codeHash: hashRecoveryCode(code) })));
  return codes;
}

export async function getMfaStatus(userId: string): Promise<MfaStatus> {
  const [[user], [unused]] = await Promise.all([
    db.select({ mfaEnabledAt: users.mfaEnabledAt }).from(users).where(eq(users.id, userId)),
    db
      .select({ count: count() })
      .from(mfaRecoveryCodes)
      .where(and(eq(mfaRecoveryCodes.userId, userId), isNull(mfaRecoveryCodes.usedAt))),
  ]);

  if (!user?.mfaEnabledAt) return { enabled: false, recoveryCodesRemaining: 0 };
  return { enabled: true, enabledAt: user.mfaEnabledAt.toISOString(), recoveryCodesRemaining: unused?.count ?? 0 };
}
