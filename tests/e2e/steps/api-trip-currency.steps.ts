import { expect, type Page } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";
import { expenses, trips } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { ExpenseCategory } from "../../../src/data/types";
import { apiClient } from "../anonymous-api";
import { Given, When, Then } from "../fixtures";
import { headers, state } from "../api-support";

Given("a USD expense exists for trip currency conversion", async ({ scenario }) => {
  await withE2EDb(async (database) => {
    await database.update(trips).set({ budgetCurrency: "USD" }).where(eq(trips.id, scenario.currentTrip!.id));
    await database.insert(expenses).values({
      tripId: scenario.currentTrip!.id,
      category: "Food",
      amount: "100",
      currency: "USD",
      date: "2025-01-01",
      convertedAmountTrip: "100",
      conversionRateTrip: "1",
      convertedCurrencyTrip: "USD",
    });
  });
});
When("I PATCH trip currency to EUR with conversion", async ({ page, scenario }) => {
  state(page).response = await (
    await apiClient(page)
  ).patch(`/api/v1/trips/${scenario.currentTrip!.id}`, {
    headers: headers(page),
    data: { budgetCurrency: "EUR", convertCurrency: true },
  });
});
When("I PATCH trip currency to EUR with conversion using the failing key", async ({ page, scenario }) => {
  state(page).response = await (
    await apiClient(page)
  ).patch(`/api/v1/trips/${scenario.currentTrip!.id}`, {
    headers: { ...headers(page), "Idempotency-Key": state(page).key },
    data: { budgetCurrency: "EUR", convertCurrency: true },
  });
});
Then("trip currency conversion is committed", async ({ page, scenario }) => {
  expect(state(page).response?.status()).toBe(200);
  const [trip] = await withE2EDb((database) =>
    database.select().from(trips).where(eq(trips.id, scenario.currentTrip!.id))
  );
  const [expense] = await withE2EDb((database) =>
    database.select().from(expenses).where(eq(expenses.tripId, scenario.currentTrip!.id))
  );
  expect(trip.budgetCurrency).toBe("EUR");
  expect(expense.convertedCurrencyTrip).toBe("EUR");
  expect(Number(expense.convertedAmountTrip)).toBe(92);
});
Then("trip currency conversion is rolled back", async ({ page, scenario }) => {
  expect(state(page).response?.status()).toBe(500);
  const [trip] = await withE2EDb((database) =>
    database.select().from(trips).where(eq(trips.id, scenario.currentTrip!.id))
  );
  const [expense] = await withE2EDb((database) =>
    database.select().from(expenses).where(eq(expenses.tripId, scenario.currentTrip!.id))
  );
  expect(trip.budgetCurrency).toBe("USD");
  expect(expense.convertedCurrencyTrip).toBe("USD");
  expect(Number(expense.convertedAmountTrip)).toBe(100);
});
Given("the trip currency is set to EUR for recalculation", async ({ scenario }) => {
  await withE2EDb((database) =>
    database.update(trips).set({ budgetCurrency: "EUR" }).where(eq(trips.id, scenario.currentTrip!.id))
  );
});
When("I POST expense recalculation with the failing key", async ({ page, scenario }) => {
  state(page).response = await (
    await apiClient(page)
  ).post(`/api/v1/trips/${scenario.currentTrip!.id}/expenses/recalculate`, {
    headers: { ...headers(page), "Idempotency-Key": state(page).key },
    data: {},
  });
});
When("I POST expense recalculation with a key", async ({ page, scenario }) => {
  state(page).response = await (
    await apiClient(page)
  ).post(`/api/v1/trips/${scenario.currentTrip!.id}/expenses/recalculate`, {
    headers: { ...headers(page), "Idempotency-Key": state(page).key },
    data: {},
  });
});
Then("expense recalculation is rolled back", async ({ page, scenario }) => {
  expect(state(page).response?.status()).toBe(500);
  const [expense] = await withE2EDb((database) =>
    database.select().from(expenses).where(eq(expenses.tripId, scenario.currentTrip!.id))
  );
  expect([
    expense.convertedCurrencyTrip,
    Number(expense.convertedAmountTrip),
    Number(expense.conversionRateTrip),
  ]).toEqual(["USD", 100, 1]);
});
Then("expense recalculation replay is denied", async ({ page, scenario }) => {
  expect(state(page).response?.status()).toBe(403);
  const [expense] = await withE2EDb((database) =>
    database.select().from(expenses).where(eq(expenses.tripId, scenario.currentTrip!.id))
  );
  expect([expense.convertedCurrencyTrip, Number(expense.convertedAmountTrip)]).toEqual(["EUR", 92]);
});
const conversionParityTrips = new WeakMap<Page, string[]>();
When("I recalculate and PATCH equivalent mixed-currency trips", async ({ page, scenario }) => {
  const seededExpenses = [
    { category: ExpenseCategory.Food, amount: 100, currency: "USD", date: "2025-01-01" },
    { category: ExpenseCategory.Misc, amount: 35, currency: "EUR", date: "2025-01-01" },
  ];
  const first = await scenario.materialize({
    trip: {
      mother: "threeDayTrip",
      setCurrent: false,
      overrides: { trip: { budgetCurrency: "EUR" }, expenses: seededExpenses },
    },
  });
  const second = await scenario.materialize({
    trip: {
      mother: "threeDayTrip",
      setCurrent: false,
      overrides: { trip: { budgetCurrency: "USD" }, expenses: seededExpenses },
    },
  });
  const firstId = first.trip!.id;
  const secondId = second.trip!.id;
  const client = await apiClient(page);
  const post = await client.post(`/api/v1/trips/${firstId}/expenses/recalculate`, { headers: headers(page), data: {} });
  const patch = await client.patch(`/api/v1/trips/${secondId}`, {
    headers: headers(page),
    data: { budgetCurrency: "EUR", convertCurrency: true },
  });
  expect(post.status()).toBe(200);
  expect(patch.status()).toBe(200);
  conversionParityTrips.set(page, [firstId, secondId]);
});
Then("both trips have identical trip conversion fields", async ({ page }) => {
  const [firstId, secondId] = conversionParityTrips.get(page)!;
  const rows = await withE2EDb((database) =>
    database
      .select()
      .from(expenses)
      .where(inArray(expenses.tripId, [firstId, secondId]))
  );
  const fields = (tripId: string) =>
    rows
      .filter((row) => row.tripId === tripId)
      .sort((left, right) => left.currency.localeCompare(right.currency))
      .map((row) => ({
        currency: row.currency,
        amount: row.convertedAmountTrip,
        rate: row.conversionRateTrip,
        target: row.convertedCurrencyTrip,
      }));
  expect(fields(firstId)).toEqual(fields(secondId));
  expect(fields(firstId)).toEqual([
    expect.objectContaining({ currency: "EUR", target: "EUR", amount: expect.any(String), rate: expect.any(String) }),
    expect.objectContaining({ currency: "USD", target: "EUR", amount: expect.any(String), rate: expect.any(String) }),
  ]);
});
