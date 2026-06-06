import { expect, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { packingTemplateItems, packingTemplates } from "../../../src/db/schema";
import { type E2EDb, withE2EDb } from "../e2e-db";
import { E2E_TEMPLATE_EDITOR_ITEMS, E2E_TEMPLATE_LABEL_ITEMS, type TemplateItemSeed } from "../e2e-seed-data";
import { Given, Then, When } from "../fixtures";

async function insertTemplateItem(
  db: E2EDb,
  values: {
    templateId: string;
    text: string;
    isLabel: boolean;
    position: number;
    labelId: string | null;
  }
): Promise<string> {
  const rows = (await db.insert(packingTemplateItems).values(values).returning({ id: packingTemplateItems.id })) as {
    id: string;
  }[];

  return rows[0].id;
}

async function seedTemplateEditor(userId: string, name: string, items: TemplateItemSeed[] = []): Promise<string> {
  return withE2EDb(async (db) => {
    const [template] = await db
      .insert(packingTemplates)
      .values({ userId, name })
      .returning({ id: packingTemplates.id });
    const labelIdsByName = new Map<string, string>();

    for (const item of items) {
      const labelId = item.isLabel ? null : item.under ? (labelIdsByName.get(item.under) ?? null) : null;
      const itemId = await insertTemplateItem(db, {
        templateId: template.id,
        text: item.text,
        isLabel: item.isLabel,
        position: item.position,
        labelId,
      });

      if (item.isLabel) {
        labelIdsByName.set(item.text, itemId);
      }
    }

    return template.id;
  });
}

async function getTemplateEditorId(userId: string, name: string): Promise<string> {
  return withE2EDb(async (db) => {
    const [template] = await db
      .select({ id: packingTemplates.id })
      .from(packingTemplates)
      .where(and(eq(packingTemplates.userId, userId), eq(packingTemplates.name, name)));

    if (!template) {
      throw new Error(`Template not found: ${name}`);
    }

    return template.id;
  });
}

async function dragTemplateItemOntoTarget(
  page: Page,
  sourceName: string,
  target: ReturnType<Page["locator"]>
): Promise<void> {
  const handle = page.getByTitle(`Reorder ${sourceName}`);
  await expect(handle).toBeVisible({ timeout: 10_000 });
  await handle.scrollIntoViewIfNeeded();

  const source = await handle.boundingBox();
  const destination = await target.boundingBox();
  if (!source || !destination) {
    throw new Error(`Could not measure drag target for ${sourceName}`);
  }

  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2 + 8, { steps: 4 });
  await page.mouse.move(destination.x + destination.width / 2, destination.y + destination.height / 2, { steps: 12 });
  await page.waitForTimeout(80);
  const reorderResponse = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().includes("/packing/")
  );
  await page.mouse.up();
  await reorderResponse;
}

Given("I am signed in as the template editor user", async ({ page, scenario }) => {
  await scenario.signIn(page);
});

Given("the template editor {string} exists", async ({ scenario }, name: string) => {
  const currentUser = await scenario.ensureCurrentUser();
  const templateId = await seedTemplateEditor(currentUser.id, name);
  scenario.setValue("templateEditorId", templateId);
  scenario.setValue("templateEditorName", name);
});

Given("the template editor {string} has no items", async ({ scenario }, name: string) => {
  const currentUser = await scenario.ensureCurrentUser();
  const templateId = await seedTemplateEditor(currentUser.id, name);
  scenario.setValue("templateEditorId", templateId);
  scenario.setValue("templateEditorName", name);
});

Given("the template editor {string} has an item {string}", async ({ scenario }, name: string, itemText: string) => {
  const currentUser = await scenario.ensureCurrentUser();
  const templateId = await seedTemplateEditor(currentUser.id, name, [
    { ...E2E_TEMPLATE_EDITOR_ITEMS[0], text: itemText },
  ]);
  scenario.setValue("templateEditorId", templateId);
  scenario.setValue("templateEditorName", name);
});

Given("the template editor {string} has a label {string}", async ({ scenario }, name: string, labelText: string) => {
  const currentUser = await scenario.ensureCurrentUser();
  const templateId = await seedTemplateEditor(currentUser.id, name, [
    { ...E2E_TEMPLATE_LABEL_ITEMS[0], text: labelText },
  ]);
  scenario.setValue("templateEditorId", templateId);
  scenario.setValue("templateEditorName", name);
});

Given(
  "the template editor {string} has a label {string} with item {string}",
  async ({ scenario }, name: string, labelText: string, itemText: string) => {
    const currentUser = await scenario.ensureCurrentUser();
    const templateId = await seedTemplateEditor(currentUser.id, name, [
      { text: labelText, isLabel: true, position: 0 },
      { text: itemText, isLabel: false, position: 1, under: labelText },
    ]);
    scenario.setValue("templateEditorId", templateId);
    scenario.setValue("templateEditorName", name);
  }
);

