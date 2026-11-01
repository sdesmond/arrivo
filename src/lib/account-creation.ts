import { sql } from "drizzle-orm";
import type { db } from "@/db";
import { users } from "@/db/schema";
import {
  AddUserFailure,
  CredentialAuthorizationPurpose,
  UserRole,
  type AddUserInput,
  type AddUserOutcome,
  type CredentialSecurityClock,
} from "@/data/types";
import { lockAppAndUsersForUpdate } from "@/lib/account-lifecycle-locks";
import { issueCredentialAuthorizationInTransaction } from "@/lib/credential-authorizations";
import { normalizeUsername, validateUsername } from "@/lib/username";

export type AddUserDatabase = Pick<typeof db, "transaction">;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RETRYABLE_SQLSTATES = new Set(["40P01", "40001"]);
const UNIQUE_VIOLATION = "23505";
const MAX_CAUSE_DEPTH = 5;
const realClock: CredentialSecurityClock = () => new Date();

type Failure = Extract<AddUserOutcome, { ok: false }>;
const fail = (reason: Failure["reason"], message?: string): Failure =>
  message === undefined ? { ok: false, reason } : { ok: false, reason, message };

// Thrown inside the transaction so a refusal after the insert rolls the new account back with it.
class RollbackWithFailure extends Error {
  constructor(readonly failure: Failure) {
    super(`Add user refused: ${failure.reason}`);
  }
}

function hasSqlState(error: unknown, codes: ReadonlySet<string> | string): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && typeof current === "object" && current !== null; depth++) {
    const { code, cause } = current as { code?: unknown; cause?: unknown };
    if (typeof code === "string" && (typeof codes === "string" ? code === codes : codes.has(code))) return true;
    current = cause;
  }
  return false;
}

// Request-independent: the caller authenticates and passes the actor ID. The account and its 24-hour setup
// authorization are written in one transaction under the AD-2 locks, so a refusal or failure leaves neither. The
// token is returned once; the adapter builds the link from the trusted origin.
export async function addUser(
  database: AddUserDatabase,
  actorUserId: string,
  input: AddUserInput,
  clock: CredentialSecurityClock = realClock
): Promise<AddUserOutcome> {
  const username = normalizeUsername(input.username);
  const message = validateUsername(input.username);
  if (message) return fail(AddUserFailure.InvalidUsername, message);
  if (!UUID_PATTERN.test(actorUserId)) return fail(AddUserFailure.Forbidden);
  const actorId = actorUserId.toLowerCase();

  try {
    return await database.transaction(async (transaction): Promise<AddUserOutcome> => {
      const scope = await lockAppAndUsersForUpdate(transaction, [actorId]);
      if (!scope.appLocked) return fail(AddUserFailure.AppUnavailable);
      if (!scope.lockedUserIds.has(actorId)) return fail(AddUserFailure.Forbidden);

      const actorRows = (await transaction.execute(
        sql`select ${users.id} as "id", ${users.username} as "username", ${users.role} as "role", ${users.passwordHash} as "passwordHash"
          from ${users} where ${users.id} = ${actorId}`
      )) as unknown as { id: string; username: string; role: string; passwordHash: string | null }[];
      const actor = actorRows[0];
      if (!actor || actor.role !== UserRole.Admin || actor.passwordHash === null) {
        return fail(AddUserFailure.Forbidden);
      }

      const existing = await transaction.execute(
        sql`select ${users.id} from ${users} where lower(${users.username}) = ${username} limit 1`
      );
      if (existing.length > 0) return fail(AddUserFailure.UsernameTaken);

      const inserted = (await transaction.execute(
        sql`insert into ${users} (username, role) values (${username}, ${UserRole.Member}) returning ${users.id} as "id"`
      )) as unknown as { id: string }[];
      const userId = inserted[0].id;

      const issued = await issueCredentialAuthorizationInTransaction(
        transaction,
        { kind: "admin", actorUserId: actorId },
        { userId, purpose: CredentialAuthorizationPurpose.Setup },
        clock
      );
      if (!issued.ok) {
        if (issued.reason === "forbidden") throw new RollbackWithFailure(fail(AddUserFailure.Forbidden));
        if (issued.reason === "app-unavailable") {
          throw new RollbackWithFailure(fail(AddUserFailure.AppUnavailable));
        }
        if (issued.reason === "retry") throw new RollbackWithFailure(fail(AddUserFailure.Retry));
        throw new Error("Setup authorization could not be issued for the new account.");
      }

      return {
        ok: true,
        userId,
        username,
        token: issued.token,
        expiresAt: issued.expiresAt,
        actor: { id: actor.id, username: actor.username },
      };
    });
  } catch (error) {
    if (error instanceof RollbackWithFailure) return error.failure;
    if (hasSqlState(error, UNIQUE_VIOLATION)) return fail(AddUserFailure.UsernameTaken);
    if (hasSqlState(error, RETRYABLE_SQLSTATES)) return fail(AddUserFailure.Retry);
    throw error;
  }
}
