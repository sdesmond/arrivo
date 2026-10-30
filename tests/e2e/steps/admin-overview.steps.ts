import { readFileSync } from "node:fs";
import { expect } from "@playwright/test";
import { Then } from "../fixtures";

// Also uses "I am signed in as an app {string}", "I request app management at {string}" and
// "app management is not found" from account-menu.steps.ts.

Then("I am on the app Overview", async ({ page }) => {
  await expect(page).toHaveURL(/\/admin\/overview$/);
  await expect(page.getByRole("heading", { name: "Manage app" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "App sections" });
  await expect(navigation.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  await expect(navigation.getByRole("link")).toHaveCount(3);
});

Then("the Overview shows version, database health and user counts with checked times", async ({ page }) => {
  const section = page.getByRole("region", { name: "Overview" });
  for (const label of ["Version", "Database", "Users", "Admins", "Pending setup"]) {
    await expect(section.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(section.getByText("Healthy", { exact: true })).toBeVisible();
  await expect(section.getByText("Unavailable")).toHaveCount(0);
  await expect(section.locator("time")).toHaveCount(5);
});

Then("the Overview version matches package.json", async ({ page }) => {
  const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
  await expect(page.getByRole("region", { name: "Overview" }).getByText(version, { exact: true })).toBeVisible();
});
