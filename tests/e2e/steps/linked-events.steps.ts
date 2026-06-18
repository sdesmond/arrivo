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

Given(
  "the trip has a Lodging reservation with Check-in on Day 1 and draggable events {string} and {string} on Day 1",
  async ({ page, scenario }, firstEventName: string, secondEventName: string) => {
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
          events: [
            { name: firstEventName, position: 0, dayNumber: 1 },
            { name: secondEventName, position: 1, dayNumber: 1 },
          ],
        },
        setCurrent: true,
      },
    });

    await scenario.gotoCurrentTrip(page);
    await ensureDayExpanded(page, 1);
  }
);

Given("the trip has a Flight reservation with Delta departing and arriving on Day 1", async ({ page, scenario }) => {
  await scenario.materialize({
    trip: {
      mother: "threeDayTrip",
      overrides: {
        reservations: [
          {
            type: "flight",
            provider: "Delta",
            startAt: "2026-07-01T18:00:00Z",
            endAt: "2026-07-02T02:00:00Z",
          },
        ],
      },
      setCurrent: true,
    },
  });

  await scenario.gotoCurrentTrip(page);
});

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

Then(
  "I see a single {string} Linked Event on Day 1 with a Plane icon and a {string} badge",
  async ({ page }, provider: string, badgeText: string) => {
    await ensureDayExpanded(page, 1);
    await expect(page.getByText(provider, { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(badgeText).first()).toBeVisible({ timeout: 10_000 });
  }
);

Then(
  "I do not see separate {string} or {string} Linked Events on Day 1",
  async ({ page }, first: string, second: string) => {
    await ensureDayExpanded(page, 1);
    await expect(page.getByText(first, { exact: false })).not.toBeVisible();
    await expect(page.getByText(second, { exact: false })).not.toBeVisible();
  }
);
