import { expect, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { checklistItems, itineraryChecklists, packingItems, tripPackingLists, days } from "../../../src/db/schema";
import { waitForApiResponse } from "../api-response";
import { withE2EDb } from "../e2e-db";
import { Given, When, Then } from "../fixtures";

async function reloadTrip(page: Page): Promise<void> {
  await page.goto(page.url());
  await page.waitForURL(/\/trips/);
}

Given("I have a seeded packing list named {string}", async ({ page, scenario }, name: string) => {
  const trip = scenario.currentTrip;
  if (!trip) throw new Error("No current trip in scenario");
  await withE2EDb(async (db) => {
    await db.insert(tripPackingLists).values({ tripId: trip.id, name, position: 0 }).onConflictDoNothing();
  });
  await reloadTrip(page);
});

Given("I have a seeded packing template named {string} with items", async ({ page, scenario }, name: string) => {
  await scenario.materialize({
    template: {
      overrides: {
        template: { name },
        items: [
          { text: "Sunscreen", isLabel: false, position: 0 },
          { text: "Towel", isLabel: false, position: 1 },
        ],
      },
      setCurrent: false,
    },
  });
  await reloadTrip(page);
});

// Seeded out of position order with a label among the items, so copied order and label exclusion are both observable.
const SOURCE_ENTRIES = [
  { text: "Towel", isLabel: false, position: 2 },
  { text: "Beach", isLabel: true, position: 0 },
  { text: "Sunscreen", isLabel: false, position: 1 },
  { text: "Hat", isLabel: false, position: 3 },
];
const SOURCE_CONTENTS = ["Sunscreen", "Towel", "Hat"];

Given(
  "I have a seeded packing template named {string} with labelled items",
  async ({ page, scenario }, name: string) => {
    await scenario.materialize({
      template: { overrides: { template: { name }, items: SOURCE_ENTRIES }, setCurrent: false },
    });
    await reloadTrip(page);
  }
);

Given("I have a seeded packing template named {string} with only a label", async ({ page, scenario }, name: string) => {
  await scenario.materialize({
    template: {
      overrides: { template: { name }, items: [{ text: "Section", isLabel: true, position: 0 }] },
      setCurrent: false,
    },
  });
  await reloadTrip(page);
});

Given("I have a seeded packing list named {string} with labelled items", async ({ page, scenario }, name: string) => {
  const trip = scenario.currentTrip;
  if (!trip) throw new Error("No current trip in scenario");
  await withE2EDb(async (db) => {
    const [list] = await db
      .insert(tripPackingLists)
      .values({ tripId: trip.id, name, position: 0 })
      .returning({ id: tripPackingLists.id });
    await db.insert(packingItems).values(
      SOURCE_ENTRIES.map((entry) => ({
        tripId: trip.id,
        listId: list.id,
        name: entry.text,
        isLabel: entry.isLabel,
        position: entry.position,
      }))
    );
  });
  await reloadTrip(page);
});

Then("I should see the packing lists empty state", async ({ page }) => {
  await expect(page.getByText("No packing lists yet")).toBeVisible({ timeout: 10_000 });
});

When("I create a new packing list named {string}", async ({ page }, name: string) => {
  await page.getByRole("button", { name: "New List" }).click();
  await page.getByLabel("Packing list name").fill(name);
  await page.getByRole("button", { name: "Create" }).click();
  // List name appears either in drill-down heading or library card
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 10_000 });
  // Return to library if currently in drill-down
  const allListsBtn = page.getByRole("button", { name: "All lists" });
  if (await allListsBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await allListsBtn.click();
  }
  await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });
});

Then("the packing list library should show {string}", async ({ page }, name: string) => {
  await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });
});

When("I open the packing list {string}", async ({ page }, name: string) => {
  const openButton = page.getByRole("button", { name: `Open "${name}"` });
  if (await openButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await openButton.click();
  } else {
    await page.getByText(name, { exact: true }).first().click();
  }
  await expect(page.getByRole("button", { name: "All lists" })).toBeVisible({ timeout: 10_000 });
});

