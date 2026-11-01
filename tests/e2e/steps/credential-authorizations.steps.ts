import { createHash } from "node:crypto";
import { expect } from "@playwright/test";
import { sql } from "drizzle-orm";
import type { CredentialAuthorizationPurpose, IssueCredentialAuthorizationResult } from "../../../src/data/types";
import {
  issueCredentialAuthorization,
  issueCredentialAuthorizationInTransaction,
  validateCredentialAuthorization,
  consumeCredentialAuthorization,
} from "../../../src/lib/credential-authorizations";
import { changeUserRole } from "../../../src/lib/account-role-changes";
import { After, Given, Then } from "../fixtures";
import {
  createCredentialAuthorizationFixture,
  type CredentialAuthorizationFixture,
} from "../credential-authorization-fixture";
import { createLockGate } from "../role-service-fixture";
import type { ScenarioFixtureContext } from "../scenario-fixture";

const FIXTURE_KEY = "credentialAuthorizationFixture";
const NOW = new Date("2026-10-27T12:00:00Z");
const clock = () => new Date(NOW);
const fixtureOf = (scenario: ScenarioFixtureContext) => scenario.getValue<CredentialAuthorizationFixture>(FIXTURE_KEY)!;
function issued(result: IssueCredentialAuthorizationResult) {
  if (!result.ok) throw new Error(result.reason);
  return result;
}
async function issue(
  fixture: CredentialAuthorizationFixture,
  purpose: CredentialAuthorizationPurpose,
  key = purpose === "setup" ? "pending" : "target"
) {
  return issued(
    await issueCredentialAuthorization(
      fixture.database(),
      purpose === "recovery" ? { kind: "trusted-operator" } : { kind: "admin", actorUserId: fixture.userId("admin") },
      { userId: fixture.userId(key), purpose },
      clock
    )
  );
}
After(async ({ scenario }) => {
  await scenario.getValue<CredentialAuthorizationFixture>(FIXTURE_KEY)?.close();
});
Given("an isolated credential authorization app", async ({ scenario }) => {
  const fixture = await createCredentialAuthorizationFixture((created) => scenario.setValue(FIXTURE_KEY, created));
  await fixture.seedUsers([
    { key: "admin", role: "admin", completed: true },
    { key: "target", role: "admin", completed: true },
    { key: "pending", role: "member", completed: false },
  ]);
});
Then("credential issuance stores hashes and validates without consuming", async ({ scenario }) => {
  const fixture = fixtureOf(scenario);
  const result = await issue(fixture, "setup");
  const rows = await fixture
    .database()
    .transaction((transaction) => transaction.execute(sql`select * from credential_authorizations`));
  expect(rows).toHaveLength(1);
  expect(rows[0].digest).toBe(createHash("sha256").update(result.token).digest("hex"));
  expect(JSON.stringify(rows)).not.toContain(result.token);
  for (let index = 0; index < 2; index++)
    expect(
      (await validateCredentialAuthorization(fixture.database(), { token: result.token, purpose: "setup" }, clock)).ok
    ).toBe(true);
  expect(result.expiresAt).toBe("2026-10-28T12:00:00.000Z");
  expect(
    (
      await validateCredentialAuthorization(
        fixture.database(),
        { token: result.token, purpose: "setup" },
        () => new Date(result.expiresAt)
      )
    ).ok
  ).toBe(false);
  expect(
    (await validateCredentialAuthorization(fixture.database(), { token: result.token, purpose: "reset" }, clock)).ok
  ).toBe(false);
});
Then("credential replacements are atomic and purpose bound", async ({ scenario }) => {
  const fixture = fixtureOf(scenario);
  const original = await issue(fixture, "reset");
  const recovery = await issue(fixture, "recovery");
  await expect(
    fixture.database().transaction(async (transaction) => {
      issued(
        await issueCredentialAuthorizationInTransaction(
          transaction,
          { kind: "admin", actorUserId: fixture.userId("admin") },
          { userId: fixture.userId("target"), purpose: "reset" },
          clock
        )
      );
      throw new Error("abort replacement");
    })
  ).rejects.toThrow("abort replacement");
  expect(
    (await validateCredentialAuthorization(fixture.database(), { token: original.token, purpose: "reset" }, clock)).ok
  ).toBe(true);
  const replacement = await issue(fixture, "reset");
  expect(
    (await validateCredentialAuthorization(fixture.database(), { token: original.token, purpose: "reset" }, clock)).ok
  ).toBe(false);
  expect(
    (await validateCredentialAuthorization(fixture.database(), { token: replacement.token, purpose: "reset" }, clock))
      .ok
  ).toBe(true);
  expect(
    (await validateCredentialAuthorization(fixture.database(), { token: recovery.token, purpose: "recovery" }, clock))
      .ok
  ).toBe(true);
});
Then("failed credential completion rolls back credentials and authorization", async ({ scenario }) => {
  const fixture = fixtureOf(scenario);
  const result = await issue(fixture, "setup");
  await expect(
    consumeCredentialAuthorization(
      fixture.database(),
      { token: result.token, purpose: "setup" },
      async (transaction, account) => {
        await transaction.execute(sql`update users set password_hash = 'replacement' where id = ${account.userId}`);
        throw new Error("abort completion");
      },
      clock
    )
  ).rejects.toThrow("abort completion");
  expect(
    (await validateCredentialAuthorization(fixture.database(), { token: result.token, purpose: "setup" }, clock)).ok
  ).toBe(true);
  const rows = await fixture
    .database()
    .transaction((transaction) =>
      transaction.execute(sql`select password_hash from users where id = ${fixture.userId("pending")}`)
    );
  expect(rows[0].password_hash).toBeNull();
});
Then("completing either reset purpose invalidates both families", async ({ scenario }) => {
  const fixture = fixtureOf(scenario);
  for (const purpose of ["reset", "recovery"] as const) {
    const reset = await issue(fixture, "reset");
    const recovery = await issue(fixture, "recovery");
    const token = purpose === "reset" ? reset.token : recovery.token;
    expect(
      await consumeCredentialAuthorization(
        fixture.database(),
        { token, purpose },
        async (transaction, account) => {
          await transaction.execute(sql`update users set password_hash = 'replacement' where id = ${account.userId}`);
        },
        clock
      )
    ).toEqual({ ok: true });
    expect(
      (await validateCredentialAuthorization(fixture.database(), { token: reset.token, purpose: "reset" }, clock)).ok
    ).toBe(false);
    expect(
      (await validateCredentialAuthorization(fixture.database(), { token: recovery.token, purpose: "recovery" }, clock))
        .ok
    ).toBe(false);
  }
});
Then("concurrent credential completions commit exactly once", async ({ scenario }) => {
  const fixture = fixtureOf(scenario);
  const result = await issue(fixture, "setup");
  const gate = createLockGate();
  let completions = 0;
  const complete = async (
    transaction: Parameters<Parameters<typeof consumeCredentialAuthorization>[2]>[0],
    account: Parameters<Parameters<typeof consumeCredentialAuthorization>[2]>[1]
  ) => {
    await transaction.execute(sql`update users set password_hash = 'replacement' where id = ${account.userId}`);
    completions++;
  };
  const first = consumeCredentialAuthorization(
    fixture.database(gate),
    { token: result.token, purpose: "setup" },
    complete,
    clock
  );
  let second: ReturnType<typeof consumeCredentialAuthorization> | undefined;
  try {
    await gate.reached;
    second = consumeCredentialAuthorization(
      fixture.database(),
      { token: result.token, purpose: "setup" },
      complete,
      clock
    );
    await fixture.waitForBlockedTransaction();
  } finally {
    gate.release();
  }
  const results = await Promise.all([first, second!]);
  expect(results.filter((outcome) => outcome.ok)).toHaveLength(1);
  expect(completions).toBe(1);
});
Then("waiting credential issuance rechecks admin authority", async ({ scenario }) => {
  const fixture = fixtureOf(scenario);
  const gate = createLockGate();
  const demotion = changeUserRole(fixture.database(gate), fixture.userId("target"), {
    targetUserId: fixture.userId("admin"),
    role: "member",
  });
  let issuance: ReturnType<typeof issueCredentialAuthorization> | undefined;
  try {
    await gate.reached;
    issuance = issueCredentialAuthorization(
      fixture.database(),
      { kind: "admin", actorUserId: fixture.userId("admin") },
      { userId: fixture.userId("pending"), purpose: "setup" },
      clock
    );
    await fixture.waitForBlockedTransaction();
  } finally {
    gate.release();
  }
  expect((await demotion).ok).toBe(true);
  expect(await issuance).toEqual({ ok: false, reason: "forbidden" });
});
Then("waiting credential completion rechecks expiry", async ({ scenario }) => {
  const fixture = fixtureOf(scenario);
  const result = await issue(fixture, "setup");
  const gate = createLockGate();
  let now = NOW;
  let completions = 0;
  const holding = issueCredentialAuthorization(
    fixture.database(gate),
    { kind: "trusted-operator" },
    { userId: fixture.userId("target"), purpose: "recovery" },
    clock
  );
  let completion: ReturnType<typeof consumeCredentialAuthorization> | undefined;
  try {
    await gate.reached;
    completion = consumeCredentialAuthorization(
      fixture.database(),
      { token: result.token, purpose: "setup" },
      async () => {
        completions++;
      },
      () => now
    );
    await fixture.waitForBlockedTransaction();
    now = new Date(result.expiresAt);
  } finally {
    gate.release();
  }
  await holding;
  expect(await completion).toEqual({ ok: false, reason: "invalid" });
  expect(completions).toBe(0);
});
Then("deleting credential account removes every authorization", async ({ scenario }) => {
  const fixture = fixtureOf(scenario);
  const reset = await issue(fixture, "reset");
  const recovery = await issue(fixture, "recovery");
  await fixture
    .database()
    .transaction((transaction) => transaction.execute(sql`delete from users where id = ${fixture.userId("target")}`));
  expect(
    (await validateCredentialAuthorization(fixture.database(), { token: reset.token, purpose: "reset" }, clock)).ok
  ).toBe(false);
  expect(
    (await validateCredentialAuthorization(fixture.database(), { token: recovery.token, purpose: "recovery" }, clock))
      .ok
  ).toBe(false);
  const rows = await fixture
    .database()
    .transaction((transaction) => transaction.execute(sql`select * from credential_authorizations`));
  expect(rows).toHaveLength(0);
});
