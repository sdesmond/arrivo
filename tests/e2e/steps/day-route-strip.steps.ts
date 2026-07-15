import { expect } from "@playwright/test";
import { Before, Then } from "../fixtures";

Before({ tags: "@trip-with-located-events" }, async ({ scenario }) => {
  await scenario.materialize({
    user: { setCurrent: true },
    trip: {
      mother: "threeDayTrip",
      overrides: {
        events: [
          { name: "Museum", position: 0, dayNumber: 1, locationLat: 48.8566, locationLng: 2.3522 },
          { name: "Cafe", position: 1, dayNumber: 1, locationLat: 48.8606, locationLng: 2.3376 },
        ],
      },
      setCurrent: true,
    },
  });
});

Then("no day route strip is visible", async ({ page }) => {
  await expect(page.getByTestId("day-route-strip")).toHaveCount(0);
});

Then("a day route strip is visible", async ({ page }) => {
  await expect(page.getByTestId("day-route-strip")).toBeVisible();
});
