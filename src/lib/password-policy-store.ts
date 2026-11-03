import { sql } from "drizzle-orm";
import type { db } from "@/db";
import type {
  PasswordPolicy,
  PasswordPolicyCommitResult,
  PasswordPolicyField,
  PasswordPolicyReadResult,
} from "@/data/types";
import { lockAppAndUsersForUpdate } from "./account-lifecycle-locks";
import { validatePasswordPolicy } from "./password-policy";

export type PasswordPolicyDatabase = Pick<typeof db, "execute" | "transaction">;

/** The singleton is missing or its stored rules are unusable. Callers must refuse, never fall back to weaker rules. */
export class PasswordPolicyUnavailableError extends Error {
  constructor() {
    super("Password rules are unavailable.");
    this.name = "PasswordPolicyUnavailableError";
  }
}

// Column aliases line up with PasswordPolicy so a row can go straight through validatePasswordPolicy.
const POLICY_COLUMNS = sql`state.password_min_length as "minLength", state.password_max_length as "maxLength",
  state.password_min_uppercase as "minUppercase", state.password_min_numbers as "minNumbers",
  state.password_min_special as "minSpecial"`;

function storedPolicy(row: unknown): PasswordPolicy | undefined {
  const checked = validatePasswordPolicy(row);
  return checked.ok ? checked.policy : undefined;
}

/** Authoritative read for any flow that chooses a password. Throws when the rules cannot be trusted. */
export async function readPasswordPolicy(database: Pick<PasswordPolicyDatabase, "execute">): Promise<PasswordPolicy> {
  const rows = await database.execute(sql`select ${POLICY_COLUMNS} from app_state state where state.id = true`);
  const policy = storedPolicy(rows[0]);
  if (!policy) throw new PasswordPolicyUnavailableError();
  return policy;
}

/** For server pages: the policy, or undefined when it cannot be read so the page can say so instead of crashing. */
export async function loadPasswordPolicy(
  database: Pick<PasswordPolicyDatabase, "execute">
): Promise<PasswordPolicy | undefined> {
  try {
    return await readPasswordPolicy(database);
  } catch {
    return undefined;
  }
}

/** One statement gives authority and policy one MVCC snapshot. Only a completed admin sees the settings. */
export async function readPasswordPolicyForAdmin(
  database: Pick<PasswordPolicyDatabase, "execute">,
  actorId: string
): Promise<PasswordPolicyReadResult> {
  const rows = await database.execute(sql`
    select ${POLICY_COLUMNS}
    from app_state state
    where state.id = true and exists(select 1 from users where id = ${actorId} and role = 'admin' and password_hash is not null)
  `);
  if (!rows[0]) return { status: "forbidden" };
  const policy = storedPolicy(rows[0]);
  return policy ? { status: "ok", policy } : { status: "unavailable" };
}

const FIELD_COLUMNS: Record<PasswordPolicyField, string> = {
  minLength: "password_min_length",
  maxLength: "password_max_length",
  minUppercase: "password_min_uppercase",
  minNumbers: "password_min_numbers",
  minSpecial: "password_min_special",
};

function samePolicy(left: PasswordPolicy, right: PasswordPolicy): boolean {
  return (Object.keys(FIELD_COLUMNS) as PasswordPolicyField[]).every((field) => left[field] === right[field]);
}

/**
 * Compare-and-save under the app and actor locks. Both policies are validated before any lock: a malformed save
 * changes nothing. Returning from the transaction means the commit succeeded.
 */
export async function savePasswordPolicy(
  database: PasswordPolicyDatabase,
  actorId: string,
  policy: unknown,
  expected: unknown
): Promise<PasswordPolicyCommitResult> {
  const next = validatePasswordPolicy(policy);
  if (!next.ok) return { status: "invalid", error: next.error, field: next.field };
  const previous = validatePasswordPolicy(expected);
  if (!previous.ok) return { status: "invalid", error: "The saved rules this change was based on are malformed." };
  return database.transaction(async (transaction): Promise<PasswordPolicyCommitResult> => {
    const scope = await lockAppAndUsersForUpdate(transaction, [actorId]);
    if (!scope.appLocked || !scope.lockedUserIds.has(actorId.toLowerCase())) return { status: "forbidden" };
    const rows = await transaction.execute(sql`
      select users.role, users.password_hash as "passwordHash", ${POLICY_COLUMNS}
      from users cross join app_state state where users.id = ${actorId} and state.id = true
    `);
    const actor = rows[0];
    if (!actor || actor.role !== "admin" || actor.passwordHash === null) return { status: "forbidden" };
    // A row that fails validation can never equal what the admin saw, so it reads as stale and gets refreshed.
    const current = storedPolicy(actor);
    if (!current || !samePolicy(current, previous.policy)) return { status: "stale" };
    const changed = !samePolicy(current, next.policy);
    if (changed) {
      await transaction.execute(sql`
        update app_state set
          password_min_length = ${next.policy.minLength}, password_max_length = ${next.policy.maxLength},
          password_min_uppercase = ${next.policy.minUppercase}, password_min_numbers = ${next.policy.minNumbers},
          password_min_special = ${next.policy.minSpecial}
        where id = true
      `);
    }
    return { status: "ok", policy: next.policy, changed };
  });
}
