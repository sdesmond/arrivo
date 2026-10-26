import { expect, type Locator, type Page } from "@playwright/test";
import { and, eq, gte, isNull, type SQL } from "drizzle-orm";
import { activityEvents, invitations, users } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import {
  removeSeededActivity,
  seedActivityEvents,
  seedActor,
  uniqueSeedMinute,
  type SeedActor,
} from "../activity-seed";
import { After, Given, When, Then } from "../fixtures";
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

// Trip producers use scenario-owned trips; only real UI mutations create Activity rows.
const ACTIVITY_TRIP_NAME = "Private Activity destination";

When("I create a private trip for Activity", async ({ page, scenario }) => {
  await page.getByRole("button", { name: "New trip", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill(ACTIVITY_TRIP_NAME);
  const response = waitForServerActionResponse(page, { pathIncludes: "/trips", timeoutMs: 15_000 });
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await response;
  await expect(page).toHaveURL(/\/trips\/[^/?]+(\?new=1)?$/);
  await scenario.rememberTripByName(ACTIVITY_TRIP_NAME);
});

Given("a private itinerary exists for Activity", async ({ page, scenario }) => {
  const trip = await scenario.ensureCurrentTrip("threeDayTrip", { trip: { name: ACTIVITY_TRIP_NAME } });
  await page.goto(`/trips/${trip.id}`);
});

When("I add two private itinerary notes for Activity", async ({ page, scenario }) => {
  const trip = scenario.currentTrip!;
  const dayToggle = page
    .locator("button[aria-expanded]")
    .filter({ hasText: /\d+ stops/ })
    .first();
  if ((await dayToggle.getAttribute("aria-expanded")) === "false") await dayToggle.click();
  for (const content of ["Private first itinerary detail", "Private second itinerary detail"]) {
    await page
      .getByRole("button", { name: /add a place/i })
      .first()
      .click();
    await page.getByTitle("Add note").click();
    await page.getByPlaceholder("Add a note…").fill(content);
    const since = Date.now();
    const response = waitForServerActionResponse(page, { pathIncludes: `/trips/${trip.id}` });
    await page.keyboard.press("Enter");
    await response;
    // Wait for each write so the final assertion proves both edits joined the batch.
    await expect
      .poll(async () => {
        const rows = await activityRows(
          and(eq(activityEvents.tripId, trip.id), eq(activityEvents.type, "trip_updated"))
        );
        return rows[0]?.endedAt.getTime() ?? 0;
      })
      .toBeGreaterThanOrEqual(since);
  }
});

Then("Activity lists one {string} row for that trip without its name", async ({ page, scenario }, action: string) => {
  const trip = scenario.currentTrip!;
  const user = await scenario.ensureCurrentUser();
  const type = action === "Created trip" ? "trip_created" : "trip_updated";
  const condition = and(eq(activityEvents.tripId, trip.id), eq(activityEvents.type, type));
  await expect.poll(async () => (await activityRows(condition)).length).toBe(1);
  const [event] = await activityRows(condition);
  expect(event).toMatchObject({ actorId: user.id, actorUsername: user.username, targetId: null, targetUsername: null });
  await expectActivityRow(page, [action, user.username, trip.id]);
  const table = page.getByRole("table", { name: "Recent instance activity" });
  await expect(table).not.toContainText(trip.name);
  await expect(table).not.toContainText("Private first itinerary detail");
  await expect(table).not.toContainText("Private second itinerary detail");
});

const PRIVATE_EXPENSE_AMOUNT = "123.45";
const PRIVATE_RESERVATION_PROVIDER = "Private Activity Air";

async function waitForTripUpdatedEndAfter(tripId: string, since: number): Promise<void> {
  await expect
    .poll(async () => {
      const rows = await activityRows(and(eq(activityEvents.tripId, tripId), eq(activityEvents.type, "trip_updated")));
      return rows[0]?.endedAt.getTime() ?? 0;
    })
    .toBeGreaterThanOrEqual(since);
}

When("I add a private expense for Activity", async ({ page, scenario }) => {
  const trip = scenario.currentTrip!;
  await page.getByRole("button", { name: "Budget" }).click();
  await page.getByRole("button", { name: "Add Misc Expense" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "Amount" }).fill(PRIVATE_EXPENSE_AMOUNT);
  await page.getByRole("button", { name: "Select category" }).click();
  await page.getByRole("option", { name: "Food", exact: true }).click();
  const since = Date.now();
  const response = waitForServerActionResponse(page, { pathIncludes: `/trips/${trip.id}`, timeoutMs: 15_000 });
  await dialog.getByRole("button", { name: "Save" }).click();
  await response;
  await expect(dialog).not.toBeVisible();
  await waitForTripUpdatedEndAfter(trip.id, since);
});

When("I add a private reservation for Activity", async ({ page, scenario }) => {
  const trip = scenario.currentTrip!;
  await page.getByRole("button", { name: "Reservations", exact: true }).click();
  await page.getByRole("button", { name: "Add Reservation" }).click();
  await page.getByRole("menuitem", { name: "Flight" }).click();
  await page.getByLabel("Provider *").fill(PRIVATE_RESERVATION_PROVIDER);
  const since = Date.now();
  const response = waitForServerActionResponse(page, { pathIncludes: `/trips/${trip.id}`, timeoutMs: 15_000 });
  // The dev-only mock-date toggle overlaps the drawer footer, so focus + Enter avoids pointer interception.
  const save = page.getByRole("button", { name: "Save" });
  await save.focus();
  await save.press("Enter");
  await response;
  await waitForTripUpdatedEndAfter(trip.id, since);
});

Then("Activity shows no expense amount or reservation provider", async ({ page }) => {
  const table = page.getByRole("table", { name: "Recent instance activity" });
  await expect(table).not.toContainText(PRIVATE_EXPENSE_AMOUNT);
  await expect(table).not.toContainText(PRIVATE_RESERVATION_PROVIDER);
});

// Invitations reuse trip-sharing's scenario-owned invitable account and real UI form.
When("the Activity invitee accepts their real invitation", async ({ page, scenario }) => {
  const invitee = scenario.getValue<ScenarioUserRecord>("invitableUser")!;
  const trip = scenario.currentTrip!;
  const session = await scenario.openSecondSession(page);
  try {
    await scenario.signInAsUser(session.page, invitee.username);
    const response = waitForServerActionResponse(session.page, { pathIncludes: "/trips", timeoutMs: 15_000 });
    await session.page.getByTitle(`Accept invitation to ${trip.name}`).click();
    await response;
    await expect(session.page).toHaveURL(`/trips/${trip.id}`);
  } finally {
    await session.context.close();
  }
});

When("I rescind the Activity invitation", async ({ page, scenario }) => {
  const invitee = scenario.getValue<ScenarioUserRecord>("invitableUser")!;
  const response = waitForServerActionResponse(page, { pathIncludes: `/trips/${scenario.currentTrip!.id}` });
  await page.getByTitle(`Rescind invitation to @${invitee.username}`).click();
  await response;
  await expect(page.getByText("Invitation rescinded.", { exact: true })).toBeVisible();
});

When("I resend the Activity invitation using both controls", async ({ page, scenario }) => {
  const invitee = scenario.getValue<ScenarioUserRecord>("invitableUser")!;
  for (const control of ["resend", "invite"] as const) {
    if (control === "invite") await page.getByLabel("Invite username").fill(invitee.username);
    const response = waitForServerActionResponse(page, { pathIncludes: `/trips/${scenario.currentTrip!.id}` });
    await page
      .getByTitle(control === "resend" ? `Resend invitation to @${invitee.username}` : "Invite this person to the trip")
      .click();
    await response;
  }
});

When("I try an Activity invitation for a missing account", async ({ page, scenario }) => {
  await page.getByLabel("Invite username").fill(scenario.uniqueUsername("missing"));
  const response = waitForServerActionResponse(page, { pathIncludes: `/trips/${scenario.currentTrip!.id}` });
  await page.getByTitle("Invite this person to the trip").click();
  await response;
  await expect(page.getByText("No account found for this username.", { exact: true })).toBeVisible();
});

Then(
  "Activity lists one {string} transition without invitation metadata",
  async ({ page, scenario }, action: string) => {
    const trip = scenario.currentTrip!;
    const manager = await scenario.ensureCurrentUser();
    const invitee = scenario.getValue<ScenarioUserRecord>("invitableUser")!;
    const types: Record<string, string> = {
      "Created invitation": "invitation_created",
      "Accepted invitation": "invitation_accepted",
      "Rescinded invitation": "invitation_rescinded",
    };
    const actor = action === "Accepted invitation" ? invitee : manager;
    const condition = and(eq(activityEvents.tripId, trip.id), eq(activityEvents.type, types[action]));
    await expect.poll(async () => (await activityRows(condition)).length).toBe(1);
    const [event] = await activityRows(condition);
    // Full equality guards the persisted shape; only the accepting actor may identify the invitee.
    expect(event).toEqual({
      id: expect.any(String),
      type: types[action],
      startedAt: expect.any(Date),
      endedAt: expect.any(Date),
      actorId: actor.id,
      actorUsername: actor.username,
      targetId: null,
      targetUsername: null,
      tripId: trip.id,
    });
    const [invitation] = await withE2EDb((database) =>
      database
        .select()
        .from(invitations)
        .where(and(eq(invitations.tripId, trip.id), eq(invitations.inviteeId, invitee.id)))
    );
    expect(JSON.stringify(event)).not.toContain(invitation.id);
    expect(JSON.stringify(event)).not.toContain(trip.name);
    expect(JSON.stringify(event)).not.toContain('"editor"');
    if (actor.id !== invitee.id) {
      expect(JSON.stringify(event)).not.toContain(invitee.id);
      expect(JSON.stringify(event)).not.toContain(invitee.username);
    }
    await expectActivityRow(page, [action, actor.username, trip.id]);
    const table = page.getByRole("table", { name: "Recent instance activity" });
    const row = table.getByRole("row").filter({ hasText: action }).filter({ hasText: trip.id });
    await expect(row.getByRole("cell").nth(3)).toHaveText("—");
    for (const privateValue of [trip.name, invitation.id, invitee.name, "Editor"]) {
      await expect(row).not.toContainText(privateValue);
    }
    if (actor.id !== invitee.id) await expect(row).not.toContainText(invitee.username);
  }
);

Then("Activity has no other invitation transitions for that trip", async ({ page, scenario }) => {
  const trip = scenario.currentTrip!;
  await new Promise((resolve) => setTimeout(resolve, 500));
  const rows = (await activityRows(eq(activityEvents.tripId, trip.id))).filter((event) =>
    event.type.startsWith("invitation_")
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].type).toBe("invitation_created");
  const table = page.getByRole("table", { name: "Recent instance activity" });
  await expect(table.getByRole("row").filter({ hasText: trip.id })).toHaveCount(1);
});

// ── Filters, paging and reader states ─────────────────────────────────────────────────────────────────────────
// Rows are seeded straight into the table (scenario-owned, removed afterwards) because the filters read history that
// real producers cannot backdate. Each scenario scopes its assertions with the actor filter or a one-minute range.

After(async () => {
  await removeSeededActivity();
});

interface ActivitySeedState {
  actor: SeedActor;
  /** Trip ID per seeded row in the order Activity must list them (newest first, ties by descending row ID). */
  listedTripIds: string[];
  named: Record<string, string>;
  minute: Date;
  extraActors: Record<string, SeedActor>;
}

const SEED_KEY = "activity:seed";
const COLLECTED_KEY = "activity:collectedTripIds";
const seedOf = (scenario: { getValue<T>(key: string): T | undefined }) =>
  scenario.getValue<ActivitySeedState>(SEED_KEY)!;

const activityTable = (page: Page) => page.getByRole("table", { name: "Recent instance activity" });
const activityResults = (page: Page) => page.getByRole("region", { name: "Activity results" });

async function waitForActivityIdle(page: Page) {
  await expect(activityResults(page)).toHaveAttribute("aria-busy", "false");
}

async function tripIdsOnPage(page: Page): Promise<string[]> {
  await waitForActivityIdle(page);
  return activityTable(page)
    .locator("tbody tr")
    .evaluateAll((rows) => rows.map((row) => row.querySelectorAll("td")[5]?.textContent ?? ""));
}

async function openActivity(page: Page, params: Record<string, string>) {
  const search = new URLSearchParams(params).toString();
  await page.goto(`/admin/activity${search ? `?${search}` : ""}`);
  await expect(page.getByRole("heading", { name: "Activity", exact: true })).toBeVisible();
}

async function chooseOption(page: Page, combobox: string, option: string) {
  await page.getByRole("combobox", { name: combobox }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

const utcAt = (day: Date, time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hours, minutes));
};

Given(
  "{int} Activity trips were created by one seeded account in the same instant",
  async ({ scenario }, count: number) => {
    const actor = seedActor(scenario.uniqueUsername("histactor"));
    const minute = uniqueSeedMinute();
    const tripIds = Array.from({ length: count }, () => crypto.randomUUID());
    const ids = await seedActivityEvents(
      tripIds.map((tripId) => ({ type: "trip_created", actor, startedAt: minute, tripId }))
    );
    const listedTripIds = tripIds
      .map((tripId, index) => ({ tripId, id: ids[index] }))
      .sort((left, right) => (left.id < right.id ? 1 : -1))
      .map((entry) => entry.tripId);
    scenario.setValue<ActivitySeedState>(SEED_KEY, { actor, listedTripIds, named: {}, minute, extraActors: {} });
  }
);

When("I filter Activity to the seeded account", async ({ page, scenario }) => {
  await chooseOption(page, "Username", seedOf(scenario).actor.username);
  await expect(page).toHaveURL(/[?&]actor=/);
  await waitForActivityIdle(page);
});

When("I page Older through the seeded Activity history", async ({ page, scenario }) => {
  const collected: string[] = [];
  const older = page.getByRole("navigation", { name: "Activity pages" }).getByRole("button", { name: "Older" });
  for (;;) {
    collected.push(...(await tripIdsOnPage(page)));
    if (!(await older.isVisible())) break;
    const before = page.url();
    await older.click();
    await expect.poll(() => page.url()).not.toBe(before);
    await waitForActivityIdle(page);
  }
  scenario.setValue<string[]>(COLLECTED_KEY, collected);
});

Then("every seeded Activity trip was listed exactly once in latest-first order", async ({ scenario }) => {
  expect(scenario.getValue<string[]>(COLLECTED_KEY)).toEqual(seedOf(scenario).listedTripIds);
});

Then("the seeded account filter and older page are kept", async ({ page, scenario }) => {
  await waitForActivityIdle(page);
  await expect(page.getByRole("combobox", { name: "Username" })).toContainText(seedOf(scenario).actor.username);
  expect(new URL(page.url()).searchParams.get("cursor")).toBeTruthy();
  const nav = page.getByRole("navigation", { name: "Activity pages" });
  await expect(nav.getByRole("button", { name: "Newest" })).toBeVisible();
  await expect(nav.getByRole("button", { name: "Newer" })).toHaveCount(0);
  expect((await tripIdsOnPage(page)).length).toBeGreaterThan(0);
});

Then("the seeded account filter is kept on the newest page", async ({ page, scenario }) => {
  await expect(page.getByRole("combobox", { name: "Username" })).toContainText(seedOf(scenario).actor.username);
  expect(new URL(page.url()).searchParams.get("actor")).toBe(seedOf(scenario).actor.id);
  await expect(
    page.getByRole("navigation", { name: "Activity pages" }).getByRole("button", { name: "Newest" })
  ).toHaveCount(0);
});

When("I go to the newest Activity page", async ({ page }) => {
  await page.getByRole("navigation", { name: "Activity pages" }).getByRole("button", { name: "Newest" }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("cursor")).toBeNull();
  await waitForActivityIdle(page);
});

// Overlap: one finished batch straddles the 11:00 boundary, one ends exactly at 10:00, one is fully before both.
Given("seeded batched Activity edits around 10:00 to 12:00", async ({ scenario }) => {
  const actor = seedActor(scenario.uniqueUsername("rangeactor"));
  const minute = uniqueSeedMinute();
  const named = { straddling: crypto.randomUUID(), boundary: crypto.randomUUID(), outside: crypto.randomUUID() };
  await seedActivityEvents([
    {
      type: "trip_updated",
      actor,
      tripId: named.straddling,
      startedAt: utcAt(minute, "10:50"),
      endedAt: utcAt(minute, "11:05"),
    },
    {
      type: "trip_updated",
      actor,
      tripId: named.boundary,
      startedAt: utcAt(minute, "09:30"),
      endedAt: utcAt(minute, "10:00"),
    },
    {
      type: "trip_updated",
      actor,
      tripId: named.outside,
      startedAt: utcAt(minute, "08:00"),
      endedAt: utcAt(minute, "09:00"),
    },
  ]);
  scenario.setValue<ActivitySeedState>(SEED_KEY, { actor, listedTripIds: [], named, minute, extraActors: {} });
});

When(
  "I open Activity for the seeded account from {string} to {string}",
  async ({ page, scenario }, from: string, to: string) => {
    const seed = seedOf(scenario);
    await openActivity(page, {
      actor: seed.actor.id,
      from: utcAt(seed.minute, from).toISOString(),
      to: utcAt(seed.minute, to).toISOString(),
    });
  }
);

Then("Activity lists only the seeded edits {string}", async ({ page, scenario }, names: string) => {
  const seed = seedOf(scenario);
  const expected = names.split(",").map((name) => seed.named[name.trim()]);
  expect((await tripIdsOnPage(page)).sort()).toEqual(expected.sort());
});

Then("Activity shows no activity matching the filters", async ({ page }) => {
  await expect(page.getByText("No activity matches these filters.", { exact: true })).toBeVisible();
  await expect(activityTable(page)).toHaveCount(0);
});

Then("Activity explains the date range is invalid and lists nothing", async ({ page }) => {
  await expect(page.getByText("Enter a start date that is on or before the end date.")).toBeVisible();
  await expect(activityTable(page)).toHaveCount(0);
});

// Ongoing uses the real clock: a burst that ended minutes ago may still grow; an old one is finished.
Given("an ongoing and a finished batched Activity edit for one seeded account", async ({ scenario }) => {
  const actor = seedActor(scenario.uniqueUsername("ongoingactor"));
  const named = { ongoing: crypto.randomUUID(), finished: crypto.randomUUID() };
  const now = Date.now();
  await seedActivityEvents([
    {
      type: "trip_updated",
      actor,
      tripId: named.ongoing,
      startedAt: new Date(now - 25 * 60_000),
      endedAt: new Date(now - 3 * 60_000),
    },
    {
      type: "trip_updated",
      actor,
      tripId: named.finished,
      startedAt: new Date(now - 5 * 3_600_000),
      endedAt: new Date(now - 4 * 3_600_000),
    },
  ]);
  scenario.setValue<ActivitySeedState>(SEED_KEY, {
    actor,
    listedTripIds: [],
    named,
    minute: new Date(),
    extraActors: {},
  });
});

When("I open Activity for the seeded account", async ({ page, scenario }) => {
  await openActivity(page, { actor: seedOf(scenario).actor.id });
});

async function rowFor(
  page: Page,
  scenario: { getValue<T>(key: string): T | undefined },
  name: string
): Promise<Locator> {
  return activityTable(page)
    .locator("tbody tr")
    .filter({ hasText: seedOf(scenario).named[name] });
}

Then(
  "the {string} seeded row shows a start-to-end range and Ongoing text",
  async ({ page, scenario }, name: string) => {
    const cell = (await rowFor(page, scenario, name)).locator("td").nth(4);
    await expect(cell.locator("time")).toHaveCount(2);
    await expect(cell).toContainText(" to ");
    await expect(cell).toContainText("Ongoing");
  }
);

Then("the {string} seeded row shows no Ongoing text", async ({ page, scenario }, name: string) => {
  const cell = (await rowFor(page, scenario, name)).locator("td").nth(4);
  await expect(cell).not.toContainText("Ongoing");
});

Then("the ongoing seeded row is listed above the finished one", async ({ page, scenario }) => {
  const ids = await tripIdsOnPage(page);
  const { named } = seedOf(scenario);
  expect(ids).toEqual([named.ongoing, named.finished]);
});

When("I refresh the Activity list", async ({ page }) => {
  const response = waitForServerActionResponse(page, { pathIncludes: "/admin/activity" });
  await page.getByRole("button", { name: "Refresh" }).click();
  await response;
  await waitForActivityIdle(page);
});

When("I click Refresh and await the response", async ({ page }) => {
  const response = waitForServerActionResponse(page, { pathIncludes: "/admin/activity" });
  await page.getByRole("button", { name: "Refresh" }).click();
  await response;
});

// Identity: a rename keeps one stable actor option; deletion and unknown identities are never fabricated.
Given("Activity history for a renamed account, a deleted account and unidentified failures", async ({ scenario }) => {
  const renamed = seedActor(scenario.uniqueUsername("oldname"));
  const renamedLater = { id: renamed.id, username: scenario.uniqueUsername("newname") };
  const deleted = seedActor(scenario.uniqueUsername("gone"));
  const minute = uniqueSeedMinute();
  const unknownTarget = scenario.uniqueUsername("ghost");
  const named = { withTarget: crypto.randomUUID(), noTarget: crypto.randomUUID() };
  await seedActivityEvents([
    {
      type: "trip_created",
      actor: renamed,
      startedAt: new Date(minute.getTime() - 3_600_000),
      tripId: crypto.randomUUID(),
    },
    {
      type: "trip_created",
      actor: renamedLater,
      startedAt: new Date(minute.getTime() - 60_000),
      tripId: crypto.randomUUID(),
    },
    {
      type: "trip_created",
      actor: deleted,
      startedAt: new Date(minute.getTime() - 120_000),
      tripId: crypto.randomUUID(),
    },
    {
      type: "sign_in_failed",
      actor: null,
      startedAt: minute,
      tripId: named.withTarget,
      target: { id: null, username: unknownTarget },
    },
    { type: "sign_in_failed", actor: null, startedAt: new Date(minute.getTime() + 1_000), tripId: named.noTarget },
  ]);
  scenario.setValue<ActivitySeedState>(SEED_KEY, {
    actor: renamedLater,
    listedTripIds: [],
    named,
    minute,
    extraActors: { oldName: renamed, deleted, ghost: { id: "", username: unknownTarget } },
  });
});

Then("the Username filter lists the renamed account once under its latest name", async ({ page, scenario }) => {
  const seed = seedOf(scenario);
  await page.getByRole("combobox", { name: "Username" }).click();
  await expect(page.getByRole("option", { name: seed.actor.username, exact: true })).toHaveCount(1);
  await expect(page.getByRole("option", { name: seed.extraActors.oldName.username, exact: true })).toHaveCount(0);
  await expect(page.getByRole("option", { name: seed.extraActors.deleted.username, exact: true })).toHaveCount(1);
  await page.keyboard.press("Escape");
});

When("I filter Activity to the renamed account", async ({ page, scenario }) => {
  await chooseOption(page, "Username", seedOf(scenario).actor.username);
  await expect(page).toHaveURL(/[?&]actor=/);
  await waitForActivityIdle(page);
});

When("I filter Activity to the deleted account", async ({ page, scenario }) => {
  await chooseOption(page, "Username", seedOf(scenario).extraActors.deleted.username);
  await expect(page).toHaveURL(new RegExp(`actor=${seedOf(scenario).extraActors.deleted.id}`));
  await waitForActivityIdle(page);
});

Then("Activity lists rows under both the old and the latest username", async ({ page, scenario }) => {
  const seed = seedOf(scenario);
  const usernames = await activityTable(page)
    .locator("tbody tr")
    .evaluateAll((rows) => rows.map((row) => row.querySelectorAll("td")[0]?.textContent ?? ""));
  expect(usernames.sort()).toEqual([seed.actor.username, seed.extraActors.oldName.username].sort());
});

Then("Activity lists one row for the deleted account", async ({ page, scenario }) => {
  await expect(activityTable(page).locator("tbody tr")).toHaveCount(1);
  await expect(activityTable(page).locator("tbody tr").first()).toContainText(
    seedOf(scenario).extraActors.deleted.username
  );
});

When("I open Activity for failed sign-ins in the seeded minute", async ({ page, scenario }) => {
  const { minute } = seedOf(scenario);
  await openActivity(page, {
    type: "sign_in_failed",
    from: new Date(minute.getTime() - 30_000).toISOString(),
    to: new Date(minute.getTime() + 30_000).toISOString(),
  });
});

Then("the failures show unavailable and unknown identities without fabricated names", async ({ page, scenario }) => {
  const seed = seedOf(scenario);
  const withTarget = (await rowFor(page, scenario, "withTarget")).locator("td");
  await expect(withTarget.nth(0)).toHaveText("Unavailable");
  await expect(withTarget.nth(3)).toHaveText(`${seed.extraActors.ghost.username} (Unknown account)`);
  const noTarget = (await rowFor(page, scenario, "noTarget")).locator("td");
  await expect(noTarget.nth(0)).toHaveText("Unavailable");
  await expect(noTarget.nth(3)).toHaveText("Unavailable");
});

// Reader states.
Given("{int} Activity rows exist for one seeded account", async ({ scenario }, count: number) => {
  const actor = seedActor(scenario.uniqueUsername("stateactor"));
  const minute = uniqueSeedMinute();
  const tripIds = Array.from({ length: count }, () => crypto.randomUUID());
  await seedActivityEvents(
    tripIds.map((tripId, index) => ({
      type: "trip_created",
      actor,
      startedAt: new Date(minute.getTime() + index * 1_000),
      tripId,
    }))
  );
  scenario.setValue<ActivitySeedState>(SEED_KEY, {
    actor,
    listedTripIds: [...tripIds].reverse(),
    named: {},
    minute,
    extraActors: {},
  });
});

When("Activity read requests start failing", async ({ page }) => {
  await page.route("**/admin/activity**", (route) =>
    route.request().method() === "POST" ? route.abort() : route.continue()
  );
});

When("Activity read requests recover", async ({ page }) => {
  await page.unroute("**/admin/activity**");
});

When("I click Refresh without waiting for the response", async ({ page }) => {
  await page.getByRole("button", { name: "Refresh" }).click();
});

Then("Activity keeps the earlier rows with a stale notice and Retry", async ({ page, scenario }) => {
  const alert = page.getByRole("alert").filter({ hasText: "Could not load activity" });
  await expect(alert).toBeVisible();
  await expect(alert.locator("time")).toHaveCount(1);
  await expect(alert.getByRole("button", { name: "Retry" })).toBeVisible();
  expect(await tripIdsOnPage(page)).toEqual(seedOf(scenario).listedTripIds);
});

When("I click Retry", async ({ page }) => {
  const response = waitForServerActionResponse(page, { pathIncludes: "/admin/activity" });
  await page.getByRole("button", { name: "Retry" }).click();
  await response;
  await waitForActivityIdle(page);
});

Then("the stale notice is gone", async ({ page }) => {
  await expect(page.getByRole("alert").filter({ hasText: "Could not load activity" })).toHaveCount(0);
});

When("my instance administrator role is removed", async ({ scenario }) => {
  const user = await scenario.ensureCurrentUser();
  await withE2EDb((database) => database.update(users).set({ role: "member" }).where(eq(users.id, user.id)));
});

Then("Activity shows only that I no longer have administrator access", async ({ page, scenario }) => {
  await expect(page.getByRole("alert").filter({ hasText: "You no longer have administrator access." })).toBeVisible();
  await expect(activityTable(page)).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Activity filters" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Refresh" })).toHaveCount(0);
  const text = (await page.locator("body").innerText()).toString();
  for (const tripId of seedOf(scenario).listedTripIds) expect(text).not.toContain(tripId);
  expect(text).not.toContain(seedOf(scenario).actor.username);
});

