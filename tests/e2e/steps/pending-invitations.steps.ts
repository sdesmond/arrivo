import { expect, type BrowserContext, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { collaborators, days, invitations, trips, users } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { After, Given, When, Then } from "../fixtures";
import { LIVE_SYNC_ASSERTION_TIMEOUT_MS, waitForLiveSyncResponse } from "../live-sync";
import { waitForServerActionResponse } from "../server-action";
import type { ScenarioFixtureContext, ScenarioUserRecord } from "../scenario-fixture";

const INVITE_TTL_MS = 72 * 60 * 60 * 1000;

async function seedPendingInvitation(
  scenario: ScenarioFixtureContext,
  tripName: string,
  inviterName: string,
  invitedEmail: string,
  expiresAt = new Date(Date.now() + INVITE_TTL_MS)
): Promise<void> {
  const inviterEmail = scenario.uniqueEmail(`inviter-${inviterName}`);

  const inviterUserId = await withE2EDb(async (db) => {
    const passwordHash = await bcrypt.hash(process.env.E2E_PASSWORD!, 10);
    const [inviter] = await db
      .insert(users)
      .values({ email: inviterEmail, name: inviterName, passwordHash })
      .returning({ id: users.id });

    const [trip] = await db.insert(trips).values({ ownerId: inviter.id, name: tripName }).returning({ id: trips.id });

    await db.insert(days).values({ tripId: trip.id, dayNumber: 1, date: null, label: "Day 1" });

    await db.insert(collaborators).values({
      tripId: trip.id,
      userId: inviter.id,
      email: inviterEmail,
      name: inviterName,
      initials: inviterName.slice(0, 2).toUpperCase(),
      role: "manager",
      isCreator: true,
    });

    await db.insert(invitations).values({
      tripId: trip.id,
      email: invitedEmail,
      role: "editor",
      status: "pending",
      expiresAt,
      invitedBy: inviter.id,
    });

    return inviter.id;
  });

  // Deleting the inviter cascades their owned trip, its collaborator row, and the invitation.
  scenario.registerCleanup({ entity: "user", id: inviterUserId });
}

Given("I have a pending invitation to {string} from {string}", async ({ scenario }, tripName, inviterName) => {
  const invitee = await scenario.ensureCurrentUser();
  await seedPendingInvitation(scenario, tripName, inviterName, invitee.email);
});

Given("I have an expired invitation to {string} from {string}", async ({ scenario }, tripName, inviterName) => {
  const invitee = await scenario.ensureCurrentUser();
  await seedPendingInvitation(scenario, tripName, inviterName, invitee.email, new Date(Date.now() - INVITE_TTL_MS));
});

Given(
  "someone else has a pending invitation to {string} from {string}",
  async ({ scenario }, tripName, inviterName) => {
    await seedPendingInvitation(scenario, tripName, inviterName, scenario.uniqueEmail("unrelated-invitee"));
  }
);

When("I open the trips dashboard", async ({ page }) => {
  await page.goto("/trips");
  await page.waitForURL(/\/trips$/);
});

When("I accept the invitation to {string}", async ({ page }, tripName: string) => {
  await page.getByTitle(`Accept invitation to ${tripName}`).click();
});

When("I decline the invitation to {string}", async ({ page }, tripName: string) => {
  await page.getByTitle(`Decline invitation to ${tripName}`).click();
});

Then(
  "I see a pending invitation row for {string} from {string} with role {string}",
  async ({ page }, tripName: string, inviterName: string, role: string) => {
    const row = page.locator("li").filter({ hasText: tripName });
    await expect(row).toBeVisible();
    await expect(row).toContainText(inviterName);
    await expect(row).toContainText(role);
  }
);

Then("I see no pending invitation row for {string}", async ({ page }, tripName: string) => {
  await expect(page.locator("li").filter({ hasText: tripName })).toHaveCount(0);
});

Then("the pending invitation row for {string} is gone", async ({ page }, tripName: string) => {
  await expect(page.locator("li").filter({ hasText: tripName })).toHaveCount(0, { timeout: 10_000 });
});

Then("I am redirected to the trip {string}", async ({ page }, tripName: string) => {
  await page.waitForURL(/\/trips\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { level: 1, name: tripName })).toBeVisible();
});

Then("I see the toast {string}", async ({ page }, message: string) => {
  await expect(page.getByText(message, { exact: true })).toBeVisible({ timeout: 10_000 });
});

Then("the Trips nav badge shows {string} pending invitation", async ({ page }, count: string) => {
  await expect(page.getByRole("link", { name: `Trips, ${count} pending invitations`, exact: true })).toBeVisible();
});

