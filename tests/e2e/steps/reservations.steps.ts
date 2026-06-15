import { expect } from "@playwright/test";
import { reservations } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { Given, When, Then } from "../fixtures";

Given("I am on the Reservations tab", async ({ page }) => {
  await page.getByRole("button", { name: "Reservations" }).click();
  await expect(page.getByRole("button", { name: "Add Reservation" })).toBeVisible({ timeout: 10_000 });
});

Given("the trip has reservations across multiple types", async ({ page, scenario }) => {
  const currentTrip = scenario.currentTrip;
  if (!currentTrip) {
    throw new Error("Missing current scenario trip.");
  }

  await withE2EDb(async (db) => {
    await db.insert(reservations).values([
      {
        tripId: currentTrip.id,
        type: "lodging",
        provider: "Soonest Hotel",
        startAt: new Date("2030-01-10T15:00:00Z"),
        endAt: new Date("2030-01-12T11:00:00Z"),
      },
      {
        tripId: currentTrip.id,
        type: "flight",
        provider: "Later Air",
        startAt: new Date("2030-02-15T10:00:00Z"),
      },
    ]);
  });

  await page.reload();
  await page.getByRole("button", { name: "Reservations" }).click();
});

When("I select the {string} reservation type", async ({ page }, typeLabel: string) => {
  await page.getByRole("menuitem", { name: typeLabel }).click();
});

Then("the {string} drawer is open", async ({ page }, title: string) => {
  await expect(page.getByText(title)).toBeVisible({ timeout: 10_000 });
});

When("I fill in the reservation provider with {string}", async ({ page }, provider: string) => {
  await page.getByLabel("Provider *").fill(provider);
});

When("I set the {string} date to today", async ({ page }, anchorLabel: string) => {
  await page.getByRole("button", { name: `${anchorLabel} date` }).click();
  await page
    .locator('[data-slot="popover-content"]')
    .getByRole("button", { name: /^Today,/ })
    .click();
});

When("I set the {string} time to {string}", async ({ page }, anchorLabel: string, time: string) => {
  await page.getByLabel(`${anchorLabel} time`).fill(time);
});

When("I click {string} on the reservation drawer", async ({ page }, buttonText: string) => {
  // The dev-only mock-date toggle is fixed at bottom-right and overlaps the drawer footer, so focus + Enter
  // avoids the pointer interception that a real click would hit.
  const button = page.getByRole("button", { name: buttonText });
  await button.focus();
  await button.press("Enter");
});

Then(
  "the reservation {string} appears in the {string} section",
  async ({ page }, provider: string, sectionLabel: string) => {
    const section = page.getByRole("button", { name: new RegExp(`^${sectionLabel}, `) });
    await expect(section).toBeVisible({ timeout: 10_000 });
    if ((await section.getAttribute("aria-expanded")) === "false") {
      await section.click();
    }
    await expect(page.getByText(provider)).toBeVisible({ timeout: 10_000 });
  }
);

Then("I see the {string} empty state", async ({ page }, title: string) => {
  await expect(page.getByText(title)).toBeVisible({ timeout: 10_000 });
});

Then("no reservation type sections are shown", async ({ page }) => {
  await expect(page.getByRole("button", { name: /reservation,/ })).toHaveCount(0);
});

Then(
  "the {string} reservation section appears before the {string} reservation section",
  async ({ page }, firstLabel: string, secondLabel: string) => {
    const sections = page.getByRole("button", { name: /reservation,/ });
    await expect(sections).toHaveCount(2, { timeout: 10_000 });
    await expect(sections.nth(0)).toHaveAccessibleName(new RegExp(`^${firstLabel}, `));
    await expect(sections.nth(1)).toHaveAccessibleName(new RegExp(`^${secondLabel}, `));
  }
);
