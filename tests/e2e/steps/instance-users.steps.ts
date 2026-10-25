import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { users } from "../../../src/db/schema";
import { Given, When, Then } from "../fixtures";
import { withE2EDb } from "../e2e-db";
import type { ScenarioUserRecord } from "../scenario-fixture";
import { waitForServerActionResponse } from "../server-action";

Given("another completed instance member exists", async ({ scenario }) => {
  const { user } = await scenario.materialize({ user: { overrides: { user: { role: "member" } }, setCurrent: false } });
  if (!user) throw new Error("Failed to create instance member.");
  scenario.setValue("instanceMember", user);
});

When("I promote the other instance member", async ({ page, scenario }) => {
  const user = scenario.getValue<ScenarioUserRecord>("instanceMember")!;
  await page.getByRole("button", { name: `Make admin: ${user.username}`, exact: true }).click();
  const response = waitForServerActionResponse(page, { pathIncludes: "/admin/users" });
  await page.getByRole("dialog").getByRole("button", { name: "Make admin", exact: true }).click();
  await response;
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

Then("the other instance member is persistently an admin", async ({ page, scenario }) => {
  const user = scenario.getValue<ScenarioUserRecord>("instanceMember")!;
  await expect(page.getByRole("button", { name: `Remove admin: ${user.username}`, exact: true })).toBeVisible();
  const [record] = await withE2EDb((database) =>
    database.select({ role: users.role }).from(users).where(eq(users.id, user.id))
  );
  expect(record.role).toBe("admin");
  await page.reload();
  await expect(page.getByRole("button", { name: `Remove admin: ${user.username}`, exact: true })).toBeVisible();
});

When("I remove my own instance admin role", async ({ page, scenario }) => {
  const user = await scenario.ensureCurrentUser();
  await page.getByRole("button", { name: `Remove admin: ${user.username}`, exact: true }).click();
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
