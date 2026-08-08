import { expect, type Page } from "@playwright/test";
import { TripDetailTab } from "../../../src/data/types";
import { Given, Then, When } from "../fixtures";

const tabParamsByLabel = {
  Itinerary: TripDetailTab.Itinerary,
  Map: TripDetailTab.Map,
  Documents: TripDetailTab.Documents,
  Packing: TripDetailTab.Packing,
  Notes: TripDetailTab.Notes,
} as const;

type TripTabLabel = keyof typeof tabParamsByLabel;

function getTabParam(label: string): (typeof tabParamsByLabel)[TripTabLabel] {
  const tabParam = tabParamsByLabel[label as TripTabLabel];

  if (!tabParam) {
    throw new Error(`Unsupported trip tab label "${label}".`);
  }

  return tabParam;
}

async function expectTabContent(page: Page, label: string): Promise<void> {
  switch (label) {
    case "Itinerary":
      await expect(page.getByRole("button", { name: "Add Day" })).toBeVisible({ timeout: 10_000 });
      return;
    case "Documents":
      await expect(page.locator("#doc-upload")).toBeAttached({ timeout: 10_000 });
      return;
    case "Packing":
      await expect(page.getByRole("button", { name: "New List" })).toBeVisible({ timeout: 10_000 });
      return;
    case "Map":
      await expect(page.getByText("No located stops yet")).toBeVisible({ timeout: 10_000 });
      return;
    case "Notes":
      await expect(page.getByRole("button", { name: "New Note" })).toBeVisible({ timeout: 10_000 });
      return;
    default:
      throw new Error(`Unsupported trip tab label "${label}".`);
  }
}

Given("I am on the trip detail page for tab navigation", async ({ page, scenario }) => {
  await scenario.signIn(page);
  await scenario.ensureCurrentTrip();
  await scenario.gotoCurrentTrip(page);
});

When("I reopen the trip with the {string} tab deep link", async ({ page, scenario }, label: string) => {
  const trip = await scenario.ensureCurrentTrip();
  await page.goto(`/trips/${trip.id}?tab=${getTabParam(label)}`);
  await expect(page).toHaveURL(new RegExp(`/trips/${trip.id}\\?tab=`), { timeout: 10_000 });
});

When("I open the {string} trip tab", async ({ page }, label: string) => {
  await page.getByRole("button", { name: label }).click();
  await expectTabContent(page, label);
});

When("I reload the browser page", async ({ page }) => {
  await page.reload();
  await page.waitForLoadState("networkidle");
});

When("I go back in the browser", async ({ page }) => {
  await page.goBack();
});

When("I go forward in the browser", async ({ page }) => {
  await page.goForward();
});

Then("the {string} tab content is visible", async ({ page }, label: string) => {
  await expectTabContent(page, label);
});

Then("the trip URL has the {string} tab deep link", async ({ page }, label: string) => {
  const currentUrl = new URL(page.url());
  expect(currentUrl.searchParams.get("tab")).toBe(getTabParam(label));
});

Then("the trip URL has no tab deep link", async ({ page }) => {
  const currentUrl = new URL(page.url());
  expect(currentUrl.searchParams.has("tab")).toBe(false);
});
