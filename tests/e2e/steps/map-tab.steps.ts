import { expect } from "@playwright/test";
import { Before, Then, When } from "../fixtures";

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

When("I open the Map tab", async ({ page }) => {
  await page.getByRole("button", { name: "Map" }).click();
});

Then("the map is visible with located stops", async ({ page }) => {
  await expect(page.getByTestId("map-tab-container")).toBeVisible({ timeout: 10_000 });
  const locatedStopsList = page.getByRole("list", { name: "Located stops" });
  await expect(locatedStopsList.getByRole("button", { name: "Eiffel Tower" })).toBeVisible();
  await expect(locatedStopsList.getByRole("button", { name: "Louvre Museum" })).toBeVisible();
});

Then("the map is visible with the reservation stop", async ({ page }) => {
  await expect(page.getByTestId("map-tab-container")).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByRole("list", { name: "Located stops" }).getByRole("button", { name: "Gare du Nord" })
  ).toBeVisible();
});

Then("no map is rendered and the located stops empty state is shown", async ({ page }) => {
  await expect(page.getByText("No located stops yet")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("map-tab-container")).toHaveCount(0);
});
