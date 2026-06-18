import { expect, type Page } from "@playwright/test";
import { Given, Then, When } from "../fixtures";

async function ensureDayExpanded(page: Page, dayIndex: number): Promise<void> {
  const dayToggle = page.getByRole("button", { name: /stops?$/ }).nth(dayIndex - 1);
  const expanded = await dayToggle.getAttribute("aria-expanded");
  if (expanded === "false") {
    await dayToggle.click();
  }
}

Given(
  "the trip has a Lodging reservation with Check-in on Day 1 and Check-out on Day 2",
  async ({ page, scenario }) => {
    await scenario.materialize({
      trip: {
        mother: "threeDayTrip",
        overrides: {
          reservations: [
            {
              type: "lodging",
              provider: "Torel Avantgarde",
              startAt: "2026-07-01T15:00:00Z",
              endAt: "2026-07-02T11:00:00Z",
            },
          ],
        },
        setCurrent: true,
      },
    });

    await scenario.gotoCurrentTrip(page);
  }
);

When("I view the Itinerary tab", async ({ page }) => {
  const itineraryTab = page.getByRole("button", { name: "Itinerary" });
  if ((await itineraryTab.count()) > 0) {
    await itineraryTab.click();
  }
});

Then(
  "I see a {string} Linked Event on Day 1 with a Hotel icon and a {string} badge",
  async ({ page }, anchorLabel: string, badgeText: string) => {
    await ensureDayExpanded(page, 1);
    await expect(page.getByText(`${anchorLabel} — Torel Avantgarde`)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(badgeText).first()).toBeVisible({ timeout: 10_000 });
  }
);

Then(
  "I see a {string} Linked Event on Day 2 with a Hotel icon and a {string} badge",
  async ({ page }, anchorLabel: string, badgeText: string) => {
    await ensureDayExpanded(page, 2);
    await expect(page.getByText(`${anchorLabel} — Torel Avantgarde`)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(badgeText).first()).toBeVisible({ timeout: 10_000 });
  }
);
