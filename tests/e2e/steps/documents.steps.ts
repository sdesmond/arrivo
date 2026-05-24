import { expect } from "@playwright/test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, isNull } from "drizzle-orm";
import { documents, trips, users } from "../../../src/db/schema";
import { E2E_TRIP, E2E_USER } from "../e2e-seed-data";
import { Given, When, Then, Before } from "../fixtures";

async function withE2EDb<T>(fn: (db: ReturnType<typeof drizzle>) => Promise<T>): Promise<T> {
  const client = postgres(process.env.E2E_DATABASE_URL!);
  const db = drizzle(client);
  try {
    return await fn(db);
  } finally {
    await client.end();
  }
}

Before({ tags: "@docs-empty" }, async () => {
  await withE2EDb(async (db) => {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, E2E_USER.email));
    if (!user) return;
    const [trip] = await db
      .select({ id: trips.id })
      .from(trips)
      .where(and(eq(trips.ownerId, user.id), eq(trips.startDate, E2E_TRIP.startDate)));
    if (!trip) return;
    await db.delete(documents).where(and(eq(documents.tripId, trip.id), isNull(documents.eventId)));
  });
});

Given("I am on the Documents tab", async ({ page }) => {
  await page.getByRole("button", { name: "Documents" }).click();
  // #doc-upload is always in the DOM regardless of empty/populated state (per Story 4.2 AC3)
  await expect(page.locator("#doc-upload")).toBeAttached({ timeout: 10_000 });
});

Given("the Documents tab shows the empty state", async ({ page }) => {
  await expect(page.getByText("No documents yet")).toBeVisible({ timeout: 5_000 });
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

Given("the Documents tab has one seeded document", async ({ page }) => {
  await expect(page.getByText("E2E Boarding Pass")).toBeVisible();
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
