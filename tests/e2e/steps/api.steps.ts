import { expect, type APIResponse, type Page } from "@playwright/test";
import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { checklistItems, itineraryChecklists, days, collaborators, users } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { waitForApiResponse } from "../api-response";
import { Given, When, Then } from "../fixtures";
interface ApiScenarioState {
  itemId: string;
  role?: string;
  revokedCookie?: string;
  response?: APIResponse;
}
const states = new WeakMap<Page, ApiScenarioState>();
function state(page: Page): ApiScenarioState {
  const value = states.get(page);
  if (!value) throw new Error("API fixture missing");
  return value;
}
function headers(page: Page) {
  return { "x-arrivo-client": "web", "content-type": "application/json", origin: new URL(page.url()).origin };
}
Given("a scenario-owned checklist API item", async ({ page, scenario }) => {
  const trip = await scenario.ensureCurrentTrip("threeDayTrip", {
    checklists: [
      {
        dayNumber: 1,
        position: 0,
        title: "API packing",
        items: [{ text: "API passport", position: 0, isChecked: false }],
      },
    ],
  });
  const itemId = await withE2EDb(async (database) => {
    const [item] = await database
      .select({ id: checklistItems.id })
      .from(checklistItems)
      .innerJoin(itineraryChecklists, eq(checklistItems.checklistId, itineraryChecklists.id))
      .innerJoin(days, eq(itineraryChecklists.dayId, days.id))
      .where(eq(days.tripId, trip.id));
    return item.id;
  });
  states.set(page, { itemId });
  await scenario.signIn(page);
  await scenario.gotoCurrentTrip(page);
});
Given("my checklist API role is {string}", async ({ page, scenario }, role: string) => {
  state(page).role = role;
  if (role === "anonymous") {
    await page.context().clearCookies();
    return;
  }
  const tripId = scenario.currentTrip!.id;
  const userId = scenario.currentUser!.id;
  await withE2EDb(async (database) => {
    const condition = and(eq(collaborators.tripId, tripId), eq(collaborators.userId, userId));
    if (role === "stranger") await database.delete(collaborators).where(condition);
    else await database.update(collaborators).set({ role }).where(condition);
  });
});
When("I set the checklist API checked state to {string} twice", async ({ page }, value: string) => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await page.request.patch(`/api/v1/checklist-items/${state(page).itemId}`, {
      headers: headers(page),
      data: { isChecked: value === "true" },
    });
    expect(response.status()).toBe(200);
    expect((await response.json()).isChecked).toBe(value === "true");
    expect(response.headers()["cache-control"]).toBe("no-store");
  }
});
Then("the checklist API state {string} persists after reload", async ({ page }, value: string) => {
  await page.reload();
  const firstDayToggle = page
    .locator("button")
    .filter({ hasText: /\d+ stops/ })
    .first();
  if ((await firstDayToggle.getAttribute("aria-expanded")) === "false") await firstDayToggle.click();
  const itemId = state(page).itemId;
  const checked = await withE2EDb(async (database) => {
    const [item] = await database
      .select({ isChecked: checklistItems.isChecked })
      .from(checklistItems)
      .where(eq(checklistItems.id, itemId));
    return item.isChecked;
  });
  expect(checked).toBe(value === "true");
  const checklist = page.locator('[id^="checklist-"]').filter({ hasText: "API packing" });
  if (value === "true") await expect(checklist.getByLabel("Complete")).toBeVisible();
  else {
    await checklist.getByRole("button").first().click();
    await expect(checklist.getByTitle("Check item")).toBeVisible();
  }
});
When("I attempt a checklist API write", async ({ page }) => {
  const requestHeaders: Record<string, string> = headers(page);
  const revokedCookie = state(page).revokedCookie;
  if (revokedCookie) requestHeaders.cookie = revokedCookie;
  state(page).response = await page.request.patch(`/api/v1/checklist-items/${state(page).itemId}`, {
    headers: requestHeaders,
    data: { isChecked: true },
  });
});
When("I submit checklist API case {string}", async ({ page }, testCase: string) => {
  const requestHeaders = headers(page);
  let itemId = state(page).itemId;
  let data: unknown = { isChecked: true };
  if (testCase === "malformed") data = "{";
  if (testCase === "non-object") data = "[]";
  if (testCase === "invalid-body") data = { isChecked: "yes" };
  if (testCase === "invalid-id") itemId = "invalid";
  if (testCase === "missing-item") itemId = randomUUID();
  if (testCase === "no-header") requestHeaders["x-arrivo-client"] = "";
  if (testCase === "wrong-type") requestHeaders["content-type"] = "text/plain";
  if (testCase === "cross-origin") requestHeaders.origin = "https://other.test";
  const extraHeaders: Record<string, string> = testCase === "same-site" ? { "sec-fetch-site": "same-site" } : {};
  state(page).response = await page.request.patch(`/api/v1/checklist-items/${itemId}`, {
    headers: { ...requestHeaders, ...extraHeaders },
    data,
  });
});
Then(
  "the checklist API returns {int} with code {string} and no write",
  async ({ page }, status: number, code: string) => {
    const response = state(page).response!;
    expect(response.status()).toBe(status);
    const body = await response.json();
    expect(body.error.code).toBe(code);
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect(response.headers()["access-control-allow-origin"]).toBeUndefined();
    if (code === "validation_failed") expect(body.error.fields).toBeDefined();
    if (state(page).role === "viewer") expect(body.error.requiredRole).toBe("editor");
    const checked = await withE2EDb(async (database) => {
      const [item] = await database
        .select({ isChecked: checklistItems.isChecked })
        .from(checklistItems)
        .where(eq(checklistItems.id, state(page).itemId));
      return item.isChecked;
    });
    expect(checked).toBe(false);
  }
);

Given("my checklist API session has been revoked", async ({ page, scenario }) => {
  const sessionCookies = (await page.context().cookies()).filter((cookie) => cookie.name.includes("session-token"));
  expect(sessionCookies.length).toBeGreaterThan(0);
  state(page).revokedCookie = sessionCookies.map((cookie) => cookie.name + "=" + cookie.value).join("; ");
  await withE2EDb(async (database) => {
    await database
      .update(users)
      .set({ sessionVersion: sql`${users.sessionVersion} + 1` })
      .where(eq(users.id, scenario.currentUser!.id));
  });
});
When("I uncheck the checklist item through the UI", async ({ page }) => {
  const checklist = page.locator('[id^="checklist-"]').filter({ hasText: "API packing" });
  if (!(await checklist.getByTitle("Uncheck item").isVisible())) await checklist.getByRole("button").first().click();
  const pending = waitForApiResponse(page, { method: "PATCH", path: `/api/v1/checklist-items/${state(page).itemId}` });
  await checklist.getByTitle("Uncheck item").click();
  const response = await pending;
  expect((await response.json()).isChecked).toBe(false);
});
