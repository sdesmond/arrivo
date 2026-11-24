import { expect } from "@playwright/test";
import { format, parseISO } from "date-fns";
import { Given, When, Then } from "../fixtures";
import { waitForApiResponse } from "../api-response";

Given("I have an existing trip", async ({ page, scenario }) => {
  await scenario.signIn(page);
  await scenario.ensureCurrentTrip();
  await scenario.gotoCurrentTrip(page);
});

Given("I am signed in with preferred currency {string}", async ({ page, scenario }, currency: string) => {
  await scenario.materialize({
    user: {
      overrides: {
        user: {
          currency,
        },
      },
    },
  });
  await scenario.signIn(page);
});

When("I open the trip edit sheet", async ({ page }) => {
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

When("I change the trip name to {string}", async ({ page }, name: string) => {
  const nameInput = page.getByRole("dialog").getByRole("textbox").first();
  await nameInput.fill(name);
});

When("I clear the trip name", async ({ page }) => {
  await page.getByRole("dialog").getByLabel("Trip name").fill("");
});

When("I type {int} characters into the trip name", async ({ page }, count: number) => {
  // Typing (not fill) so the input's maxLength applies the way it does for a person.
  await page.getByRole("dialog").getByLabel("Trip name").pressSequentially("x".repeat(count));
});

Then("the trip name field shows {string} and Save changes is disabled", async ({ page }, message: string) => {
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Trip name")).toHaveAttribute("aria-invalid", "true");
  await expect(dialog.getByRole("status").filter({ hasText: message })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save changes" })).toBeDisabled();
});

Then("the trip name field holds {int} characters", async ({ page }, count: number) => {
  await expect(page.getByRole("dialog").getByLabel("Trip name")).toHaveValue("x".repeat(count));
});

When("I type {string} in the budget field", async ({ page }, budget: string) => {
  await page.getByRole("dialog").getByRole("textbox", { name: "Budget" }).fill(budget);
});

When("I save", async ({ page, scenario }) => {
  const saved = waitForApiResponse(page, { method: "PATCH", path: `/api/v1/trips/${scenario.currentTrip!.id}` });
  await page.getByRole("button", { name: "Save changes" }).click();
  // Count, not visibility: the drawer and any popover inside it run their exit animations together.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // The sheet seeds its draft from the trip prop only while closed, so reopening before the revalidated trip
  // lands (the dialog closes first) shows the old values. Wait for the API response, then two frames for React.
  await saved;
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
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
  await expect(page.getByRole("dialog")).toHaveCount(0);
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

When("I select {string} as the transit mode", async ({ page }, mode: string) => {
  const section = page.getByRole("dialog").getByRole("group", { name: /default transit mode/i });
  await section.getByRole("button", { name: mode, exact: true }).click();
});

Then("the trip edit sheet shows {string} as the selected transit mode", async ({ page }, mode: string) => {
  const section = page.getByRole("dialog").getByRole("group", { name: /default transit mode/i });
  await expect(section.getByRole("button", { name: mode, exact: true })).toHaveAttribute("aria-pressed", "true");
});
