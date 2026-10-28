import { expect } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { activityEvents, instanceState } from "../../../src/db/schema";
import { After, Given, When, Then } from "../fixtures";
import {
  createActivityRetentionFixture,
  holdSharedRetentionPolicy,
  type ActivityRetentionFixture,
} from "../activity-retention-fixture";
import { holdActivityMaintenance, type ActivityMaintenanceHold } from "../activity-integration-fixture";
import { withE2EDb } from "../e2e-db";
import { waitForServerActionResponse } from "../server-action";

const MAINTENANCE_HOLD_KEY = "retentionMaintenanceHold";

After(async ({ scenario }) => {
  await scenario.getValue<ActivityMaintenanceHold>(MAINTENANCE_HOLD_KEY)?.release();
  await scenario.getValue<ActivityRetentionFixture>("retentionFixture")?.close();
  const expiredId = scenario.getValue<string>("retentionExpiredId");
  if (expiredId) await withE2EDb((database) => database.delete(activityEvents).where(eq(activityEvents.id, expiredId)));
  await scenario.getValue<() => Promise<void>>("restoreRetention")?.();
});
Given("an isolated retention database", async ({ scenario }) => {
  scenario.setValue("retentionFixture", await createActivityRetentionFixture());
});
Then("PostgreSQL retention verifies {string}", async ({ scenario }, testCase: string) => {
  await scenario.getValue<ActivityRetentionFixture>("retentionFixture")!.verify(testCase);
});
Given("Activity retention starts at {int} days", async ({ scenario }, days: number) => {
  scenario.setValue("restoreRetention", await holdSharedRetentionPolicy(days));
});
Given("I am on a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
});
When("I choose Activity retention of {int} days", async ({ page }, days: number) => {
  await page.getByRole("combobox", { name: "Activity retention" }).click();
  await page.getByRole("option", { name: `${days} days`, exact: true }).click();
});
When("I save Activity retention", async ({ page }) => {
  const response = waitForServerActionResponse(page, { pathIncludes: "/admin/activity" });
  await page.getByRole("button", { name: "Save retention" }).click();
  await response;
});
When("I request shorter Activity retention", async ({ page }) => {
  await page.getByRole("button", { name: "Save retention" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
});
When("I cancel shorter Activity retention", async ({ page }) => {
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
});
Then("Cancel has initial retention confirmation focus", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
});
Then("saved Activity retention is {int} days after reload", async ({ page }, days: number) => {
  await page.reload();
  await expect(page.getByText(`Saved retention: ${days} days`, { exact: true })).toBeVisible();
});
Then("my retention change event contains no private metadata", async ({ scenario }) => {
  const user = await scenario.ensureCurrentUser();
  await expect
    .poll(async () =>
      withE2EDb((database) =>
        database
          .select()
          .from(activityEvents)
          .where(and(eq(activityEvents.actorId, user.id), eq(activityEvents.type, "retention_changed")))
      )
    )
    .toHaveLength(1);
  const [event] = await withE2EDb((database) =>
    database
      .select()
      .from(activityEvents)
      .where(and(eq(activityEvents.actorId, user.id), eq(activityEvents.type, "retention_changed")))
  );
  expect(event.actorUsername).toBe(user.username);
  expect(event.targetId).toBeNull();
  expect(event.targetUsername).toBeNull();
  expect(event.tripId).toBeNull();
});
When("I choose shorter retention using keyboard", async ({ page }) => {
  await page.getByRole("combobox", { name: "Activity retention" }).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("combobox", { name: "Activity retention" })).toContainText("30 days");
  await page.getByRole("combobox", { name: "Activity retention" }).focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
});
Then("retention confirmation is a mobile bottom sheet", async ({ page }) => {
  const popup = page.getByRole("alertdialog");
  await expect
    .poll(async () => {
      const box = await popup.boundingBox();
      return box ? Math.abs(box.y + box.height - page.viewportSize()!.height) : Infinity;
    })
    .toBeLessThan(2);
  // The dialog zooms in from 95%; measuring mid-animation shrinks controls below their real size.
  await popup.evaluate((element) =>
    Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished))
  );
  for (const control of [
    page.getByRole("button", { name: "Cancel", exact: true }),
    page.getByRole("button", { name: "Confirm retention change" }),
  ])
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});
When("I dismiss retention confirmation using Escape", async ({ page }) => {
  await page.keyboard.press("Escape");
});
Then("retention Save regains focus", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Save retention" })).toBeFocused();
});
When("retention action requests fail", async ({ page }) => {
  await page.route("**/admin/activity**", (route) =>
    route.request().method() === "POST" ? route.abort() : route.continue()
  );
});
When("I attempt to save Activity retention", async ({ page }) => {
  await page.getByRole("button", { name: "Save retention" }).click();
});
Then("retention reports failure and keeps {int} days selected", async ({ page }, days: number) => {
  await expect(page.getByRole("alert").filter({ hasText: "Could not save retention" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Activity retention" })).toContainText(`${days} days`);
  expect((await withE2EDb((database) => database.select().from(instanceState)))[0].activityRetentionDays).toBe(90);
});
Then("retention reports denied authority", async ({ page }) => {
  await expect(page.getByRole("alert").filter({ hasText: "Admin access is required" })).toBeVisible();
});
Given("scenario-owned expired Activity exists", async ({ scenario }) => {
  const user = await scenario.ensureCurrentUser();
  const expired = new Date(Date.now() - 100 * 86_400_000);
  const [event] = await withE2EDb((database) =>
    database
      .insert(activityEvents)
      .values({
        type: "sign_out",
        actorId: user.id,
        actorUsername: user.username,
        startedAt: expired,
        endedAt: expired,
      })
      .returning({ id: activityEvents.id })
  );
  scenario.setValue("retentionExpiredId", event.id);
});
When("I request the dynamic trips page", async ({ page }) => {
  await page.goto("/trips");
});
Then("scenario-owned expired Activity is physically removed", async ({ scenario }) => {
  const id = scenario.getValue<string>("retentionExpiredId")!;
  await expect
    .poll(() => withE2EDb((database) => database.select().from(activityEvents).where(eq(activityEvents.id, id))))
    .toHaveLength(0);
});

// ── Integrated policy-save versus physical-cleanup outcomes ──────────────────────────────────────────────────

Given("scenario-owned Activity aged {int} days exists", async ({ scenario }, days: number) => {
  const user = await scenario.ensureCurrentUser();
  const aged = new Date(Date.now() - days * 86_400_000);
  const [event] = await withE2EDb((database) =>
    database
      .insert(activityEvents)
      .values({ type: "sign_out", actorId: user.id, actorUsername: user.username, startedAt: aged, endedAt: aged })
      .returning({ id: activityEvents.id })
  );
  scenario.setValue("retentionExpiredId", event.id);
});

When("Activity cleanup is blocked", async ({ scenario }) => {
  scenario.setValue(MAINTENANCE_HOLD_KEY, await holdActivityMaintenance());
});

When("Activity cleanup is released", async ({ scenario }) => {
  await scenario.getValue<ActivityMaintenanceHold>(MAINTENANCE_HOLD_KEY)!.release();
});

When("I confirm shorter Activity retention", async ({ page }) => {
  const response = waitForServerActionResponse(page, { pathIncludes: "/admin/activity" });
  await page.getByRole("button", { name: "Confirm retention change" }).click();
  await response;
});

When("I confirm shorter Activity retention without waiting", async ({ page }) => {
  await page.getByRole("button", { name: "Confirm retention change" }).click();
});

When("I refresh cleanup status", async ({ page }) => {
  const response = waitForServerActionResponse(page, { pathIncludes: "/admin/activity" });
  await page.getByRole("button", { name: "Refresh cleanup status" }).click();
  await response;
});

Then("retention saved {int} days is acknowledged", async ({ page }, days: number) => {
  await expect(page.getByRole("status").filter({ hasText: `Retention saved: ${days} days` })).toBeVisible();
});

Then("cleanup status is unavailable", async ({ page }) => {
  await expect(page.getByText("Cleanup status unavailable.", { exact: true })).toBeVisible();
});

Then("cleanup status reports expired Activity pending cleanup", async ({ page }) => {
  await expect(page.getByText(/^Expired activity pending cleanup\. Checked at /)).toBeVisible();
});

Then("cleanup status eventually reports no expired Activity", async ({ page }) => {
  await page.goto("/admin/activity");
  // Other scenarios may hold short-lived expired rows of their own, so ask again until none are left.
  await expect(async () => {
    const response = waitForServerActionResponse(page, { pathIncludes: "/admin/activity" });
    await page.getByRole("button", { name: "Refresh cleanup status" }).click();
    await response;
    await expect(page.getByText(/^No expired activity found at /)).toBeVisible({ timeout: 2_000 });
  }).toPass();
});

async function retentionEventCount(userId: string): Promise<number> {
  const rows = await withE2EDb((database) =>
    database
      .select({ id: activityEvents.id })
      .from(activityEvents)
      .where(and(eq(activityEvents.actorId, userId), eq(activityEvents.type, "retention_changed")))
  );
  return rows.length;
}

Then(
  "Activity retention is still {int} days with {int} retention change events",
  async ({ scenario }, days: number, events: number) => {
    const user = await scenario.ensureCurrentUser();
    expect((await withE2EDb((database) => database.select().from(instanceState)))[0].activityRetentionDays).toBe(days);
    // A wrongly scheduled event lands after the response, so give it time before asserting absence.
    if (events === 0) await new Promise((resolve) => setTimeout(resolve, 500));
    expect(await retentionEventCount(user.id)).toBe(events);
  }
);

Then("the aged Activity row still exists", async ({ scenario }) => {
  const id = scenario.getValue<string>("retentionExpiredId")!;
  expect(
    await withE2EDb((database) => database.select().from(activityEvents).where(eq(activityEvents.id, id)))
  ).toHaveLength(1);
});

Then("Activity retention is saved as {int} days with the aged row still stored", async ({ scenario }, days: number) => {
  const id = scenario.getValue<string>("retentionExpiredId")!;
  expect((await withE2EDb((database) => database.select().from(instanceState)))[0].activityRetentionDays).toBe(days);
  expect(
    await withE2EDb((database) => database.select().from(activityEvents).where(eq(activityEvents.id, id)))
  ).toHaveLength(1);
});

Then("the aged Activity row is still readable in history", async ({ page, scenario }) => {
  const user = await scenario.ensureCurrentUser();
  // Filtered to this account so the 60-day-old row is on the first page of a shared database's history.
  await page.goto(`/admin/activity?actor=${user.id}`);
  await expect(page.getByRole("heading", { name: "Activity", exact: true })).toBeVisible();
  const rows = page
    .getByRole("table", { name: "Recent instance activity" })
    .getByRole("row")
    .filter({ hasText: user.username })
    .filter({ hasText: "Sign-out" });
  await expect(rows).toHaveCount(1);
});