Then("the Trips nav badge is not shown", async ({ page }) => {
  await expect(page.getByRole("link", { name: "Trips", exact: true })).toBeVisible();
});

const WATCHING_CONTEXT_KEY = "pendingInvitationsWatchingContext";
const WATCHING_PAGE_KEY = "pendingInvitationsWatchingPage";
const WATCHING_USER_KEY = "pendingInvitationsWatchingUser";

function getWatchingSession(scenario: ScenarioFixtureContext): { page: Page; user: ScenarioUserRecord } {
  const watchingPage = scenario.getValue<Page>(WATCHING_PAGE_KEY);
  const watchingUser = scenario.getValue<ScenarioUserRecord>(WATCHING_USER_KEY);
  if (!watchingPage || !watchingUser) throw new Error("No watching invitee session is open for this scenario.");
  return { page: watchingPage, user: watchingUser };
}

async function openManagerShareDialog(page: Page, scenario: ScenarioFixtureContext): Promise<void> {
  await scenario.gotoCurrentTrip(page);
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Share trip" })).toBeVisible();
}

Given("a registered user is watching their dashboard in their own session", async ({ page, scenario }) => {
  await scenario.ensureCurrentTrip();
  const { user: watchingUser } = await scenario.materialize({
    user: { overrides: { user: { name: "Watching Invitee", initials: "WI" } }, setCurrent: false },
  });
  if (!watchingUser) throw new Error("Failed to materialize the watching invitee.");

  const { context: watchingContext, page: watchingPage } = await scenario.openSecondSession(page);
  scenario.setValue(WATCHING_CONTEXT_KEY, watchingContext);
  scenario.setValue(WATCHING_PAGE_KEY, watchingPage);
  scenario.setValue(WATCHING_USER_KEY, watchingUser);

  await scenario.signInAsUser(watchingPage, watchingUser.email);
  const personalChannelReady = waitForLiveSyncResponse(watchingPage, "/api/users/me/events");
  await Promise.all([watchingPage.goto("/trips"), personalChannelReady]);
  await expect(watchingPage.getByRole("link", { name: "Trips", exact: true })).toBeVisible();
});

When("I invite the watching user to my trip as an editor", async ({ page, scenario }) => {
  const { user: watchingUser } = getWatchingSession(scenario);
  await openManagerShareDialog(page, scenario);
  await page.getByLabel("Invite email").fill(watchingUser.email);
  await page.getByLabel("Invite role").click();
  await page.getByRole("option", { name: "Editor" }).click();
  await page.getByTitle("Invite this person to the trip").click();
  await expect(page.getByText("Invitation sent.")).toBeVisible();
});

Then("the watching user sees my trip invitation without reloading", async ({ scenario }) => {
  const trip = await scenario.ensureCurrentTrip();
  const { page: watchingPage } = getWatchingSession(scenario);
  await expect(watchingPage.getByTitle(`Accept invitation to ${trip.name}`)).toBeVisible({
    timeout: LIVE_SYNC_ASSERTION_TIMEOUT_MS,
  });
});

Then("the watching user's Trips nav badge shows {string} pending invitation", async ({ scenario }, count: string) => {
  const { page: watchingPage } = getWatchingSession(scenario);
  await expect(
    watchingPage.getByRole("link", { name: `Trips, ${count} pending invitations`, exact: true })
  ).toBeVisible({ timeout: LIVE_SYNC_ASSERTION_TIMEOUT_MS });
});

When("I rescind the watching user's invitation", async ({ page, scenario }) => {
  const { user: watchingUser } = getWatchingSession(scenario);
  const rescindPosted = waitForServerActionResponse(page, { pathIncludes: "/trips/" });
  await page.getByTitle(`Rescind invitation to ${watchingUser.email}`).click();
  await rescindPosted;
  await expect(page.getByText("Invitation rescinded.")).toBeVisible();
});

Then("the watching user's invitation disappears without reloading", async ({ scenario }) => {
  const trip = await scenario.ensureCurrentTrip();
  const { page: watchingPage } = getWatchingSession(scenario);
  await expect(watchingPage.getByTitle(`Accept invitation to ${trip.name}`)).toHaveCount(0, {
    timeout: LIVE_SYNC_ASSERTION_TIMEOUT_MS,
  });
  await expect(watchingPage.getByRole("link", { name: "Trips", exact: true })).toBeVisible();
});

After(async ({ scenario }) => {
  const watchingContext = scenario.getValue<BrowserContext>(WATCHING_CONTEXT_KEY);
  if (!watchingContext) return;
  await watchingContext.close();
  scenario.clearValue(WATCHING_CONTEXT_KEY);
  scenario.clearValue(WATCHING_PAGE_KEY);
  scenario.clearValue(WATCHING_USER_KEY);
});
