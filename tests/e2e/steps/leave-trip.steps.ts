import { expect, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { collaborators, days, trips } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { Then, When } from "../fixtures";
import { waitForServerActionResponse } from "../server-action";
import type { ScenarioFixtureContext } from "../scenario-fixture";

// Shared-trip fixtures come from viewer-trip-access.steps.ts ("I am a <role> on ... owned by ..."),
// which materializes a scenario-owned owner, trip, and both membership rows.

// The hero control's accessible name carries the trip name ("Leave trip <name>"); the confirmation's
// action is exactly "Leave trip", so this never matches the dialog button.
function leaveTripControl(page: Page) {
  return page.getByRole("button", { name: /^Leave trip .+/ });
}

async function loadCallerMembership(scenario: ScenarioFixtureContext) {
  const trip = await scenario.ensureCurrentTrip();
  const caller = await scenario.ensureCurrentUser();
  return withE2EDb(async (db) =>
    db
      .select({ id: collaborators.id })
      .from(collaborators)
      .where(and(eq(collaborators.tripId, trip.id), eq(collaborators.userId, caller.id)))
  );
}

Then("I see the Leave trip control", async ({ page }) => {
  await expect(leaveTripControl(page)).toBeVisible();
});

Then("I do not see the Leave trip control", async ({ page, scenario }) => {
  // Wait for this trip's hero — its heading and the Edit control that shares Leave trip's crumb row —
  // so the absence check can't pass against a page that hasn't rendered the hero yet.
  const trip = await scenario.ensureCurrentTrip();
  await expect(page.getByRole("heading", { level: 1, name: trip.name })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  await expect(leaveTripControl(page)).toHaveCount(0);
});

When("I start leaving the trip", async ({ page }) => {
  await leaveTripControl(page).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
});

When("I cancel leaving the trip", async ({ page }) => {
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(leaveTripControl(page)).toBeFocused();
});

When("I leave the trip and confirm", async ({ page, scenario }) => {
  const trip = await scenario.ensureCurrentTrip();
  await leaveTripControl(page).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("disappear from your trips list");

  // Arm before the click, await after: the leave must commit before later reload/DB assertions.
  const leavePosted = waitForServerActionResponse(page, { pathIncludes: `/trips/${trip.id}` });
  await dialog.getByRole("button", { name: "Leave trip", exact: true }).click();
  await leavePosted;
});

Then("I am back on the trips list", async ({ page }) => {
  await expect(page).toHaveURL(/\/trips$/, { timeout: 15_000 });
  // The /trips loading skeleton has no trip links, so a later "trip is absent" check would pass on it.
  // Wait for the skeleton to go and the rendered list's own New trip control to appear.
  await expect(page.getByRole("status", { name: "Loading trips" })).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByRole("button", { name: "New trip", exact: true })).toBeVisible();
});

Then("opening the shared trip directly is denied", async ({ page, scenario }) => {
  const trip = await scenario.ensureCurrentTrip();
  await page.goto(`/trips/${trip.id}`);
  await expect(page.getByRole("heading", { name: "Trip not found" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: trip.name })).toHaveCount(0);
});

Then("the owner still has the trip with their membership intact", async ({ scenario }) => {
  const trip = await scenario.ensureCurrentTrip();
  const { tripRows, creatorRows, dayRows } = await withE2EDb(async (db) => ({
    tripRows: await db.select({ id: trips.id }).from(trips).where(eq(trips.id, trip.id)),
    creatorRows: await db
      .select({ id: collaborators.id })
      .from(collaborators)
      .where(and(eq(collaborators.tripId, trip.id), eq(collaborators.isCreator, true))),
    dayRows: await db.select({ id: days.id }).from(days).where(eq(days.tripId, trip.id)),
  }));

  expect(tripRows).toHaveLength(1);
  expect(creatorRows).toHaveLength(1);
  expect(dayRows).toHaveLength(1);
  expect(await loadCallerMembership(scenario)).toHaveLength(0);
});

Then("I am still a member of the shared trip", async ({ scenario }) => {
  expect(await loadCallerMembership(scenario)).toHaveLength(1);
});
