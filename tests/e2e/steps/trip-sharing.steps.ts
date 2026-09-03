import { expect } from "@playwright/test";
import { collaborators, invitations } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { Given, Then, When } from "../fixtures";

const ACTIVE_EMAIL = "active-share@example.com";
const PENDING_EMAIL = "pending-share@example.com";
const DECLINED_EMAIL = "declined-share@example.com";
const EXPIRED_PENDING_EMAIL = "expired-pending-share@example.com";
const REMOVABLE_EMAIL = "removable-share@example.com";
const PENDING_INVITATION_EXPIRY_LABEL_KEY = "pendingInvitationExpiryLabel";

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

Given("I have an additional removable sharing contributor", async ({ scenario }) => {
  const trip = await scenario.ensureCurrentTrip();
  await withE2EDb(async (db) => {
    await db.insert(collaborators).values({
      tripId: trip.id,
      email: REMOVABLE_EMAIL,
      name: "Removable Contributor",
      initials: "RC",
      role: "viewer",
      isCreator: false,
    });
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

When("I resend the pending sharing invitation", async ({ page, scenario }) => {
  const expiryLabel = (await page.getByLabel(/^Invitation expires/).getAttribute("aria-label")) ?? "";
  scenario.setValue(PENDING_INVITATION_EXPIRY_LABEL_KEY, expiryLabel);
  await page.getByTitle(`Resend invitation to ${PENDING_EMAIL}`).click();
});

Then("I see the pending sharing invitation expiry refresh", async ({ page, scenario }) => {
  const previousExpiryLabel = scenario.getValue<string>(PENDING_INVITATION_EXPIRY_LABEL_KEY);
  await expect(page.getByLabel(/^Invitation expires/)).not.toHaveAttribute("aria-label", previousExpiryLabel ?? "");
  await expect(page.getByText("Invitation resent.")).toBeVisible();
});

When("I rescind the pending sharing invitation", async ({ page }) => {
  await page.getByTitle(`Rescind invitation to ${PENDING_EMAIL}`).click();
});

Then("I do not see the pending sharing row", async ({ page }) => {
  await expect(page.getByText(PENDING_EMAIL, { exact: true })).not.toBeVisible();
  await expect(page.getByText("Invitation rescinded.")).toBeVisible();
});

When("I dismiss the declined sharing invitation", async ({ page }) => {
  await page.getByTitle(`Dismiss invitation to ${DECLINED_EMAIL}`).click();
});

Then("I do not see the declined sharing row", async ({ page }) => {
  await expect(page.getByText(DECLINED_EMAIL, { exact: true })).not.toBeVisible();
  await expect(page.getByText("Invitation dismissed.")).toBeVisible();
});

Then("dismissed sharing invitation remains removed after reopening dialog", async ({ page }) => {
  await page.getByTitle("Close sharing dialog").click();
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(page.getByText(DECLINED_EMAIL, { exact: true })).not.toBeVisible();
});

When("I stage a role change on the active sharing row to viewer", async ({ page }) => {
  await page.getByLabel(`Role for Active Contributor`).click();
  await page.getByRole("option", { name: "Viewer" }).click();
});

When("I stage the removal of the additional sharing contributor", async ({ page }) => {
  await page.getByTitle(`Remove Removable Contributor`).click();
});

Then("I see contributor change Save and Cancel controls", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
});

Then("I do not see contributor change Save and Cancel controls", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Save", exact: true })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).not.toBeVisible();
});

Then("I do not receive a contributor changes toast", async ({ page }) => {
  await expect(page.getByText("Contributor changes saved.")).not.toBeVisible();
});

When("I cancel the contributor changes", async ({ page }) => {
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
});

Then("the active sharing row still shows the editor role", async ({ page }) => {
  const row = page.getByText(ACTIVE_EMAIL, { exact: true }).locator("..").locator("..");
  await expect(row).toContainText("Editor");
  await expect(page.getByText("Contributor changes saved.")).not.toBeVisible();
});

When("I save the contributor changes", async ({ page }) => {
  await page.getByRole("button", { name: "Save", exact: true }).click();
});

Then("I receive a contributor changes toast", async ({ page }) => {
  await expect(page.getByText("Contributor changes saved.")).toBeVisible();
});

Then("I do not see the removed additional sharing contributor", async ({ page }) => {
  await expect(page.getByText(REMOVABLE_EMAIL, { exact: true })).not.toBeVisible();
});

Then("the active sharing row role is updated to viewer", async ({ page }) => {
  const row = page.getByText(ACTIVE_EMAIL, { exact: true }).locator("..").locator("..");
  await expect(row).toContainText("Viewer");
});
