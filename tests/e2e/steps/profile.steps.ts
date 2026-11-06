import { expect, type BrowserContext, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { collaborators, invitations, trips } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { Given, When, Then } from "../fixtures";
import type { ScenarioUserRecord } from "../scenario-fixture";
import { waitForServerActionResponse } from "../server-action";

Given("I am on the profile page", async ({ page, scenario }) => {
  await scenario.signIn(page);
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/profile/);
});

When("I click the user area in the sidebar", async ({ page }) => {
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
});

Then("I should be on the profile page", async ({ page }) => {
  await expect(page).toHaveURL(/\/profile/);
});

When("I navigate to the Traveler section", async ({ page }) => {
  await page.getByRole("tab", { name: "Traveler" }).click();
});

When("I navigate to the Preferences section", async ({ page }) => {
  await page.getByRole("tab", { name: "Preferences" }).click();
  // Verify the panel actually switched (Base UI Tabs can set data-active on the
  // trigger without switching the panel under load — see profile-page-client.tsx)
  await expect(page.getByRole("tabpanel", { name: "Preferences" })).toBeVisible({ timeout: 5000 });
});

When("I update my name to {string}", async ({ page }, name: string) => {
  const nameInput = page.locator("#profile-name");
  await nameInput.clear();
  await nameInput.fill(name);
});

When("I save my Account details", async ({ page }) => {
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForTimeout(500);
});

Then("my name {string} should appear in the sidebar", async ({ page }, name: string) => {
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toContainText(name);
});

const RENAMED_USERNAME_KEY = "renamedUsername";

When("I change my username to a new one and save", async ({ page, scenario }) => {
  const user = await scenario.ensureCurrentUser();
  const username = scenario.uniqueUsername("renamed");
  scenario.setValue(RENAMED_USERNAME_KEY, username);

  const usernameInput = page.locator("#profile-username");
  await expect(usernameInput).toHaveValue(user.username);
  await usernameInput.fill(username);
  const saved = waitForServerActionResponse(page, { pathIncludes: "/profile" });
  await page.getByRole("button", { name: "Save" }).click();
  await saved;
  await expect(page.getByText("Saved", { exact: true })).toHaveCount(0);
  scenario.setCurrentUser({ ...user, username });
});

Then("the sidebar should show my new username", async ({ page, scenario }) => {
  const username = scenario.getValue<string>(RENAMED_USERNAME_KEY)!;
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toContainText(`@${username}`);
});

