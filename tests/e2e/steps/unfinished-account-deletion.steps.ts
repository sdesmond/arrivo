import { expect, type Page } from "@playwright/test";
import { and, eq, sql } from "drizzle-orm";
import { activityEvents, credentialAuthorizations, users } from "../../../src/db/schema";
import { deleteAccountAsAdmin, previewAccountDeletionAsAdmin } from "../../../src/lib/account-deletion";
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
    .getByRole("list", { name: "App users" })
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

// Opening the dialog is what asks the server for the review; arm the response before the click. A click that lands
// before the page hydrates opens nothing, so retry until the dialog is up rather than waiting on a POST that never fires.
async function openDeleteReview(page: Page, scenario: ScenarioFixtureContext) {
  const review = waitForServerActionResponse(page, { pathIncludes: "/admin/users", timeoutMs: 15_000 });
  const trigger = page.getByRole("button", { name: `Delete account: ${targetOf(scenario).username}`, exact: true });
  const dialog = page.getByRole("dialog");
  await expect(async () => {
    if (!(await dialog.isVisible())) await trigger.click();
    await expect(dialog).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 10_000 });
  await review;
}
const confirmButton = (page: Page) => page.getByRole("dialog").getByRole("button", { name: /^Delete account$/ });

When("I open the delete review for the account in Users", async ({ page, scenario }) => {
  await openDeleteReview(page, scenario);
});
When("I delete the unfinished account in Users", async ({ page, scenario }) => {
  await openDeleteReview(page, scenario);
  await expect(confirmButton(page)).toBeEnabled();
  const response = waitForServerActionResponse(page, { pathIncludes: "/admin/users" });
  await confirmButton(page).click();
  await response;
});
Then("the unfinished account is gone after refresh", async ({ page, scenario }) => {
  await page.reload();
  await expect(page.getByRole("list", { name: "App users" })).toBeVisible();
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
  // Once Users shows it as completed, the same review is offered for it.
  await expect(targetRow(page, scenario).getByRole("button", { name: /Delete account/ })).toHaveCount(1);
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

Given("an isolated deletion app", async ({ scenario }) => {
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
// The service takes the admin as the session carries them: ID plus current session version.
async function reviewed(fixture: CredentialAuthorizationFixture, key: string) {
  const actorId = fixture.userId("admin");
  const sessionVersion = await fixture.database().transaction(async (transaction) => {
    const [row] = (await transaction.execute(
      sql`select session_version as "sessionVersion" from users where id = ${actorId}`
    )) as unknown as { sessionVersion: number }[];
    return row.sessionVersion;
  });
  const actor = { id: actorId, sessionVersion };
  const preview = await previewAccountDeletionAsAdmin(fixture.database(), actor, fixture.userId(key));
  if (!preview.ok) throw new Error(`Review refused: ${preview.reason}`);
  return (gate?: ReturnType<typeof createLockGate>) =>
    deleteAccountAsAdmin(fixture.database(gate), actor, fixture.userId(key), preview.preview.fingerprint);
}
Then("deletion waiting behind completion asks for a new review of the completed account", async ({ scenario }) => {
  const fixture = scenario.getValue<CredentialAuthorizationFixture>(FIXTURE_KEY)!;
  const original = await issueSetup(fixture, "pending");
  const confirmDeletion = await reviewed(fixture, "pending");
  const gate = createLockGate();
  const completion = complete(fixture, original.token, gate);
  let waiting: ReturnType<typeof confirmDeletion> | undefined;
  try {
    await gate.reached;
    waiting = confirmDeletion();
    await fixture.waitForBlockedTransaction();
  } finally {
    gate.release();
  }
  expect((await completion).ok).toBe(true);
  expect(await waiting).toMatchObject({ ok: false, reason: "changed", preview: { setupComplete: true } });
  expect(await fixture.accountExists("pending")).toBe(true);
});
Then("completion waiting behind deletion finds no authorization", async ({ scenario }) => {
  const fixture = scenario.getValue<CredentialAuthorizationFixture>(FIXTURE_KEY)!;
  const original = await issueSetup(fixture, "second");
  const confirmDeletion = await reviewed(fixture, "second");
  const gate = createLockGate();
  const deletion = confirmDeletion(gate);
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
