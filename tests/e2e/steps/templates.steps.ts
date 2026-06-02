import { expect } from "@playwright/test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { packingTemplates, users } from "../../../src/db/schema";
import { After, Before, Given, Then, When } from "../fixtures";
import { E2E_USER } from "../e2e-seed-data";

interface TemplateTable {
  hashes: () => Array<{ name: string }>;
}

async function withE2EDb<T>(fn: (db: ReturnType<typeof drizzle>) => Promise<T>): Promise<T> {
  const client = postgres(process.env.E2E_DATABASE_URL!);
  const db = drizzle(client);

  try {
    return await fn(db);
  } finally {
    await client.end();
  }
}

async function getE2EUserId(db: ReturnType<typeof drizzle>): Promise<string> {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, E2E_USER.email));
  if (!user) {
    throw new Error("E2E user not found");
  }

  return user.id;
}

async function clearTemplates(): Promise<void> {
  await withE2EDb(async (db) => {
    const userId = await getE2EUserId(db);
    await db.delete(packingTemplates).where(eq(packingTemplates.userId, userId));
  });
}

async function seedTemplate(name: string): Promise<void> {
  await withE2EDb(async (db) => {
    const userId = await getE2EUserId(db);
    await db.insert(packingTemplates).values({ userId, name });
  });
}

Before({ tags: "@templates" }, async () => {
  await clearTemplates();
});

After({ tags: "@templates" }, async () => {
  await clearTemplates();
});

Given("I have no packing templates", async () => {
  await clearTemplates();
});

Given("I have a packing template named {string}", async ({}, name: string) => {
  await clearTemplates();
  await seedTemplate(name);
});

Given("I have packing templates:", async ({}, table: TemplateTable) => {
  await clearTemplates();
  for (const row of table.hashes()) {
    await seedTemplate(row.name);
  }
});

When("I click the Packing Templates link in the sidebar", async ({ page }) => {
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Packing Templates" })
    .click();
});

When("I open the templates page", async ({ page }) => {
  await page.goto("/packing");
  await expect(page).toHaveURL(/\/packing/);
  await expect(page.getByRole("heading", { name: "Packing Templates" })).toBeVisible();
});

When("I create a packing template named {string}", async ({ page }, name: string) => {
  await page.getByRole("button", { name: "New template" }).click();
  await page.getByLabel("Template name").fill(name);
  await page.getByRole("button", { name: "Create template" }).click();
  await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });
});

When("I rename the packing template {string} to {string}", async ({ page }, currentName: string, nextName: string) => {
  await page.getByRole("button", { name: `Rename ${currentName}` }).click();
  const input = page.getByLabel("Template name");
  await input.clear();
  await input.fill(nextName);
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText(nextName)).toBeVisible({ timeout: 10_000 });
});

When("I delete the packing template {string}", async ({ page }, name: string) => {
  await page.getByRole("button", { name: `Delete ${name}` }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(name)).toHaveCount(0, { timeout: 10_000 });
});

When("I enter only spaces as the template name", async ({ page }) => {
  await page.getByRole("button", { name: "New template" }).click();
  await page.getByLabel("Template name").fill("   ");
});

Then("I should be on the templates page", async ({ page }) => {
  await expect(page).toHaveURL(/\/packing/);
});

Then("I should see the empty template state", async ({ page }) => {
  await expect(page.getByText("No templates yet")).toBeVisible();
});

Then("I should see the packing template {string}", async ({ page }, name: string) => {
  await expect(page.getByText(name)).toBeVisible();
});

Then("I should not see the packing template {string}", async ({ page }, name: string) => {
  await expect(page.getByRole("button", { name: `Rename ${name}` })).toHaveCount(0);
});

Then("I should see a template validation error", async ({ page }) => {
  await expect(page.getByRole("status")).toHaveText("Template name is required.");
});

Then("the create template button should be disabled", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Create template" })).toBeDisabled();
});
