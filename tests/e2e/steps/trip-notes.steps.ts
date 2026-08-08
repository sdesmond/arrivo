import { expect } from "@playwright/test";
import { Given, When, Then } from "../fixtures";

function decodeStepValue(value: string): string {
  return value.replace(/\\n/g, "\n");
}

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
  await page.getByLabel("Note title").fill(decodeStepValue(value));
});

When("I enter {string} as the note body", async ({ page }, value: string) => {
  await page.getByLabel("Note body").fill(decodeStepValue(value));
});

When("I expand the note titled {string}", async ({ page }, title: string) => {
  const row = page.locator("ol > li").filter({ hasText: title });
  const disclosure = row.locator('button[aria-expanded="false"]');
  await disclosure.click();
  await expect(row.locator('button[aria-expanded="true"]')).toBeVisible();
  await expect(row.getByRole("region")).toBeVisible();
});

When("I replace the note title with {string}", async ({ page }, value: string) => {
  await page.getByLabel("Note title").fill(decodeStepValue(value));
});

When("I replace the note body with {string}", async ({ page }, value: string) => {
  await page.getByLabel("Note body").fill(decodeStepValue(value));
});

When("I collapse the expanded note", async ({ page }) => {
  await page.locator('button[aria-expanded="true"]').click();
  await expect(page.locator('[id^="trip-note-region-"][role="region"]')).toHaveCount(0, { timeout: 10_000 });
});

When("I close the note editor", async ({ page }) => {
  await page.getByRole("button", { name: "Notes" }).click();
  await expect(page.getByLabel("Note title")).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByRole("button", { name: "New Note", exact: true })).toBeVisible({ timeout: 10_000 });
});

When("I set the Notes viewport to 320 CSS pixels wide", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
});

When("I resize Notes text to 200 percent", async ({ page }) => {
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--font-scale", "2");
  });
});

Then("the Notes empty state is visible", async ({ page }) => {
  await expect(page.getByText("No notes yet")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "New Note" })).toBeVisible({ timeout: 10_000 });
});

Then("no note capture bar is visible", async ({ page }) => {
  await expect(page.getByLabel("Note title")).toHaveCount(0);
});

Then(
  "the note editor shows title {string} and body {string} in place",
  async ({ page }, title: string, body: string) => {
    await expect(page.getByLabel("Note title")).toHaveValue(decodeStepValue(title));
    await expect(page.getByLabel("Note body")).toHaveValue(decodeStepValue(body));
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveURL(/\/trips\/[^/]+$/);
  }
);

Then("only the note titled {string} is expanded", async ({ page }, title: string) => {
  const row = page.locator("ol > li").filter({ hasText: title });
  await expect(page.locator('button[aria-expanded="true"]')).toHaveCount(1);
  await expect(page.locator('[id^="trip-note-region-"][role="region"]')).toHaveCount(1);
  await expect(row.locator('button[aria-expanded="true"]')).toBeVisible();
  await expect(page.getByLabel("Note title")).toHaveValue(title);
});

Then("the Notes tab and New Note controls measure at least 44 by 44 pixels", async ({ page }) => {
  const controls = [
    page.getByRole("button", { name: "Notes", exact: true }),
    page.getByRole("button", { name: "New Note", exact: true }),
  ];

  for (const control of controls) {
    await control.scrollIntoViewIfNeeded();
    await expect(control).toBeVisible({ timeout: 10_000 });
    const bounds = await control.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
  }
});

Then("the Notes panel has no horizontal scrolling", async ({ page }) => {
  const notesList = page.locator("ol");
  await expect(notesList).toBeVisible();
  const widths = await notesList.evaluate((element) => {
    const panel = element.parentElement;
    return {
      listClientWidth: element.clientWidth,
      listScrollWidth: element.scrollWidth,
      panelClientWidth: panel?.clientWidth ?? 0,
      panelScrollWidth: panel?.scrollWidth ?? 0,
    };
  });
  expect(widths.listScrollWidth).toBeLessThanOrEqual(widths.listClientWidth);
  expect(widths.panelScrollWidth).toBeLessThanOrEqual(widths.panelClientWidth);
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
