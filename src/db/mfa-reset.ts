import type postgres from "postgres";

// Turns two-factor off for one account, for the owner of an install when a user has lost both their phone and
// their recovery codes (there is no email-based recovery). Also signs that user out everywhere.
export async function resetMfa(sql: postgres.Sql, username: string): Promise<boolean> {
  return sql.begin(async (transaction) => {
    const [user] = await transaction<{ id: string }[]>`
      update users
      set totp_secret = null, totp_pending_secret = null, totp_last_step = null, mfa_enabled_at = null,
        session_version = session_version + 1
      where lower(username) = lower(${username})
      returning id
    `;
    if (!user) return false;

    await transaction`delete from mfa_recovery_codes where user_id = ${user.id}`;
    await transaction`delete from auth_throttle where key = ${`mfa:${user.id}`}`;
    return true;
  }) as Promise<boolean>;
}
