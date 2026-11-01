import { createHash } from "node:crypto";
import { expect } from "@playwright/test";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { issueAdminRecovery } from "../../../src/lib/admin-recovery-issuance";
import {
  issueCredentialAuthorization,
  validateCredentialAuthorization,
} from "../../../src/lib/credential-authorizations";
import type { CredentialAuthorizationDatabase } from "../../../src/lib/credential-authorizations";
import type { AdminRecoveryIssuanceOutcome } from "../../../src/data/types";
import { lockAppAndUsersForUpdate } from "../../../src/lib/account-lifecycle-locks";
import { After, Given, Then } from "../fixtures";
import { createAdminRecoveryIssuanceFixture } from "../admin-recovery-issuance-fixture";
import type { CredentialAuthorizationFixture } from "../credential-authorization-fixture";
import { createLockGate } from "../role-service-fixture";
import type { ScenarioFixtureContext } from "../scenario-fixture";

const KEY = "adminRecoveryIssuanceFixture";
const clock = () => new Date("2026-10-29T12:00:00Z");
const operator = { kind: "trusted-operator" } as const;
const input = { username: " TARGET ", origin: "https://browser.example.test:8443/" };
const fixtureOf = (scenario: ScenarioFixtureContext) => scenario.getValue<CredentialAuthorizationFixture>(KEY)!;
function successful(result: AdminRecoveryIssuanceOutcome) {
  if (!result.ok) throw new Error(result.reason);
  return result;
}
function tokenOf(result: AdminRecoveryIssuanceOutcome) {
  return new URL(successful(result).url).searchParams.get("token")!;
}
async function usable(fixture: CredentialAuthorizationFixture, token: string) {
  return (await validateCredentialAuthorization(fixture.database(), { token, purpose: "recovery" }, clock)).ok;
}
async function credentials(fixture: CredentialAuthorizationFixture) {
  return fixture.database().transaction(async (transaction) => {
    const snapshot: unknown[] = [];
    for (const table of ["users", "trusted_devices", "mfa_recovery_codes", "sessions"]) {
      snapshot.push(await transaction.execute(sql.raw(`select * from ${table} order by 1`)));
    }
    return JSON.stringify(snapshot);
  });
}
After(async ({ scenario }) => {
  await scenario.getValue<CredentialAuthorizationFixture>(KEY)?.close();
});
Given("an isolated admin recovery app", async ({ scenario }) => {
  await createAdminRecoveryIssuanceFixture((fixture) => scenario.setValue(KEY, fixture));
});
Then("admin recovery stores only a digest with exact purpose and expiry", async ({ scenario }) => {
  const fixture = fixtureOf(scenario);
  const before = await credentials(fixture);
  const result = successful(await issueAdminRecovery(fixture.database(), operator, input, clock));
  const token = tokenOf(result);
  const rows = await fixture
    .database()
    .transaction((transaction) => transaction.execute(sql`select * from credential_authorizations`));
  expect(rows).toHaveLength(1);
  expect(rows[0].digest).toBe(createHash("sha256").update(token).digest("hex"));
  expect(rows[0].purpose).toBe("recovery");
  expect(new Date(rows[0].expires_at as string).toISOString()).toBe("2026-10-29T13:00:00.000Z");
  expect(result.expiresAt).toBe("2026-10-29T13:00:00.000Z");
  expect(result.userId).toBe(fixture.userId("target"));
  expect(new URL(result.url).origin).toBe("https://browser.example.test:8443");
  expect(await credentials(fixture)).toBe(before);
  expect(await usable(fixture, token)).toBe(true);
  expect(
    (
      await validateCredentialAuthorization(
        fixture.database(),
        { token, purpose: "recovery" },
        () => new Date("2026-10-29T12:59:59.999Z")
      )
    ).ok
  ).toBe(true);
  expect(
    (
      await validateCredentialAuthorization(
        fixture.database(),
        { token, purpose: "recovery" },
        () => new Date(result.expiresAt)
      )
    ).ok
  ).toBe(false);
  for (const purpose of ["setup", "reset"] as const) {
    expect((await validateCredentialAuthorization(fixture.database(), { token, purpose }, clock)).ok).toBe(false);
  }
  const events = await fixture
    .database()
    .transaction((transaction) => transaction.execute(sql`select * from activity_events`));
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    type: "admin_recovery_link_generated",
    actor_id: null,
    actor_username: "Server operator (CLI)",
    target_id: fixture.userId("target"),
    target_username: "target",
    trip_id: null,
  });
  expect(JSON.stringify([rows, events])).not.toContain(token);
  expect(JSON.stringify(events)).not.toMatch(/browser.example.test|opaque-secret|device-digest|code-digest/);
});
Then("admin recovery replacements preserve other purposes and rollback", async ({ scenario }) => {
  const fixture = fixtureOf(scenario);
  const targetId = fixture.userId("target");
  const reset = await issueCredentialAuthorization(
    fixture.database(),
    { kind: "admin", actorUserId: fixture.userId("admin") },
    { userId: targetId, purpose: "reset" },
    clock
  );
  if (!reset.ok) throw new Error(reset.reason);
  // A historical setup-purpose link must also remain untouched.
  await fixture
    .database()
    .transaction((transaction) =>
      transaction.execute(
        sql`insert into credential_authorizations (user_id, purpose, digest, expires_at) values (${targetId}, 'setup', 'historical-setup-digest', '2026-10-30T12:00:00Z')`
      )
    );
  const original = await issueAdminRecovery(fixture.database(), operator, input, clock);
  const before = await fixture
    .database()
    .transaction((transaction) => transaction.execute(sql`select * from credential_authorizations order by id`));
  const dialect = new PgDialect();
  const rollbackDb = {
    transaction: (run) =>
      fixture.database().transaction(async (transaction) =>
        run(
          new Proxy(transaction, {
            get(target, property) {
              if (property !== "execute") {
                const value = Reflect.get(target, property);
                return typeof value === "function" ? value.bind(target) : value;
              }
              return async (statement: Parameters<typeof transaction.execute>[0]) => {
                const result = await target.execute(statement);
                const text = typeof statement === "string" ? statement : dialect.sqlToQuery(statement.getSQL()).sql;
                if (text.startsWith('insert into "credential_authorizations"'))
                  throw new Error("abort recovery replacement");
                return result;
              };
            },
          })
        )
      ),
  } as CredentialAuthorizationDatabase;
  await expect(issueAdminRecovery(rollbackDb, operator, input, clock)).rejects.toThrow("abort recovery replacement");
  expect(
    await fixture
      .database()
      .transaction((transaction) => transaction.execute(sql`select * from credential_authorizations order by id`))
  ).toEqual(before);
  expect(await usable(fixture, tokenOf(original))).toBe(true);
  const replacement = await issueAdminRecovery(fixture.database(), operator, input, clock);
  expect(await usable(fixture, tokenOf(original))).toBe(false);
  expect(await usable(fixture, tokenOf(replacement))).toBe(true);
  expect(
    (await validateCredentialAuthorization(fixture.database(), { token: reset.token, purpose: "reset" }, clock)).ok
  ).toBe(true);
  const setup = await fixture
    .database()
    .transaction((transaction) =>
      transaction.execute(sql`select invalidated_at from credential_authorizations where purpose = 'setup'`)
    );
  expect(setup[0].invalidated_at).toBeNull();
  const events = await fixture
    .database()
    .transaction((transaction) => transaction.execute(sql`select * from activity_events`));
  expect(events).toHaveLength(2);
});
Then("admin recovery refuses invalid origins and ineligible targets", async ({ scenario }) => {
  const fixture = fixtureOf(scenario);
  const before = await credentials(fixture);
  for (const origin of [
    "https://browser.example.test/path",
    "https://user@browser.example.test",
    "https://browser.example.test/?",
    "ftp://browser.example.test",
  ]) {
    expect(await issueAdminRecovery(fixture.database(), operator, { ...input, origin }, clock)).toEqual({
      ok: false,
      reason: "invalid-origin",
    });
  }
  for (const username of ["missing", "member", "pending"])
    expect(await issueAdminRecovery(fixture.database(), operator, { ...input, username }, clock)).toEqual({
      ok: false,
      reason: "changed-state",
    });
  expect(await credentials(fixture)).toBe(before);
  for (const table of ["activity_events", "credential_authorizations"])
    expect(
      await fixture.database().transaction((transaction) => transaction.execute(sql.raw(`select * from ${table}`)))
    ).toHaveLength(0);
});
Then("rejected recovery Activity leaves a usable committed link", async ({ scenario }) => {
  const fixture = fixtureOf(scenario);
  await fixture
    .database()
    .transaction((transaction) =>
      transaction.execute(
        sql`alter table activity_events add constraint reject_recovery_activity check (type <> 'admin_recovery_link_generated')`
      )
    );
  const result = await issueAdminRecovery(fixture.database(), operator, input, clock);
  expect(await usable(fixture, tokenOf(result))).toBe(true);
  expect(
    await fixture.database().transaction((transaction) => transaction.execute(sql`select * from activity_events`))
  ).toHaveLength(0);
});
Then("concurrent admin recoveries leave exactly one usable link", async ({ scenario }) => {
  const fixture = fixtureOf(scenario);
  const gate = createLockGate();
  const first = issueAdminRecovery(fixture.database(gate), operator, input, clock);
  let second: ReturnType<typeof issueAdminRecovery> | undefined;
  try {
    await gate.reached;
    second = issueAdminRecovery(fixture.database(), operator, input, clock);
    await fixture.waitForBlockedTransaction();
  } finally {
    gate.release();
  }
  const results = await Promise.all([first, second!]);
  expect(results.every((result) => result.ok)).toBe(true);
  const validity = await Promise.all(results.map((result) => usable(fixture, tokenOf(result))));
  expect(validity.filter(Boolean)).toHaveLength(1);
});
Then("waiting admin recovery refuses locked {string}", async ({ scenario }, mutation: string) => {
  const fixture = fixtureOf(scenario);
  const gate = createLockGate();
  const change = fixture.database().transaction(async (transaction) => {
    await lockAppAndUsersForUpdate(transaction, [fixture.userId("target")]);
    await gate.arrive();
    if (mutation === "demotion")
      await transaction.execute(sql`update users set role = 'member' where id = ${fixture.userId("target")}`);
    else if (mutation === "deletion")
      await transaction.execute(sql`delete from users where id = ${fixture.userId("target")}`);
    else {
      await transaction.execute(sql`update users set username = 'renamed' where id = ${fixture.userId("target")}`);
      await transaction.execute(
        sql`insert into users (username, role, password_hash) values ('target', 'admin', 'another-hash')`
      );
    }
  });
  let issuance: ReturnType<typeof issueAdminRecovery> | undefined;
  try {
    await gate.reached;
    issuance = issueAdminRecovery(fixture.database(), operator, input, clock);
    await fixture.waitForBlockedTransaction();
  } finally {
    gate.release();
  }
  await change;
  expect(await issuance).toEqual({ ok: false, reason: "changed-state" });
  for (const table of ["activity_events", "credential_authorizations"])
    expect(
      await fixture.database().transaction((transaction) => transaction.execute(sql.raw(`select * from ${table}`)))
    ).toHaveLength(0);
});
