import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { users } from "../../../src/db/schema";
import { When, Then } from "../fixtures";
import { withE2EDb } from "../e2e-db";
import { waitForServerActionResponse } from "../server-action";
import type { ScenarioFixtureContext } from "../scenario-fixture";

async function rememberAddedAccount(scenario: ScenarioFixtureContext) {
  const username = scenario.getValue<string>("addedUsername")!;
  const records = await withE2EDb((database) =>
    database.select({ id: users.id, passwordHash: users.passwordHash }).from(users).where(eq(users.username, username))
  );
  for (const record of records) scenario.registerCleanup({ entity: "user", id: record.id });
  expect(records).toHaveLength(1);
  expect(records[0].passwordHash === null).toBe(true);
}

When("I create a fresh account through Add User", async ({ page, scenario }) => {
  const username = scenario.uniqueUsername("added");
  scenario.setValue("addedUsername", username);
  await page.getByRole("button", { name: "Add User", exact: true }).click();
  await page.getByRole("textbox", { name: "Username" }).fill(username);
  const response = waitForServerActionResponse(page, { pathIncludes: "/admin/users" });
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await response;
  await rememberAddedAccount(scenario);
});

Then("the Add User result is focused and shareable", async ({ page, scenario }) => {
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Account created. Share this setup link." })).toBeFocused();
  await expect(dialog.getByText(scenario.getValue<string>("addedUsername")!, { exact: true })).toBeVisible();
  await expect(dialog.locator("time")).toBeVisible();
  // Avoid reading or asserting credential values: the selectable result and named copy action are sufficient.
  await expect(dialog.locator("p.select-text")).toHaveCount(1);
  await expect(dialog.getByRole("button", { name: "Copy link" })).toBeVisible();
  const fitsViewport = await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth);
  expect(fitsViewport).toBe(true);
});

When("I close and reopen Add User", async ({ page }) => {
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add User", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Add User", exact: true }).press("Enter");
});

Then("Add User has a blank form without a setup link", async ({ page }) => {
  await expect(page.getByRole("textbox", { name: "Username" })).toHaveValue("");
  await expect(page.getByRole("dialog").locator("p.select-text")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Copy link" })).toHaveCount(0);
});

Then("the added account persists as pending after reload", async ({ page, scenario }) => {
  await rememberAddedAccount(scenario);
  await page.reload();
  const row = page
    .getByRole("list", { name: "Instance users" })
    .getByRole("listitem")
    .filter({ has: page.getByText(scenario.getValue<string>("addedUsername")!, { exact: true }) });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Pending setup");
  await expect(page.locator("p.select-text")).toHaveCount(0);
});

When("I submit an invalid Add User username", async ({ page }) => {
  await page.getByRole("button", { name: "Add User", exact: true }).click();
  await page.getByRole("textbox", { name: "Username" }).fill("!");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
});

Then("Add User explains the username error", async ({ page }) => {
  await expect(page.getByRole("textbox", { name: "Username" })).toHaveAccessibleDescription(
    "Username must be 3–30 characters."
  );
});

When("I submit an existing Add User username", async ({ page, scenario }) => {
  const { user } = await scenario.materialize({ user: { setCurrent: false } });
  if (!user) throw new Error("Missing scenario account.");
  scenario.setValue("takenUsername", user.username);
  await page.getByRole("textbox", { name: "Username" }).fill(user.username.toUpperCase());
  const response = waitForServerActionResponse(page, { pathIncludes: "/admin/users" });
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await response;
});

Then("Add User reports the username is taken without a duplicate", async ({ page, scenario }) => {
  await expect(page.getByRole("textbox", { name: "Username" })).toHaveAccessibleDescription(
    "That username is already taken."
  );
  const records = await withE2EDb((database) =>
    database
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, scenario.getValue<string>("takenUsername")!))
  );
  expect(records).toHaveLength(1);
});

When("the Add User response is lost after account creation", async ({ page, scenario }) => {
  const username = scenario.uniqueUsername("lost");
  scenario.setValue("addedUsername", username);
  let postCount = 0;
  let releaseCheck!: () => void;
  const checkGate = new Promise<void>((resolve) => {
    releaseCheck = resolve;
  });
  await page.route("**/admin/users", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    postCount += 1;
    if (postCount === 1) {
      // Fetch waits for the actual transaction to commit before discarding its response.
      await route.fetch();
      await rememberAddedAccount(scenario);
      await route.abort("failed");
    } else {
      await checkGate;
      await route.continue();
    }
  });
  await page.getByRole("button", { name: "Add User", exact: true }).click();
  await page.getByRole("textbox", { name: "Username" }).fill(username);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  try {
    await expect(page.getByRole("button", { name: "Checking…" })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(postCount).toBe(2);
  } finally {
    releaseCheck();
  }
});

Then("Add User reports an existing account without recovering its link", async ({ page }) => {
  await expect(page.getByRole("dialog")).toContainText(
    "Account exists; link unavailable. Review Users before continuing."
  );
  await expect(page.getByRole("button", { name: "Create account", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Copy link" })).toHaveCount(0);
  await page.unroute("**/admin/users");
});
