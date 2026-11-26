import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { trips } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { apiClient } from "../anonymous-api";
import { When, Then } from "../fixtures";
import { headers, state } from "../api-support";

When("I PATCH trip metadata to {string}", async ({ page, scenario }, name: string) => {
  state(page).response = await (
    await apiClient(page)
  ).patch(`/api/v1/trips/${scenario.currentTrip!.id}`, {
    headers: headers(page),
    data: { name, budgetTotal: 0 },
  });
});
Then(
  "the trip metadata API returns {int} and stores {string}",
  async ({ page, scenario }, status: number, stored: string) => {
    expect(state(page).response?.status()).toBe(status);
    const [trip] = await withE2EDb((database) =>
      database.select().from(trips).where(eq(trips.id, scenario.currentTrip!.id))
    );
    expect(trip.name).toBe(stored === "original" ? scenario.currentTrip!.name : stored);
    if (status === 200) expect(Number(trip.budgetTotal)).toBe(0);
    expect(trip.startDate).toBe(scenario.currentTrip!.startDate ?? null);
    expect(trip.endDate).toBe(scenario.currentTrip!.endDate ?? null);
  }
);
When("I commit keyed trip metadata", async ({ page, scenario }) => {
  const response = await (
    await apiClient(page)
  ).patch(`/api/v1/trips/${scenario.currentTrip!.id}`, {
    headers: { ...headers(page), "Idempotency-Key": state(page).key },
    data: { name: "Keyed name" },
  });
  expect(response.status()).toBe(200);
});
When("I replay keyed trip metadata", async ({ page, scenario }) => {
  state(page).response = await (
    await apiClient(page)
  ).patch(`/api/v1/trips/${scenario.currentTrip!.id}`, {
    headers: { ...headers(page), "Idempotency-Key": state(page).key },
    data: { name: "Keyed name" },
  });
});
