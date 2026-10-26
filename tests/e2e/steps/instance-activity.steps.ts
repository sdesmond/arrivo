import { expect, type Page } from "@playwright/test";
import { and, eq, gte, isNull, type SQL } from "drizzle-orm";
import { activityEvents, users } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { Given, When, Then } from "../fixtures";
import type { ScenarioUserRecord } from "../scenario-fixture";
import { waitForServerActionResponse } from "../server-action";

// Also uses "I am signed in as an instance {string}" and "instance management is not found" from
// account-menu.steps.ts, and the sign-in / code steps from mfa.steps.ts.

Given("the current account is an instance admin", async ({ scenario }) => {
  await scenario.ensureCurrentUser({ user: { role: "admin" } });
});

When("I open the instance Activity page", async ({ page }) => {
  await page.goto("/admin/activity");
  await expect(page.getByRole("heading", { name: "Activity", exact: true })).toBeVisible();
});

When("I refresh the page", async ({ page }) => {
  await page.reload();
});

Then("the Activity table lists a Sign-in row for me", async ({ page, scenario }) => {
  const user = await scenario.ensureCurrentUser();
  const table = page.getByRole("table", { name: "Recent instance activity" });
  // The row is written after the sign-in response, so it can land just after the first load.
  await expect(async () => {
    await page.reload();
    await expect(table.getByRole("row").filter({ hasText: user.username }).filter({ hasText: "Sign-in" })).toHaveCount(
      1
    );
  }).toPass();
});

async function signInCount(userId: string): Promise<number> {
  const rows = await withE2EDb((database) =>
    database
      .select({ id: activityEvents.id })
      .from(activityEvents)
      .where(and(eq(activityEvents.actorId, userId), eq(activityEvents.type, "sign_in")))
  );
  return rows.length;
}

Then("my account has {int} recorded sign-ins", async ({ scenario }, count: number) => {
  const user = await scenario.ensureCurrentUser();
  if (count === 0) {
    // Nothing to wait for; give a wrongly-scheduled write time to show up before asserting absence.
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(await signInCount(user.id)).toBe(0);
    return;
  }
  await expect.poll(() => signInCount(user.id)).toBe(count);
});

Given("that member signed in and then had their account deleted", async ({ scenario }) => {
  const member = scenario.getValue<ScenarioUserRecord>("instanceMember")!;
  const now = new Date();
  await withE2EDb(async (database) => {
    await database.insert(activityEvents).values({
      type: "sign_in",
      startedAt: now,
      endedAt: now,
      actorId: member.id,
      actorUsername: member.username,
    });
    await database.delete(users).where(eq(users.id, member.id));
  });
});

Then("the Activity table lists a Sign-in row for that deleted member", async ({ page, scenario }) => {
  const member = scenario.getValue<ScenarioUserRecord>("instanceMember")!;
  const table = page.getByRole("table", { name: "Recent instance activity" });
  await expect(table.getByRole("row").filter({ hasText: member.username }).filter({ hasText: "Sign-in" })).toHaveCount(
    1
  );
});

// ── Authentication and account events ─────────────────────────────────────────────────────────────────────────
// Also uses "I sign out" (auth.steps.ts), "I sign in with my password" (mfa.steps.ts), "I navigate to the Identity
// section" and "I change my username to a new one and save" (profile.steps.ts), "another completed instance member
// exists" and "I promote the other instance member" (instance-users.steps.ts).

const ORIGINAL_IDENTITY_KEY = "activity:originalIdentity";
const UNKNOWN_USERNAME_KEY = "activity:unknownUsername";
const FAILURE_WINDOW_KEY = "activity:failureWindowStart";
const OTHER_ADMIN_KEY = "activity:otherAdmin";
const NEW_PASSWORD = "a-brand-new-password";
const WRONG_PASSWORD = "definitely-the-wrong-password";

type ActivityRow = typeof activityEvents.$inferSelect;
interface RememberedIdentity {
  id: string;
  username: string;
}

async function activityRows(condition: SQL | undefined): Promise<ActivityRow[]> {
  return withE2EDb((database) => database.select().from(activityEvents).where(condition));
}

async function submitSignIn(page: Page, username: string, password: string) {
  await page.getByRole("textbox", { name: "Username" }).fill(username);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  // bcrypt and the throttle transaction can run past the 5s default when the whole suite loads the server.
  const response = waitForServerActionResponse(page, { pathIncludes: "/sign-in", timeoutMs: 15_000 });
  await page.getByRole("button", { name: "Sign in" }).click();
  await response;
  await expect(page.locator("#form-error")).toHaveText("Invalid username or password.");
}

async function postToCredentialsCallback(page: Page, fields: Record<string, string>) {
  const csrf = (await (await page.request.get("/api/auth/csrf")).json()) as { csrfToken: string };
  const response = await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken: csrf.csrfToken, json: "true", ...fields },
    maxRedirects: 0,
  });
  expect(response.status()).toBeLessThan(500);
}

