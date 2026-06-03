import { expect } from "@playwright/test";
import { When, Then } from "../fixtures";

const COVER_UPLOAD_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0Q0AAAAASUVORK5CYII=",
  "base64"
);

When("I click the Remove image button", async ({ page }) => {
  await page.getByRole("dialog").getByRole("button", { name: "Remove image" }).click();
});

Then("the cover image is cleared after reloading the page", async ({ page }) => {
  await page.reload();
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Remove image" })).not.toBeVisible();
});

When("I upload a new cover image from the picker", async ({ page }) => {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Edit cover image" }).click();
  await expect(page.getByRole("tab", { name: "Upload" })).toBeVisible();
  await page.getByRole("tab", { name: "Upload" }).click();
  await page.locator("#cover-upload-input").setInputFiles({
    name: "e2e-cover.png",
    mimeType: "image/png",
    buffer: COVER_UPLOAD_PNG,
  });
});

Then("the new cover image is shown after reloading the page", async ({ page }) => {
  await page.reload();
  await page.getByRole("button", { name: "Edit" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Remove image" })).toBeVisible();
  await expect(dialog.locator('img[role="presentation"]')).toHaveAttribute("src", /\/uploads\//);
});
