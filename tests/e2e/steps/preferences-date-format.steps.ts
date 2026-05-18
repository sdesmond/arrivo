import { expect } from "@playwright/test";
import { When, Then } from "../fixtures";
import { E2E_TRIP } from "../e2e-seed-data";

When("I select the {string} date format", async ({ page }, label: string) => {
  await page.getByRole("button", { name: label, exact: true }).click();
});

When("I navigate to the trips page", async ({ page }) => {
  await page.goto("/trips");
  await expect(page).toHaveURL(/\/trips/);
});

function toReadableDate(dateStr: string, format: "MM/DD/YYYY" | "DD/MM/YYYY"): string {
  const date = new Date(dateStr + "T00:00:00");
  const day = date.getDate();
  const month = date.toLocaleString("en-US", { month: "short" });
  const year = date.getFullYear();
  return format === "MM/DD/YYYY" ? `${month} ${day}, ${year}` : `${day} ${month} ${year}`;
}

Then("the trip card dates should be in DD/MM/YYYY format", async ({ page }) => {
  const startFormatted = toReadableDate(E2E_TRIP.startDate, "DD/MM/YYYY");
  const endFormatted = toReadableDate(E2E_TRIP.endDate, "DD/MM/YYYY");
  await expect(page.getByText(new RegExp(startFormatted))).toBeVisible();
  await expect(page.getByText(new RegExp(endFormatted))).toBeVisible();
});

Then("the trip card dates should be in MM/DD/YYYY format", async ({ page }) => {
  const startFormatted = toReadableDate(E2E_TRIP.startDate, "MM/DD/YYYY").replace(",", "\\,");
  const endFormatted = toReadableDate(E2E_TRIP.endDate, "MM/DD/YYYY").replace(",", "\\,");
  await expect(page.getByText(new RegExp(startFormatted))).toBeVisible();
  await expect(page.getByText(new RegExp(endFormatted))).toBeVisible();
});