async function expectActivityRow(page: Page, texts: string[]) {
  const table = page.getByRole("table", { name: "Recent instance activity" });
  // Rows are written after the response, so one can land just after the first load.
  await expect(async () => {
    await page.reload();
    let rows = table.getByRole("row");
    for (const text of texts) rows = rows.filter({ hasText: text });
    await expect(rows).toHaveCount(1);
  }).toPass();
}

const failuresAgainst = (userId: string) =>
  and(eq(activityEvents.type, "sign_in_failed"), eq(activityEvents.targetId, userId));

Given("I remember my current username", async ({ scenario }) => {
  const user = await scenario.ensureCurrentUser();
  scenario.setValue<RememberedIdentity>(ORIGINAL_IDENTITY_KEY, { id: user.id, username: user.username });
});

When("I submit the wrong password for my account", async ({ page, scenario }) => {
  const user = await scenario.ensureCurrentUser();
  await submitSignIn(page, user.username, WRONG_PASSWORD);
});

When("I submit the wrong password for an account that does not exist", async ({ page, scenario }) => {
  const username = scenario.uniqueUsername("ghost");
  scenario.setValue(UNKNOWN_USERNAME_KEY, username);
  await submitSignIn(page, username, WRONG_PASSWORD);
});

When("wrong credentials for my account are posted directly to the sign-in callback", async ({ page, scenario }) => {
  const user = await scenario.ensureCurrentUser();
  await postToCredentialsCallback(page, { username: user.username, password: WRONG_PASSWORD });
});

When("a forged second-factor ticket is posted directly to the sign-in callback", async ({ page, scenario }) => {
  scenario.setValue(FAILURE_WINDOW_KEY, new Date());
  await postToCredentialsCallback(page, { mfaTicket: "forged.ticket", code: "123456" });
});

Then("{int} failed sign-in is recorded against my account", async ({ scenario }, count: number) => {
  const user = await scenario.ensureCurrentUser();
  await expect.poll(async () => (await activityRows(failuresAgainst(user.id))).length).toBe(count);
  const [row] = await activityRows(failuresAgainst(user.id));
  // A rejection names who was attempted; nobody was authenticated, and no secret or address is stored.
  expect(row).toMatchObject({ actorId: null, actorUsername: null, targetId: user.id, targetUsername: user.username });
});

Then("{int} failed sign-in is recorded against that unknown username", async ({ scenario }, count: number) => {
  const username = scenario.getValue<string>(UNKNOWN_USERNAME_KEY)!;
  const condition = and(eq(activityEvents.type, "sign_in_failed"), eq(activityEvents.targetUsername, username));
  await expect.poll(async () => (await activityRows(condition)).length).toBe(count);
  const [row] = await activityRows(condition);
  expect(row).toMatchObject({ actorId: null, actorUsername: null, targetId: null, targetUsername: username });
});

Then("{int} failed sign-in is recorded with no identity", async ({ scenario }, count: number) => {
  const since = scenario.getValue<Date>(FAILURE_WINDOW_KEY)!;
  const condition = and(
    eq(activityEvents.type, "sign_in_failed"),
    isNull(activityEvents.targetId),
    isNull(activityEvents.targetUsername),
    isNull(activityEvents.actorId),
    gte(activityEvents.startedAt, since)
  );
  await expect.poll(async () => (await activityRows(condition)).length).toBe(count);
});

Then(
  "the Activity table lists a Failed sign-in row for my account with an unavailable actor",
  async ({ page, scenario }) => {
    const user = await scenario.ensureCurrentUser();
    await expectActivityRow(page, ["Failed sign-in", "Unavailable", user.username]);
  }
);

Then("the Activity table lists a Failed sign-in row for that unknown username", async ({ page, scenario }) => {
  const username = scenario.getValue<string>(UNKNOWN_USERNAME_KEY)!;
  await expectActivityRow(page, ["Failed sign-in", `${username} (Unknown account)`]);
});

Then("the Activity table lists a Failed sign-in row with an unavailable affected account", async ({ page }) => {
  const table = page.getByRole("table", { name: "Recent instance activity" });
  await expect(async () => {
    await page.reload();
    const cells = table.getByRole("row").filter({ hasText: "Failed sign-in" }).first().getByRole("cell");
    await expect(cells.nth(0)).toHaveText("Unavailable");
    await expect(cells.nth(3)).toHaveText("Unavailable");
  }).toPass();
});

Then("my account has {int} recorded {string} events", async ({ scenario }, count: number, type: string) => {
  const identity = scenario.getValue<RememberedIdentity>(ORIGINAL_IDENTITY_KEY) ?? (await scenario.ensureCurrentUser());
  const condition = and(eq(activityEvents.actorId, identity.id), eq(activityEvents.type, type));
  if (count === 0) {
    // Nothing to wait for; give a wrongly-scheduled write time to show up before asserting absence.
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(await activityRows(condition)).toHaveLength(0);
    return;
  }
  await expect.poll(async () => (await activityRows(condition)).length).toBe(count);
});

Then("the Activity table lists a Sign-out row for me", async ({ page, scenario }) => {
  const user = await scenario.ensureCurrentUser();
  await expectActivityRow(page, [user.username, "Sign-out"]);
});

