import { expect, type Page } from "@playwright/test";
import { Then } from "../fixtures";

// Also uses "I am signed in as an app {string}" from account-menu.steps.ts.
// playwright.config.ts sets E2E_UPDATE_STUB, so the app server never calls GitHub.

function sidebar(page: Page) {
  return page.getByRole("navigation", { name: "Main navigation" });
}

Then("the sidebar links to release {string}", async ({ page }, version: string) => {
  const link = sidebar(page).getByRole("link", { name: `Version ${version} available` });
  await expect(link).toHaveAttribute("href", `https://github.com/sdesmond/arrivo/releases/tag/v${version}`);
});

Then("the sidebar shows no release notice", async ({ page }) => {
  await expect(sidebar(page).getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
  await expect(sidebar(page).getByRole("link", { name: /available/ })).toHaveCount(0);
});
