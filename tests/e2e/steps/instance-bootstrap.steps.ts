import { expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { UserRole } from "../../../src/data/types";
import { users } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { Given, When, Then } from "../fixtures";

const SIGN_UP_USERNAME_KEY = "signUpUsername";
// Sign-up requires 8+ characters, longer than the seeded E2E_PASSWORD.
const SIGN_UP_PASSWORD = "sign-up-password";

Given("the instance has not been set up yet", async ({ scenario }) => {
  await scenario.setInstanceState("fresh");
});

Given("the instance is already set up", async ({ scenario }) => {
  await scenario.setInstanceState("initialized");
});

Given("I am on the sign-up page", async ({ page, scenario }) => {
  scenario.signOut();
  await page.context().clearCookies();
  await page.goto("/sign-up");
});

async function submitSignUp(page: Page, username: string) {
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Sign-up Person");
  await page.getByRole("textbox", { name: "Username" }).fill(username);
  await page.getByRole("textbox", { name: "Password" }).fill(SIGN_UP_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
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
  await expect(page).toHaveURL(/\/sign-up/);
});

Then("I should be told to ask an admin for an account", async ({ page }) => {
  await expect(page.locator("#form-error")).toHaveText("Ask an admin to create your account.");
  await expect(page).toHaveURL(/\/sign-up/);
});

Then("no account was created for that username", async ({ scenario }) => {
  const username = scenario.getValue<string>(SIGN_UP_USERNAME_KEY)!;
  expect(await findUser(username)).toBeUndefined();
});

Then("my new account is the instance admin", async ({ scenario }) => {
  const username = scenario.getValue<string>(SIGN_UP_USERNAME_KEY)!;
  expect((await findUser(username))?.role).toBe(UserRole.Admin);
});

Then("I can sign out and sign back in with my new username", async ({ page, scenario }) => {
  const username = scenario.getValue<string>(SIGN_UP_USERNAME_KEY)!;
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Log out", exact: true }).click();
  await page.waitForURL("**/sign-in");
  await page.getByRole("textbox", { name: "Username" }).fill(username);
  await page.getByRole("textbox", { name: "Password" }).fill(SIGN_UP_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/trips");
  await expect(page.getByText(`@${username}`)).toBeVisible();
});