Then("the role change names me and the other instance member", async ({ scenario }) => {
  const me = await scenario.ensureCurrentUser();
  const member = scenario.getValue<ScenarioUserRecord>("instanceMember")!;
  const [row] = await activityRows(and(eq(activityEvents.actorId, me.id), eq(activityEvents.type, "role_changed")));
  expect(row).toMatchObject({ actorUsername: me.username, targetId: member.id, targetUsername: member.username });
});

Then(
  "the Activity table lists a Changed role row for me affecting the other instance member",
  async ({ page, scenario }) => {
    const me = await scenario.ensureCurrentUser();
    const member = scenario.getValue<ScenarioUserRecord>("instanceMember")!;
    await expectActivityRow(page, [me.username, "Changed role", member.username]);
  }
);

When("I open my profile page", async ({ page }) => {
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Profile & Settings" })).toBeVisible();
});

Then("the rename event keeps my original username and account ID", async ({ scenario }) => {
  const original = scenario.getValue<RememberedIdentity>(ORIGINAL_IDENTITY_KEY)!;
  const renamed = await scenario.ensureCurrentUser();
  const condition = and(eq(activityEvents.actorId, original.id), eq(activityEvents.type, "username_changed"));
  const rows = await activityRows(condition);
  expect(rows).toHaveLength(1);
  expect(rows[0].actorUsername).toBe(original.username);
  // The new value is deliberately not stored anywhere on the event.
  expect(JSON.stringify(rows[0])).not.toContain(renamed.username);
  const [account] = await withE2EDb((database) =>
    database.select({ username: users.username }).from(users).where(eq(users.id, original.id))
  );
  expect(account.username).toBe(renamed.username);
});

Then("the Activity table lists a Changed username row for my original username", async ({ page, scenario }) => {
  const original = scenario.getValue<RememberedIdentity>(ORIGINAL_IDENTITY_KEY)!;
  await expectActivityRow(page, [original.username, "Changed username"]);
});

When("I change my password", async ({ page, scenario }) => {
  await page.getByRole("tab", { name: "Account" }).click();
  await page.locator("#pw-current").fill(process.env.E2E_PASSWORD!);
  await page.locator("#pw-new").fill(NEW_PASSWORD);
  await page.locator("#pw-confirm").fill(NEW_PASSWORD);
  // The action ends in a sign-out redirect, so only the POST itself is awaited here.
  const response = waitForServerActionResponse(page, { pathIncludes: "/profile", timeoutMs: 15_000, required: false });
  await page.getByRole("button", { name: "Update password" }).click();
  await response;
  scenario.signOut();
});

When("I sign in with my new password", async ({ page, scenario }) => {
  const user = await scenario.ensureCurrentUser();
  await page.getByRole("textbox", { name: "Username" }).fill(user.username);
  await page.getByRole("textbox", { name: "Password" }).fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/trips");
});

Then("the Activity table lists a Changed password row for me", async ({ page, scenario }) => {
  const user = await scenario.ensureCurrentUser();
  await expectActivityRow(page, [user.username, "Changed password"]);
});

Given("another completed instance admin exists", async ({ scenario }) => {
  const { user } = await scenario.materialize({ user: { overrides: { user: { role: "admin" } }, setCurrent: false } });
  if (!user) throw new Error("Failed to create the other instance admin.");
  scenario.setValue(OTHER_ADMIN_KEY, user);
});

When("I delete my account", async ({ page, scenario }) => {
  await page.getByRole("tab", { name: "Account" }).click();
  await page.getByRole("button", { name: "Delete account", exact: true }).click();
  const response = waitForServerActionResponse(page, { pathIncludes: "/profile", timeoutMs: 15_000, required: false });
  await page.getByRole("dialog").getByRole("button", { name: "Delete account", exact: true }).click();
  await response;
  scenario.signOut();
});

Then("the deletion event keeps my original username and account ID", async ({ scenario }) => {
  const original = scenario.getValue<RememberedIdentity>(ORIGINAL_IDENTITY_KEY)!;
  const condition = and(eq(activityEvents.actorId, original.id), eq(activityEvents.type, "account_deleted"));
  const rows = await activityRows(condition);
  expect(rows).toHaveLength(1);
  expect(rows[0].actorUsername).toBe(original.username);
  const remaining = await withE2EDb((database) =>
    database.select({ id: users.id }).from(users).where(eq(users.id, original.id))
  );
  expect(remaining).toHaveLength(0);
});

When("the other instance admin opens the instance Activity page", async ({ page, scenario }) => {
  const other = scenario.getValue<ScenarioUserRecord>(OTHER_ADMIN_KEY)!;
  await page.context().clearCookies();
  await scenario.signInAsUser(page, other.username);
  await page.goto("/admin/activity");
  await expect(page.getByRole("heading", { name: "Activity", exact: true })).toBeVisible();
});

Then("the Activity table lists a Deleted own account row for my original username", async ({ page, scenario }) => {
  const original = scenario.getValue<RememberedIdentity>(ORIGINAL_IDENTITY_KEY)!;
  await expectActivityRow(page, [original.username, "Deleted own account"]);
});
