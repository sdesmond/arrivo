import { expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { collaborators, days, trips, users } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { Given, When, Then } from "../fixtures";
import type { ScenarioFixtureContext, ScenarioTripRecord } from "../scenario-fixture";

// Materializes a trip owned by a different (freshly created) user, with the current scenario user
// added as a collaborator at the given role. Mirrors the raw-insert pattern used for pending
// invitations — assertTripAccess resolves role from the `collaborators` row, so the fixture needs a
// real second-owner trip rather than one materialized through the current-user-owned trip mother.
async function seedSharedTrip(
  scenario: ScenarioFixtureContext,
  tripName: string,
  ownerName: string,
  collaboratorRole: "viewer" | "editor" | "manager"
): Promise<ScenarioTripRecord> {
  const invitee = await scenario.ensureCurrentUser();
  const ownerEmail = scenario.uniqueEmail(`owner-${ownerName}`);

  const trip = await withE2EDb(async (db) => {
    const passwordHash = await bcrypt.hash(process.env.E2E_PASSWORD!, 10);
    const [owner] = await db
      .insert(users)
      .values({ email: ownerEmail, name: ownerName, passwordHash })
      .returning({ id: users.id });

    const [tripRow] = await db
      .insert(trips)
      .values({ ownerId: owner.id, name: tripName })
      .returning({ id: trips.id, name: trips.name, startDate: trips.startDate, endDate: trips.endDate });

    await db.insert(days).values({ tripId: tripRow.id, dayNumber: 1, date: null, label: "Day 1" });

    await db.insert(collaborators).values([
      {
        tripId: tripRow.id,
        userId: owner.id,
        email: ownerEmail,
        name: ownerName,
        initials: ownerName.slice(0, 2).toUpperCase(),
        role: "manager",
        isCreator: true,
      },
      {
        tripId: tripRow.id,
        userId: invitee.id,
        email: invitee.email,
        name: invitee.name,
        initials: invitee.initials,
        role: collaboratorRole,
        isCreator: false,
      },
    ]);

    // Deleting the owner cascades their trip and both collaborator rows.
    return { ownerId: owner.id, tripRow };
  });

  scenario.registerCleanup({ entity: "user", id: trip.ownerId });

  const tripRecord: ScenarioTripRecord = {
    id: trip.tripRow.id,
    name: trip.tripRow.name,
    startDate: trip.tripRow.startDate ?? null,
    endDate: trip.tripRow.endDate ?? null,
  };
  scenario.setCurrentTrip(tripRecord);
  return tripRecord;
}

Given("I am a viewer on {string} owned by {string}", async ({ scenario }, tripName, ownerName) => {
  await seedSharedTrip(scenario, tripName, ownerName, "viewer");
});

Given("I am an editor on {string} owned by {string}", async ({ scenario }, tripName, ownerName) => {
  await seedSharedTrip(scenario, tripName, ownerName, "editor");
});

Given("I am a manager on {string} owned by {string}", async ({ scenario }, tripName, ownerName) => {
  await seedSharedTrip(scenario, tripName, ownerName, "manager");
});

When("I go to the shared trip", async ({ page, scenario }) => {
  await scenario.gotoCurrentTrip(page);
});

Then("I see the trip heading {string}", async ({ page }, tripName: string) => {
  await expect(page.getByRole("heading", { level: 1, name: tripName })).toBeVisible();
});

Then("I see a {string} tab", async ({ page }, tabName: string) => {
  await expect(page.getByRole("button", { name: tabName, exact: true })).toBeVisible();
});

Then("I do not see a {string} tab", async ({ page }, tabName: string) => {
  await expect(page.getByRole("button", { name: tabName, exact: true })).toHaveCount(0);
});

Then("I do not see the cover options control", async ({ page }) => {
  await expect(page.getByTitle("Cover options")).toHaveCount(0);
});
