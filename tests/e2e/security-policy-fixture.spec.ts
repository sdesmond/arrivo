import { expect, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import postgres from "postgres";
import { DEFAULT_PASSWORD_POLICY, type PasswordPolicy } from "../../src/data/types";
import {
  POLICY_APP_BASE_PORT,
  POLICY_APP_SLOTS,
  applyMigrations,
  cloneSecurityPolicyUserMother,
  createSecurityPolicyApp,
  policyAppDatabaseUrl,
  policyAppDistDirectory,
  policyAppPort,
  policyAppStorageDirectory,
  type SecurityPolicyApp,
} from "./security-policy-fixture";

// Self-tests for the password-policy fixture. They need only a database (no app process), so they run in the
// "fixtures" Playwright project after global-setup, like the scenario-fixture self-tests.

const STRICT: PasswordPolicy = {
  minLength: 10,
  maxLength: 15,
  minUppercase: 2,
  minNumbers: 2,
  minSpecial: 2,
};

async function databaseExists(name: string): Promise<boolean> {
  const admin = postgres(process.env.E2E_DATABASE_URL!, { max: 1 });
  try {
    const rows = await admin`select 1 from pg_database where datname = ${name}`;
    return rows.length > 0;
  } finally {
    await admin.end();
  }
}

test.describe("E2E password-policy fixture", () => {
  const slot = () => test.info().parallelIndex;
  let app: SecurityPolicyApp | undefined;

  test.afterEach(async () => {
    await app?.stop();
    app = undefined;
  });

  test("derives a distinct database, port and caches per slot, and refuses slots it cannot isolate", () => {
    const source = "postgres://arrivo:secret@localhost:5432/arrivo_e2e?sslmode=disable";
    const urls = Array.from({ length: POLICY_APP_SLOTS }, (_, index) => policyAppDatabaseUrl(source, index));
    expect(new Set(urls).size).toBe(POLICY_APP_SLOTS);
    expect(urls[0]).toBe("postgres://arrivo:secret@localhost:5432/arrivo_e2e_policy_0?sslmode=disable");
    expect(new Set(Array.from({ length: POLICY_APP_SLOTS }, (_, index) => policyAppPort(index))).size).toBe(
      POLICY_APP_SLOTS
    );
    expect(policyAppPort(0)).toBe(POLICY_APP_BASE_PORT);
    expect(policyAppDistDirectory(2)).toBe(".next-e2e-policy-2");
    expect(policyAppStorageDirectory(1)).toContain("policy-1");
    for (const bad of [-1, POLICY_APP_SLOTS, 1.5]) {
      expect(() => policyAppPort(bad)).toThrow(/slot/);
      expect(() => policyAppDatabaseUrl(source, bad)).toThrow(/slot/);
    }
  });

  test("refuses a source database that is unsafe or already a policy database", () => {
    expect(() => policyAppDatabaseUrl("postgres://u:p@h/arrivo_e2e_policy_0", 0)).toThrow(/must not already/);
    expect(() => policyAppDatabaseUrl("postgres://u:p@h/bad name", 0)).toThrow();
    expect(() => policyAppDatabaseUrl(`postgres://u:p@h/${"a".repeat(60)}`, 0)).toThrow(/too long/);
  });

  test("clones user mothers independently with unique usernames", () => {
    const first = cloneSecurityPolicyUserMother("member");
    const second = cloneSecurityPolicyUserMother("member");
    expect(first.username).not.toBe(second.username);
    first.name = "Changed";
    expect(cloneSecurityPolicyUserMother("member").name).toBe("Policy Member");
    expect(cloneSecurityPolicyUserMother("admin").role).toBe("admin");
    expect(cloneSecurityPolicyUserMother("pending").password).toBeNull();
    expect(cloneSecurityPolicyUserMother("member", { password: "override-1" }).password).toBe("override-1");
  });

  test("creates a migrated database whose singleton starts at the default policy, and drops it on teardown", async () => {
    app = await createSecurityPolicyApp({ slot: slot(), startServer: false });
    expect(app.baseURL).toBeUndefined();
    expect(app.databaseName).not.toBe(new URL(process.env.E2E_DATABASE_URL!).pathname.slice(1));
    expect(await databaseExists(app.databaseName)).toBe(true);
    expect(await app.readPolicy()).toEqual(DEFAULT_PASSWORD_POLICY);
    const [state] = await app.client`select initialized_at from app_state where id = true`;
    expect(state.initialized_at).not.toBeNull();
    const name = app.databaseName;
    await app.stop();
    expect(await databaseExists(name)).toBe(false);
    await app.stop();
    app = undefined;
  });

  test("can start uninitialized with no accounts, like a first run", async () => {
    app = await createSecurityPolicyApp({ slot: slot(), startServer: false, initialized: false });
    const [state] = await app.client`select initialized_at from app_state where id = true`;
    expect(state.initialized_at).toBeNull();
    const [{ count }] = await app.client`select count(*)::int as count from users`;
    expect(count).toBe(0);
  });

  test("never touches the shared E2E database", async () => {
    const shared = postgres(process.env.E2E_DATABASE_URL!, { max: 1 });
    try {
      const [before] = await shared`select password_min_length as value from app_state where id = true`;
      app = await createSecurityPolicyApp({ slot: slot(), startServer: false, policy: STRICT });
      const [after] = await shared`select password_min_length as value from app_state where id = true`;
      expect(after.value).toBe(before.value);
      expect(await app.readPolicy()).toEqual(STRICT);
    } finally {
      await shared.end();
    }
  });

  test("round-trips a policy and seeds users with real password hashes", async () => {
    app = await createSecurityPolicyApp({ slot: slot(), startServer: false });
    await app.writePolicy(STRICT);
    expect(await app.readPolicy()).toEqual(STRICT);
    const admin = await app.seedUser(cloneSecurityPolicyUserMother("admin"));
    const pending = await app.seedUser(cloneSecurityPolicyUserMother("pending"));
    const [row] = await app.client`select password_hash, role from users where id = ${admin.id}`;
    expect(await bcrypt.compare(admin.password!, row.password_hash)).toBe(true);
    expect(row.role).toBe("admin");
    const [pendingRow] = await app.client`select password_hash from users where id = ${pending.id}`;
    expect(pendingRow.password_hash).toBeNull();
  });

  test("issuing a link needs a running app, and setup and reset links need an admin", async () => {
    app = await createSecurityPolicyApp({ slot: slot(), startServer: false });
    const admin = await app.seedUser(cloneSecurityPolicyUserMother("admin"));
    await expect(app.issueLink("reset", admin, admin)).rejects.toThrow(/running app/);
  });

  test("the database refuses impossible policies, so no write path can store one", async () => {
    app = await createSecurityPolicyApp({ slot: slot(), startServer: false });
    const client = app.client;
    for (const statement of [
      () => client`update app_state set password_min_length = 7`,
      () => client`update app_state set password_min_length = 17`,
      () => client`update app_state set password_max_length = 14`,
      () => client`update app_state set password_max_length = 21`,
      () => client`update app_state set password_min_length = 16, password_max_length = 15`,
      () => client`update app_state set password_min_uppercase = -1`,
      () => client`update app_state set password_min_special = 21`,
      () =>
        client`update app_state set password_max_length = 15, password_min_uppercase = 20, password_min_numbers = 20`,
      () => client`update app_state set password_min_numbers = 21`,
      () =>
        client`update app_state set password_max_length = 15, password_min_uppercase = 6,
          password_min_numbers = 5, password_min_special = 5`,
    ]) {
      await expect(statement()).rejects.toThrow();
    }
    // 0 means not required, and minima that exactly fill the maximum length are feasible.
    await client`update app_state set password_min_uppercase = 0, password_min_numbers = 0, password_min_special = 0`;
    await client`update app_state set password_max_length = 15, password_min_uppercase = 5, password_min_numbers = 5, password_min_special = 5`;
    expect(await app.readPolicy()).toMatchObject({ maxLength: 15, minUppercase: 5, minNumbers: 5, minSpecial: 5 });
  });

  test("the toggle-to-count migration zeroes switched-off classes, keeps switched-on counts and every account", async () => {
    // Pre-migration: the shape with require* toggles (migration 0010).
    app = await createSecurityPolicyApp({ slot: slot(), startServer: false, migrateThrough: 10 });
    await app.client`update app_state set initialized_at = now(), password_require_uppercase = true,
      password_min_uppercase = 3, password_require_number = false, password_min_numbers = 4,
      password_require_special = true, password_min_special = 2, password_min_length = 10, password_max_length = 18`;
    const member = await app.seedUser(cloneSecurityPolicyUserMother("member"));
    const [stored] = await app.client`select password_hash, session_version from users where id = ${member.id}`;

    await applyMigrations(app.client, { from: 11 });

    expect(await app.readPolicy()).toEqual({
      minLength: 10,
      maxLength: 18,
      minUppercase: 3,
      minNumbers: 0,
      minSpecial: 2,
    });
    const [after] = await app.client`select password_hash, session_version from users where id = ${member.id}`;
    expect(after).toEqual(stored);
    const columns =
      await app.client`select column_name from information_schema.columns where table_name = 'app_state' and column_name like 'password_require%'`;
    expect(columns).toHaveLength(0);
  });

  test("the upgrade migration keeps existing accounts, hashes and sessions and starts at the default policy", async () => {
    // Pre-upgrade: every migration before the password-policy one.
    app = await createSecurityPolicyApp({ slot: slot(), startServer: false, migrateThrough: 9 });
    const before =
      await app.client`select 1 from information_schema.columns where table_name = 'app_state' and column_name = 'password_min_length'`;
    expect(before).toHaveLength(0);
    await app.client`update app_state set initialized_at = now() where id = true`;
    const member = await app.seedUser(cloneSecurityPolicyUserMother("member"));
    await app.client`update users set session_version = 7 where id = ${member.id}`;
    const [stored] = await app.client`select password_hash, session_version from users where id = ${member.id}`;

    await applyMigrations(app.client, { from: 10 });

    const [after] = await app.client`select password_hash, session_version from users where id = ${member.id}`;
    expect(after.password_hash).toBe(stored.password_hash);
    expect(after.session_version).toBe(7);
    expect(await bcrypt.compare(member.password!, after.password_hash)).toBe(true);
    expect(await app.readPolicy()).toEqual(DEFAULT_PASSWORD_POLICY);
  });
});
