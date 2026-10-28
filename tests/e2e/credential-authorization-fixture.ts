import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { CredentialAuthorizationDatabase } from "../../src/lib/credential-authorizations";
import type { DbTransaction } from "../../src/lib/server-action-locks";
import { createRoleServiceFixture, type RoleServiceFixture, type LockGate } from "./role-service-fixture";

export interface CredentialAuthorizationFixture extends Omit<RoleServiceFixture, "database"> {
  database(gate?: LockGate & { arrive(): Promise<void> }): CredentialAuthorizationDatabase;
}

/** Cleanup is registered before table setup and seeding. Base fixture owns fresh schema/users from mothers. */
export async function createCredentialAuthorizationFixture(
  register: (fixture: CredentialAuthorizationFixture) => void
): Promise<CredentialAuthorizationFixture> {
  const base = await createRoleServiceFixture();
  const dialect = new PgDialect();
  const fixture: CredentialAuthorizationFixture = {
    ...base,
    database(gate) {
      return {
        transaction: (run) =>
          base.database().transaction(async (transaction) => {
            if (!gate) return run(transaction);
            const wrapped = new Proxy(transaction, {
              get(target, property) {
                if (property !== "execute") {
                  const value = Reflect.get(target, property);
                  return typeof value === "function" ? value.bind(target) : value;
                }
                return async (statement: Parameters<DbTransaction["execute"]>[0]) => {
                  const result = await target.execute(statement);
                  const queryText =
                    typeof statement === "string" ? statement : dialect.sqlToQuery(statement.getSQL()).sql;
                  if (queryText.includes('"instance_state"')) await gate.arrive();
                  return result;
                };
              },
            });
            return run(wrapped);
          }),
      } as CredentialAuthorizationDatabase;
    },
  };
  register(fixture);
  try {
    await fixture.database().transaction(async (transaction) => {
      await transaction.execute(
        sql`create table credential_authorizations (like public.credential_authorizations including all)`
      );
      // LIKE INCLUDING ALL does not copy foreign keys. Bind cascade to this schema's users, never public.users.
      await transaction.execute(
        sql`alter table credential_authorizations add constraint credential_authorizations_user_fk foreign key (user_id) references users(id) on delete cascade`
      );
    });
  } catch (error) {
    await fixture.close();
    throw error;
  }
  return fixture;
}
