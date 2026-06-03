import { expect } from "@playwright/test";
import { documents } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { E2E_DOCUMENT } from "../e2e-seed-data";
import { Given, When, Then } from "../fixtures";

Given("I am on the Documents tab", async ({ page }) => {
  await page.getByRole("button", { name: "Documents" }).click();
  await expect(page.locator("#doc-upload")).toBeAttached({ timeout: 10_000 });
});

Given("the Documents tab shows the empty state", async ({ page }) => {
  await expect(page.getByText("No documents yet")).toBeVisible({ timeout: 5_000 });
});

Given("the Documents tab has one seeded document", async ({ page, scenario }) => {
  const currentTrip = scenario.currentTrip;
  if (!currentTrip) {
    throw new Error("Missing current scenario trip.");
  }

  await withE2EDb(async (db) => {
    await db.insert(documents).values({ tripId: currentTrip.id, ...E2E_DOCUMENT });
  });

  await page.reload();
  await page.getByRole("button", { name: "Documents" }).click();
  await expect(page.getByText(E2E_DOCUMENT.name)).toBeVisible();
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

When("I delete the document {string}", async ({ page }, docName: string) => {
  await page.getByRole("button", { name: `Delete ${docName}` }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
});

Then("the document {string} is no longer visible", async ({ page }, docName: string) => {
  await expect(page.getByRole("button", { name: `Delete ${docName}` })).not.toBeVisible({
    timeout: 10_000,
  });
});

Then("the empty state message is shown", async ({ page }) => {
  await expect(
    page.getByText("Add your first trip document — boarding passes, insurance, visas, and more.")
  ).toBeVisible({ timeout: 5_000 });
});

When("I type {string} in the search field", async ({ page }, query: string) => {
  await page.getByRole("searchbox").fill(query);
});

When("I clear the search field", async ({ page }) => {
  await page.getByRole("searchbox").fill("");
});

Then("the document {string} is visible in the list", async ({ page }, docName: string) => {
  await expect(page.getByText(docName)).toBeVisible({ timeout: 5_000 });
});

Then("the document {string} is not visible in the list", async ({ page }, docName: string) => {
  await expect(page.getByText(docName)).not.toBeVisible({ timeout: 5_000 });
});

Given("the document {string} is in the Documents tab", async ({ page }, docName: string) => {
  await expect(page.getByText(docName)).toBeVisible({ timeout: 5_000 });
});

When("I rename the document {string} to {string}", async ({ page }, oldName: string, newName: string) => {
  await page.getByText(oldName).click();
  const input = page.getByRole("textbox");
  await input.fill(newName);
  await input.press("Enter");
});

When("I click the View button for {string}", async ({ page }, docName: string) => {
  await page.getByRole("button", { name: `View ${docName}` }).click();
});

Then("the document viewer is open with title {string}", async ({ page }, docName: string) => {
  await expect(page.getByRole("button", { name: "Close viewer" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("dialog").getByText(docName)).toBeVisible({ timeout: 10_000 });
});

When("I close the document viewer", async ({ page }) => {
  await page.getByRole("button", { name: "Close viewer" }).click();
});

Then("the document viewer is closed", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Close viewer" })).toHaveCount(0, {
    timeout: 5_000,
  });
});

Then("the View button for {string} has focus", async ({ page }, docName: string) => {
  await expect(page.getByRole("button", { name: `View ${docName}` })).toBeFocused({ timeout: 5_000 });
});

Then("the share button for {string} is visible in the viewer", async ({ page }, docName: string) => {
  await expect(page.getByRole("button", { name: `Share ${docName}` })).toBeVisible({ timeout: 5_000 });
});

When("I click the share button for {string}", async ({ page }, docName: string) => {
  await page.getByRole("button", { name: `Share ${docName}` }).click();
});
