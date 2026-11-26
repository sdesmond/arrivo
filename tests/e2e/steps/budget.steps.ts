import { expect, type Page } from "@playwright/test";
import { Given, When, Then } from "../fixtures";
import { waitForApiResponse } from "../api-response";
import { ExpenseCategory } from "../../../src/data/types";
import { expenses, reservations, trips } from "../../../src/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { withE2EDb } from "../e2e-db";
import { reloadPage } from "../page-reload";

const createdExpenseIds = new WeakMap<Page, string>();

function expensePath(page: Page): string {
  return `/api/v1/expenses/${createdExpenseIds.get(page)}`;
}

When("I open the Budget tab", async ({ page }) => {
  await page.getByRole("button", { name: "Budget", exact: true }).click();
});

When("I click the Add Misc Expense button", async ({ page }) => {
  await page.getByRole("button", { name: "Add Misc Expense" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

When("I enter {string} as the expense amount", async ({ page }, amount: string) => {
  await page.getByRole("textbox", { name: "Amount" }).fill(amount);
});

When("I choose {string} as the expense currency", async ({ page }, currency: string) => {
  await page.getByRole("button", { name: /Currency:/i }).click();
  await page.getByRole("textbox", { name: "Search currencies" }).fill(currency);
  await page.getByRole("option", { name: new RegExp(`${currency}$`, "i") }).click();
});

When("I choose {string} as the expense category", async ({ page }, category: string) => {
  await page.getByRole("button", { name: "Select category" }).click();
  await page.getByRole("option", { name: category, exact: true }).click();
});

When("I save the Misc Expense", async ({ page, scenario }) => {
  const created = waitForApiResponse(page, {
    method: "POST",
    path: `/api/v1/trips/${scenario.currentTrip!.id}/expenses`,
  });
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  const { id } = (await (await created).json()) as { id: string };
  createdExpenseIds.set(page, id);
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

When("I open the Misc Expense in the {string} category", async ({ page }, category: string) => {
  await page
    .getByRole("table", { name: "Expenses" })
    .getByRole("row", { name: new RegExp(category) })
    .click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Edit Misc Expense" })).toBeVisible();
});

When("I save the edited Misc Expense", async ({ page }) => {
  const updated = waitForApiResponse(page, { method: "PATCH", path: expensePath(page) });
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await updated;
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

When("I remove the Misc Expense", async ({ page }) => {
  const removed = waitForApiResponse(page, { method: "DELETE", path: expensePath(page) });
  await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
  await removed;
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

Then("the Budget tab shows no {string} category tile", async ({ page }, category: string) => {
  await expect(page.locator('[data-slot="category-tile-grid"]').getByText(category, { exact: true })).toHaveCount(0);
});

Then("the Budget tab shows {string} as Actual spent", async ({ page }, amount: string) => {
  await expect(page.getByText(amount, { exact: true }).first()).toBeVisible();
});

Then("the Budget summary totals {string} as Actual spent", async ({ page }, amount: string) => {
  const summary = page.getByText("Actual spent", { exact: true }).locator("..");
  await expect(summary.locator(":scope > div:first-of-type > p")).toHaveText(amount);
});

Then("the Budget tab shows {string} as Budget", async ({ page }, amount: string) => {
  const escapedAmount = amount.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await expect(
    page
      .locator("p")
      .filter({ hasText: new RegExp(`^Budget\\s+${escapedAmount}$`) })
      .first()
  ).toBeVisible();
});

Then("the Budget tab shows a {string} category tile", async ({ page }, category: string) => {
  await expect(page.locator('[data-slot="category-tile-grid"]').getByText(category, { exact: true })).toBeVisible();
});

Given("a trip with stale USD and EUR expenses", async ({ page, scenario }) => {
  await scenario.materialize({
    trip: {
      mother: "threeDayTrip",
      overrides: {
        trip: { budgetCurrency: "USD", budgetTotal: 500 },
        expenses: [
          { category: ExpenseCategory.Food, amount: 100, currency: "USD", date: "2025-01-01" },
          { category: ExpenseCategory.Misc, amount: 35, currency: "EUR", date: "2025-01-01" },
        ],
      },
    },
  });
  await withE2EDb((database) =>
    database
      .update(expenses)
      .set({ updatedAt: new Date("2020-01-01") })
      .where(eq(expenses.tripId, scenario.currentTrip!.id))
  );
  await scenario.gotoCurrentTrip(page);
});

Given("the reservation trip has a USD budget", async ({ page, scenario }) => {
  await withE2EDb((database) =>
    database
      .update(trips)
      .set({ budgetCurrency: "USD", budgetTotal: "500" })
      .where(eq(trips.id, scenario.currentTrip!.id))
  );
  await reloadPage(page);
  await page.getByRole("button", { name: "Reservations", exact: true }).click();
});

When("the linked USD reservation cost needs recalculation", async ({ scenario }) => {
  const aged = await withE2EDb((database) =>
    database
      .update(expenses)
      .set({ date: "2025-01-01", updatedAt: new Date("2020-01-01") })
      .where(
        and(
          eq(expenses.tripId, scenario.currentTrip!.id),
          eq(expenses.currency, "USD"),
          isNotNull(expenses.reservationId)
        )
      )
      .returning({ id: expenses.id })
  );
  expect(aged).toHaveLength(1);
});

When("I change its budget currency to EUR without conversion", async ({ page, scenario }) => {
  await page.getByRole("button", { name: "Budget", exact: true }).click();
  await page.getByRole("button", { name: "Edit budget" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /Currency:/i }).click();
  await page.getByRole("textbox", { name: "Search currencies" }).fill("EUR");
  await page.getByRole("option", { name: /EUR$/i }).click();
  await dialog.getByRole("button", { name: "Save changes" }).click();
  const saved = waitForApiResponse(page, { method: "PATCH", path: `/api/v1/trips/${scenario.currentTrip!.id}` });
  await page.getByRole("button", { name: "Leave As Is" }).click();
  await saved;
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

When("I recalculate budget conversions", async ({ page, scenario }) => {
  const response = waitForApiResponse(page, {
    method: "POST",
    path: `/api/v1/trips/${scenario.currentTrip!.id}/expenses/recalculate`,
  });
  await page.getByRole("button", { name: "Recalculate Conversions" }).click();
  await response;
});
Then("the recalculated budget conversions are persisted", async ({ scenario }) => {
  const rows = await withE2EDb((database) =>
    database.select().from(expenses).where(eq(expenses.tripId, scenario.currentTrip!.id))
  );
  const foreign = rows.find((row) => row.currency === "USD")!;
  const native = rows.find((row) => row.currency === "EUR")!;
  expect([
    Number(foreign.convertedAmountTrip),
    Number(foreign.conversionRateTrip),
    foreign.convertedCurrencyTrip,
  ]).toEqual([92, 0.92, "EUR"]);
  expect([Number(native.convertedAmountTrip), Number(native.conversionRateTrip), native.convertedCurrencyTrip]).toEqual(
    [35, 1, "EUR"]
  );
});

function expectMiscExpense(row: typeof expenses.$inferSelect, id: string | undefined) {
  expect(row).toMatchObject({
    id,
    category: ExpenseCategory.Misc,
    currency: "EUR",
    reservationId: null,
    eventId: null,
  });
  expect([
    Number(row.amount),
    Number(row.convertedAmountTrip),
    Number(row.conversionRateTrip),
    row.convertedCurrencyTrip,
  ]).toEqual([35, 35, 1, "EUR"]);
}

Then("the recalculated reservation and Misc expenses are persisted", async ({ page, scenario }) => {
  const tripId = scenario.currentTrip!.id;
  const { lodgings, rows } = await withE2EDb(async (database) => ({
    lodgings: await database.select().from(reservations).where(eq(reservations.tripId, tripId)),
    rows: await database.select().from(expenses).where(eq(expenses.tripId, tripId)),
  }));
  expect(lodgings).toHaveLength(1);
  expect(lodgings[0]).toMatchObject({ type: "lodging", provider: "Revised Hotel Name" });
  expect(rows).toHaveLength(2);
  const linked = rows.find((row) => row.reservationId === lodgings[0].id)!;
  expect(linked).toMatchObject({ category: ExpenseCategory.Food, currency: "USD", eventId: null });
  expect([
    Number(linked.amount),
    Number(linked.convertedAmountTrip),
    Number(linked.conversionRateTrip),
    linked.convertedCurrencyTrip,
  ]).toEqual([100, 92, 0.92, "EUR"]);
  const miscId = createdExpenseIds.get(page);
  expectMiscExpense(
    rows.find((row) => row.id === miscId)!,
    miscId
  );
});

Then("only the original Misc expense survives", async ({ page, scenario }) => {
  const rows = await withE2EDb((database) =>
    database.select().from(expenses).where(eq(expenses.tripId, scenario.currentTrip!.id))
  );
  expect(rows).toHaveLength(1);
  expectMiscExpense(rows[0], createdExpenseIds.get(page));
  const table = page.getByRole("table", { name: "Expenses" });
  await expect(table.getByRole("row", { name: /Misc.*€35\.00/ })).toBeVisible();
});

Then("the stale conversion indication is cleared", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Recalculate Conversions" })).toHaveCount(0);
});
