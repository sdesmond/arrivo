import { expect } from "@playwright/test";
import { RoleChangeFailure, UserRole, type ChangeUserRoleResult } from "../../../src/data/types";
import { changeUserRole } from "../../../src/lib/account-role-changes";
import { After, Given, When, Then } from "../fixtures";
import {
  createLockGate,
  createRoleServiceFixture,
  type RoleServiceFixture,
  type RoleServiceUserSpec,
} from "../role-service-fixture";
import type { ScenarioFixtureContext } from "../scenario-fixture";

const FIXTURE_KEY = "roleServiceFixture";
const RESULT_KEY = "roleServiceResult";
const RESULTS_KEY = "roleServiceResults";

type Scenario = ScenarioFixtureContext;

// Registered with the scenario before any seeding so a failed setup still drops the schema.
async function startFixture(scenario: Scenario, specs: RoleServiceUserSpec[]) {
  const fixture = await createRoleServiceFixture();
  scenario.setValue(FIXTURE_KEY, fixture);
  await fixture.seedUsers(specs);
}

const fixtureOf = (scenario: Scenario) => scenario.getValue<RoleServiceFixture>(FIXTURE_KEY)!;

After(async ({ scenario }) => {
  await scenario.getValue<RoleServiceFixture>(FIXTURE_KEY)?.close();
});

Given("an isolated instance with a completed admin and a completed member", async ({ scenario }) => {
  await startFixture(scenario, [
    { key: "admin", role: UserRole.Admin, completed: true },
    { key: "member", role: UserRole.Member, completed: true },
  ]);
});

Given("an isolated instance with two completed admins", async ({ scenario }) => {
  await startFixture(scenario, [
    { key: "first", role: UserRole.Admin, completed: true },
    { key: "second", role: UserRole.Admin, completed: true },
  ]);
});

Given("an isolated instance with two completed admins and a completed member", async ({ scenario }) => {
  await startFixture(scenario, [
    { key: "first", role: UserRole.Admin, completed: true },
    { key: "second", role: UserRole.Admin, completed: true },
    { key: "member", role: UserRole.Member, completed: true },
  ]);
});

Given("an isolated instance with one completed admin and one unfinished admin", async ({ scenario }) => {
  await startFixture(scenario, [
    { key: "admin", role: UserRole.Admin, completed: true },
    { key: "unfinished", role: UserRole.Admin, completed: false },
  ]);
});

Given("an isolated instance with a completed admin and an unfinished member", async ({ scenario }) => {
  await startFixture(scenario, [
    { key: "admin", role: UserRole.Admin, completed: true },
    { key: "unfinished", role: UserRole.Member, completed: false },
  ]);
});

async function change(scenario: Scenario, actor: string, target: string, role: UserRole) {
  const fixture = fixtureOf(scenario);
  const result = await changeUserRole(fixture.database(), fixture.userId(actor), {
    targetUserId: fixture.userId(target),
    role,
  });
  scenario.setValue(RESULT_KEY, result);
}

When("the admin changes the member's role to admin", async ({ scenario }) => {
  await change(scenario, "admin", "member", UserRole.Admin);
});

When("the first admin changes the second admin's role to member", async ({ scenario }) => {
  await change(scenario, "first", "second", UserRole.Member);
});

When("the completed admin changes their own role to member", async ({ scenario }) => {
  await change(scenario, "admin", "admin", UserRole.Member);
});

When("the admin changes the unfinished member's role to admin", async ({ scenario }) => {
  await change(scenario, "admin", "unfinished", UserRole.Admin);
});

When("both admins demote themselves at the same time", async ({ scenario }) => {
  const fixture = fixtureOf(scenario);
  const gate = createLockGate();
  const demote = (key: string, withGate?: typeof gate) =>
    changeUserRole(fixture.database(withGate), fixture.userId(key), {
      targetUserId: fixture.userId(key),
      role: UserRole.Member,
    });

  // The first transaction holds the singleton lock until the second is verifiably queued behind it.
  const firstPromise = demote("first", gate);
  await gate.reached;
  const secondPromise = demote("second");
  try {
    await fixture.waitForBlockedTransaction();
  } finally {
    gate.release();
  }

  scenario.setValue(RESULTS_KEY, await Promise.all([firstPromise, secondPromise]));
});

When(
  "the second admin's promotion of the member waits behind the first admin demoting the second admin",
  async ({ scenario }) => {
    const fixture = fixtureOf(scenario);
    const gate = createLockGate();

    const demotion = changeUserRole(fixture.database(gate), fixture.userId("first"), {
      targetUserId: fixture.userId("second"),
      role: UserRole.Member,
    });
    await gate.reached;
    const promotion = changeUserRole(fixture.database(), fixture.userId("second"), {
      targetUserId: fixture.userId("member"),
      role: UserRole.Admin,
    });
    try {
      await fixture.waitForBlockedTransaction();
    } finally {
      gate.release();
    }

    expect((await demotion).ok).toBe(true);
    scenario.setValue(RESULT_KEY, await promotion);
  }
);

Then("the role change succeeds", async ({ scenario }) => {
  expect(scenario.getValue<ChangeUserRoleResult>(RESULT_KEY)).toMatchObject({ ok: true, changed: true });
});

function expectRefusal(scenario: Scenario, reason: RoleChangeFailure) {
  expect(scenario.getValue<ChangeUserRoleResult>(RESULT_KEY)).toEqual({ ok: false, reason });
}

Then("the role change is refused as last-admin", async ({ scenario }) => {
  expectRefusal(scenario, RoleChangeFailure.LastAdmin);
});

Then("the role change is refused as unfinished-account", async ({ scenario }) => {
  expectRefusal(scenario, RoleChangeFailure.UnfinishedAccount);
});

Then("the promotion is refused as forbidden", async ({ scenario }) => {
  expectRefusal(scenario, RoleChangeFailure.Forbidden);
});

Then("the member's stored role is admin", async ({ scenario }) => {
  expect(await fixtureOf(scenario).roleOf("member")).toBe(UserRole.Admin);
});

Then("the member's stored role is member", async ({ scenario }) => {
  expect(await fixtureOf(scenario).roleOf("member")).toBe(UserRole.Member);
});

Then("the second admin's stored role is member", async ({ scenario }) => {
  expect(await fixtureOf(scenario).roleOf("second")).toBe(UserRole.Member);
});

Then("the completed admin's stored role is admin", async ({ scenario }) => {
  expect(await fixtureOf(scenario).roleOf("admin")).toBe(UserRole.Admin);
});

Then("the unfinished member's stored role is member", async ({ scenario }) => {
  expect(await fixtureOf(scenario).roleOf("unfinished")).toBe(UserRole.Member);
});

Then("exactly one self-demotion succeeds and the other is refused as last-admin", async ({ scenario }) => {
  const results = scenario.getValue<ChangeUserRoleResult[]>(RESULTS_KEY)!;
  expect(results.filter((result) => result.ok)).toHaveLength(1);
  expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, reason: RoleChangeFailure.LastAdmin }]);
});

Then("exactly one admin remains stored", async ({ scenario }) => {
  expect(await fixtureOf(scenario).adminCount()).toBe(1);
});
