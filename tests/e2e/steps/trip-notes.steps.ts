import { expect } from "@playwright/test";
import { Given, When, Then } from "../fixtures";

Given("I have a trip for trip notes", async ({ scenario }) => {
  await scenario.ensureCurrentTrip();
});

When("I open the Notes tab", async ({ page, scenario }) => {
  await scenario.gotoCurrentTrip(page);
  await page.getByRole("button", { name: "Notes" }).click();
});

When("I activate New Note", async ({ page }) => {
  await page.getByRole("button", { name: "New Note" }).click();
  await expect(page.getByLabel("Note title")).toBeVisible();
});

When("I enter {string} as the note title", async ({ page }, value: string) => {
  await page.getByLabel("Note title").fill(value);
});

When("I enter {string} as the note body", async ({ page }, value: string) => {
  await page.getByLabel("Note body").fill(value);
});

When("I close the note editor", async ({ page }) => {
  await page.getByRole("button", { name: "Notes" }).click();
});

Then("the Notes empty state is visible", async ({ page }) => {
  await expect(page.getByText("No notes yet")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "New Note" })).toBeVisible({ timeout: 10_000 });
});

Then("no note capture bar is visible", async ({ page }) => {
  await expect(page.getByLabel("Note title")).toHaveCount(0);
});

Then(
  "a note row titled {string} with preview {string} is at the top of the notes list",
  async ({ page }, title: string, preview: string) => {
    const firstRow = page.locator("ol li").first();
    await expect(firstRow).toContainText(title, { timeout: 10_000 });
    await expect(firstRow).toContainText(preview);
  }
);

Then("the notes list shows, in order, {string}, {string}", async ({ page }, first: string, second: string) => {
  const rows = page.locator("ol li");
  await expect(rows).toHaveCount(2, { timeout: 10_000 });
  await expect(rows.nth(0)).toContainText(first);
  await expect(rows.nth(1)).toContainText(second);
});