Then("I can sign in with my new username", async ({ page, scenario }) => {
  const username = scenario.getValue<string>(RENAMED_USERNAME_KEY)!;
  await page.getByRole("textbox", { name: "Username" }).fill(username);
  await page.getByRole("textbox", { name: "Password" }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/trips");
});

When("I set currency to {string}", async ({ page }, currency: string) => {
  await page.getByRole("button", { name: /Currency:/i }).click();
  await page.getByRole("textbox", { name: "Search currencies" }).fill(currency);
  await page.getByRole("option", { name: new RegExp(`${currency}$`, "i") }).click();
});

When("I save the Preferences section", async ({ page }) => {
  const saved = waitForServerActionResponse(page, { pathIncludes: "/profile" });
  await page.getByRole("button", { name: "Save" }).click();
  await saved;
  await expect(page.getByText("Saved", { exact: true })).toHaveCount(0);
});

Then("the currency preference should persist after reload", async ({ page }) => {
  await page.reload();
  await page.getByRole("tab", { name: "Preferences" }).click();
  await expect(page.getByRole("button", { name: /Currency: Euro EUR/i })).toBeVisible();
});

When("I set the default transit mode to {string}", async ({ page }, mode: string) => {
  await page.getByRole("button", { name: mode, exact: true }).click();
});

When("I set the walk threshold to {string}", async ({ page }, threshold: string) => {
  await page.getByRole("combobox", { name: "Walk if closer than" }).click();
  await page.getByRole("option", { name: threshold }).click();
});

Then("the transit mode should show {string}", async ({ page }, mode: string) => {
  await expect(page.getByRole("button", { name: mode, exact: true })).toHaveAttribute("aria-pressed", "true");
});

Then("the walk threshold should show {string}", async ({ page }, threshold: string) => {
  await expect(page.getByRole("combobox", { name: "Walk if closer than" })).toContainText(threshold);
});

Then("the Account section should be active", async ({ page }) => {
  await expect(page.getByRole("tab", { name: "Account" })).toHaveAttribute("aria-selected", "true");
});

Then("the Account content should be visible", async ({ page }) => {
  await expect(page.locator("#profile-name")).toBeVisible();
});

Then("the Traveler content should be visible", async ({ page }) => {
  await expect(page.getByText("Loyalty Numbers")).toBeVisible();
});

Then("the Account content should not be visible", async ({ page }) => {
  await expect(page.locator("#profile-name")).not.toBeVisible();
});

When("I navigate to the Appearance section", async ({ page }) => {
  await page.getByRole("tab", { name: "Appearance" }).click();
});

When("I select {string} as the font size", async ({ page }, size: string) => {
  await page.getByRole("combobox", { name: /font size/i }).click();
  await page.getByRole("option", { name: size }).click();
});

Then("the font size select should show {string}", async ({ page }, size: string) => {
  await expect(page.getByRole("combobox", { name: /font size/i })).toContainText(size, { ignoreCase: true });
});

Then("the font size should use {int} pixels with scale {string}", async ({ page }, pixels: number, scale: string) => {
  await expect
    .poll(() =>
      page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--font-size-base").trim())
    )
    .toBe(`${pixels}px`);
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--font-scale").trim()))
    .toBe(scale);
});

When("I reload the page", async ({ page }) => {
  await page.reload();
});

When("I type in the name field", async ({ page }) => {
  const nameInput = page.locator("#profile-name");
  await nameInput.fill("Dirty Name");
});

When("I accept the unsaved-changes dialog when switching to the Preferences section", async ({ page }) => {
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("tab", { name: "Preferences" }).click();
});

Then("I should be on the Preferences section", async ({ page }) => {
  await expect(page.getByRole("tab", { name: "Preferences" })).toHaveAttribute("aria-selected", "true");
});

When("I accept the unsaved-changes dialog when switching to the Traveler section", async ({ page }) => {
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("tab", { name: "Traveler" }).click();
});

Then("switching to the Traveler section should not show a warning", async ({ page }) => {
  let dialogFired = false;
  page.once("dialog", () => {
    dialogFired = true;
  });
  await page.getByRole("tab", { name: "Traveler" }).click();
  await expect(page.getByText("Loyalty Numbers")).toBeVisible();
  expect(dialogFired).toBe(false);
});

Then("I should see the loyalty number {string}", async ({ page }, memberNumber: string) => {
  await expect(page.getByText(memberNumber)).toBeVisible();
});

When("I click the copy button for the loyalty number", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy member number" }).click();
});

When("I use a profile viewport width of {int} pixels", async ({ page }, width: number) => {
  await page.setViewportSize({ width, height: 900 });
});

Then("document number copy buttons should be hidden", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Copy passport number", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Copy known traveler number", exact: true })).toHaveCount(0);
});

When(
  "I enter passport number {string} and known traveler number {string}",
  async ({ page }, passportNumber: string, knownTravelerNumber: string) => {
    await page.getByLabel("Passport number", { exact: true }).fill(passportNumber);
    await page
      .getByLabel("Known traveler number (TSA PreCheck / Global Entry)", { exact: true })
      .fill(knownTravelerNumber);
  }
);

Then(
  "I can copy passport number {string} and known traveler number {string}",
  async ({ page }, passportNumber: string, knownTravelerNumber: string) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    for (const [label, value] of [
      ["Copy passport number", passportNumber],
      ["Copy known traveler number", knownTravelerNumber],
    ]) {
      const button = page.getByRole("button", { name: label, exact: true });
      await button.click();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(value);
      const bounds = await button.boundingBox();
      expect(bounds!.width).toBeGreaterThanOrEqual(44);
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    }
  }
);

When("I save my travel documents", async ({ page }) => {
  const saved = waitForServerActionResponse(page, { pathIncludes: "/profile" });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await saved;
});

Then("no inline save success message should appear", async ({ page }) => {
  await expect(page.getByText("Saved", { exact: true })).toHaveCount(0);
});

When("I add a wishlist destination named {string}", async ({ page }, name: string) => {
  const input = page.getByPlaceholder("e.g. Kyoto, Japan");
  await input.fill(name);
  const saved = waitForServerActionResponse(page, { pathIncludes: "/profile" });
  await input.press("Enter");
  await saved;
  await expect(page.getByRole("tabpanel", { name: "Traveler" }).getByText(name, { exact: true })).toBeVisible();
});

