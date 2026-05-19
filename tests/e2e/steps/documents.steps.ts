import { expect } from "@playwright/test";
import { Given, When, Then } from "../fixtures";

Given("I am on the Documents tab", async ({ page }) => {
  await page.getByRole("button", { name: "Documents" }).click();
  await expect(page.getByText("Add")).toBeVisible();
});

When("I upload a file named {string} with MIME type {string}", async ({ page }, filename: string, mimeType: string) => {
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: filename,
    mimeType,
    buffer: Buffer.from("file content"),
  });
});

Then("the document {string} appears in the Documents list", async ({ page }, filename: string) => {
  await expect(page.getByText(filename)).toBeVisible({ timeout: 10_000 });
});
