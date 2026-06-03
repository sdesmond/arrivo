import { expect } from "@playwright/test";
import { Given, Then } from "../fixtures";

Given("I am on the sign-in page", async ({ page, scenario }) => {
  scenario.signOut();
  await page.context().clearCookies();
  await page.goto("/sign-in");
});

Given("I am signed in", async ({ page, scenario }) => {
  await scenario.signIn(page);
  await expect(page).toHaveURL(/\/trips/);
});

Given("I am signed in as the baseline e2e user", async ({ page, scenario }) => {
  await scenario.signInAsBaseline(page);
  await expect(page).toHaveURL(/\/trips/);
});

Then("I should be redirected to the trips page", async ({ page }) => {
  await expect(page).toHaveURL(/\/trips/, { timeout: 15_000 });
});

Then("I should be redirected to the sign-in page", async ({ page }) => {
  await expect(page).toHaveURL(/\/sign-in/);
});