// Narrow viewport and privacy.
Given("a private trip and an Activity row for it by one seeded account", async ({ scenario }) => {
  const trip = await scenario.ensureCurrentTrip("threeDayTrip", { trip: { name: "Private Filter Destination" } });
  const actor = seedActor(scenario.uniqueUsername("mobileactor"));
  await seedActivityEvents([
    { type: "trip_updated", actor, startedAt: new Date(Date.now() - 3_600_000), tripId: trip.id },
  ]);
  scenario.setValue<ActivitySeedState>(SEED_KEY, {
    actor,
    listedTripIds: [trip.id],
    named: {},
    minute: new Date(),
    extraActors: {},
  });
});

Then("the page does not scroll horizontally", async ({ page }) => {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

Then("the Activity table scrolls by keyboard inside its labeled region", async ({ page }) => {
  const region = page.getByRole("region", { name: "Activity table" });
  const metrics = await region.evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth }));
  expect(metrics.scroll).toBeGreaterThan(metrics.client);
  await region.focus();
  await expect(region).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => region.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
});

Then("every Activity filter and page control is at least 44 pixels tall", async ({ page }) => {
  const controls = [
    page.getByRole("combobox", { name: "Username" }),
    page.getByRole("combobox", { name: "Action" }),
    page.locator("#activity-filter-from"),
    page.locator("#activity-filter-to"),
    page.getByRole("button", { name: "Refresh" }),
  ];
  for (const control of controls) {
    const box = await control.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});

Then("Activity shows the trip ID but not the trip name", async ({ page, scenario }) => {
  const trip = scenario.currentTrip!;
  await expect(activityTable(page).locator("tbody tr").first()).toContainText(trip.id);
  await expect(page.locator("body")).not.toContainText(trip.name);
});
