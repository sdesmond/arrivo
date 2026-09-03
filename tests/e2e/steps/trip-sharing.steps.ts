import { expect } from "@playwright/test";
import { collaborators, invitations } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { Given, Then, When } from "../fixtures";

const ACTIVE_EMAIL = "active-share@example.com";
const PENDING_EMAIL = "pending-share@example.com";
const DECLINED_EMAIL = "declined-share@example.com";
const EXPIRED_PENDING_EMAIL = "expired-pending-share@example.com";

Given("I have a trip with sharing rows", async ({ scenario }) => {
  const [user, trip] = await Promise.all([scenario.ensureCurrentUser(), scenario.ensureCurrentTrip("datelessTrip")]);

  await withE2EDb(async (db) => {
    await db.insert(collaborators).values({
      tripId: trip.id,
      email: ACTIVE_EMAIL,
      name: "Active Contributor",
      initials: "AC",
      role: "editor",
      isCreator: false,
    });

    await db.insert(invitations).values([
      {
        tripId: trip.id,
        email: PENDING_EMAIL,
        role: "viewer",
        status: "pending",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        invitedBy: user.id,
      },
      {
        tripId: trip.id,
        email: DECLINED_EMAIL,
        role: "editor",
        status: "declined",
        expiresAt: new Date(Date.now() - 60 * 60 * 1000),
        invitedBy: user.id,
      },
      {
        tripId: trip.id,
        email: EXPIRED_PENDING_EMAIL,
        role: "viewer",
        status: "pending",
        expiresAt: new Date(Date.now() - 60 * 60 * 1000),
        invitedBy: user.id,
      },
    ]);
  });
});

When("I go to the current trip", async ({ page, scenario }) => {
  await scenario.gotoCurrentTrip(page);
});

When("I open the sharing dialog", async ({ page }) => {
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Share trip" })).toBeVisible();
});

Then("I see the sharing dialog creator row", async ({ page, scenario }) => {
  const user = await scenario.ensureCurrentUser();
  await expect(page.getByText(user.name, { exact: true })).toBeVisible();
  await expect(page.getByLabel("Trip creator — access can't be changed")).toBeVisible();
});

Then("I see the active sharing row", async ({ page }) => {
  const row = page.getByText(ACTIVE_EMAIL, { exact: true }).locator("..").locator("..");
  await expect(row).toContainText("Active Contributor");
  await expect(row).toContainText("Editor");
});

Then("I see the pending sharing row", async ({ page }) => {
  const row = page.getByText(PENDING_EMAIL, { exact: true }).locator("..").locator("..");
  await expect(row).toContainText("Pending");
});

Then("I see the declined sharing row", async ({ page }) => {
  const row = page.getByText(DECLINED_EMAIL, { exact: true }).locator("..").locator("..");
  await expect(row).toContainText("Declined");
});

Then("I do not see the expired pending sharing row", async ({ page }) => {
  await expect(page.getByText(EXPIRED_PENDING_EMAIL, { exact: true })).not.toBeVisible();
});
