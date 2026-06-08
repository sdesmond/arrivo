import { expect, type Locator } from "@playwright/test";
import { eq } from "drizzle-orm";
import { packingItems } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import {
  E2E_TEMPLATE_PULL,
  E2E_TEMPLATE_PULL_2,
  E2E_TEMPLATE_PULL_2_ITEMS,
  E2E_TEMPLATE_PULL_ITEMS,
} from "../e2e-seed-data";
import { Given, Then, When } from "../fixtures";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function checkTemplate(dialog: Locator, name: string): Promise<void> {
  const checkbox = dialog.getByRole("checkbox", { name: new RegExp(`^${escapeRegExp(name)}$`) }).first();
  await expect(checkbox).toBeVisible({ timeout: 5_000 });
  await checkbox.check();
}

Given("I am signed in as the template pull user", async ({ page, scenario }) => {
  await scenario.signIn(page);
});

Given("I have a trip with no packing items for pull", async ({ scenario }) => {
  const trip = await scenario.ensureCurrentTrip("threeDayTrip", {
    trip: {
      name: "E2E Pull Trip",
      startDate: "2026-07-11",
      endDate: "2026-07-13",
    },
  });

  await withE2EDb(async (db) => {
    await db.delete(packingItems).where(eq(packingItems.tripId, trip.id));
  });
});

Given("I have a trip with a pre-seeded packing item for pull", async ({ scenario }) => {
  const trip = await scenario.ensureCurrentTrip("threeDayTrip", {
    trip: {
      name: "E2E Pull Trip",
      startDate: "2026-07-11",
      endDate: "2026-07-13",
    },
  });

  await withE2EDb(async (db) => {
    await db.delete(packingItems).where(eq(packingItems.tripId, trip.id));
    await db.insert(packingItems).values({ tripId: trip.id, name: "Laptop", isLabel: false, done: false, position: 0 });
  });
});

Given("I have a packing template available for pull", async ({ scenario }) => {
  await scenario.materialize({
    template: {
      mother: "emptyTemplate",
      overrides: {
        template: { name: E2E_TEMPLATE_PULL.name },
        items: E2E_TEMPLATE_PULL_ITEMS,
      },
      setCurrent: false,
    },
  });
});

Given("I have two packing templates available for pull with a shared item", async ({ scenario }) => {
  await scenario.materialize({
    template: {
      mother: "emptyTemplate",
      overrides: {
        template: { name: E2E_TEMPLATE_PULL.name },
        items: E2E_TEMPLATE_PULL_ITEMS,
      },
      setCurrent: false,
    },
  });

  await scenario.materialize({
    template: {
      mother: "emptyTemplate",
      overrides: {
        template: { name: E2E_TEMPLATE_PULL_2.name },
        items: E2E_TEMPLATE_PULL_2_ITEMS,
      },
      setCurrent: false,
    },
  });
});

When("I open the packing tab for the pull test trip", async ({ page, scenario }) => {
  await scenario.gotoCurrentTrip(page);
  await page.getByRole("button", { name: "Packing" }).click();
  await expect(page.getByPlaceholder("New section…")).toBeVisible({ timeout: 10_000 });
});

When("I pull the template onto the trip", async ({ page }) => {
  const pullBtn = page.getByRole("button", { name: "Pull templates" });
  await pullBtn.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await expect(dialog.getByRole("checkbox").first()).toBeVisible({ timeout: 5_000 });
  await checkTemplate(dialog, E2E_TEMPLATE_PULL.name);
  await page.getByRole("button", { name: /Pull selected/ }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await expect(page.getByText(/item\(s\) added/)).toBeVisible({ timeout: 10_000 });
});

When("I pull both templates onto the trip", async ({ page }) => {
  const pullBtn = page.getByRole("button", { name: "Pull templates" });
  await pullBtn.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await expect(dialog.getByRole("checkbox").first()).toBeVisible({ timeout: 5_000 });
  await checkTemplate(dialog, E2E_TEMPLATE_PULL.name);
  await checkTemplate(dialog, E2E_TEMPLATE_PULL_2.name);
  await page.getByRole("button", { name: /Pull selected/ }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await expect(page.getByText(/item\(s\) added/)).toBeVisible({ timeout: 10_000 });
});

Then("I should not see a pull templates button", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Pull templates" })).toHaveCount(0);
});

Then("the packing list should contain {string} exactly once", async ({ page }, name: string) => {
  await expect(async () => {
    const items = page.locator("[data-packing-kind]").filter({ hasText: name });
    await expect(items).toHaveCount(1);
  }).toPass({ timeout: 10_000 });
});

Then("I should see a duplicate notice", async ({ page }) => {
  await expect(page.getByText(/duplicate\(s\) skipped/)).toBeVisible({ timeout: 10_000 });
});