When("I open day 1 in the itinerary", async ({ page }) => {
  await page.getByRole("button", { name: "Itinerary" }).click();
  const dayToggle = page
    .locator("button")
    .filter({ hasText: /\d+ stops/ })
    .first();
  await expect(dayToggle).toBeVisible({ timeout: 10_000 });
  const expanded = await dayToggle.getAttribute("aria-expanded");
  if (expanded === "false") await dayToggle.click();
  await expect(page.getByRole("button", { name: /Add a place to day/i })).toBeVisible({ timeout: 10_000 });
});

When("I click Add and select the packing list picker", async ({ page }) => {
  await page.getByRole("button", { name: /Add a place to day 1/i }).click();
  await page.getByTitle("Insert packing list").click();
  await expect(page.getByText("Insert packing list").first()).toBeVisible({ timeout: 10_000 });
});

async function selectPickerSource(page: Page, tripId: string, name: string): Promise<void> {
  // Arm the exact creation POST before the gesture and await it, so a later reload cannot outrun the commit.
  const created = waitForApiResponse(page, { method: "POST", path: `/api/v1/trips/${tripId}/checklists` });
  await page.getByText(name, { exact: true }).first().click();
  await created;
}

When("I select the template {string} from the picker", async ({ page, scenario }, name: string) => {
  await selectPickerSource(page, scenario.currentTrip!.id, name);
});

When("I select the packing list {string} from the picker", async ({ page, scenario }, name: string) => {
  await selectPickerSource(page, scenario.currentTrip!.id, name);
});

Then("a checklist titled {string} should appear in day 1", async ({ page }, title: string) => {
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 15_000 });
});

async function reopenChecklist(page: Page, title: string) {
  await page.reload();
  await page.getByRole("button", { name: "Itinerary" }).click();
  const dayToggle = page
    .locator("button")
    .filter({ hasText: /\d+ stops/ })
    .first();
  await expect(dayToggle).toBeVisible({ timeout: 10_000 });
  if ((await dayToggle.getAttribute("aria-expanded")) === "false") await dayToggle.click();
  const checklist = page.locator('[id^="checklist-"]').filter({ hasText: title });
  await expect(checklist).toBeVisible({ timeout: 10_000 });
  if (!(await checklist.getByPlaceholder("Add an item…").isVisible()))
    await checklist.getByRole("button").first().click();
  return checklist;
}

Then(
  "after reload the {string} checklist holds {string} unchecked in that order",
  async ({ page, scenario }, title: string, contents: string) => {
    const expected = contents.split(", ");
    expect(expected).toEqual(SOURCE_CONTENTS);
    const checklist = await reopenChecklist(page, title);
    await expect(checklist.locator("[data-checklist-item-id]")).toHaveText(expected);
    await expect(checklist.getByRole("button", { name: "Uncheck item" })).toHaveCount(0);
    const stored = await withE2EDb((db) =>
      db
        .select({ content: checklistItems.content, isChecked: checklistItems.isChecked })
        .from(checklistItems)
        .innerJoin(itineraryChecklists, eq(checklistItems.checklistId, itineraryChecklists.id))
        .innerJoin(days, eq(itineraryChecklists.dayId, days.id))
        .where(and(eq(days.tripId, scenario.currentTrip!.id), eq(itineraryChecklists.title, title)))
        .orderBy(checklistItems.createdAt)
    );
    expect(stored).toEqual(expected.map((content) => ({ content, isChecked: false })));
  }
);

Then("after reload the {string} checklist is titled and empty", async ({ page, scenario }, title: string) => {
  const checklist = await reopenChecklist(page, title);
  await expect(checklist.locator("[data-checklist-item-id]")).toHaveCount(0);
  const stored = await withE2EDb((db) =>
    db
      .select({ id: itineraryChecklists.id })
      .from(itineraryChecklists)
      .innerJoin(days, eq(itineraryChecklists.dayId, days.id))
      .where(and(eq(days.tripId, scenario.currentTrip!.id), eq(itineraryChecklists.title, title)))
  );
  expect(stored).toHaveLength(1);
  const items = await withE2EDb((db) =>
    db.select({ id: checklistItems.id }).from(checklistItems).where(eq(checklistItems.checklistId, stored[0].id))
  );
  expect(items).toHaveLength(0);
});