When("I expand the companion {string}", async ({ page }, name: string) => {
  await page.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
});

Then(
  "{word} icon controls should be at least 44 pixels and fit within the viewport",
  async ({ page }, section: string) => {
    const panel = page.getByRole("tabpanel", { name: section === "Companion" ? "Companions" : section });
    const controls = panel.getByRole("button", { name: /^(Copy member number|Remove|Edit |Collapse )/ });
    await expect(controls).toHaveCount(section === "Traveler" ? 3 : 2);
    for (const control of await controls.all()) {
      await expect(control).toBeVisible();
      const bounds = await control.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.width).toBeGreaterThanOrEqual(44);
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()!.width
    );
  }
);

Then("I see the copied to clipboard toast", async ({ page }) => {
  await expect(page.getByText("Copied to clipboard")).toBeVisible();
});

When("I navigate to the Companions section", async ({ page }) => {
  await page.getByRole("tab", { name: "Companions" }).click();
});

Then("I should see the companion {string}", async ({ page }, name: string) => {
  await expect(page.getByText(name)).toBeVisible();
});

When("I add a companion named {string}", async ({ page }, name: string) => {
  await page.locator("#companion-name").fill(name);
  await page.getByRole("button", { name: "Add" }).click();
  await page.waitForTimeout(500);
});

When("I remove the companion {string}", async ({ page }, name: string) => {
  await page.getByRole("button", { name: `Remove ${name}` }).click();
  await page.waitForTimeout(500);
});

Then("the companion {string} should not be visible", async ({ page }, name: string) => {
  await expect(page.getByText(name)).not.toBeVisible();
});

// ── Security tab and session revocation (also used by mfa.feature) ──────────

const SECOND_DEVICE_KEY = "profile:second-device";

When("I navigate to the Account section", async ({ page }) => {
  await page.getByRole("tab", { name: "Account" }).click();
  await expect(page.getByRole("tabpanel", { name: "Account" })).toBeVisible();
});

When("I open the Security section", async ({ page }) => {
  await page.getByRole("tab", { name: "Security" }).click();
  await expect(page.getByRole("tabpanel", { name: "Security" })).toBeVisible();
});

Given("I am also signed in on a second device", async ({ page, scenario }) => {
  const user = await scenario.ensureCurrentUser();
  const secondDevice = await scenario.openSecondSession(page);
  scenario.setValue(SECOND_DEVICE_KEY, secondDevice);
  await scenario.signInAsUser(secondDevice.page, user.username);
});

When("I change my password to {string}", async ({ page, scenario }, newPassword: string) => {
  await page.getByRole("button", { name: "Change password" }).click();
  await page.getByLabel("Current password").fill(process.env.E2E_PASSWORD!);
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirm new password").fill(newPassword);
  await page.getByRole("button", { name: "Update password" }).click();
  await page.waitForURL("**/sign-in?notice=*");
  scenario.signOut();
});

When("I sign out all devices", async ({ page, scenario }) => {
  await page.getByRole("button", { name: "Sign out all devices" }).click();
  await page.waitForURL("**/sign-in?notice=*");
  scenario.signOut();
});

Then("I should see the sign-in notice {string}", async ({ page }, text: string) => {
  await expect(page.getByRole("status")).toContainText(text);
});

Then("my second device should be signed out", async ({ scenario }) => {
  const secondDevice = scenario.getValue<{ context: BrowserContext; page: Page }>(SECOND_DEVICE_KEY);
  if (!secondDevice) throw new Error("No second device was opened in this scenario.");
  try {
    await secondDevice.page.goto("/trips");
    await expect(secondDevice.page).toHaveURL(/\/sign-in/);
  } finally {
    await secondDevice.context.close();
  }
});

When("I remove my other browser", async ({ page }) => {
  // The list was rendered before the second device signed in.
  await page.reload();
  await page.getByRole("tab", { name: "Security" }).click();
  const otherBrowser = page
    .getByRole("list", { name: "Your browsers" })
    .getByRole("listitem")
    .filter({ hasNotText: "This browser" });
  await expect(otherBrowser).toHaveCount(1);
  const response = waitForServerActionResponse(page, { pathIncludes: "/profile" });
  await otherBrowser.getByRole("button", { name: /^Remove / }).click();
  await response;
  await expect(otherBrowser).toHaveCount(0);
});

