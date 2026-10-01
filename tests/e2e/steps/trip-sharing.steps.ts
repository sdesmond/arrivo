import { expect, type BrowserContext, type Page } from "@playwright/test";
import { collaborators, invitations } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { After, Given, Then, When } from "../fixtures";
import { LIVE_SYNC_ASSERTION_TIMEOUT_MS, waitForLiveSyncResponse } from "../live-sync";
import { waitForServerActionResponse } from "../server-action";
import type { ScenarioFixtureContext, ScenarioUserRecord } from "../scenario-fixture";

const ACTIVE_EMAIL = "active-share@example.com";
const PENDING_EMAIL = "pending-share@example.com";
const DECLINED_EMAIL = "declined-share@example.com";
const EXPIRED_PENDING_EMAIL = "expired-pending-share@example.com";
const REMOVABLE_EMAIL = "removable-share@example.com";
const OTHER_MANAGER_EMAIL = "other-manager-share@example.com";
const PENDING_INVITATION_EXPIRY_LABEL_KEY = "pendingInvitationExpiryLabel";
const INVITABLE_USER_KEY = "invitableUser";

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

Given("the shared trip has another manager", async ({ scenario }) => {
  const trip = await scenario.ensureCurrentTrip();
  await withE2EDb(async (db) => {
    await db.insert(collaborators).values({
      tripId: trip.id,
      email: OTHER_MANAGER_EMAIL,
      name: "Other Manager",
      initials: "OM",
      role: "manager",
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

Then("I see my sharing row marked You and locked", async ({ page, scenario }) => {
  const user = await scenario.ensureCurrentUser();
  const row = page.getByRole("dialog").getByText(user.email, { exact: true }).locator("..").locator("..");
  await expect(row).toContainText("You");
  await expect(row.getByLabel("Your access can't be changed here")).toBeVisible();
  await expect(row.getByLabel(`Role for ${user.name}`)).toHaveCount(0);
});

Then("I see the other manager sharing row is editable", async ({ page }) => {
  const row = page.getByText(OTHER_MANAGER_EMAIL, { exact: true }).locator("..").locator("..");
  await expect(row.getByLabel("Role for Other Manager")).toBeEnabled();
  await expect(row.getByTitle("Remove Other Manager")).toBeEnabled();
});

Then("I see the pending sharing row", async ({ page }) => {
  const row = page.getByText(PENDING_EMAIL, { exact: true }).locator("..").locator("..");
  await expect(row).toContainText("Pending");
});

Then("I see the declined sharing row", async ({ page }) => {
  const row = page.getByText(DECLINED_EMAIL, { exact: true }).locator("..").locator("..");
  await expect(row).toContainText("Declined");
});

Then("I see the expired pending sharing row", async ({ page }) => {
  const row = page.getByText(EXPIRED_PENDING_EMAIL, { exact: true }).locator("..").locator("..");
  await expect(row).toContainText("Expired");
  await expect(row).not.toContainText("Pending");
});

Then("I can resend the expired pending sharing invitation", async ({ page }) => {
  await expect(page.getByTitle(`Resend invitation to ${EXPIRED_PENDING_EMAIL}`)).toBeEnabled();
});

Then("I can rescind the expired pending sharing invitation", async ({ page }) => {
  await expect(page.getByTitle(`Rescind invitation to ${EXPIRED_PENDING_EMAIL}`)).toBeEnabled();
});

Given("there is a Packt user I can invite", async ({ scenario }) => {
  const { user } = await scenario.materialize({
    user: { overrides: { user: { name: "Invitable Person", initials: "IP" } }, setCurrent: false },
  });
  if (!user) throw new Error("Failed to materialize the invitable user.");
  scenario.setValue(INVITABLE_USER_KEY, user);
});

When("I invite that user to the trip as an editor", async ({ page, scenario }) => {
  const invitee = scenario.getValue<ScenarioUserRecord>(INVITABLE_USER_KEY);
  if (!invitee) throw new Error("No invitable user materialized for this scenario.");
  await page.getByLabel("Invite email").fill(invitee.email);
  await page.getByLabel("Invite role").click();
  await page.getByRole("option", { name: "Editor" }).click();
  await page.getByTitle("Invite this person to the trip").click();
});

Then("I receive an invitation sent toast", async ({ page }) => {
  await expect(page.getByText("Invitation sent.")).toBeVisible();
});

Then("I see a pending sharing row for the invited user with the editor role", async ({ page, scenario }) => {
  const invitee = scenario.getValue<ScenarioUserRecord>(INVITABLE_USER_KEY);
  if (!invitee) throw new Error("No invitable user materialized for this scenario.");
  const row = page.getByText(invitee.email, { exact: true }).locator("..").locator("..");
  await expect(row).toContainText("Pending");
  await expect(row).toContainText("Editor");
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

Then("the sharing Save control is disabled", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
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

When("I press Escape to dismiss the sharing dialog", async ({ page }) => {
  await page.keyboard.press("Escape");
});

When("I click outside the sharing dialog", async ({ page }) => {
  await page.locator('[data-slot="dialog-overlay"]').click({ position: { x: 4, y: 4 } });
});

When("I close the sharing dialog via the X button", async ({ page }) => {
  await page.getByTitle("Close sharing dialog").click();
});

Then("the sharing dialog is closed", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Share trip" })).not.toBeVisible();
});

Then("the sharing dialog is not closed", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Share trip" })).toBeVisible();
});

const SECOND_SESSION_CONTEXT_KEY = "tripSharingSecondSessionContext";
const SECOND_SESSION_PAGE_KEY = "tripSharingSecondSessionPage";
const SECOND_SESSION_USER_KEY = "tripSharingSecondSessionUser";

function getSecondSession(scenario: ScenarioFixtureContext): { page: Page; user: ScenarioUserRecord } {
  const secondPage = scenario.getValue<Page>(SECOND_SESSION_PAGE_KEY);
  const secondUser = scenario.getValue<ScenarioUserRecord>(SECOND_SESSION_USER_KEY);
  if (!secondPage || !secondUser) throw new Error("No second sharing session is open for this scenario.");
  return { page: secondPage, user: secondUser };
}

async function openSecondSession(
  page: Page,
  scenario: ScenarioFixtureContext,
  user: ScenarioUserRecord,
  path: string,
  channelPath: string
): Promise<Page> {
  const { context, page: secondPage } = await scenario.openSecondSession(page);
  scenario.setValue(SECOND_SESSION_CONTEXT_KEY, context);
  scenario.setValue(SECOND_SESSION_PAGE_KEY, secondPage);
  scenario.setValue(SECOND_SESSION_USER_KEY, user);

  await scenario.signInAsUser(secondPage, user.email);
  const channelReady = waitForLiveSyncResponse(secondPage, channelPath);
  await Promise.all([secondPage.goto(path), channelReady]);
  return secondPage;
}

function sharingRowFor(page: Page, email: string) {
  return page.getByRole("dialog").getByText(email, { exact: true }).locator("..").locator("..");
}

Given("I have a trip with a pending invitation for a user watching their dashboard", async ({ page, scenario }) => {
  const [manager, trip] = await Promise.all([scenario.ensureCurrentUser(), scenario.ensureCurrentTrip("datelessTrip")]);
  const { user: invitee } = await scenario.materialize({
    user: { overrides: { user: { name: "Sharing Invitee", initials: "SI" } }, setCurrent: false },
  });
  if (!invitee) throw new Error("Failed to materialize the sharing invitee.");

  await withE2EDb(async (db) => {
    await db.insert(invitations).values({
      tripId: trip.id,
      email: invitee.email,
      role: "viewer",
      status: "pending",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      invitedBy: manager.id,
    });
  });

  const inviteePage = await openSecondSession(page, scenario, invitee, "/trips", "/api/users/me/events");
  await expect(inviteePage.getByTitle(`Accept invitation to ${trip.name}`)).toBeVisible();
});

Given(
  "I have a trip with an editor contributor viewing it in their own session for sharing",
  async ({ page, scenario }) => {
    const trip = await scenario.ensureCurrentTrip("datelessTrip");
    const contributor = await scenario.seedCollaborator(trip.id, "Leaving Contributor", "LC", "editor");
    const contributorPage = await openSecondSession(
      page,
      scenario,
      contributor,
      `/trips/${trip.id}`,
      `/api/trips/${trip.id}/events`
    );
    await expect(contributorPage.getByRole("heading", { level: 1, name: trip.name })).toBeVisible();
  }
);

When("I open the sharing dialog with live sync", async ({ page, scenario }) => {
  const trip = await scenario.ensureCurrentTrip();
  const tripChannelReady = waitForLiveSyncResponse(page, `/api/trips/${trip.id}/events`);
  await Promise.all([page.goto(`/trips/${trip.id}`), tripChannelReady]);
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Share trip" })).toBeVisible();
});

When("the invited user accepts the invitation from their dashboard", async ({ page, scenario }) => {
  const trip = await scenario.ensureCurrentTrip();
  const { page: inviteePage, user: invitee } = getSecondSession(scenario);
  await expect(sharingRowFor(page, invitee.email)).toContainText("Pending");

  await inviteePage.getByTitle(`Accept invitation to ${trip.name}`).click();
  await inviteePage.waitForURL(`**/trips/${trip.id}`, { timeout: 15_000 });
});

When("the invited user declines the invitation from their dashboard", async ({ page, scenario }) => {
  const trip = await scenario.ensureCurrentTrip();
  const { page: inviteePage, user: invitee } = getSecondSession(scenario);
  await expect(sharingRowFor(page, invitee.email)).toContainText("Pending");

  await inviteePage.getByTitle(`Decline invitation to ${trip.name}`).click();
  await expect(inviteePage.getByText("Invitation declined.", { exact: true })).toBeVisible();
});

When("the sharing contributor leaves the trip", async ({ page, scenario }) => {
  const trip = await scenario.ensureCurrentTrip();
  const { page: contributorPage, user: contributor } = getSecondSession(scenario);
  await expect(page.getByRole("dialog").getByTitle(`Remove ${contributor.name}`)).toBeVisible();

  await contributorPage.getByRole("button", { name: /^Leave trip .+/ }).click();
  const confirmation = contributorPage.getByRole("alertdialog");
  const leavePosted = waitForServerActionResponse(contributorPage, { pathIncludes: `/trips/${trip.id}` });
  await confirmation.getByRole("button", { name: "Leave trip", exact: true }).click();
  await leavePosted;
});

Then(
  "the sharing dialog lists the invited user as an active contributor without reloading",
  async ({ page, scenario }) => {
    const { user: invitee } = getSecondSession(scenario);
    await expect(page.getByRole("dialog").getByLabel(`Role for ${invitee.name}`)).toBeVisible({
      timeout: LIVE_SYNC_ASSERTION_TIMEOUT_MS,
    });
    await expect(page.getByRole("dialog").getByTitle(`Rescind invitation to ${invitee.email}`)).toHaveCount(0);
  }
);

Then(
  "the sharing dialog shows the invited user's invitation as declined without reloading",
  async ({ page, scenario }) => {
    const { user: invitee } = getSecondSession(scenario);
    await expect(page.getByRole("dialog").getByTitle(`Dismiss invitation to ${invitee.email}`)).toBeVisible({
      timeout: LIVE_SYNC_ASSERTION_TIMEOUT_MS,
    });
    await expect(sharingRowFor(page, invitee.email)).toContainText("Declined");
  }
);

Then("the sharing dialog no longer lists the sharing contributor without reloading", async ({ page, scenario }) => {
  const { user: contributor } = getSecondSession(scenario);
  await expect(page.getByRole("dialog").getByTitle(`Remove ${contributor.name}`)).toHaveCount(0, {
    timeout: LIVE_SYNC_ASSERTION_TIMEOUT_MS,
  });
  await expect(page.getByRole("heading", { name: "Share trip" })).toBeVisible();
});

After(async ({ scenario }) => {
  const secondContext = scenario.getValue<BrowserContext>(SECOND_SESSION_CONTEXT_KEY);
  if (!secondContext) return;
  await secondContext.close();
  scenario.clearValue(SECOND_SESSION_CONTEXT_KEY);
  scenario.clearValue(SECOND_SESSION_PAGE_KEY);
  scenario.clearValue(SECOND_SESSION_USER_KEY);
});
