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

When("I sign out", async ({ page }) => {
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/sign-in");
});

When("I tab to the email field and type valid credentials", async ({ page }) => {
  await page.keyboard.press("Tab");
  await page.keyboard.type(process.env.E2E_EMAIL!);
  await page.keyboard.press("Tab");
  await page.keyboard.type(process.env.E2E_PASSWORD!);
});

When("I press Enter to submit", async ({ page }) => {
  await page.keyboard.press("Enter");
});
