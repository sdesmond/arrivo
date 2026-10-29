import { expect, type Page } from "@playwright/test";
import { and, eq, sql } from "drizzle-orm";
import { activityEvents, credentialAuthorizations, users } from "../../../src/db/schema";
import { deleteUnfinishedAccount } from "../../../src/lib/unfinished-account-deletion";
import {
  consumeCredentialAuthorization,
  issueCredentialAuthorization,
} from "../../../src/lib/credential-authorizations";
import { After, Given, When, Then } from "../fixtures";
import { withE2EDb } from "../e2e-db";
import { waitForServerActionResponse } from "../server-action";
import type { ScenarioFixtureContext, ScenarioUserRecord } from "../scenario-fixture";
import {
  createCredentialAuthorizationFixture,
  type CredentialAuthorizationFixture,
} from "../credential-authorization-fixture";
import { createLockGate } from "../role-service-fixture";
import { openCredentialLink, recipientContext } from "../onboarding-browser";

// The target comes from the shared "a regeneration target with a {string} setup link" step.
interface DeletionTarget extends ScenarioUserRecord {
  oldToken: string;
}
const FIXTURE_KEY = "deletionFixture";
const clock = () => new Date("2026-10-28T12:00:00Z");
const targetOf = (scenario: ScenarioFixtureContext) => scenario.getValue<DeletionTarget>("regenerationTarget")!;
const targetRow = (page: Page, scenario: ScenarioFixtureContext) =>
  page
    .getByRole("list", { name: "Instance users" })
    .getByRole("listitem")
    .filter({ has: page.getByText(targetOf(scenario).username, { exact: true }) });
const readEvents = (scenario: ScenarioFixtureContext) =>
  withE2EDb((database) =>
    database
      .select()
      .from(activityEvents)
      .where(
        and(eq(activityEvents.targetId, targetOf(scenario).id), eq(activityEvents.type, "pending_account_deleted"))
      )
  );

When("I delete the unfinished account in Users", async ({ page, scenario }) => {
  await page.getByRole("button", { name: `Delete account: ${targetOf(scenario).username}`, exact: true }).click();
  const response = waitForServerActionResponse(page, { pathIncludes: "/admin/users" });
  await page.getByRole("dialog").getByRole("button", { name: "Delete account", exact: true }).click();
  await response;
});
Then("the unfinished account is gone after refresh", async ({ page, scenario }) => {
  await page.reload();
  await expect(page.getByRole("list", { name: "Instance users" })).toBeVisible();
  await expect(targetRow(page, scenario)).toHaveCount(0);
  const accounts = await withE2EDb((database) =>
    database
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, targetOf(scenario).id))
  );
  expect(accounts).toEqual([]);
});
Then("its old setup link admits no one", async ({ page, scenario }) => {
  const authorizations = await withE2EDb((database) =>
    database
      .select()
      .from(credentialAuthorizations)
      .where(eq(credentialAuthorizations.userId, targetOf(scenario).id))
  );
  expect(authorizations).toEqual([]);
  const context = await recipientContext(page);
  try {
    const oldSetupPage = scenario.getValue<Page>("regenerationOldSetupPage");
    if (oldSetupPage) {
      await oldSetupPage.reload();
      await expect(oldSetupPage.getByRole("heading", { name: "Setup link unavailable" })).toBeVisible();
    }
    const recipient = await context.newPage();
    await openCredentialLink(recipient, `/account-setup/open?token=${targetOf(scenario).oldToken}`);
    await expect(recipient.getByRole("heading", { name: "Setup link unavailable" })).toBeVisible();
  } finally {
    await context.close();
  }
});
Then("deletion Activity identifies only the admin and target", async ({ scenario }) => {
  await expect.poll(async () => (await readEvents(scenario)).length).toBe(1);
  const [event] = await readEvents(scenario);
  expect(event.actorId).toBe(scenario.currentUser!.id);
  expect(event.actorUsername).toBe(scenario.currentUser!.username);
  expect(event.targetId).toBe(targetOf(scenario).id);
  expect(event.targetUsername).toBe(targetOf(scenario).username);
  expect(JSON.stringify(event).includes("token")).toBe(false);
});
Then("the completed account remains with no deletion Activity", async ({ page, scenario }) => {
  await page.reload();
  await expect(targetRow(page, scenario)).toContainText("Setup complete");
  await expect(targetRow(page, scenario).getByRole("button", { name: /Delete account/ })).toHaveCount(0);
  const accounts = await withE2EDb((database) =>
    database
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, targetOf(scenario).id))
  );
  expect(accounts).toEqual([{ id: targetOf(scenario).id }]);
  expect(await readEvents(scenario)).toHaveLength(0);
});
Then("there is no deletion Activity for the target", async ({ scenario }) => {
  expect(await readEvents(scenario)).toHaveLength(0);
});

Given("an isolated deletion instance", async ({ scenario }) => {
  const fixture = await createCredentialAuthorizationFixture((created) => scenario.setValue(FIXTURE_KEY, created));
  await fixture.seedUsers([
    { key: "admin", role: "admin", completed: true },
    { key: "pending", role: "member", completed: false },
    { key: "second", role: "member", completed: false },
  ]);
});
async function issueSetup(fixture: CredentialAuthorizationFixture, key: string) {
  const issued = await issueCredentialAuthorization(
    fixture.database(),
    { kind: "admin", actorUserId: fixture.userId("admin") },
    { userId: fixture.userId(key), purpose: "setup" },
    clock
  );
  if (!issued.ok) throw new Error(issued.reason);
  return issued;
}
const complete = (fixture: CredentialAuthorizationFixture, token: string, gate?: ReturnType<typeof createLockGate>) =>
  consumeCredentialAuthorization(
    fixture.database(gate),
    { token, purpose: "setup" },
    async (transaction, account) => {
      await transaction.execute(sql`update users set password_hash = 'completed' where id = ${account.userId}`);
    },
    clock
  );
Then("deletion waiting behind completion refuses the completed account", async ({ scenario }) => {
  const fixture = scenario.getValue<CredentialAuthorizationFixture>(FIXTURE_KEY)!;
  const original = await issueSetup(fixture, "pending");
  const gate = createLockGate();
  const completion = complete(fixture, original.token, gate);
  let waiting: ReturnType<typeof deleteUnfinishedAccount> | undefined;
  try {
    await gate.reached;
    waiting = deleteUnfinishedAccount(fixture.database(), fixture.userId("admin"), fixture.userId("pending"));
    await fixture.waitForBlockedTransaction();
  } finally {
    gate.release();
  }
  expect((await completion).ok).toBe(true);
  expect(await waiting).toEqual({ ok: false, reason: "changed-state" });
  expect(await fixture.accountExists("pending")).toBe(true);
});
Then("completion waiting behind deletion finds no authorization", async ({ scenario }) => {
  const fixture = scenario.getValue<CredentialAuthorizationFixture>(FIXTURE_KEY)!;
  const original = await issueSetup(fixture, "second");
  const gate = createLockGate();
  const deletion = deleteUnfinishedAccount(fixture.database(gate), fixture.userId("admin"), fixture.userId("second"));
  let waiting: ReturnType<typeof complete> | undefined;
  try {
    await gate.reached;
    waiting = complete(fixture, original.token);
    await fixture.waitForBlockedTransaction();
  } finally {
    gate.release();
  }
  expect((await deletion).ok).toBe(true);
  expect((await waiting).ok).toBe(false);
  expect(await fixture.accountExists("second")).toBe(false);
});

After(async ({ scenario }) => {
  await scenario.getValue<CredentialAuthorizationFixture>(FIXTURE_KEY)?.close();
});