const SHARED_TRIP_COLLABORATORS_KEY = "sharedTripCollaborators";

function requireSharedTripId(scenario: { currentTrip?: { id: string } }): string {
  const tripId = scenario.currentTrip?.id;
  if (!tripId) throw new Error("No shared trip was seeded in this scenario.");
  return tripId;
}

Given(
  "I own the shared trip {string} with editor {string} and viewer {string}",
  async ({ scenario }, tripName: string, editorName: string, viewerName: string) => {
    const trip = await scenario.ensureCurrentTrip("datelessTrip", { trip: { name: tripName } });
    const editor = await scenario.seedCollaborator(trip.id, editorName, editorName.slice(0, 2).toUpperCase(), "editor");
    // seedCollaborator only seeds editors/managers; the viewer is a second materialized account added by hand.
    const { user: viewer } = await scenario.materialize({
      user: {
        overrides: { user: { name: viewerName, initials: viewerName.slice(0, 2).toUpperCase() } },
        setCurrent: false,
      },
    });
    if (!viewer) throw new Error(`Failed to materialize the viewer "${viewerName}".`);
    await withE2EDb(async (db) => {
      await db.insert(collaborators).values({
        tripId: trip.id,
        userId: viewer.id,
        name: viewer.name,
        initials: viewer.initials,
        role: "viewer",
        isCreator: false,
      });
    });
    scenario.setValue<Record<string, ScenarioUserRecord>>(SHARED_TRIP_COLLABORATORS_KEY, {
      [editorName]: editor,
      [viewerName]: viewer,
    });
  }
);

Given("I have a pending invite out on my shared trip", async ({ scenario }) => {
  const inviter = await scenario.ensureCurrentUser();
  const tripId = requireSharedTripId(scenario);
  const { user: invitee } = await scenario.materialize({
    user: { overrides: { user: { name: "Pending Invitee", initials: "PI" } }, setCurrent: false },
  });
  if (!invitee) throw new Error("Failed to materialize the pending invitee.");
  await withE2EDb(async (db) => {
    await db.insert(invitations).values({
      tripId,
      inviteeId: invitee.id,
      role: "editor",
      status: "pending",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      invitedBy: inviter.id,
    });
  });
});

When("I open the delete account dialog", async ({ page }) => {
  await page.getByRole("button", { name: "Delete account" }).click();
  await expect(page.getByRole("dialog", { name: "Delete account?" })).toBeVisible();
});

When("I choose {string} for {string}", async ({ page }, optionLabel: string, tripName: string) => {
  const picker = page.getByRole("dialog").getByRole("combobox", { name: new RegExp(tripName) });
  await picker.click();
  await page.getByRole("option", { name: optionLabel }).click();
  await expect(picker).toContainText(optionLabel);
});

When("I confirm deleting my account", async ({ page, scenario }) => {
  await page.getByRole("dialog").getByRole("button", { name: "Delete account" }).click();
  // Success answers the action POST with signOut's 303, sent only after the transaction commits, so
  // landing on sign-in already proves persistence (waitForServerActionResponse would reject the 303).
  await page.waitForURL("**/sign-in**", { timeout: 15_000 });
  // The root <Toaster> survives the SPA navigation, so a swallowed redirect would still show here. A
  // retrying "count is 0" check would pass once the toast auto-dismisses, so fail if it ever appears.
  const failureToastAppeared = await page
    .getByText("Couldn't delete your account. Try again.")
    .waitFor({ state: "visible", timeout: 2_000 })
    .then(() => true)
    .catch(() => false);
  expect(failureToastAppeared).toBe(false);
  scenario.signOut();
});

Then("{string} should own my shared trip as its manager", async ({ scenario }, heirName: string) => {
  const tripId = requireSharedTripId(scenario);
  const heir = scenario.getValue<Record<string, ScenarioUserRecord>>(SHARED_TRIP_COLLABORATORS_KEY)?.[heirName];
  if (!heir) throw new Error(`"${heirName}" was not seeded on the shared trip.`);

  const { trip, heirMembership } = await withE2EDb(async (db) => {
    const [tripRow] = await db.select({ ownerId: trips.ownerId }).from(trips).where(eq(trips.id, tripId));
    const [membership] = await db
      .select({ role: collaborators.role, isCreator: collaborators.isCreator })
      .from(collaborators)
      .where(and(eq(collaborators.tripId, tripId), eq(collaborators.userId, heir.id)));
    return { trip: tripRow, heirMembership: membership };
  });

  expect(trip?.ownerId).toBe(heir.id);
  expect(heirMembership).toEqual({ role: "manager", isCreator: true });
});

