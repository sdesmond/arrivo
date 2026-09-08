import { expect } from "@playwright/test";
import { After, Then, When } from "../fixtures";

const LIVE_SYNC_EVENTS_ROUTE = "**/api/users/me/events";

// The channel is declared dead at SSE_HEARTBEAT_INTERVAL_MS (15s) + LIVE_SYNC_DEAD_CHANNEL_GRACE_MS
// (10s), and the indicator holds a problem back for its own 2s grace window on top of that.
const DEAD_CHANNEL_WINDOW_MS = 40_000;
const RECONNECTING_WINDOW_MS = 15_000;
const MAX_TAB_STOPS = 60;

// Every scenario that interrupts the channel leaves an aborting route registered; without this the
// EventSource keeps retrying it through teardown.
After({ tags: "@feat:sync-status" }, async ({ page }) => {
  await page.unroute(LIVE_SYNC_EVENTS_ROUTE).catch(() => undefined);
});

Then("the trips page has finished loading", async ({ page }) => {
  await expect(page.getByRole("button", { name: "New trip", exact: true })).toBeVisible();
});

Then("no live sync problem indicator is shown", async ({ page }) => {
  await expect(page.getByTestId("sync-status-trigger")).toHaveCount(0, { timeout: RECONNECTING_WINDOW_MS });
});

When("I interrupt the live sync connection", async ({ page }) => {
  await page.route(LIVE_SYNC_EVENTS_ROUTE, async (route) => {
    await route.abort("failed");
  });
  await page.reload();
});

When("I restore the live sync connection", async ({ page }) => {
  await page.unroute(LIVE_SYNC_EVENTS_ROUTE);
});

Then("the live sync problem indicator shows {string}", async ({ page }, label: string) => {
  await expect(page.getByRole("button", { name: label })).toBeVisible({ timeout: RECONNECTING_WINDOW_MS });
});

Then("the live sync problem indicator eventually shows {string}", async ({ page, $testInfo }, label: string) => {
  $testInfo.setTimeout(DEAD_CHANNEL_WINDOW_MS + 60_000);
  await expect(page.getByRole("button", { name: label })).toBeVisible({ timeout: DEAD_CHANNEL_WINDOW_MS });
});

When("I move keyboard focus to the live sync problem indicator", async ({ page }) => {
  const trigger = page.getByTestId("sync-status-trigger");
  await expect(trigger).toBeVisible();

  for (let i = 0; i < MAX_TAB_STOPS; i += 1) {
    if (await trigger.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }

  throw new Error("Keyboard focus never reached the live sync problem indicator");
});

When("I tap the live sync problem indicator", async ({ page }) => {
  await page.getByTestId("sync-status-trigger").click();
});

Then("the live sync tooltip shows {string}", async ({ page }, label: string) => {
  await expect(page.getByTestId("sync-status-tooltip")).toHaveText(label);
});
