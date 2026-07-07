import { expect } from "@playwright/test";
import { Before, Given, When, Then } from "../fixtures";
import {
  E2E_DOCUMENT,
  E2E_ERASE_DOC,
  E2E_EVENT,
  E2E_EVENT_ERASE,
  E2E_EVENT_KEEP,
  E2E_EVENT_MANAGE,
  E2E_KEEP_DOC,
  E2E_MANAGE_DOC,
  E2E_PICK_DOC,
  E2E_TRIP_START_DATE,
} from "../e2e-seed-data";

function escapeRegex(source: string): string {
  return source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function dayButtonNamePattern(date: string): RegExp {
  const parsedDate = new Date(`${date}T00:00:00`);
  const weekday = parsedDate.toLocaleString("en-US", { weekday: "short" });
  const month = parsedDate.toLocaleString("en-US", { month: "short" });
  const day = String(parsedDate.getDate());
  return new RegExp(`${weekday}.*(${month}\\s*${day}|${day}\\s*${month})`, "i");
}

Before({ tags: "@event-docs" }, async ({ scenario }) => {
  await scenario.materialize({
    user: { setCurrent: true },
    trip: {
      mother: "threeDayTrip",
      overrides: {
        events: [
          { ...E2E_EVENT, dayNumber: 1 },
          { ...E2E_EVENT_KEEP, dayNumber: 1 },
          { ...E2E_EVENT_ERASE, dayNumber: 1 },
          { ...E2E_EVENT_MANAGE, dayNumber: 1 },
        ],
        documents: [
          E2E_DOCUMENT,
          E2E_PICK_DOC,
          { ...E2E_KEEP_DOC, eventName: E2E_EVENT_KEEP.name },
          { ...E2E_ERASE_DOC, eventName: E2E_EVENT_ERASE.name },
          { ...E2E_MANAGE_DOC, eventName: E2E_EVENT_MANAGE.name },
        ],
      },
      setCurrent: true,
    },
  });
});

Given("I am on the Itinerary tab", async ({ page }) => {
  await page.getByRole("button", { name: "Itinerary" }).click();
  await page.waitForTimeout(500);
});

Given("I expand Day 1", async ({ page }) => {
  const toggleBtn = page.getByRole("button", { name: dayButtonNamePattern(E2E_TRIP_START_DATE) }).first();
  await toggleBtn.click();
  await expect(page.getByText(E2E_EVENT.name, { exact: true })).toBeVisible({ timeout: 5_000 });
});

When("I click the Attach button on {string}", async ({ page }, eventName: string) => {
  await page
    .locator("div")
    .filter({ hasText: new RegExp(eventName) })
    .filter({ has: page.getByTitle("Attach document") })
    .getByTitle("Attach document")
    .first()
    .click();
});

Then("the pick list panel shows {string}", async ({ page }, docName: string) => {
  await expect(page.getByRole("button", { name: docName })).toBeVisible({ timeout: 5_000 });
});

When("I select {string} from the pick list", async ({ page }, docName: string) => {
  await page.getByRole("button", { name: docName }).click();
});

Then("the AddDocDialog is closed", async ({ page }) => {
  await expect(page.getByText("Attach document")).not.toBeVisible({ timeout: 5_000 });
});

When("I click {string}", async ({ page }, buttonText: string) => {
  await page.getByRole("button", { name: buttonText }).click();
});

Then("the upload panel is shown with the Attach button", async ({ page }) => {
  await expect(page.getByRole("button", { name: /^attach$/i })).toBeVisible({ timeout: 5_000 });
});

When("I delete the event {string}", async ({ page }, eventName: string) => {
  await page
    .locator("div")
    .filter({ hasText: new RegExp(`^${escapeRegex(eventName)}`) })
    .filter({ has: page.getByTitle("Delete event") })
    .getByTitle("Delete event")
    .first()
    .click();
});

Then("the delete event dialog is shown", async ({ page }) => {
  await expect(page.getByRole("button", { name: /keep documents/i })).toBeVisible({ timeout: 5_000 });
});

Then("the delete event dialog is closed", async ({ page }) => {
  await expect(page.getByRole("button", { name: /keep documents/i })).not.toBeVisible({ timeout: 3_000 });
});

Then("{string} is no longer visible in the itinerary", async ({ page }, eventName: string) => {
  await expect(page.getByText(eventName, { exact: true })).not.toBeVisible({ timeout: 10_000 });
});

Then("the Documents tab shows {string}", async ({ page }, docName: string) => {
  await page.getByRole("button", { name: "Documents" }).click();
  await expect(page.getByText(docName, { exact: true })).toBeVisible({ timeout: 10_000 });
});

Then("the Documents tab does not show {string}", async ({ page }, docName: string) => {
  await page.getByRole("button", { name: "Documents" }).click();
  await expect(page.getByText(docName, { exact: true })).not.toBeVisible({ timeout: 5_000 });
});

When("I expand the docs for event {string}", async ({ page }, eventName: string) => {
  await page
    .locator("div")
    .filter({ hasText: new RegExp(`^${escapeRegex(eventName)}`) })
    .getByRole("button", { name: /doc/i })
    .first()
    .click();
  await expect(page.getByRole("button", { name: `View ${E2E_MANAGE_DOC.name}` })).toBeVisible({ timeout: 5_000 });
});

When("I rename the event doc {string} to {string}", async ({ page }, oldName: string, newName: string) => {
  await page.getByText(oldName, { exact: true }).first().click();
  const input = page.getByRole("textbox");
  await input.fill(newName);
  await input.press("Enter");
});

Then("the event doc {string} is visible", async ({ page }, docName: string) => {
  await expect(page.getByText(docName, { exact: true }).first()).toBeVisible({ timeout: 5_000 });
});

When("I promote the event doc {string} to trip level", async ({ page }, docName: string) => {
  await page.getByRole("button", { name: `Move ${docName} to trip` }).click();
});

Then("the event doc {string} is no longer visible in the event", async ({ page }, docName: string) => {
  await expect(page.getByRole("button", { name: `Move ${docName} to trip` })).not.toBeVisible({ timeout: 10_000 });
});
