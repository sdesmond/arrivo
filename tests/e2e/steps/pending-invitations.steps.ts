import { expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { collaborators, days, invitations, trips, users } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { Given, When, Then } from "../fixtures";
import type { ScenarioFixtureContext } from "../scenario-fixture";

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
