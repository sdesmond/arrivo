import { expect, type Page } from "@playwright/test";
import { Given, Then, When } from "../fixtures";

const STUB_PHOTOGRAPHER_NAME = "Stub Photographer 1";
const STUB_PHOTOGRAPHER_URL = "https://unsplash.com/@stub-photographer-1";
const COVER_UPLOAD_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0Q0AAAAASUVORK5CYII=",
  "base64"
);

async function applyFirstStubCoverPhoto(page: Page): Promise<void> {
  const editCoverItem = page.getByRole("menuitem", { name: "Edit Cover" });
  let menuOpen = false;
  try {
    await expect(editCoverItem).toBeVisible({ timeout: 2000 });
    menuOpen = true;
  } catch {
    /* menu likely closed — will open below */
  }
  if (!menuOpen) {
    await page.getByTitle("Cover options").click();
    await expect(editCoverItem).toBeVisible({ timeout: 5000 });
  }
  await editCoverItem.click();
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
  const editCoverItem = page.getByRole("menuitem", { name: "Edit Cover" });
  let visible = false;
  try {
    await expect(editCoverItem).toBeVisible({ timeout: 2000 });
    visible = true;
  } catch {
    /* menu likely closed — will open below */
  }
  if (!visible) {
    await page.getByTitle("Cover options").click();
    await expect(editCoverItem).toBeVisible({ timeout: 5000 });
  }
  await editCoverItem.click();
});

When("I reload the trip detail page", async ({ page }) => {
  await page.reload();
});

When("I upload a new cover image from the picker", async ({ page }) => {
  const pickerDialog = page.getByRole("dialog");
  await expect(pickerDialog).toBeVisible();
  await pickerDialog.getByRole("tab", { name: "Upload" }).click();
  await pickerDialog.locator("#cover-upload-input").setInputFiles({
    name: "e2e-cover.png",
    mimeType: "image/png",
    buffer: COVER_UPLOAD_PNG,
  });
  await expect(pickerDialog).not.toBeVisible({ timeout: 10000 });
});

When("I try to upload an invalid cover file from the picker", async ({ page }) => {
  const pickerDialog = page.getByRole("dialog");
  await expect(pickerDialog).toBeVisible();
  await pickerDialog.getByRole("tab", { name: "Upload" }).click();
  await pickerDialog.locator("#cover-upload-input").setInputFiles({
    name: "e2e-cover.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg></svg>"),
  });
});

Then("the cover picker defaults to the Custom tab", async ({ page }) => {
  await expect(page.getByRole("tab", { name: "Custom", selected: true })).toBeVisible();
});

Then("the uploaded cover image persists after reloading the page", async ({ page }) => {
  await page.reload();
  await expect(page.locator('img[role="presentation"]').first()).toHaveAttribute("src", /\/uploads\//);
  await page.getByTitle("Cover options").click();
  await expect(page.getByRole("menuitem", { name: "Remove Cover" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Info" })).not.toBeVisible();
});

Then("I see the cover upload error {string}", async ({ page }, message: string) => {
  await expect(page.getByText(message)).toBeVisible({ timeout: 10_000 });
});

Then("the cover picker remains open", async ({ page }) => {
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
});

Then("I see no cover image editing controls", async ({ page }) => {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Cover image")).not.toBeVisible();
  await expect(dialog.getByRole("button", { name: "Edit cover image" })).not.toBeVisible();
  await expect(dialog.getByRole("button", { name: "Remove image" })).not.toBeVisible();
});
