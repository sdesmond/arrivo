import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { users } from "../../../src/db/schema";
import { Given, When, Then } from "../fixtures";
import { withE2EDb } from "../e2e-db";

Given("account role responses are delayed", async ({ page, scenario }) => {
  let releaseResponses!: () => void;
  const pendingResponses = new Promise<void>((resolve) => {
    releaseResponses = resolve;
  });
  let requestCount = 0;
  scenario.setValue("releaseAccountRoleResponses", releaseResponses);
  page.once("close", releaseResponses);
  await page.route("**/api/users/me/instance-role", async (route) => {
    requestCount += 1;
    scenario.setValue("pendingAccountRoleReads", requestCount);
    expect(route.request().method()).toBe("GET");
    await pendingResponses;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ isAdmin: true }) });
  });
});

When("I wait for pending account role reads", async ({ scenario }) => {
  // Desktop and mobile menus are both mounted; hold both reads across navigation.
  await expect.poll(() => scenario.getValue<number>("pendingAccountRoleReads") ?? 0).toBeGreaterThanOrEqual(2);
});

When("I release delayed account role responses", async ({ page, scenario }) => {
  const releaseResponses = scenario.getValue<() => void>("releaseAccountRoleResponses");
  if (!releaseResponses) throw new Error("No delayed account role responses were registered.");
  // Current-page reads also wait, so their completion proves the new pathname received fresh authority.
  await expect.poll(() => scenario.getValue<number>("pendingAccountRoleReads") ?? 0).toBeGreaterThanOrEqual(4);
  const lateResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/users/me/instance-role"
  );
  releaseResponses();
  await (await lateResponse).finished();
});

Then("late account role reads keep me on Settings", async ({ page }) => {
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole("heading", { name: "Profile & Settings" })).toBeVisible();
});

Given("I am signed in as an instance {string}", async ({ page, scenario }, role: string) => {
  if (role !== "admin" && role !== "member") throw new Error(`Unsupported instance role: ${role}`);
  await scenario.ensureCurrentUser({ user: { role } });
  await scenario.signIn(page);
});

Given("I use a mobile account viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
});

When("I open Travel History from the sidebar", async ({ page }) => {
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Travel History" }).click();
  await expect(page).toHaveURL(/\/travel-history$/);
});

When("I switch Travel History to Spending through query navigation", async ({ page }) => {
  await page.keyboard.press("Escape");
  const roleRequest = page.waitForRequest(
    (request) => new URL(request.url()).pathname === "/api/users/me/instance-role" && request.method() === "GET"
  );
  await page.getByRole("button", { name: "Spending", exact: true }).click();
  await expect(page).toHaveURL(/\/travel-history\?view=spending$/);
  const response = await (await roleRequest).response();
  expect(response).not.toBeNull();
  expect(await response!.json()).toEqual({ isAdmin: false });
});

When("I open the shared account menu", async ({ page }) => {
  const desktop = page.getByRole("button", { name: "Account menu", exact: true });
  const trigger = (await desktop.isVisible()) ? desktop : page.getByRole("button", { name: "Profile", exact: true });
  // The development date picker floats over the lower-right corner on narrow screens.
  await trigger.click({ position: { x: 8, y: 8 } });
  await expect(page.getByRole("menu")).toBeVisible();
});

Then("the account menu includes instance management", async ({ page }) => {
  await expect(page.getByRole("menuitem", { name: "Manage instance" })).toBeVisible();
});

Then("the account menu excludes instance management", async ({ page }) => {
  await expect(page.getByRole("menuitem", { name: "Manage instance" })).toHaveCount(0);
});

Then("the account menu offers Settings and Log out", async ({ page }) => {
  await expect(page.getByRole("menuitem", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Log out" })).toBeVisible();
});

When("I choose Manage instance", async ({ page }) => {
  await page.getByRole("menuitem", { name: "Manage instance" }).click();
});

When("I choose account Settings", async ({ page }) => {
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/profile$/);
});

Then("I see the Users-only instance management shell", async ({ page }) => {
  await expect(page).toHaveURL(/\/admin\/users(?:\?authority-check=1)?$/);
  await expect(page.getByRole("heading", { name: "Manage instance" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Users", exact: true })).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Instance sections" });
  await expect(navigation.getByRole("link", { name: "Users" })).toHaveAttribute("aria-current", "page");
  await expect(navigation.getByRole("link")).toHaveCount(2);
  await expect(navigation.getByRole("link", { name: "Activity" })).not.toHaveAttribute("aria-current", "page");
});

When("I follow Users in the existing instance navigation", async ({ page }) => {
  const navigationResponse = page.waitForResponse((response) => {
    const request = response.request();
    const url = new URL(request.url());
    return url.pathname === "/admin/users" && !url.searchParams.has("authority-check") && request.headers().rsc === "1";
  });
  await page.getByRole("navigation", { name: "Instance sections" }).getByRole("link", { name: "Users" }).click();
  const response = await navigationResponse;
  expect(response.request().isNavigationRequest()).toBe(false);
  expect(response.request().headers().rsc).toBe("1");
});

Then("client instance navigation is not found", async ({ page }) => {
  await expect(page).toHaveURL(/\/admin\/users$/);
  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Manage instance" })).toHaveCount(0);
});

When("I request instance management at {string}", async ({ page, scenario }, route: string) => {
  const response = await page.goto(route);
  scenario.setValue("adminResponseStatus", response?.status());
});

Then("instance management is not found", async ({ page, scenario }) => {
  expect(scenario.getValue<number>("adminResponseStatus")).toBe(404);
  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Manage instance" })).toHaveCount(0);
});

Then("the Profile tab has not navigated", async ({ page }) => {
  await expect(page).toHaveURL(/\/trips$/);
  await expect(page.getByRole("button", { name: "Profile", exact: true })).toHaveAttribute("aria-haspopup", "menu");
});

When("my instance admin role is removed in another session", async ({ scenario }) => {
  const user = await scenario.ensureCurrentUser();
  // Independent DB connection models another authenticated session changing the role.
  await withE2EDb((db) => db.update(users).set({ role: "member" }).where(eq(users.id, user.id)));
});
