import { sql } from "drizzle-orm";
import {
  createCredentialAuthorizationFixture,
  type CredentialAuthorizationFixture,
} from "./credential-authorization-fixture";

/** All rows and copied tables belong to this scenario's isolated schema. */
export async function createAdminRecoveryIssuanceFixture(
  register: (fixture: CredentialAuthorizationFixture) => void
): Promise<CredentialAuthorizationFixture> {
  const fixture = await createCredentialAuthorizationFixture(register);
  await fixture.database().transaction(async (transaction) => {
    for (const table of ["activity_events", "trusted_devices", "mfa_recovery_codes", "sessions"]) {
      await transaction.execute(sql.raw(`create table ${table} (like public.${table} including all)`));
    }
  });
  await fixture.seedUsers([
    { key: "admin", role: "admin", completed: true },
    { key: "target", role: "admin", completed: true },
    { key: "member", role: "member", completed: true },
    { key: "pending", role: "admin", completed: false },
  ]);
  await fixture.database().transaction(async (transaction) => {
    for (const key of ["admin", "target", "member", "pending"]) {
      await transaction.execute(sql`update users set username = ${key} where id = ${fixture.userId(key)}`);
    }
    const userId = fixture.userId("target");
    await transaction.execute(
      sql`update users set session_version = 7, totp_secret = 'opaque-secret', totp_pending_secret = 'opaque-pending', totp_last_step = 12, mfa_enabled_at = '2026-10-01T12:00:00Z' where id = ${userId}`
    );
    await transaction.execute(
      sql`insert into trusted_devices (user_id, token_hash, label, session_version, mfa_remembered_until) values (${userId}, 'device-digest', 'Browser', 7, '2026-11-01T12:00:00Z')`
    );
    await transaction.execute(
      sql`insert into mfa_recovery_codes (user_id, code_hash) values (${userId}, 'code-digest')`
    );
    await transaction.execute(
      sql`insert into sessions (session_token, user_id, expires) values ('session-placeholder', ${userId}, '2026-11-01T12:00:00Z')`
    );
  });
  return fixture;
}