Then("my shared trip should have no pending invites", async ({ scenario }) => {
  const tripId = requireSharedTripId(scenario);
  const pending = await withE2EDb((db) =>
    db
      .select({ id: invitations.id })
      .from(invitations)
      .where(and(eq(invitations.tripId, tripId), eq(invitations.status, "pending")))
  );
  expect(pending).toEqual([]);
});

Then("my shared trip should no longer exist", async ({ scenario }) => {
  const tripId = requireSharedTripId(scenario);
  const remaining = await withE2EDb((db) => db.select({ id: trips.id }).from(trips).where(eq(trips.id, tripId)));
  expect(remaining).toEqual([]);
});

// A valid 1x1 PNG; the server re-encodes it to a 256x256 WebP.
const AVATAR_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const AVATAR_URL_KEY = "avatarUrl";
const AVATAR_URL_PREFIX = "/api/storage/user-avatars/";

function sidebarAvatar(page: Page) {
  return page.getByRole("button", { name: "Account menu", exact: true }).locator("img");
}

function profileAvatar(page: Page) {
  return page.getByRole("tabpanel", { name: "Account" }).locator('[data-slot="profile-avatar"] img');
}

When("I upload a profile photo", async ({ page, scenario }) => {
  const saved = waitForServerActionResponse(page, { pathIncludes: "/profile" });
  await page.locator('input[type="file"][accept="image/jpeg,image/png,image/webp"]').setInputFiles({
    name: "avatar.png",
    mimeType: "image/png",
    buffer: Buffer.from(AVATAR_PNG_BASE64, "base64"),
  });
  await saved;
  await expect(profileAvatar(page)).toHaveAttribute("src", new RegExp(`^${AVATAR_URL_PREFIX}`));
  scenario.setValue(AVATAR_URL_KEY, await profileAvatar(page).getAttribute("src"));
});

When("I remove my profile photo", async ({ page }) => {
  const removed = waitForServerActionResponse(page, { pathIncludes: "/profile" });
  await page.getByRole("button", { name: "Remove photo" }).click();
  await removed;
});

Then("my profile photo should be shown on the profile page", async ({ page }) => {
  const photo = profileAvatar(page);
  await expect(photo).toBeVisible();
  // The auth-gated storage route must serve the re-encoded 256x256 WebP.
  await expect
    .poll(() => photo.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth === 256))
    .toBe(true);
});

Then("hovering my profile photo should reveal its {string} control", async ({ page }, label: string) => {
  const control = page.getByRole("button", { name: label, exact: true });
  await page.mouse.move(0, 0);
  await expect(control).toHaveCSS("opacity", "0");
  await control.hover();
  await expect(control).toHaveCSS("opacity", "1");
  // Part of the picture itself: the control sits inside the photo's bounds and is at least 44px.
  const photoBox = (await profileAvatar(page).boundingBox())!;
  const controlBox = (await control.boundingBox())!;
  expect(controlBox.width).toBeGreaterThanOrEqual(44);
  expect(controlBox.height).toBeGreaterThanOrEqual(44);
  expect(controlBox.x).toBeGreaterThanOrEqual(photoBox.x - 1);
  expect(controlBox.x + controlBox.width).toBeLessThanOrEqual(photoBox.x + photoBox.width + 1);
});

Then("the sidebar should show my profile photo", async ({ page }) => {
  await expect(sidebarAvatar(page)).toHaveAttribute("src", new RegExp(`^${AVATAR_URL_PREFIX}`));
});

Then("the sidebar should not show a profile photo", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
  await expect(sidebarAvatar(page)).toHaveCount(0);
});

Then("my initials should be shown instead of a profile photo", async ({ page }) => {
  await expect(profileAvatar(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Upload photo" })).toBeVisible();
  await expect(sidebarAvatar(page)).toHaveCount(0);
});

Then("the removed profile photo file should no longer be served", async ({ page, scenario }) => {
  const url = scenario.getValue<string>(AVATAR_URL_KEY)!;
  const response = await page.request.get(url);
  expect(response.status()).toBe(404);
});
