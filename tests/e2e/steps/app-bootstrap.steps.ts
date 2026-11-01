import { expect, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { UserRole } from "../../../src/data/types";
import { activityEvents, users } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { Given, When, Then } from "../fixtures";
import { waitForServerActionResponse } from "../server-action";

const SIGN_UP_USERNAME_KEY = "signUpUsername";
// Sign-up requires 8+ characters, longer than the seeded E2E_PASSWORD.
const SIGN_UP_PASSWORD = "sign-up-password";

Given("the app has not been set up yet", async ({ scenario }) => {
  await scenario.setAppState("fresh");
});

Given("the app is already set up", async ({ scenario }) => {
  await scenario.setAppState("initialized");
});

Given("I am on the admin setup page", async ({ page, scenario }) => {
  scenario.signOut();
  await page.context().clearCookies();
  await page.goto("/setup");
});

async function submitSignUp(page: Page, username: string) {
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Sign-up Person");
  await page.getByRole("textbox", { name: "Username" }).fill(username);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(SIGN_UP_PASSWORD);
  await page.getByLabel("Confirm password", { exact: true }).fill(SIGN_UP_PASSWORD);
  // Auth.js can return a successful 303 after bootstrap; the mutation helper accepts only 2xx.
  const response = page.waitForResponse(
    (result) => result.request().method() === "POST" && new URL(result.url()).pathname === "/setup",
    { timeout: 15_000 }
  );
  await page.getByRole("button", { name: "Create admin account" }).click();
  expect((await response).status()).toBeLessThan(400);
}

async function findUser(username: string) {
  const [found] = await withE2EDb((db) =>
    db.select({ id: users.id, role: users.role }).from(users).where(eq(users.username, username))
  );
  return found;
}

When("I sign up with a new username", async ({ page, scenario }) => {
  const username = scenario.uniqueUsername("signup");
  scenario.setValue(SIGN_UP_USERNAME_KEY, username);
  // Typed with capitals: the account is stored, and signed in to, by its lowercased form.
  await submitSignUp(page, username.toUpperCase());

  // Success lands on /trips; a refused sign-up stays on the form showing an error.
  await Promise.race([page.waitForURL("**/trips", { timeout: 15_000 }), page.locator("#form-error").waitFor()]);
  const created = await findUser(username);
  if (created) scenario.registerCleanup({ entity: "user", id: created.id });
});

When("I sign up with the username of an existing account", async ({ page, scenario }) => {
  const existing = await scenario.ensureCurrentUser();
  await submitSignUp(page, existing.username);
});

Then("I should see that the username is taken", async ({ page }) => {
  await expect(page.locator("#form-error")).toHaveText("That username is taken.");
  await expect(page).toHaveURL(/\/setup/);
});

Then("I should be told setup is already complete", async ({ page }) => {
  await expect(page.locator("#form-error")).toHaveText("Setup is already complete. Sign in to continue.");
  await expect(page).toHaveURL(/\/setup/);
});

Then("no account was created for that username", async ({ scenario }) => {
  const username = scenario.getValue<string>(SIGN_UP_USERNAME_KEY)!;
  expect(await findUser(username)).toBeUndefined();
});

Then("my new account is the app admin", async ({ scenario }) => {
  const username = scenario.getValue<string>(SIGN_UP_USERNAME_KEY)!;
  expect((await findUser(username))?.role).toBe(UserRole.Admin);
});

Then("I can sign out and sign back in with my new username", async ({ page, scenario }) => {
  const username = scenario.getValue<string>(SIGN_UP_USERNAME_KEY)!;
  const desktop = page.getByRole("button", { name: "Account menu", exact: true });
  const trigger = (await desktop.isVisible()) ? desktop : page.getByRole("button", { name: "Profile", exact: true });
  // The development date picker floats over the lower-right corner on narrow screens.
  await trigger.click({ position: { x: 8, y: 8 } });
  await page.getByRole("menuitem", { name: "Log out", exact: true }).click();
  await page.waitForURL("**/sign-in");
  await page.getByRole("textbox", { name: "Username" }).fill(username);
  await page.getByRole("textbox", { name: "Password" }).fill(SIGN_UP_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/trips");
  // The @username label lives in the desktop sidebar only; the account-menu trigger shows on both layouts.
  await expect(page.getByRole("button", { name: /^(Account menu|Profile)$/ }).filter({ visible: true })).toHaveCount(1);
});

async function creationEvents(username: string) {
  return withE2EDb((db) =>
    db
      .select()
      .from(activityEvents)
      .where(and(eq(activityEvents.type, "account_created"), eq(activityEvents.actorUsername, username)))
  );
}

Then("the account creation is recorded once in Activity for my new account", async ({ scenario }) => {
  const username = scenario.getValue<string>(SIGN_UP_USERNAME_KEY)!;
  const created = await findUser(username);
  // The event is written after the sign-up response, so poll for it.
  await expect.poll(async () => (await creationEvents(username)).length).toBe(1);
  const [event] = await creationEvents(username);
  expect(event).toMatchObject({ actorId: created.id, actorUsername: username, targetId: null, targetUsername: null });
});

Then("no account creation was recorded in Activity for that username", async ({ scenario }) => {
  const username = scenario.getValue<string>(SIGN_UP_USERNAME_KEY)!;
  // Nothing to wait for; give a wrongly-scheduled write time to show up before asserting absence.
  await new Promise((resolve) => setTimeout(resolve, 500));
  expect(await creationEvents(username)).toHaveLength(0);
});

When("I open bootstrap entry {string}", async ({ page, scenario }, path: string) => {
  scenario.signOut();
  await page.context().clearCookies();
  await page.goto(path);
});

Then("I see the admin setup welcome", async ({ page }) => {
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByRole("heading", { name: "Welcome to Arrivo!" })).toBeVisible();
  await expect(page.getByText("Let's get your admin account set up.")).toBeVisible();
  expect(
    await page
      .locator('form input:not([type="hidden"])')
      .evaluateAll((inputs) => inputs.map((input) => input.getAttribute("name")))
  ).toEqual(["username", "name", "password", "confirmPassword"]);
  for (const label of ["Username", "Name", "Password", "Confirm password"]) {
    await expect(page.getByLabel(label, { exact: true })).toHaveAttribute("required", "");
  }
});

Then("I see the sign-in screen", async ({ page }) => {
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
});

Then("Username is focused", async ({ page }) => {
  await expect(page.getByLabel("Username", { exact: true })).toBeFocused();
});

When("I submit admin setup with {string} set to {string}", async ({ page, scenario }, field: string, value: string) => {
  const username = field === "username" ? value : scenario.uniqueUsername("invalid");
  scenario.setValue(SIGN_UP_USERNAME_KEY, username);
  const fields: Record<string, string> = {
    username,
    name: "Setup Admin",
    password: SIGN_UP_PASSWORD,
    confirmPassword: SIGN_UP_PASSWORD,
    [field]: value,
  };
  for (const [name, inputValue] of Object.entries(fields))
    await page.locator('input[name="' + name + '"]').fill(inputValue);
  // Exercise authoritative server validation even when native required/minlength would block submission.
  await page.locator("form").evaluate((form) => {
    form.setAttribute("novalidate", "");
  });
  const response = waitForServerActionResponse(page, { pathIncludes: "/setup", timeoutMs: 15_000 });
  await page.getByRole("button", { name: "Create admin account" }).click();
  await response;
});

Then("I see setup error {string}", async ({ page }, error: string) => {
  await expect(page.locator("#form-error")).toHaveText(error);
});

Then("setup remains open after reload", async ({ page }) => {
  await page.reload();
  await expect(page.getByRole("heading", { name: "Welcome to Arrivo!" })).toBeVisible();
});
