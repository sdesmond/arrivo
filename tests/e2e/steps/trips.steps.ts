import { expect } from "@playwright/test";
import { format, parseISO } from "date-fns";
import { Given, When, Then } from "../fixtures";

Given("I have an existing trip", async ({ page, scenario }) => {
  await scenario.signIn(page);
  await scenario.ensureCurrentTrip();
  await scenario.gotoCurrentTrip(page);
});

When("I open the trip edit sheet", async ({ page }) => {
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

When("I change the trip name to {string}", async ({ page }, name: string) => {
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
  await page.getByRole("button", { name: "Edit", exact: true }).press("Enter");
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
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeFocused();
});

When("I close the trip edit sheet without saving", async ({ page }) => {
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

Then("the trip edit sheet shows the original dates", async ({ page, scenario }) => {
  const trip = scenario.currentTrip;
  if (!trip?.startDate || !trip.endDate) {
    throw new Error("Current scenario trip is missing its original date range.");
  }

  const originalRangeLabel = new RegExp(
    `${format(parseISO(trip.startDate), "MMM d, yyyy")}.*${format(parseISO(trip.endDate), "MMM d, yyyy")}`
  );

  await expect(page.getByRole("dialog").getByRole("button", { name: originalRangeLabel }).first()).toBeVisible();
});

When("I navigate to the trips list", async ({ page }) => {
  await page.goto("/trips");
});

Then("I see an {string} section with {string}", async ({ page }, sectionTitle: string, tripName: string) => {
  await expect(page.getByRole("heading", { name: sectionTitle })).toBeVisible();
  await expect(page.getByText(tripName).first()).toBeVisible();
});

When("I open the Budget tab", async ({ page }) => {
  await page.getByRole("button", { name: "Budget" }).click();
});

When("I click the Add Misc Expense button", async ({ page }) => {
  await page.getByRole("button", { name: "Add Misc Expense" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

When("I enter {string} as the expense amount", async ({ page }, amount: string) => {
  await page.getByRole("textbox", { name: "Amount" }).fill(amount);
});

When("I choose {string} as the expense category", async ({ page }, category: string) => {
  await page.getByRole("button", { name: "Select category" }).click();
  await page.getByRole("option", { name: category, exact: true }).click();
});

When("I save the Misc Expense", async ({ page }) => {
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

Then("the Budget tab shows {string} as Actual spent", async ({ page }, amount: string) => {
  await expect(page.getByText(amount, { exact: true }).first()).toBeVisible();
});

Then("the Budget tab shows a {string} category tile", async ({ page }, category: string) => {
  await expect(page.getByText(category, { exact: true })).toBeVisible();
});
