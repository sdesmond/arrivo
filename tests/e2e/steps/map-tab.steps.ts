import { expect, type Page } from "@playwright/test";
import { Before, Given, Then, When } from "../fixtures";

function mapRegion(page: Page) {
  return page.getByRole("application", { name: /trip map/i });
}

Before({ tags: "@trip-with-map-pins" }, async ({ scenario }) => {
  await scenario.materialize({
    user: { setCurrent: true },
    trip: {
      mother: "threeDayTrip",
      overrides: {
        events: [
          { name: "Eiffel Tower", position: 0, dayNumber: 1, locationLat: 48.8584, locationLng: 2.2945 },
          { name: "Louvre Museum", position: 1, dayNumber: 1, locationLat: 48.8606, locationLng: 2.3376 },
        ],
      },
      setCurrent: true,
    },
  });
});

Before({ tags: "@trip-with-reservation-map-pin" }, async ({ scenario }) => {
  await scenario.materialize({
    user: { setCurrent: true },
    trip: {
      mother: "threeDayTrip",
      overrides: {
        events: [],
        reservations: [
          {
            type: "train",
            provider: "Eurostar",
            startLocationName: "Gare du Nord",
            startAddress: "18 Rue de Dunkerque, Paris",
            startLocationLat: 48.8809,
            startLocationLng: 2.3553,
          },
        ],
      },
      setCurrent: true,
    },
  });
});

Given("I have a trip with located stops on two days", async ({ page, scenario }) => {
  await scenario.materialize({
    user: { setCurrent: true },
    trip: {
      mother: "threeDayTrip",
      overrides: {
        events: [
          { name: "Eiffel Tower", position: 0, dayNumber: 1, locationLat: 48.8584, locationLng: 2.2945 },
          { name: "Louvre Museum", position: 0, dayNumber: 2, locationLat: 48.8606, locationLng: 2.3376 },
        ],
      },
      setCurrent: true,
    },
  });
  await scenario.signIn(page);
  await scenario.gotoCurrentTrip(page);
});

Before({ tags: "@map-deep-link" }, async ({ scenario }) => {
  await scenario.materialize({
    user: { setCurrent: true },
    trip: {
      mother: "threeDayTrip",
      overrides: {
        events: [
          { name: "Museum", position: 0, dayNumber: 1, locationLat: 48.8566, locationLng: 2.3522 },
          { name: "Cafe", position: 1, dayNumber: 1, locationLat: 48.8606, locationLng: 2.3376 },
          { name: "Louvre Museum", position: 0, dayNumber: 2, locationLat: 48.861, locationLng: 2.338 },
        ],
      },
      setCurrent: true,
    },
  });
});

Given("I have a trip with a routed day and another located stop", async ({ page, scenario }) => {
  await scenario.signIn(page);
  await scenario.gotoCurrentTrip(page);
  const dayToggle = page
    .locator("button")
    .filter({ hasText: /\d+ stops/ })
    .first();
  if ((await dayToggle.getAttribute("aria-expanded")) === "false") {
    await dayToggle.click();
  }
});

Given("I have a trip with many days", async ({ page, scenario }) => {
  await scenario.materialize({
    user: { setCurrent: true },
    trip: {
      mother: "threeDayTrip",
      overrides: {
        days: Array.from({ length: 10 }, (_unused, index) => ({
          dayNumber: index + 1,
          date: `2026-07-${String(index + 1).padStart(2, "0")}`,
          label: `Day ${index + 1}`,
        })),
        events: [{ name: "Eiffel Tower", position: 0, dayNumber: 1, locationLat: 48.8584, locationLng: 2.2945 }],
      },
      setCurrent: true,
    },
  });
  await scenario.signIn(page);
  await scenario.gotoCurrentTrip(page);
});

When("I open the Map tab", async ({ page }) => {
  await page.getByRole("button", { name: "Map" }).click();
});

When("I tap the day 1 route strip thumbnail", async ({ page }) => {
  await page.getByRole("button", { name: /route (overview|unavailable) for day 1/i }).click();
});

When("I select map scope {string}", async ({ page }, scope: string) => {
  await page.getByRole("tab", { name: scope }).click();
});

When("I open the Map tab on a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.getByRole("button", { name: "Map" }).click();
});

