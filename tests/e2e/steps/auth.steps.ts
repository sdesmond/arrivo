import { expect } from "@playwright/test";
import { When, Then } from "../fixtures";

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
  await page.getByRole("button", { name: "Sign out" }).click();
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
