import { expect } from "@playwright/test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import { When, Then, Before } from "../fixtures";
import { trips, users } from "../../../src/db/schema";
import { E2E_USER, E2E_TRIP } from "../e2e-seed-data";

async function withE2EDb<T>(fn: (db: ReturnType<typeof drizzle>) => Promise<T>): Promise<T> {
  const client = postgres(process.env.E2E_DATABASE_URL!);
  const db = drizzle(client);
  try {
    return await fn(db);
  } finally {
    await client.end();
  }
}

Before({ tags: "@reseed-cover-image" }, async () => {
  await withE2EDb(async (db) => {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, E2E_USER.email));
    if (!user) return;
    await db
      .update(trips)
      .set({ coverImageUrl: E2E_TRIP.coverImageUrl })
      .where(and(eq(trips.ownerId, user.id), eq(trips.startDate, E2E_TRIP.startDate)));
  });
});

When("I click the Remove image button", async ({ page }) => {
  await page.getByRole("dialog").getByRole("button", { name: "Remove image" }).click();
});

Then("the cover image is cleared after reloading the page", async ({ page }) => {
  await page.reload();
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Remove image" })).not.toBeVisible();
});

When("I select a new cover image from the picker", async ({ page }) => {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Edit cover image" }).click();
  await expect(page.getByRole("tab", { name: "URL" })).toBeVisible();
  await page.getByRole("tab", { name: "URL" }).click();
  await page.getByPlaceholder("https://...").fill("https://example.com/e2e-cover.jpg");
  await page.getByRole("button", { name: "Apply" }).click();
});

Then("the new cover image is shown after reloading the page", async ({ page }) => {
  await page.reload();
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Remove image" })).toBeVisible();
});
