import { expect, type Page } from "@playwright/test";
import { Given, Then, When } from "../fixtures";

const STUB_PHOTOGRAPHER_NAME = "Stub Photographer 1";
const STUB_PHOTOGRAPHER_URL = "https://unsplash.com/@stub-photographer-1";
async function applyFirstStubCoverPhoto(page: Page): Promise<void> {
  await page.getByRole("menuitem", { name: "Edit Cover" }).click();
  const pickerDialog = page.getByRole("dialog");
  const stubPhotoButton = pickerDialog.locator('button[title="Stub Photographer 1"]');
  const searchInput = pickerDialog.getByRole("combobox", { name: "Search location for photos" });
  await expect(pickerDialog).toBeVisible();
  await pickerDialog.getByRole("tab", { name: "Search" }).click();
  await searchInput.fill("Paris");
  await expect(page.getByText("Paris, France")).toBeVisible({ timeout: 10_000 });
  await page.getByText("Paris, France").click();
  await expect(stubPhotoButton).toBeVisible({ timeout: 15_000 });
  await stubPhotoButton.click();
  await expect(pickerDialog).not.toBeVisible();
}

Given("I have an existing trip with a photo destination", async ({ page, scenario }) => {
  await scenario.signIn(page);
  await scenario.ensureCurrentTrip("threeDayTrip", {
    trip: {
      destinationName: "Paris, France",
      destinationCountry: "France",
      destinationCountryCode: "FR",
    },
  });
  await scenario.gotoCurrentTrip(page);
});

Given("I already selected the first stub cover photo", async ({ page }) => {
  await page.getByTitle("Cover options").click();
  await applyFirstStubCoverPhoto(page);
});

When("I open the cover options menu", async ({ page }) => {
  await page.getByTitle("Cover options").click();
  await expect(page.getByRole("menuitem", { name: "Edit Cover" })).toBeVisible();
});

When("I choose the first stub cover photo", async ({ page }) => {
  await applyFirstStubCoverPhoto(page);
});

When("I open the cover attribution dialog", async ({ page }) => {
  await page.getByRole("menuitem", { name: "Info" }).click();
});

Then("the cover attribution dialog shows the stub photographer", async ({ page }) => {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: STUB_PHOTOGRAPHER_NAME })).toBeVisible();
  await expect(dialog.getByRole("link", { name: "View on Unsplash" })).toHaveAttribute("href", STUB_PHOTOGRAPHER_URL);
});

When("I remove the current cover photo", async ({ page }) => {
  await page.getByRole("menuitem", { name: "Remove Cover" }).click();
});

Then("the cover options menu hides remove and info actions", async ({ page }) => {
  await expect(page.getByRole("menuitem", { name: "Edit Cover" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Remove Cover" })).not.toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Info" })).not.toBeVisible();
});

When("I open the cover picker from the cover options menu", async ({ page }) => {
  await page.getByRole("menuitem", { name: "Edit Cover" }).click();
});

Then("the cover picker defaults to the Custom tab", async ({ page }) => {
  await expect(page.getByRole("tab", { name: "Custom", selected: true })).toBeVisible();
});