Then("the map is visible with located stops", async ({ page }) => {
  await expect(page.getByTestId("map-tab-container")).toBeVisible({ timeout: 10_000 });
  await expect(mapRegion(page).getByRole("button", { name: /Eiffel Tower/ })).toBeVisible();
  await expect(mapRegion(page).getByRole("button", { name: /Louvre Museum/ })).toBeVisible();
});

Then("the map is visible with the reservation stop", async ({ page }) => {
  await expect(page.getByTestId("map-tab-container")).toBeVisible({ timeout: 10_000 });
  await expect(mapRegion(page).getByRole("button", { name: /Gare du Nord/ })).toBeVisible();
});

Then("no map is rendered and the located stops empty state is shown", async ({ page }) => {
  await expect(page.getByText("No located stops yet")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("map-tab-container")).toHaveCount(0);
});

Then("only Day 1 located stops are shown on the map", async ({ page }) => {
  await expect(mapRegion(page).getByRole("button", { name: /Eiffel Tower/ })).toBeVisible();
  await expect(mapRegion(page).getByRole("button", { name: /Louvre Museum/ })).toHaveCount(0);
});

Then("every located stop is shown on the map", async ({ page }) => {
  await expect(mapRegion(page).getByRole("button", { name: /Eiffel Tower/ })).toBeVisible();
  await expect(mapRegion(page).getByRole("button", { name: /Louvre Museum/ })).toBeVisible();
});

Then("the map shows the stop {string}", async ({ page }, expectedName: string) => {
  await expect(mapRegion(page).getByRole("button", { name: expectedName, exact: true })).toBeVisible();
});

Then("the map shows the stops {string} and {string}", async ({ page }, firstName: string, secondName: string) => {
  await expect(mapRegion(page).getByRole("button", { name: firstName, exact: true })).toBeVisible();
  await expect(mapRegion(page).getByRole("button", { name: secondName, exact: true })).toBeVisible();
});

Then("the reservation stop is not numbered on the map", async ({ page }) => {
  await expect(mapRegion(page).getByRole("button", { name: /Gare du Nord/ })).toBeVisible();
  await expect(mapRegion(page).getByRole("button", { name: /^\d+\.\s/ })).toHaveCount(0);
});

When("I tap the map pin for {string}", async ({ page }, stopName: string) => {
  await mapRegion(page)
    .getByRole("button", { name: new RegExp(stopName) })
    .click();
});

Then("the map detail card shows {string} with an Open External Maps action", async ({ page }, stopName: string) => {
  const detailCard = page.getByTestId("map-tab-pin-detail");
  await expect(detailCard).toBeVisible();
  await expect(detailCard).toContainText(stopName);
  await expect(detailCard.getByRole("button", { name: "Open External Maps" })).toBeVisible();
});

When("I close the map detail card", async ({ page }) => {
  await page.getByRole("button", { name: "Close pin detail" }).click();
});

Then("the map detail card is not shown", async ({ page }) => {
  await expect(page.getByTestId("map-tab-pin-detail")).toHaveCount(0);
});

When("I tap the View in Itinerary action in the map detail card", async ({ page }) => {
  await page.getByTestId("map-tab-pin-detail").getByRole("button", { name: "View in Itinerary" }).click();
});

Then("I land on the Itinerary tab with {string} focused", async ({ page }, eventName: string) => {
  await expect(page).toHaveURL(/[?&]tab=itin/);
  await expect(page).toHaveURL(/[?&]focus=/);
  await expect(page.getByText(eventName, { exact: true })).toBeVisible({ timeout: 10_000 });
});

Then("the map detail card has no View in Itinerary action", async ({ page }) => {
  await expect(page.getByTestId("map-tab-pin-detail").getByRole("button", { name: "View in Itinerary" })).toHaveCount(
    0
  );
});

Then("the map day selector is horizontally scrollable", async ({ page }) => {
  const isScrollable = await page.getByRole("tablist", { name: "Map scope" }).evaluate((element) => {
    return element.scrollWidth > element.clientWidth;
  });

  expect(isScrollable).toBe(true);
});

Then("the Map tab is open with day 1 selected", async ({ page }) => {
  await expect(page).toHaveURL(/[?&]tab=map/);
  await expect(page).toHaveURL(/[?&]day=1/);
  await expect(page.getByRole("tab", { name: "Day 1", selected: true })).toBeVisible();
});

Then("the Whole Trip scope is selected", async ({ page }) => {
  await expect(page.getByRole("tab", { name: "Whole Trip", selected: true })).toBeVisible();
});
