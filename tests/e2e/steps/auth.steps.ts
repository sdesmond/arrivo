import { expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { users } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { Given, When, Then } from "../fixtures";
import { waitForServerActionResponse } from "../server-action";

When("I enter valid credentials", async ({ page }) => {
  await page.getByRole("textbox", { name: "Username" }).fill(process.env.E2E_USERNAME!);
  await page.getByRole("textbox", { name: "Password" }).fill(process.env.E2E_PASSWORD!);
});

When("I enter an incorrect password", async ({ page }) => {
  await page.getByRole("textbox", { name: "Username" }).fill(process.env.E2E_USERNAME!);
  await page.getByRole("textbox", { name: "Password" }).fill("wrong-password");
});

When("I submit the sign-in form", async ({ page }) => {
  await page.getByRole("button", { name: "Sign in" }).click();
});

Then("I should see a sign-in error message", async ({ page }) => {
  await expect(page.getByRole("alert")).toBeVisible();
});

When("I sign out", async ({ page, scenario }) => {
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.waitForURL("**/sign-in");
  scenario.signOut();
});

When("I tab to the username field and type valid credentials", async ({ page }) => {
  const usernameField = page.getByRole("textbox", { name: "Username" });
  const passwordField = page.getByRole("textbox", { name: "Password" });

  await expect(usernameField).toBeVisible();

  for (let attemptIndex = 0; attemptIndex < 4; attemptIndex += 1) {
    await page.keyboard.press("Tab");
    if (await usernameField.evaluate((element) => element === document.activeElement)) {
      break;
    }
  }

  await expect(usernameField).toBeFocused();
  await page.keyboard.type(process.env.E2E_USERNAME!);
  await page.keyboard.press("Tab");
  await expect(passwordField).toBeFocused();
  await page.keyboard.type(process.env.E2E_PASSWORD!);
});

When("I press Enter to submit", async ({ page }) => {
  await page.keyboard.press("Enter");
});

async function failSignIns(page: Page, username: string, attempts: number) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await page.getByRole("textbox", { name: "Username" }).fill(username);
    await page.getByRole("textbox", { name: "Password" }).fill(`wrong-password-${attempt}`);
    // bcrypt + the throttle transaction can run past the 5s default when the whole suite loads the server.
    const response = waitForServerActionResponse(page, { pathIncludes: "/sign-in", timeoutMs: 15_000 });
    await page.getByRole("button", { name: "Sign in" }).click();
    await response;
    await expect(page.locator("#form-error")).toHaveText("Invalid username or password.");
    // React resets the form after each action; refilling before that lands would be wiped and fail validation.
    await expect(page.getByRole("textbox", { name: "Username" })).toHaveValue("");
  }
}

async function expectLockoutMessage(page: Page) {
  await expect(page.locator("#form-error")).toHaveText(/Too many attempts\. Try again in \d+ minutes?\./);
  await expect(page).toHaveURL(/\/sign-in/);
}

When("I enter the wrong password for my account {int} times", async ({ page, scenario }, attempts: number) => {
  const user = await scenario.ensureCurrentUser();
  await failSignIns(page, user.username, attempts);
});

Given("I have signed in and out on this browser", async ({ page, scenario }) => {
  const user = await scenario.ensureCurrentUser();
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByRole("textbox", { name: "Username" }).fill(user.username);
  await page.getByRole("textbox", { name: "Password" }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/trips");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.waitForURL("**/sign-in");
  scenario.signOut();
});

When(
  "someone enters the wrong password for my account {int} times on another browser",
  async ({ page, scenario }, attempts: number) => {
    const user = await scenario.ensureCurrentUser();
    const other = await scenario.openSecondSession(page);
    try {
      await other.page.goto("/sign-in");
      await failSignIns(other.page, user.username, attempts);
      // Even the right password is refused there now.
      await other.page.getByRole("textbox", { name: "Username" }).fill(user.username);
      await other.page.getByRole("textbox", { name: "Password" }).fill(process.env.E2E_PASSWORD!);
      await other.page.getByRole("button", { name: "Sign in" }).click();
      await expectLockoutMessage(other.page);
    } finally {
      await other.context.close();
    }
  }
);

When("I sign in to my account with the correct password", async ({ page, scenario }) => {
  const user = await scenario.ensureCurrentUser();
  await page.getByRole("textbox", { name: "Username" }).fill(user.username);
  await page.getByRole("textbox", { name: "Password" }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
});

Then("I should see a sign-in lockout message", async ({ page }) => {
  await expectLockoutMessage(page);
});

When("I sign in to my account with Keep me signed in ticked", async ({ page, scenario }) => {
  const user = await scenario.ensureCurrentUser();
  await page.getByRole("textbox", { name: "Username" }).fill(user.username);
  await page.getByRole("textbox", { name: "Password" }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole("checkbox", { name: "Keep me signed in" }).check();
  await page.getByRole("button", { name: "Sign in" }).click();
});

const SIGN_UP_USERNAME_KEY = "signUpUsername";
// Sign-up requires 8+ characters, longer than the seeded E2E_PASSWORD.
const SIGN_UP_PASSWORD = "sign-up-password";

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

When("I sign up with a new username", async ({ page, scenario }) => {
  const username = scenario.uniqueUsername("signup");
  scenario.setValue(SIGN_UP_USERNAME_KEY, username);
  // Typed with capitals: the account is stored, and signed in to, by its lowercased form.
  await submitSignUp(page, username.toUpperCase());
  await page.waitForURL("**/trips", { timeout: 15_000 });

  const [created] = await withE2EDb((db) =>
    db.select({ id: users.id }).from(users).where(eq(users.username, username))
  );
  if (!created) throw new Error(`Sign-up did not create an account for "${username}".`);
  scenario.registerCleanup({ entity: "user", id: created.id });
});

When("I sign up with the username of an existing account", async ({ page, scenario }) => {
  const existing = await scenario.ensureCurrentUser();
  await submitSignUp(page, existing.username);
});

Then("I should see that the username is taken", async ({ page }) => {
  await expect(page.locator("#form-error")).toHaveText("That username is taken.");
  await expect(page).toHaveURL(/\/sign-up/);
});

Then("I can sign out and sign back in with my new username", async ({ page, scenario }) => {
  const username = scenario.getValue<string>(SIGN_UP_USERNAME_KEY)!;
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.waitForURL("**/sign-in");
  await page.getByRole("textbox", { name: "Username" }).fill(username);
  await page.getByRole("textbox", { name: "Password" }).fill(SIGN_UP_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/trips");
  await expect(page.getByText(`@${username}`)).toBeVisible();
});
