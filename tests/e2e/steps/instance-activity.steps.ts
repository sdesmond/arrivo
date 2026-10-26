import { expect } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { activityEvents, users } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { Given, When, Then } from "../fixtures";
import type { ScenarioUserRecord } from "../scenario-fixture";

// Also uses "I am signed in as an instance {string}" and "instance management is not found" from
// account-menu.steps.ts, and the sign-in / code steps from mfa.steps.ts.

Given("the current account is an instance admin", async ({ scenario }) => {
  await scenario.ensureCurrentUser({ user: { role: "admin" } });
});

When("I open the instance Activity page", async ({ page }) => {
  await page.goto("/admin/activity");
  await expect(page.getByRole("heading", { name: "Activity", exact: true })).toBeVisible();
});

When("I refresh the page", async ({ page }) => {
  await page.reload();
});

Then("the Activity table lists a Sign-in row for me", async ({ page, scenario }) => {
  const user = await scenario.ensureCurrentUser();
  const table = page.getByRole("table", { name: "Recent instance activity" });
  // The row is written after the sign-in response, so it can land just after the first load.
  await expect(async () => {
    await page.reload();
    await expect(table.getByRole("row").filter({ hasText: user.username }).filter({ hasText: "Sign-in" })).toHaveCount(
      1
    );
  }).toPass();
});

async function signInCount(userId: string): Promise<number> {
  const rows = await withE2EDb((database) =>
    database
      .select({ id: activityEvents.id })
      .from(activityEvents)
      .where(and(eq(activityEvents.actorId, userId), eq(activityEvents.type, "sign_in")))
  );
  return rows.length;
}

Then("my account has {int} recorded sign-ins", async ({ scenario }, count: number) => {
  const user = await scenario.ensureCurrentUser();
  if (count === 0) {
    // Nothing to wait for; give a wrongly-scheduled write time to show up before asserting absence.
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(await signInCount(user.id)).toBe(0);
    return;
  }
  await expect.poll(() => signInCount(user.id)).toBe(count);
});

Given("that member signed in and then had their account deleted", async ({ scenario }) => {
  const member = scenario.getValue<ScenarioUserRecord>("instanceMember")!;
  const now = new Date();
  await withE2EDb(async (database) => {
    await database.insert(activityEvents).values({
      type: "sign_in",
      startedAt: now,
      endedAt: now,
      actorId: member.id,
      actorUsername: member.username,
    });
    await database.delete(users).where(eq(users.id, member.id));
  });
});

Then("the Activity table lists a Sign-in row for that deleted member", async ({ page, scenario }) => {
  const member = scenario.getValue<ScenarioUserRecord>("instanceMember")!;
  const table = page.getByRole("table", { name: "Recent instance activity" });
  await expect(table.getByRole("row").filter({ hasText: member.username }).filter({ hasText: "Sign-in" })).toHaveCount(
    1
  );
});
