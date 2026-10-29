import "dotenv/config";
import postgres from "postgres";
import type { CollaboratorRole, UserRole } from "../../src/data/types";
import {
  createDeletionConcurrencyFixture,
  type DeletionConcurrencyFixture,
  type HeldInsert,
} from "./deletion-concurrency-fixture";

export interface AdminDeletionAccountSpec {
  key: string;
  role: UserRole;
  /** Completed accounts have a password hash; unfinished ones do not. */
  completed: boolean;
}

export interface AdminDeletionFixture extends Omit<DeletionConcurrencyFixture, "seedUsers"> {
  seedAccounts(specs: AdminDeletionAccountSpec[]): Promise<void>;
  /** The admin as the service sees them: ID plus the session version the sign-in would carry. */
  actor(key: string): Promise<{ id: string; sessionVersion: number }>;
  setMembership(tripKey: string, userKey: string, role: CollaboratorRole, addedAt: string): Promise<void>;
  removeMembership(tripKey: string, userKey: string): Promise<void>;
  /** A collaborator row without an account, which can never inherit. */
  addSeat(tripKey: string, name: string): Promise<void>;
  /** The key of whichever user has the lower ID, the final successor tie-break. */
  lowerIdKey(firstKey: string, secondKey: string): string;
  /** Executes the admin deletion runs to hold the singleton, every affected user and the target's trips. */
  lockCount(targetKey: string, actorKey: string): Promise<number>;
  /** Holds an uncommitted role change under the app singleton and the user's row, as the role service would. */
  holdRoleChange(userKey: string, role: UserRole): Promise<HeldInsert>;
  completedAdminCount(): Promise<number>;
  tripExists(tripKey: string): Promise<boolean>;
  creatorCount(tripKey: string): Promise<number>;
}

/**
 * An isolated schema for admin deletion against real Postgres: scenario-owned accounts (completed or pending, admin or
 * member), trips and memberships with controllable added-at times. Reuses the deletion-concurrency lock gates.
 */
export async function createAdminDeletionFixture(
  register: (fixture: AdminDeletionFixture) => void
): Promise<AdminDeletionFixture> {
  const base = await createDeletionConcurrencyFixture();
  const { schema } = base;
  const client = postgres(process.env.E2E_DATABASE_URL!, { max: 3 });
  const lowerIds = (firstKey: string, secondKey: string) =>
    base.userId(firstKey) < base.userId(secondKey) ? firstKey : secondKey;

  const fixture: AdminDeletionFixture = {
    ...base,
    async seedAccounts(specs) {
      await base.seedUsers(specs.map(({ key, role }) => ({ key, role })));
      for (const spec of specs) {
        if (!spec.completed) {
          await client.unsafe(`update "${schema}".users set password_hash = null where id = $1`, [
            base.userId(spec.key),
          ]);
        }
      }
    },
    async actor(key) {
      const [row] = await client.unsafe(`select session_version from "${schema}".users where id = $1`, [
        base.userId(key),
      ]);
      return { id: base.userId(key), sessionVersion: row.session_version as number };
    },
    async setMembership(tripKey, userKey, role, addedAt) {
      const existing = await client.unsafe(
        `update "${schema}".collaborators set role = $3, added_at = $4 where trip_id = $1 and user_id = $2 returning id`,
        [base.tripId(tripKey), base.userId(userKey), role, addedAt]
      );
      if (existing.length > 0) return;
      await client.unsafe(
        `insert into "${schema}".collaborators (trip_id, user_id, name, initials, role, is_creator, added_at)
         values ($1, $2, $3, 'ME', $4, false, $5)`,
        [base.tripId(tripKey), base.userId(userKey), userKey, role, addedAt]
      );
    },
    async removeMembership(tripKey, userKey) {
      await client.unsafe(`delete from "${schema}".collaborators where trip_id = $1 and user_id = $2`, [
        base.tripId(tripKey),
        base.userId(userKey),
      ]);
    },
    async addSeat(tripKey, name) {
      await client.unsafe(
        `insert into "${schema}".collaborators (trip_id, user_id, name, initials, role, is_creator)
         values ($1, null, $2, 'ES', 'editor', false)`,
        [base.tripId(tripKey), name]
      );
    },
    lowerIdKey: lowerIds,
    async lockCount(targetKey, actorKey) {
      const [users] = await client.unsafe(
        `select count(distinct id)::int as total from (
           select $1::uuid as id union select $2::uuid
           union select c.user_id from "${schema}".collaborators c
             join "${schema}".trips t on t.id = c.trip_id
            where t.owner_id = $1 and c.user_id is not null
         ) affected`,
        [base.userId(targetKey), base.userId(actorKey)]
      );
      const [target] = await client.unsafe(
        `select role, password_hash is not null as completed from "${schema}".users where id = $1`,
        [base.userId(targetKey)]
      );
      const guard = target.role === "admin" && target.completed ? 1 : 0;
      // The singleton, each affected user, the last-admin guard when it applies, then each owned trip.
      return 1 + (users.total as number) + guard + (await base.ownedTripCount(targetKey));
    },
    async holdRoleChange(userKey, role) {
      const connection = await client.reserve();
      try {
        await connection.unsafe("begin");
        await connection.unsafe(`select id from "${schema}".app_state where id = true for update`);
        await connection.unsafe(`select id from "${schema}".users where id = $1 for update`, [base.userId(userKey)]);
        await connection.unsafe(`update "${schema}".users set role = $2 where id = $1`, [base.userId(userKey), role]);
      } catch (error) {
        await connection.unsafe("rollback").catch(() => undefined);
        connection.release();
        throw error;
      }
      return {
        async release() {
          try {
            await connection.unsafe("commit");
          } finally {
            connection.release();
          }
        },
      };
    },
    async completedAdminCount() {
      const [row] = await client.unsafe(
        `select count(*)::int as total from "${schema}".users where role = 'admin' and password_hash is not null`
      );
      return row.total as number;
    },
    async tripExists(tripKey) {
      const rows = await client.unsafe(`select 1 from "${schema}".trips where id = $1`, [base.tripId(tripKey)]);
      return rows.length > 0;
    },
    async creatorCount(tripKey) {
      const [row] = await client.unsafe(
        `select count(*)::int as total from "${schema}".collaborators where trip_id = $1 and is_creator`,
        [base.tripId(tripKey)]
      );
      return row.total as number;
    },
    async close() {
      try {
        await client.end();
      } finally {
        await base.close();
      }
    },
  };
  register(fixture);
  return fixture;
}
