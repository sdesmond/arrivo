import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { users } from "../../../src/db/schema";
import { Given, When, Then } from "../fixtures";
import { withE2EDb } from "../e2e-db";
import type { ScenarioUserRecord } from "../scenario-fixture";
import type { Page } from "@playwright/test";
import { waitForServerActionResponse } from "../server-action";

const roleSelect = (page: Page, username: string) =>
  page.getByRole("combobox", { name: `Role: ${username}`, exact: true });

// The select is server-rendered, so a click before hydration opens nothing; retry until the confirmation is up.
async function chooseRole(page: Page, username: string, role: "Admin" | "Member") {
  const dialog = page.getByRole("dialog");
  await expect(async () => {
    if (!(await dialog.isVisible())) {
      // A previous attempt may have left the popup open; close it so the click opens rather than toggles it shut.
      if (await page.getByRole("option", { name: role, exact: true }).isVisible()) await page.keyboard.press("Escape");
      await roleSelect(page, username).click();
      await page.getByRole("option", { name: role, exact: true }).click({ timeout: 1_500 });
    }
    await expect(dialog).toBeVisible({ timeout: 1_500 });
  }).toPass();
}

Given("another completed app member exists", async ({ scenario }) => {
  const { user } = await scenario.materialize({ user: { overrides: { user: { role: "member" } }, setCurrent: false } });
  if (!user) throw new Error("Failed to create app member.");
  scenario.setValue("appMember", user);
});

When("I promote the other app member", async ({ page, scenario }) => {
  const user = scenario.getValue<ScenarioUserRecord>("appMember")!;
  await chooseRole(page, user.username, "Admin");
  const response = waitForServerActionResponse(page, { pathIncludes: "/admin/users" });
  await page.getByRole("dialog").getByRole("button", { name: "Make admin", exact: true }).click();
  await response;
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

Then("the other app member is persistently an admin", async ({ page, scenario }) => {
  const user = scenario.getValue<ScenarioUserRecord>("appMember")!;
  await expect(roleSelect(page, user.username)).toContainText("Admin");
  const [record] = await withE2EDb((database) =>
    database.select({ role: users.role }).from(users).where(eq(users.id, user.id))
  );
  expect(record.role).toBe("admin");
  await page.reload();
  await expect(roleSelect(page, user.username)).toContainText("Admin");
});

When("I remove my own app admin role", async ({ page, scenario }) => {
  const user = await scenario.ensureCurrentUser();
  await chooseRole(page, user.username, "Member");
  const response = waitForServerActionResponse(page, { pathIncludes: "/admin/users" });
  await page.getByRole("dialog").getByRole("button", { name: "Remove admin", exact: true }).click();
  await response;
});

Then("I land on personal settings after demotion", async ({ page, scenario }) => {
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole("heading", { name: "Profile & Settings" })).toBeVisible();
  const user = await scenario.ensureCurrentUser();
  const [record] = await withE2EDb((database) =>
    database.select({ role: users.role }).from(users).where(eq(users.id, user.id))
  );
  expect(record.role).toBe("member");
});