Given(
  "the template editor {string} has items {string} and {string}",
  async ({ scenario }, name: string, first: string, second: string) => {
    const currentUser = await scenario.ensureCurrentUser();
    const templateId = await seedTemplateEditor(currentUser.id, name, [
      { text: first, isLabel: false, position: 0 },
      { text: second, isLabel: false, position: 1 },
    ]);
    scenario.setValue("templateEditorId", templateId);
    scenario.setValue("templateEditorName", name);
  }
);

When("I click the template editor {string}", async ({ page }, name: string) => {
  await Promise.all([page.waitForURL(/\/packing\/.+/, { timeout: 10_000 }), page.getByRole("link", { name }).click()]);
});

When("I open the template editor for {string}", async ({ page, scenario }, name: string) => {
  const currentUser = await scenario.ensureCurrentUser();
  const templateId = await getTemplateEditorId(currentUser.id, name);
  scenario.setValue("templateEditorId", templateId);
  await page.goto(`/packing/${templateId}`);
  await expect(page).toHaveURL(new RegExp(`/packing/${templateId}$`));
  await expect(page.getByRole("heading", { name })).toBeVisible();
});

When("I add the template item {string}", async ({ page }, name: string) => {
  await page.getByPlaceholder("Add item…").fill(name);
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-packing-kind]").filter({ hasText: name }).first()).toBeVisible({ timeout: 10_000 });
});

When("I add the template label {string}", async ({ page }, name: string) => {
  await page.getByPlaceholder("New section…").fill(name);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name })).toBeVisible({ timeout: 10_000 });
});

When("I edit the template item {string} to {string}", async ({ page }, currentName: string, nextName: string) => {
  const nameElement = page.locator("[data-packing-name]").filter({ hasText: currentName }).first();
  await expect(nameElement).toBeVisible({ timeout: 10_000 });
  await nameElement.click();
  const input = page.locator(`input[value="${currentName}"]`);
  await expect(input).toBeVisible({ timeout: 5_000 });
  await input.fill(nextName);
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-packing-name]").filter({ hasText: nextName }).first()).toBeVisible({
    timeout: 10_000,
  });
});

When("I remove the template item {string}", async ({ page }, name: string) => {
  await page.getByRole("button", { name: `Remove ${name}` }).click();
  await expect(page.locator("[data-packing-kind]").filter({ hasText: name })).toHaveCount(0, { timeout: 10_000 });
});

When("I rename the template label {string} to {string}", async ({ page }, currentName: string, nextName: string) => {
  const heading = page.getByRole("heading", { name: currentName });
  await expect(heading).toBeVisible({ timeout: 10_000 });
  await heading.click();
  const input = page.locator(`input[value="${currentName}"]`);
  await expect(input).toBeVisible({ timeout: 5_000 });
  await input.fill(nextName);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: nextName })).toBeVisible({ timeout: 10_000 });
});

When("I delete the template label {string}", async ({ page }, name: string) => {
  const heading = page.getByRole("heading", { name });
  await expect(heading).toBeVisible({ timeout: 10_000 });
  await heading.click();
  await page.getByRole("button", { name: "Delete label" }).click();
});

Then("I should see the template label delete confirmation", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Keep Items" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Delete Items" })).toBeVisible();
});

When("I keep the template label items", async ({ page }) => {
  await page.getByRole("button", { name: "Keep Items" }).click();
});

When(
  "I drag the template item {string} onto the template item {string}",
  async ({ page }, name: string, targetName: string) => {
    const target = page.locator('[data-packing-kind="item"]').filter({ hasText: targetName }).first();
    await dragTemplateItemOntoTarget(page, name, target);
  }
);

Then("I should be on the template editor for {string}", async ({ page }, name: string) => {
  await expect(page).toHaveURL(/\/packing\/.+/);
  await expect(page.getByRole("heading", { name })).toBeVisible();
});

Then("the template editor should contain {string}", async ({ page }, name: string) => {
  await expect(page.locator("[data-packing-kind]").filter({ hasText: name }).first()).toBeVisible();
});

Then("the template editor should not contain {string}", async ({ page }, name: string) => {
  await expect(page.locator("[data-packing-kind]").filter({ hasText: name })).toHaveCount(0);
});

Then("the template editor should contain a label {string}", async ({ page }, name: string) => {
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
});

Then("the template editor should not contain a label {string}", async ({ page }, name: string) => {
  await expect(page.locator('[data-packing-kind="label"]').filter({ hasText: name })).toHaveCount(0);
});

Then("the template editor order should be {string} then {string}", async ({ page }, first: string, second: string) => {
  await expect(async () => {
    const names = await page.locator("[data-packing-name]").allTextContents();
    expect(names.map((name) => name.trim())).toEqual([first, second]);
  }).toPass({ timeout: 10_000 });
});
