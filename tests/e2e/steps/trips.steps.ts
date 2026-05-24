import { expect } from "@playwright/test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { Given, When, Then, After } from "../fixtures";
import { trips } from "../../../src/db/schema";
import { E2E_TRIP } from "../e2e-seed-data";

let tripNameMutated = false;

Given("I have an existing trip", async ({ page }) => {
  const client = postgres(process.env.E2E_DATABASE_URL!);
  const db = drizzle(client);
  const [trip] = await db.select({ id: trips.id }).from(trips).where(eq(trips.startDate, E2E_TRIP.startDate));
  await client.end();
  if (!trip) throw new Error("Seeded E2E trip not found");
  await page.goto(`/trips/${trip.id}`);
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

When("I navigate to the trips list", async ({ page }) => {
  await page.goto("/trips");
});

Then("I see an {string} section with {string}", async ({ page }, sectionTitle: string, tripName: string) => {
  await expect(page.getByRole("heading", { name: sectionTitle })).toBeVisible();
  await expect(page.getByText(tripName).first()).toBeVisible();
});

After(async () => {
  if (!tripNameMutated) return;
  tripNameMutated = false;
  const client = postgres(process.env.E2E_DATABASE_URL!);
  const db = drizzle(client);
  try {
    await db.update(trips).set({ name: E2E_TRIP.name }).where(eq(trips.startDate, E2E_TRIP.startDate));
  } finally {
    await client.end();
  }
});
