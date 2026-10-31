import { expect, type Page } from "@playwright/test";
import { and, eq, sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { activityEvents, credentialAuthorizations, users } from "../../../src/db/schema";
import { regenerateSetupLink, type SetupLinkRegenerationDatabase } from "../../../src/lib/setup-link-regeneration";
import {
  consumeCredentialAuthorization,
  issueCredentialAuthorization,
  validateCredentialAuthorization,
  type CredentialAuthorizationDatabase,
} from "../../../src/lib/credential-authorizations";
import { changeUserRole } from "../../../src/lib/account-role-changes";
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

interface RegenerationTarget extends ScenarioUserRecord {
  oldToken: string;
  oldExpiry: string;
}
const TARGET_KEY = "regenerationTarget";
const FIXTURE_KEY = "regenerationFixture";
const NOW = new Date("2026-10-28T12:00:00Z");
const clock = () => new Date(NOW);
const targetOf = (scenario: ScenarioFixtureContext) => scenario.getValue<RegenerationTarget>(TARGET_KEY)!;
const fixtureOf = (scenario: ScenarioFixtureContext) => scenario.getValue<CredentialAuthorizationFixture>(FIXTURE_KEY)!;
const targetRow = (page: Page, scenario: ScenarioFixtureContext) =>
  page
    .getByRole("list", { name: "App users" })
    .getByRole("listitem")
    .filter({ has: page.getByText(targetOf(scenario).username, { exact: true }) });
async function currentAuthorizations(scenario: ScenarioFixtureContext) {
  return withE2EDb((database) =>
    database
      .select()
      .from(credentialAuthorizations)
      .where(eq(credentialAuthorizations.userId, targetOf(scenario).id))
  );
}
Given("a regeneration target with a {string} setup link", async ({ page, scenario }, state: string) => {
  const { user } = await scenario.materialize({
    user: { mother: "pending", setCurrent: false },
  });
  if (!user || !scenario.currentUser) throw new Error("Missing scenario accounts.");
  const issued = await withE2EDb((database) =>
    issueCredentialAuthorization(
      database as unknown as CredentialAuthorizationDatabase,
      { kind: "admin", actorUserId: scenario.currentUser!.id },
      { userId: user.id, purpose: "setup" },
      state === "expired" ? () => new Date(Date.now() - 25 * 3_600_000) : undefined
    )
  );
  if (!issued.ok) throw new Error(issued.reason);
  scenario.setValue<RegenerationTarget>(TARGET_KEY, { ...user, oldToken: issued.token, oldExpiry: issued.expiresAt });
  if (state === "pending") {
    const browserContext = await recipientContext(page);
    const setupPage = await browserContext.newPage();
    scenario.setValue("regenerationOldSetupPage", setupPage);
    await openCredentialLink(setupPage, `/account-setup/open?token=${issued.token}`);
    await expect(setupPage.getByRole("dialog", { name: "Set up your account" })).toBeVisible();
  }
});
Then("the regeneration row shows {string}", async ({ page, scenario }, label: string) => {
  await expect(targetRow(page, scenario)).toContainText(label);
  await expect(
    targetRow(page, scenario).getByRole("button", {
      name: `Generate new link: ${targetOf(scenario).username}`,
      exact: true,
    })
  ).toBeVisible();
});
When("I generate the target's replacement setup link", async ({ page, scenario }) => {
  await page.getByRole("button", { name: `Generate new link: ${targetOf(scenario).username}`, exact: true }).click();
  const response = waitForServerActionResponse(page, { pathIncludes: "/admin/users" });
  scenario.setValue("regenerationStartedAt", Date.now());
  await page.getByRole("dialog").getByRole("button", { name: "Generate new link", exact: true }).click();
  await response;
});
Then("regeneration keeps the account ID and gives a fresh 24-hour setup link", async ({ page, scenario }) => {
  const target = targetOf(scenario);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "New setup link ready" })).toBeFocused();
  const url = await dialog.locator("p.select-text").textContent();
  if (!url) throw new Error("Missing one-time result.");
  scenario.setValue("regeneratedUrl", url);
  const accounts = await withE2EDb((database) =>
    database.select({ id: users.id }).from(users).where(eq(users.username, target.username))
  );
  expect(accounts).toEqual([{ id: target.id }]);
  const authorizations = await currentAuthorizations(scenario);
  expect(authorizations).toHaveLength(2);
  expect(authorizations.filter((authorization) => authorization.invalidatedAt !== null)).toHaveLength(1);
  const current = authorizations.find((authorization) => authorization.invalidatedAt === null)!;
  const lifetime = current.expiresAt.getTime() - scenario.getValue<number>("regenerationStartedAt")!;
  expect(lifetime).toBeGreaterThanOrEqual(24 * 3_600_000 - 10_000);
  expect(lifetime).toBeLessThanOrEqual(24 * 3_600_000 + 10_000);
  await expect(dialog.locator("time")).toHaveAttribute("datetime", current.expiresAt.toISOString());
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await expect(targetRow(page, scenario)).toHaveCount(1);
});
Then("regeneration Activity identifies only the admin and target", async ({ scenario }) => {
  const read = () =>
    withE2EDb((database) =>
      database
        .select()
        .from(activityEvents)
        .where(
          and(eq(activityEvents.targetId, targetOf(scenario).id), eq(activityEvents.type, "setup_link_regenerated"))
        )
    );
  await expect.poll(async () => (await read()).length).toBe(1);
  const [event] = await read();
  expect(event.actorId).toBe(scenario.currentUser!.id);
  expect(event.actorUsername).toBe(scenario.currentUser!.username);
  expect(event.targetId).toBe(targetOf(scenario).id);
  expect(event.targetUsername).toBe(targetOf(scenario).username);
  expect(JSON.stringify(event).includes("token=")).toBe(false);
  const creations = await withE2EDb((database) =>
    database
      .select({ id: activityEvents.id })
      .from(activityEvents)
      .where(and(eq(activityEvents.targetId, targetOf(scenario).id), eq(activityEvents.type, "account_created")))
  );
  expect(creations).toHaveLength(0);
});
Then("the prior setup link is rejected and the replacement opens setup", async ({ page, scenario }) => {
  // Raw credentials stay in scenario memory; no assertions echo URLs or tokens. Default E2E traces/video are off.
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
    await openCredentialLink(recipient, scenario.getValue<string>("regeneratedUrl")!);
    await expect(recipient.getByRole("dialog", { name: "Set up your account" })).toBeVisible();
    expect(new URL(recipient.url()).search).toBe("");
  } finally {
    await context.close();
  }
});
When("the regeneration target becomes {string} after Users loaded", async ({ scenario }, state: string) => {
  await withE2EDb((database) =>
    state === "deleted"
      ? database.delete(users).where(eq(users.id, targetOf(scenario).id))
      : database
          .update(users)
          .set({ passwordHash: "completed-fixture" })
          .where(eq(users.id, targetOf(scenario).id))
  );
});
Then(
  "Users reconciles the {string} regeneration target without issuance",
  async ({ page, scenario }, state: string) => {
    if (state === "deleted") await expect(targetRow(page, scenario)).toHaveCount(0);
    else {
      await expect(targetRow(page, scenario)).not.toContainText("Pending setup");
      await expect(targetRow(page, scenario).getByRole("button", { name: /Generate new link/ })).toHaveCount(0);
    }
    expect((await currentAuthorizations(scenario)).length).toBe(state === "deleted" ? 0 : 1);
    const accounts = await withE2EDb((database) =>
      database
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, targetOf(scenario).username))
    );
    expect(accounts).toEqual(state === "deleted" ? [] : [{ id: targetOf(scenario).id }]);
  }
);
When("regeneration commits but its response and first state check are lost", async ({ page, scenario }) => {
  let posts = 0;
  await page.route("**/admin/users", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    posts++;
    if (posts === 1) {
      await route.fetch();
      await route.abort("failed");
    } else if (posts === 2) await route.abort("failed");
    else await route.continue();
  });
  await page.getByRole("button", { name: `Generate new link: ${targetOf(scenario).username}`, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Generate new link", exact: true }).click();
  await expect(page.getByRole("button", { name: "Check again", exact: true })).toBeVisible();
  expect(posts).toBe(2);
  expect(await currentAuthorizations(scenario)).toHaveLength(2);
});
Then("regeneration remains locked across close and reopen", async ({ page, scenario }) => {
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: `Generate new link: ${targetOf(scenario).username}`, exact: true }).click();
  await expect(page.getByRole("button", { name: "Check again", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Generate new link", exact: true })).toHaveCount(0);
});
When("I check regeneration state again", async ({ page }) => {
  const response = waitForServerActionResponse(page, { pathIncludes: "/admin/users" });
  await page.getByRole("button", { name: "Check again", exact: true }).click();
  await response;
});
Then("regeneration permits only deliberate replacement of the lost result", async ({ page, scenario }) => {
  await expect(page.getByRole("button", { name: "Generate replacement link", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Copy link" })).toHaveCount(0);
  expect(await currentAuthorizations(scenario)).toHaveLength(2);
  const response = waitForServerActionResponse(page, { pathIncludes: "/admin/users" });
  await page.getByRole("button", { name: "Generate replacement link", exact: true }).click();
  await response;
  await expect(page.getByRole("heading", { name: "New setup link ready" })).toBeVisible();
  expect(await currentAuthorizations(scenario)).toHaveLength(3);
  await page.unroute("**/admin/users");
});

After(async ({ scenario }) => {
  await scenario.getValue<Page>("regenerationOldSetupPage")?.context().close();
  await scenario.getValue<CredentialAuthorizationFixture>(FIXTURE_KEY)?.close();
});
Given("an isolated regeneration app", async ({ scenario }) => {
  const fixture = await createCredentialAuthorizationFixture((created) => scenario.setValue(FIXTURE_KEY, created));
  await fixture.seedUsers([
    { key: "admin", role: "admin", completed: true },
    { key: "other", role: "admin", completed: true },
    { key: "pending", role: "member", completed: false },
  ]);
});
async function issueOriginal(fixture: CredentialAuthorizationFixture) {
  const issued = await issueCredentialAuthorization(
    fixture.database(),
    { kind: "admin", actorUserId: fixture.userId("admin") },
    { userId: fixture.userId("pending"), purpose: "setup" },
    clock
  );
  if (!issued.ok) throw new Error(issued.reason);
  return issued;
}
Then("regeneration waiting behind completion refuses the completed account", async ({ scenario }) => {
  const fixture = fixtureOf(scenario);
  const original = await issueOriginal(fixture);
  const gate = createLockGate();
  const completion = consumeCredentialAuthorization(
    fixture.database(gate),
    { token: original.token, purpose: "setup" },
    async (transaction, account) => {
      await transaction.execute(sql`update users set password_hash = 'completed' where id = ${account.userId}`);
    },
    clock
  );
  let waiting: ReturnType<typeof regenerateSetupLink> | undefined;
  try {
    await gate.reached;
    waiting = regenerateSetupLink(fixture.database(), fixture.userId("admin"), fixture.userId("pending"), clock);
    await fixture.waitForBlockedTransaction();
  } finally {
    gate.release();
  }
  expect((await completion).ok).toBe(true);
  expect(await waiting).toEqual({ ok: false, reason: "changed-state" });
});
Then("regeneration waiting behind admin demotion is forbidden", async ({ scenario }) => {
  const fixture = fixtureOf(scenario);
  const gate = createLockGate();
  const demotion = changeUserRole(fixture.database(gate), fixture.userId("other"), {
    targetUserId: fixture.userId("admin"),
    role: "member",
  });
  let waiting: ReturnType<typeof regenerateSetupLink> | undefined;
  try {
    await gate.reached;
    waiting = regenerateSetupLink(fixture.database(), fixture.userId("admin"), fixture.userId("pending"), clock);
    await fixture.waitForBlockedTransaction();
  } finally {
    gate.release();
  }
  expect((await demotion).ok).toBe(true);
  expect(await waiting).toEqual({ ok: false, reason: "forbidden" });
});
Then("an authorization insert failure rolls back regeneration invalidation", async ({ scenario }) => {
  const fixture = fixtureOf(scenario);
  const original = await issueOriginal(fixture);
  const dialect = new PgDialect();
  const base = fixture.database();
  const failing = {
    transaction: (run: Parameters<SetupLinkRegenerationDatabase["transaction"]>[0]) =>
      base.transaction((transaction) =>
        run(
          new Proxy(transaction, {
            get(target, property) {
              const value = Reflect.get(target, property);
              if (property !== "execute") return typeof value === "function" ? value.bind(target) : value;
              return async (statement: Parameters<typeof target.execute>[0]) => {
                const text = typeof statement === "string" ? statement : dialect.sqlToQuery(statement.getSQL()).sql;
                if (text.startsWith("insert into") && text.includes("credential_authorizations"))
                  throw new Error("replacement insert failed");
                return target.execute(statement);
              };
            },
          })
        )
      ),
  } as SetupLinkRegenerationDatabase;
  await expect(regenerateSetupLink(failing, fixture.userId("admin"), fixture.userId("pending"), clock)).rejects.toThrow(
    "replacement insert failed"
  );
  expect(
    (await validateCredentialAuthorization(fixture.database(), { token: original.token, purpose: "setup" }, clock)).ok
  ).toBe(true);
  const rows = await fixture
    .database()
    .transaction((transaction) => transaction.execute(sql`select id, invalidated_at from credential_authorizations`));
  expect(rows).toHaveLength(1);
  expect(rows[0].invalidated_at).toBeNull();
});
