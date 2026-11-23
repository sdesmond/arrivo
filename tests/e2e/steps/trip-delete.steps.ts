import { expect } from "@playwright/test";
import { Given, When, Then } from "../fixtures";
import { reloadPage } from "../page-reload";

Given("I have a trip available to delete from the listing page", async ({ page, scenario }) => {
  const trip = await scenario.ensureCurrentTrip("deleteTrip");
  await scenario.signIn(page);
  await page.goto("/trips");
  await expect(page.locator(`a[href="/trips/${trip.id}"]`).first()).toBeVisible();
});

Given("I have another trip with the same name", async ({ page, scenario }) => {
  const { trip } = await scenario.materialize({ trip: { mother: "deleteTrip", setCurrent: false } });
  if (!trip) throw new Error("Could not create the second trip.");
  scenario.setValue("same-name-trip-id", trip.id);
  await reloadPage(page);
  await expect(page.locator(`a[href="/trips/${trip.id}"]`).first()).toBeVisible();
});

Then("the other trip with the same name remains visible", async ({ page, scenario }) => {
  const tripId = scenario.getValue<string>("same-name-trip-id");
  if (!tripId) throw new Error("The second trip was not created.");
  await expect(page.locator(`a[href="/trips/${tripId}"]`).first()).toBeVisible();
});

When("I open the trip options menu for {string}", async ({ page, scenario }, tripName: string) => {
  const trip = await scenario.ensureCurrentTrip();
  expect(trip.name).toBe(tripName);
  const tripCard = page.locator(`a[href="/trips/${trip.id}"]`).first();
  await expect(tripCard).toBeVisible();
  const trigger = tripCard.getByTitle("Trip options");
  await trigger.click();
  const deleteTripItem = page.getByRole("menuitem", { name: "Delete trip" });
  if (!(await deleteTripItem.isVisible().catch(() => false))) {
    await trigger.focus();
    await page.keyboard.press("Enter");
  }
  await expect(deleteTripItem).toBeVisible();
});

When("I choose {string} from the trip options menu", async ({ page }, action: string) => {
  const menuItem = page.getByRole("menuitem", { name: action }).first();
  await expect(menuItem).toBeVisible();
  await menuItem.focus();
  await page.keyboard.press("Enter");
});

When("I confirm the trip deletion", async ({ page, scenario }) => {
  const trip = await scenario.ensureCurrentTrip();
  const deleted = page.waitForResponse(
    (response) =>
      response.request().method() === "DELETE" && new URL(response.url()).pathname === `/api/v1/trips/${trip.id}`
  );
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  expect((await deleted).status()).toBe(204);
});

Then("the trip {string} is no longer visible in the trip list", async ({ page, scenario }, tripName: string) => {
  const trip = await scenario.ensureCurrentTrip();
  expect(trip.name).toBe(tripName);
  await expect(page.locator(`a[href="/trips/${trip.id}"]`)).toHaveCount(0);
});

When("I delete the trip", async ({ page, scenario }) => {
  const trip = await scenario.ensureCurrentTrip();
  await page.goto("/trips");
  const tripCard = page.locator(`a[href="/trips/${trip.id}"]`).filter({ hasText: trip.name }).first();
  await expect(tripCard).toBeVisible();
  const trigger = tripCard.getByTitle("Trip options");
  const deleteTripItem = page.getByRole("menuitem", { name: "Delete trip" });
  // A click before hydration opens nothing; retry only while the menu is closed so a slow open is never toggled shut.
  await expect(async () => {
    if (!(await deleteTripItem.isVisible())) await trigger.click();
    await expect(deleteTripItem).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 10_000 });
  await deleteTripItem.click();
  // Wait for the delete action itself: under load it can outlast the card assertion's timeout on its own.
  const deleted = page.waitForResponse(
    (response) =>
      response.request().method() === "DELETE" && new URL(response.url()).pathname === `/api/v1/trips/${trip.id}`
  );
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  expect((await deleted).status()).toBe(204);
  await expect(page.locator(`a[href="/trips/${trip.id}"]`)).toHaveCount(0);
});

When("I open that trip and delete it from its detail page", async ({ page, scenario }) => {
  const trip = await scenario.ensureCurrentTrip();
  await page.goto(`/trips/${trip.id}`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Delete trip", exact: true }).click();
  const deleted = page.waitForResponse(
    (response) =>
      response.request().method() === "DELETE" && new URL(response.url()).pathname === `/api/v1/trips/${trip.id}`
  );
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  expect((await deleted).status()).toBe(204);
});
Then("I return to the trips list after deletion", async ({ page }) => {
  await expect(page).toHaveURL(/\/trips\/?$/);
});

Then("the trip deletion dialog is closed", async ({ page }) => {
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});
