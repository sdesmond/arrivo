import { createHash } from "node:crypto";
import { expect } from "@playwright/test";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { addUser, type AddUserDatabase } from "../../../src/lib/account-creation";
import { changeUserRole } from "../../../src/lib/account-role-changes";
import { After, Given, Then } from "../fixtures";
import {
  createCredentialAuthorizationFixture,
  type CredentialAuthorizationFixture,
} from "../credential-authorization-fixture";
import { createLockGate } from "../role-service-fixture";
import type { ScenarioFixtureContext } from "../scenario-fixture";

const FIXTURE_KEY = "accountCreationFixture";
const NOW = new Date("2026-10-28T12:00:00Z");
const clock = () => new Date(NOW);
const dialect = new PgDialect();
const fixtureOf = (scenario: ScenarioFixtureContext) => scenario.getValue<CredentialAuthorizationFixture>(FIXTURE_KEY)!;

async function rows(fixture: CredentialAuthorizationFixture, query: ReturnType<typeof sql>) {
  return fixture.database().transaction((transaction) => transaction.execute(query));
}
const countUsers = async (fixture: CredentialAuthorizationFixture) =>
  (await rows(fixture, sql`select id from users`)).length;
const countAuthorizations = async (fixture: CredentialAuthorizationFixture) =>
  (await rows(fixture, sql`select id from credential_authorizations`)).length;

After(async ({ scenario }) => {
  await scenario.getValue<CredentialAuthorizationFixture>(FIXTURE_KEY)?.close();
});

Given("an isolated account creation instance", async ({ scenario }) => {
  const fixture = await createCredentialAuthorizationFixture((created) => scenario.setValue(FIXTURE_KEY, created));
  await fixture.seedUsers([
    { key: "admin", role: "admin", completed: true },
    { key: "other", role: "admin", completed: true },
    { key: "existing", role: "member", completed: true },
  ]);
});

Then("adding a user creates a passwordless member with a hashed 24-hour setup authorization", async ({ scenario }) => {
  const fixture = fixtureOf(scenario);
  const result = await addUser(fixture.database(), fixture.userId("admin"), { username: "  Alex.Q " }, clock);
  if (!result.ok) throw new Error(result.reason);

  expect(result.username).toBe("alex.q");
  expect(result.expiresAt).toBe("2026-10-29T12:00:00.000Z");
  const accounts = await rows(fixture, sql`select role, password_hash, name from users where id = ${result.userId}`);
  expect(accounts).toHaveLength(1);
  expect(accounts[0]).toMatchObject({ role: "member", password_hash: null, name: null });
  const authorizations = await rows(fixture, sql`select * from credential_authorizations`);
  expect(authorizations).toHaveLength(1);
  expect(authorizations[0].user_id).toBe(result.userId);
  expect(authorizations[0].purpose).toBe("setup");
  expect(authorizations[0].digest).toBe(createHash("sha256").update(result.token).digest("hex"));
  expect(JSON.stringify(authorizations)).not.toContain(result.token);
});

Then("adding a taken username in any case creates no account or authorization", async ({ scenario }) => {
  const fixture = fixtureOf(scenario);
  // Seeded usernames are schema-suffixed and too long to pass validation, so plant a short pending one.
  await rows(fixture, sql`insert into users (username, role) values ('taken.name', 'member')`);
  const before = await countUsers(fixture);

  const result = await addUser(fixture.database(), fixture.userId("admin"), { username: "TAKEN.Name" });

  expect(result).toEqual({ ok: false, reason: "username-taken" });
  expect(await countUsers(fixture)).toBe(before);
  expect(await countAuthorizations(fixture)).toBe(0);
});

Then("two concurrent adds of the same username commit exactly once", async ({ scenario }) => {
  const fixture = fixtureOf(scenario);
  const gate = createLockGate();
  const before = await countUsers(fixture);
  const first = addUser(fixture.database(gate), fixture.userId("admin"), { username: "alex.q" }, clock);
  let second: ReturnType<typeof addUser> | undefined;
  try {
    await gate.reached;
    second = addUser(fixture.database(), fixture.userId("other"), { username: "Alex.Q" }, clock);
    await fixture.waitForBlockedTransaction();
  } finally {
    gate.release();
  }
  const results = await Promise.all([first, second!]);

  expect(results.filter((result) => result.ok)).toHaveLength(1);
  expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, reason: "username-taken" }]);
  expect(await countUsers(fixture)).toBe(before + 1);
  expect(await countAuthorizations(fixture)).toBe(1);
});

Then("an add waiting behind the actor's demotion is refused with no account", async ({ scenario }) => {
  const fixture = fixtureOf(scenario);
  const gate = createLockGate();
  const before = await countUsers(fixture);
  const demotion = changeUserRole(fixture.database(gate), fixture.userId("other"), {
    targetUserId: fixture.userId("admin"),
    role: "member",
  });
  let waiting: ReturnType<typeof addUser> | undefined;
  try {
    await gate.reached;
    waiting = addUser(fixture.database(), fixture.userId("admin"), { username: "alex.q" }, clock);
    await fixture.waitForBlockedTransaction();
  } finally {
    gate.release();
  }

  expect((await demotion).ok).toBe(true);
  expect(await waiting).toEqual({ ok: false, reason: "forbidden" });
  expect(await countUsers(fixture)).toBe(before);
  expect(await countAuthorizations(fixture)).toBe(0);
});

Then("a failing setup authorization insert leaves no account behind", async ({ scenario }) => {
  const fixture = fixtureOf(scenario);
  const before = await countUsers(fixture);
  const base = fixture.database();
  const failing = {
    transaction: (run: Parameters<AddUserDatabase["transaction"]>[0]) =>
      base.transaction((transaction) =>
        run(
          new Proxy(transaction, {
            get(target, property) {
              const value = Reflect.get(target, property);
              if (property !== "execute") return typeof value === "function" ? value.bind(target) : value;
              return async (statement: Parameters<typeof target.execute>[0]) => {
                const text = typeof statement === "string" ? statement : dialect.sqlToQuery(statement.getSQL()).sql;
                if (text.startsWith("insert into") && text.includes("credential_authorizations")) {
                  throw new Error("authorization insert failed");
                }
                return target.execute(statement);
              };
            },
          })
        )
      ),
  } as unknown as AddUserDatabase;

  await expect(addUser(failing, fixture.userId("admin"), { username: "alex.q" }, clock)).rejects.toThrow(
    "authorization insert failed"
  );
  expect(await countUsers(fixture)).toBe(before);
  expect(await countAuthorizations(fixture)).toBe(0);
});
