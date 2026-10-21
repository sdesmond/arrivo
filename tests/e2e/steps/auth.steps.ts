import { expect, type Page } from "@playwright/test";
import { Given, When, Then } from "../fixtures";
import { waitForServerActionResponse } from "../server-action";

When("I enter valid credentials", async ({ page }) => {
  await page.getByRole("textbox", { name: "Email" }).fill(process.env.E2E_EMAIL!);
  await page.getByRole("textbox", { name: "Password" }).fill(process.env.E2E_PASSWORD!);
});

When("I enter an incorrect password", async ({ page }) => {
  await page.getByRole("textbox", { name: "Email" }).fill(process.env.E2E_EMAIL!);
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

When("I tab to the email field and type valid credentials", async ({ page }) => {
  const emailField = page.getByRole("textbox", { name: "Email" });
  const passwordField = page.getByRole("textbox", { name: "Password" });

  await expect(emailField).toBeVisible();

  for (let attemptIndex = 0; attemptIndex < 4; attemptIndex += 1) {
    await page.keyboard.press("Tab");
    if (await emailField.evaluate((element) => element === document.activeElement)) {
      break;
    }
  }

  await expect(emailField).toBeFocused();
  await page.keyboard.type(process.env.E2E_EMAIL!);
  await page.keyboard.press("Tab");
  await expect(passwordField).toBeFocused();
  await page.keyboard.type(process.env.E2E_PASSWORD!);
});

When("I press Enter to submit", async ({ page }) => {
  await page.keyboard.press("Enter");
});

async function failSignIns(page: Page, email: string, attempts: number) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await page.getByRole("textbox", { name: "Email" }).fill(email);
    await page.getByRole("textbox", { name: "Password" }).fill(`wrong-password-${attempt}`);
    // bcrypt + the throttle transaction can run past the 5s default when the whole suite loads the server.
    const response = waitForServerActionResponse(page, { pathIncludes: "/sign-in", timeoutMs: 15_000 });
    await page.getByRole("button", { name: "Sign in" }).click();
    await response;
    await expect(page.locator("#form-error")).toHaveText("Invalid email or password.");
    // React resets the form after each action; refilling before that lands would be wiped and fail validation.
    await expect(page.getByRole("textbox", { name: "Email" })).toHaveValue("");
  }
}

async function expectLockoutMessage(page: Page) {
  await expect(page.locator("#form-error")).toHaveText(/Too many attempts\. Try again in \d+ minutes?\./);
  await expect(page).toHaveURL(/\/sign-in/);
}

When("I enter the wrong password for my account {int} times", async ({ page, scenario }, attempts: number) => {
  const user = await scenario.ensureCurrentUser();
  await failSignIns(page, user.email, attempts);
});

Given("I have signed in and out on this browser", async ({ page, scenario }) => {
  const user = await scenario.ensureCurrentUser();
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByRole("textbox", { name: "Email" }).fill(user.email);
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
      await failSignIns(other.page, user.email, attempts);
      // Even the right password is refused there now.
      await other.page.getByRole("textbox", { name: "Email" }).fill(user.email);
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
  await page.getByRole("textbox", { name: "Email" }).fill(user.email);
  await page.getByRole("textbox", { name: "Password" }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
});

Then("I should see a sign-in lockout message", async ({ page }) => {
  await expectLockoutMessage(page);
});
