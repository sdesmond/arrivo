import { expect } from "@playwright/test";
import { Given, Then, When } from "../fixtures";

interface TemplateTable {
  hashes: () => Array<{ name: string }>;
}

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

Given("I have no packing templates", async ({ scenario }) => {
  await scenario.ensureCurrentUser();
});

Given("I have a packing template named {string}", async ({ scenario }, name: string) => {
  await scenario.materialize({
    template: { overrides: { template: { name } }, setCurrent: false },
  });
});

Given("I have packing templates:", async ({ scenario }, table: TemplateTable) => {
  for (const row of table.hashes()) {
    await scenario.materialize({
      template: { overrides: { template: { name: row.name } }, setCurrent: false },
    });
  }
});

When("I create a packing template named {string}", async ({ page }, name: string) => {
  await page.getByRole("button", { name: "New template" }).click();
  await page.getByLabel("Template name").fill(name);
  await page.getByRole("button", { name: "Create template" }).click();
  await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });
});

When("I rename the packing template {string} to {string}", async ({ page }, currentName: string, nextName: string) => {
  await page.getByTitle(`Rename ${currentName}`).click();
  const input = page.getByLabel("Template name");
  await input.clear();
  await input.fill(nextName);
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText(nextName)).toBeVisible({ timeout: 10_000 });
});

When("I delete the packing template {string}", async ({ page }, name: string) => {
  await page.getByTitle(`Delete ${name}`).click();
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
  await expect(page.getByTitle(`Rename ${name}`)).toHaveCount(0);
});

Then(
  "the packing templates should appear in order {string} then {string} then {string}",
  async ({ page }, firstName: string, secondName: string, thirdName: string) => {
    const templateNames = await page.locator("li a[href^='/packing/']").allTextContents();
    expect(templateNames.slice(0, 3)).toEqual([firstName, secondName, thirdName]);
  }
);

Then("I should see a template validation error", async ({ page }) => {
  await expect(page.getByRole("status").filter({ hasText: "Template name is required." })).toBeVisible();
});

Then("the create template button should be disabled", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Create template" })).toBeDisabled();
});
