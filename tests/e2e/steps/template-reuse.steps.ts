import { expect } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import {
  checklistItems,
  days,
  itineraryChecklists,
  packingItems,
  packingTemplateItems,
  packingTemplates,
  tripPackingLists,
} from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { E2E_TRIP_ALT_START_DATE, E2E_TRIP_ALT_THIRD_DATE } from "../e2e-seed-data";
import { Given, Then, When } from "../fixtures";
import { reloadPage } from "../page-reload";

async function seedList(tripId: string, name: string, position: number, items: { name: string; done: boolean }[]) {
  await withE2EDb(async (db) => {
    const [list] = await db.insert(tripPackingLists).values({ tripId, name, position }).returning({
      id: tripPackingLists.id,
    });
    await db.insert(packingItems).values(
      items.map((item, itemPosition) => ({
        tripId,
        listId: list!.id,
        name: item.name,
        isLabel: false,
        done: item.done,
        position: itemPosition,
      }))
    );
  });
}

Given(
  "I have a trip with the lists {string} and {string} for template reuse",
  async ({ scenario }, first: string, second: string) => {
    const trip = await scenario.ensureCurrentTrip("threeDayTrip", {
      trip: { name: "E2E Template Reuse Trip", startDate: E2E_TRIP_ALT_START_DATE, endDate: E2E_TRIP_ALT_THIRD_DATE },
    });
    await withE2EDb(async (db) => {
      await db.delete(packingItems).where(eq(packingItems.tripId, trip.id));
      await db.delete(tripPackingLists).where(eq(tripPackingLists.tripId, trip.id));
    });
    // The first list holds a checked item so the template's unchecked copy is observable.
    await seedList(trip.id, first, 0, [
      { name: "Passport", done: false },
      { name: "Toothbrush", done: true },
    ]);
    await seedList(trip.id, second, 1, [
      { name: "Sunscreen", done: false },
      { name: "Camera", done: false },
      { name: "Charger", done: false },
    ]);
  }
);

Then("the template editor shows no checked items", async ({ page }) => {
  await expect(page.locator("[data-packing-kind]").first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(0);
});

Then(
  "the template {string} stores the items {string} and the label {string}",
  async ({}, name: string, items: string, label: string) => {
    await expect
      .poll(async () =>
        withE2EDb(async (db) => {
          const templates = await db
            .select({ id: packingTemplates.id })
            .from(packingTemplates)
            .where(eq(packingTemplates.name, name));
          if (templates.length !== 1) return `templates:${templates.length}`;
          const rows = await db
            .select({ text: packingTemplateItems.text, isLabel: packingTemplateItems.isLabel })
            .from(packingTemplateItems)
            .where(eq(packingTemplateItems.templateId, templates[0]!.id))
            .orderBy(packingTemplateItems.position);
          return {
            items: rows.filter((row) => !row.isLabel).map((row) => row.text),
            labels: rows.filter((row) => row.isLabel).map((row) => row.text),
          };
        })
      )
      .toEqual({ items: items.split(", "), labels: [label] });
  }
);

When(
  "I pull the template {string} onto the packing list {string}",
  async ({ page, scenario }, name: string, list: string) => {
    await scenario.gotoCurrentTrip(page);
    await page.getByRole("button", { name: "Packing" }).click();
    await page.getByText(list, { exact: true }).first().click();
    await expect(page.getByRole("button", { name: "List options" })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "List options" }).click();
    await page.getByText("Pull templates").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    const checkbox = dialog.getByRole("checkbox", { name, exact: true }).first();
    await expect(checkbox).toBeVisible({ timeout: 5_000 });
    await checkbox.check();
    const response = page.waitForResponse(
      (candidate) =>
        candidate.request().method() === "POST" && new URL(candidate.url()).pathname.endsWith("/packing/pull-templates")
    );
    await page.getByRole("button", { name: /Pull selected/ }).click();
    expect((await response).ok()).toBe(true);
    await expect(dialog).toBeHidden({ timeout: 10_000 });
  }
);

Then("the template {string} no longer exists", async ({}, name: string) => {
  await expect
    .poll(async () =>
      withE2EDb(async (db) => {
        const templates = await db
          .select({ id: packingTemplates.id })
          .from(packingTemplates)
          .where(eq(packingTemplates.name, name));
        return templates.length;
      })
    )
    .toBe(0);
});

When("I reopen and reload the reuse trip", async ({ page, scenario }) => {
  await scenario.gotoCurrentTrip(page);
  await reloadPage(page);
});

Then(
  "after reload the packing list {string} holds {string} in that order",
  async ({ page, scenario }, listName: string, contents: string) => {
    const expected = contents.split(", ");
    await page.getByRole("button", { name: "Packing" }).click();
    await page.getByText(listName, { exact: true }).first().click();
    await expect(page.getByRole("button", { name: "List options" })).toBeVisible({ timeout: 10_000 });
    for (const itemName of expected) {
      await expect(page.locator('[data-packing-kind="item"]').filter({ hasText: itemName }).first()).toBeVisible({
        timeout: 10_000,
      });
    }
    const stored = await withE2EDb((db) =>
      db
        .select({ name: packingItems.name, isLabel: packingItems.isLabel })
        .from(packingItems)
        .innerJoin(tripPackingLists, eq(packingItems.listId, tripPackingLists.id))
        .where(and(eq(tripPackingLists.tripId, scenario.currentTrip!.id), eq(tripPackingLists.name, listName)))
        .orderBy(packingItems.position)
    );
    expect(stored.filter((item) => !item.isLabel).map((item) => item.name)).toEqual(expected);
  }
);

Then(
  "after reload the {string} checklist keeps {string} unchecked in that order",
  async ({ page, scenario }, title: string, contents: string) => {
    const expected = contents.split(", ");
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
