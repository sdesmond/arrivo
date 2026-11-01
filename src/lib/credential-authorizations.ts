import { createHash, randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { db } from "@/db";
import { credentialAuthorizations, users } from "@/db/schema";
import {
  CredentialAuthorizationPurpose,
  UserRole,
  type CredentialAuthorizationAccount,
  type CredentialAuthorizationFailure,
  type CredentialAuthorizationInput,
  type CredentialIssuanceAuthority,
  type CredentialSecurityClock,
  type ConsumeCredentialAuthorizationResult,
  type IssueCredentialAuthorizationInput,
  type IssueCredentialAuthorizationResult,
  type ValidateCredentialAuthorizationResult,
} from "@/data/types";
import { lockAppAndUsersForUpdate } from "@/lib/account-lifecycle-locks";
import type { DbTransaction } from "@/lib/server-action-locks";

export type CredentialAuthorizationDatabase = Pick<typeof db, "transaction">;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const realClock: CredentialSecurityClock = () => new Date();
const invalid = (): CredentialAuthorizationFailure => ({ ok: false, reason: "invalid" });
const validPurpose = (purpose: CredentialAuthorizationPurpose) =>
  Object.values(CredentialAuthorizationPurpose).includes(purpose);
const digestToken = (token: string) => createHash("sha256").update(token).digest("hex");

interface AccountRow {
  id: string;
  username: string;
  role: string;
  passwordHash: string | null;
}
interface AuthorizationRow extends Omit<AccountRow, "id"> {
  id: string;
  userId: string;
  purpose: CredentialAuthorizationPurpose;
  expiresAt: Date | string;
  consumedAt: Date | null;
  invalidatedAt: Date | null;
}
function eligible(
  account: Pick<AccountRow, "role" | "passwordHash">,
  purpose: CredentialAuthorizationPurpose
): boolean {
  if (purpose === CredentialAuthorizationPurpose.Setup) return account.passwordHash === null;
  return (
    account.passwordHash !== null &&
    (purpose !== CredentialAuthorizationPurpose.Recovery || account.role === UserRole.Admin)
  );
}
function validInput(input: CredentialAuthorizationInput): boolean {
  return typeof input.token === "string" && TOKEN_PATTERN.test(input.token) && validPurpose(input.purpose);
}
function validIssue(authority: CredentialIssuanceAuthority, input: IssueCredentialAuthorizationInput): boolean {
  return (
    UUID_PATTERN.test(input.userId) &&
    validPurpose(input.purpose) &&
    (authority.kind === "trusted-operator"
      ? input.purpose === CredentialAuthorizationPurpose.Recovery
      : authority.kind === "admin" &&
        UUID_PATTERN.test(authority.actorUserId) &&
        (input.purpose !== CredentialAuthorizationPurpose.Reset ||
          authority.actorUserId.toLowerCase() !== input.userId.toLowerCase()) &&
        input.purpose !== CredentialAuthorizationPurpose.Recovery)
  );
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
async function withTransaction<Result>(
  database: CredentialAuthorizationDatabase,
  run: (transaction: DbTransaction) => Promise<Result>
): Promise<Result | CredentialAuthorizationFailure> {
  try {
    return await database.transaction(run);
  } catch (error) {
    if (retryable(error)) return { ok: false, reason: "retry" };
    throw error;
  }
}

/** Caller owns commit/rollback. Never catch SQL failures inside that transaction. Acquires AD-2 locks,
 * so a composing Add User caller must acquire the singleton before creating its account. Tokens are returned once. */
export async function issueCredentialAuthorizationInTransaction(
  transaction: DbTransaction,
  authority: CredentialIssuanceAuthority,
  input: IssueCredentialAuthorizationInput,
  clock: CredentialSecurityClock = realClock
): Promise<IssueCredentialAuthorizationResult> {
  if (!validIssue(authority, input)) return invalid();
  const userId = input.userId.toLowerCase();
  const actorId = authority.kind === "admin" ? authority.actorUserId.toLowerCase() : undefined;
  const ids = actorId ? [actorId, userId] : [userId];
  const scope = await lockAppAndUsersForUpdate(transaction, ids);
  if (!scope.appLocked) return { ok: false, reason: "app-unavailable" };
  const accounts =
    (await transaction.execute(sql`select ${users.id} as "id", ${users.username} as "username", ${users.role} as "role", ${users.passwordHash} as "passwordHash"
    from ${users} where ${users.id} in (${sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `
    )})`)) as unknown as AccountRow[];
  if (actorId) {
    const actor = accounts.find((account) => account.id === actorId);
    if (!actor || actor.role !== UserRole.Admin || actor.passwordHash === null)
      return { ok: false, reason: "forbidden" };
  }
  const account = accounts.find((account) => account.id === userId);
  if (!account || !eligible(account, input.purpose)) return invalid();
  const now = clock();
  const lifetimeMinutes = input.purpose === CredentialAuthorizationPurpose.Setup ? 1440 : 60;
  const expiresAt = new Date(now.getTime() + lifetimeMinutes * 60_000);
  const token = randomBytes(32).toString("base64url");
  await invalidate(transaction, userId, [input.purpose], now);
  await transaction.execute(sql`insert into ${credentialAuthorizations} (id, user_id, purpose, digest, expires_at)
    values (${randomUUID()}, ${userId}, ${input.purpose}, ${digestToken(token)}, ${expiresAt.toISOString()})`);
  return { ok: true, token, expiresAt: expiresAt.toISOString() };
}
export async function issueCredentialAuthorization(
  database: CredentialAuthorizationDatabase,
  authority: CredentialIssuanceAuthority,
  input: IssueCredentialAuthorizationInput,
  clock: CredentialSecurityClock = realClock
): Promise<IssueCredentialAuthorizationResult> {
  if (!validIssue(authority, input)) return invalid();
  return withTransaction(database, (transaction) =>
    issueCredentialAuthorizationInTransaction(transaction, authority, input, clock)
  );
}
async function readAuthorization(
  transaction: DbTransaction,
  input: CredentialAuthorizationInput
): Promise<AuthorizationRow | undefined> {
  const rows =
    (await transaction.execute(sql`select ${credentialAuthorizations.id} as "id", ${credentialAuthorizations.userId} as "userId",
    ${credentialAuthorizations.purpose} as "purpose", ${credentialAuthorizations.expiresAt} as "expiresAt",
    ${credentialAuthorizations.consumedAt} as "consumedAt", ${credentialAuthorizations.invalidatedAt} as "invalidatedAt",
    ${users.username} as "username", ${users.role} as "role", ${users.passwordHash} as "passwordHash"
    from ${credentialAuthorizations} inner join ${users} on ${users.id} = ${credentialAuthorizations.userId}
    where ${credentialAuthorizations.digest} = ${digestToken(input.token)} and ${credentialAuthorizations.purpose} = ${input.purpose}`)) as unknown as AuthorizationRow[];
  return rows[0];
}
function usable(row: AuthorizationRow | undefined, now: Date): row is AuthorizationRow {
  return (
    !!row &&
    row.consumedAt === null &&
    row.invalidatedAt === null &&
    new Date(row.expiresAt).getTime() > now.getTime() &&
    eligible(row, row.purpose)
  );
}
function context(row: AuthorizationRow): CredentialAuthorizationAccount {
  return {
    userId: row.userId,
    username: row.username,
    purpose: row.purpose,
    expiresAt: new Date(row.expiresAt).toISOString(),
  };
}
export async function validateCredentialAuthorization(
  database: CredentialAuthorizationDatabase,
  input: CredentialAuthorizationInput,
  clock: CredentialSecurityClock = realClock
): Promise<ValidateCredentialAuthorizationResult> {
  if (!validInput(input)) return invalid();
  return withTransaction(database, async (transaction) => {
    const row = await readAuthorization(transaction, input);
    return usable(row, clock()) ? { ok: true as const, account: context(row) } : invalid();
  });
}
async function invalidate(
  transaction: DbTransaction,
  userId: string,
  purposes: CredentialAuthorizationPurpose[],
  now: Date
): Promise<void> {
  await transaction.execute(sql`update ${credentialAuthorizations} set invalidated_at = ${now.toISOString()}
    where ${credentialAuthorizations.userId} = ${userId} and ${credentialAuthorizations.purpose} in (${sql.join(
      purposes.map((purpose) => sql`${purpose}`),
      sql`, `
    )})
    and ${credentialAuthorizations.consumedAt} is null and ${credentialAuthorizations.invalidatedAt} is null`);
}

/** Trusted server callback only; no request APIs or client-callable action. All credential writes must use the
 * supplied transaction. Callback failures throw and roll back; callback must not perform external side effects. */
export async function consumeCredentialAuthorization(
  database: CredentialAuthorizationDatabase,
  input: CredentialAuthorizationInput,
  complete: (transaction: DbTransaction, account: CredentialAuthorizationAccount) => Promise<void>,
  clock: CredentialSecurityClock = realClock
): Promise<ConsumeCredentialAuthorizationResult> {
  if (!validInput(input)) return invalid();
  return withTransaction(database, async (transaction) => {
    const initial = await readAuthorization(transaction, input);
    if (!usable(initial, clock())) return invalid();
    const scope = await lockAppAndUsersForUpdate(transaction, [initial.userId]);
    if (!scope.appLocked || !scope.lockedUserIds.has(initial.userId)) return invalid();
    const row = await readAuthorization(transaction, input);
    const now = clock();
    if (!usable(row, now)) return invalid();
    await complete(transaction, context(row));
    const consumed = await transaction.execute(
      sql`update ${credentialAuthorizations} set consumed_at = ${now.toISOString()}
        where ${credentialAuthorizations.id} = ${row.id} and ${credentialAuthorizations.consumedAt} is null
        and ${credentialAuthorizations.invalidatedAt} is null and ${credentialAuthorizations.expiresAt} > ${now.toISOString()}
        returning ${credentialAuthorizations.id}`
    );
    if (consumed.length !== 1) throw new Error("Credential authorization changed during completion.");
    const purposes =
      row.purpose === CredentialAuthorizationPurpose.Setup
        ? [row.purpose]
        : [CredentialAuthorizationPurpose.Reset, CredentialAuthorizationPurpose.Recovery];
    await invalidate(transaction, row.userId, purposes, now);
    return { ok: true as const };
  });
}
