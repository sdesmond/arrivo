import { expect } from "@playwright/test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { Given, When, Then, After } from "../fixtures";
import { trips, users } from "../../../src/db/schema";
import { E2E_USER, E2E_TRIP } from "../e2e-seed-data";

let tripNameMutated = false;

Given("I have an existing trip", async ({ page }) => {
  await page.goto("/trips");
  await page.locator('a[href*="/trips/"]').first().click();
  await page.waitForURL(/\/trips\/.+/);
});

When("I open the trip edit sheet", async ({ page }) => {
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

When("I change the trip name to {string}", async ({ page }, name: string) => {
  tripNameMutated = true;
  const nameInput = page.getByRole("dialog").getByRole("textbox").first();
  await nameInput.fill(name);
});

When("I save", async ({ page }) => {
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

Then("the trip should display {string}", async ({ page }, name: string) => {
  await expect(page.getByRole("heading", { level: 1 })).toContainText(name);
});

When("I tab to the edit button and press Enter", async ({ page }) => {
  await page.getByRole("button", { name: "Edit" }).press("Enter");
});

Then("the edit sheet should open with focus inside", async ({ page }) => {
  await expect(page.getByRole("dialog")).toBeVisible();
  const focused = await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
  expect(focused).toBe(true);
});

When("I press Escape", async ({ page }) => {
  await page.keyboard.press("Escape");
});

Then("the sheet should close and focus should return to the edit button", async ({ page }) => {
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Edit" })).toBeFocused();
});

After(async () => {
  if (!tripNameMutated) return;
  tripNameMutated = false;
  const client = postgres(process.env.E2E_DATABASE_URL!);
  const db = drizzle(client);
  try {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, E2E_USER.email));
    if (!user) return;
    await db.update(trips).set({ name: E2E_TRIP.name }).where(eq(trips.ownerId, user.id));
  } finally {
    await client.end();
  }
});
