import { expect, type Locator, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { notes } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { E2E_TRIP_NOTES_REORDER } from "../e2e-seed-data";
import { Given, When, Then } from "../fixtures";
import { waitForServerActionResponse } from "../server-action";

function decodeStepValue(value: string): string {
  return value.replace(/\\n/g, "\n");
}

function reorderHandle(page: Page, name: string) {
  return page.getByTitle(`Reorder ${name}`, { exact: false });
}

// No scrollIntoViewIfNeeded here — these are pure geometry checks, not interactions, and scrolling
// right after a viewport resize (e.g. `page.setViewportSize`) races the layout reflow, occasionally
// throwing "Element is not attached to the DOM". A single evaluate() reads the rect atomically
// instead of resolving the element across two separate round-trips (scroll, then boundingBox).
async function expectControlAtLeast44px(control: Locator): Promise<void> {
  await expect(control).toBeVisible({ timeout: 10_000 });
  const rect = await control.evaluate((element) => element.getBoundingClientRect());
  expect(rect.width).toBeGreaterThanOrEqual(44);
  expect(rect.height).toBeGreaterThanOrEqual(44);
}

Given("I have a trip for trip notes", async ({ scenario }) => {
  await scenario.ensureCurrentTrip();
});

Given("I have pre-seeded reorder notes for the trip", async ({ page, scenario }) => {
  const currentTrip = scenario.currentTrip;
  if (!currentTrip) throw new Error("Current scenario trip is missing.");
  await withE2EDb(async (db) => {
    await db.delete(notes).where(eq(notes.tripId, currentTrip.id));
    await db.insert(notes).values(
      E2E_TRIP_NOTES_REORDER.map((noteSeed) => ({
        tripId: currentTrip.id,
        title: noteSeed.title,
        position: noteSeed.position,
      }))
    );
  });
  await page.goto(page.url());
  await page.waitForURL(/\/trips/);
});

When("I open the Notes tab", async ({ page, scenario }) => {
  await scenario.gotoCurrentTrip(page);
  await page.getByRole("button", { name: "Notes" }).click();
});

When("I activate New Note", async ({ page }) => {
  await page.getByRole("button", { name: "New Note" }).click();
  await expect(page.getByLabel("Note title")).toBeVisible();
});

When("I enter {string} as the note title", async ({ page }, value: string) => {
  await page.getByLabel("Note title").fill(decodeStepValue(value));
});

When("I enter {string} as the note body", async ({ page }, value: string) => {
  await page.getByLabel("Note body").fill(decodeStepValue(value));
});

When("I expand the note titled {string}", async ({ page }, title: string) => {
  const row = page.locator("ol > li").filter({ hasText: title });
  const disclosure = row.locator('button[aria-expanded="false"]');
  await disclosure.click();
  await expect(row.locator('button[aria-expanded="true"]')).toBeVisible();
  await expect(row.getByRole("region")).toBeVisible();
});

When("I replace the note title with {string}", async ({ page }, value: string) => {
  await page.getByLabel("Note title").fill(decodeStepValue(value));
});

When("I replace the note body with {string}", async ({ page }, value: string) => {
  await page.getByLabel("Note body").fill(decodeStepValue(value));
});

When("I collapse the expanded note", async ({ page }) => {
  await page.locator('button[aria-expanded="true"]').click();
  await expect(page.locator('[id^="trip-note-region-"][role="region"]')).toHaveCount(0, { timeout: 10_000 });
});

When("I request deletion of the expanded note titled {string}", async ({ page }, title: string) => {
  await page.getByRole("button", { name: `Delete ${title}` }).click();
});

When("I request deletion of the collapsed note titled {string}", async ({ page }, title: string) => {
  const deleteButton = page.getByRole("button", { name: `Delete ${title}`, exact: true });
  const row = page.locator("ol > li").filter({ has: deleteButton });
  await expect(row.locator('button[aria-expanded="false"]')).toBeVisible();
  await deleteButton.click();
});

When("I confirm note deletion", async ({ page }) => {
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 10_000 });
});

When("I cancel note deletion", async ({ page }) => {
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 10_000 });
});

When("I close the note editor", async ({ page }) => {
  await page.getByRole("button", { name: "Notes" }).click();
  await expect(page.getByLabel("Note title")).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByRole("button", { name: "New Note", exact: true })).toBeVisible({ timeout: 10_000 });
});

When("I set the Notes viewport to 320 CSS pixels wide", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
});

When("I resize Notes text to 200 percent", async ({ page }) => {
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--font-scale", "2");
  });
});

Then("the Notes empty state is visible", async ({ page }) => {
  await expect(page.getByText("No notes yet")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "New Note" })).toBeVisible({ timeout: 10_000 });
});

Then("no note capture bar is visible", async ({ page }) => {
  await expect(page.getByLabel("Note title")).toHaveCount(0);
});

Then(
  "the note editor shows title {string} and body {string} in place",
  async ({ page }, title: string, body: string) => {
    await expect(page.getByLabel("Note title")).toHaveValue(decodeStepValue(title));
    await expect(page.getByLabel("Note body")).toHaveValue(decodeStepValue(body));
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveURL(/\/trips\/[^/]+$/);
  }
);

Then("only the note titled {string} is expanded", async ({ page }, title: string) => {
  const row = page.locator("ol > li").filter({ hasText: title });
  await expect(page.locator('button[aria-expanded="true"]')).toHaveCount(1);
  await expect(page.locator('[id^="trip-note-region-"][role="region"]')).toHaveCount(1);
  await expect(row.locator('button[aria-expanded="true"]')).toBeVisible();
  await expect(page.getByLabel("Note title")).toHaveValue(title);
  await expect(page.getByLabel("Note title")).toBeFocused();
});

Then("the note delete confirmation is visible with Cancel focused", async ({ page }) => {
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
});

Then(
  "the note titled {string} is absent and the disclosure for {string} is focused",
  async ({ page }, removedTitle: string, expectedTitle: string) => {
    await expect(page.locator("ol > li").filter({ hasText: removedTitle })).toHaveCount(0, { timeout: 10_000 });
    const expectedRow = page.locator("ol > li").filter({ hasText: expectedTitle });
    await expect(expectedRow.locator('button[id^="trip-note-disclosure-"]')).toBeFocused();
  }
);

Then("the expanded note titled {string} remains and its Trash action is focused", async ({ page }, title: string) => {
  await expect(page.getByRole("button", { name: `Collapse ${title}` })).toBeVisible();
  await expect(page.getByRole("button", { name: `Delete ${title}` })).toBeFocused();
});

Then("the expanded note disclosure measures at least 44 by 44 pixels", async ({ page }) => {
  await expectControlAtLeast44px(page.locator('button[aria-expanded="true"]'));
});

Then("the Notes tab and New Note controls measure at least 44 by 44 pixels", async ({ page }) => {
  await expectControlAtLeast44px(page.getByRole("button", { name: "Notes", exact: true }));
  await expectControlAtLeast44px(page.getByRole("button", { name: "New Note", exact: true }));
});

Then("the Notes panel has no horizontal scrolling", async ({ page }) => {
  const notesList = page.locator("ol");
  await expect(notesList).toBeVisible();
  const widths = await notesList.evaluate((element) => {
    const panel = element.parentElement;
    return {
      listClientWidth: element.clientWidth,
      listScrollWidth: element.scrollWidth,
      panelClientWidth: panel?.clientWidth ?? 0,
      panelScrollWidth: panel?.scrollWidth ?? 0,
    };
  });
  expect(widths.listScrollWidth).toBeLessThanOrEqual(widths.listClientWidth);
  expect(widths.panelScrollWidth).toBeLessThanOrEqual(widths.panelClientWidth);
});

Then(
  "a note row titled {string} with preview {string} is at the top of the notes list",
  async ({ page }, title: string, preview: string) => {
    const firstRow = page.locator("ol li").first();
    await expect(firstRow).toContainText(title, { timeout: 10_000 });
    await expect(firstRow).toContainText(preview);
  }
);

Then("the notes list shows, in order, {string}, {string}", async ({ page }, first: string, second: string) => {
  const rows = page.locator("ol li");
  await expect(rows).toHaveCount(2, { timeout: 10_000 });
  await expect(rows.nth(0)).toContainText(first);
  await expect(rows.nth(1)).toContainText(second);
});

Then(
  "the notes list shows, in order, {string}, {string}, {string}",
  async ({ page }, first: string, second: string, third: string) => {
    const rows = page.locator("ol li");
    await expect(rows).toHaveCount(3, { timeout: 10_000 });
    await expect(rows.nth(0)).toContainText(first);
    await expect(rows.nth(1)).toContainText(second);
    await expect(rows.nth(2)).toContainText(third);
  }
);

When(
  "I pointer-drag the note {string} onto the note {string}",
  async ({ page }, sourceName: string, targetName: string) => {
    const handle = reorderHandle(page, sourceName);
    const targetRow = page.locator("ol > li").filter({ hasText: targetName });
    await expect(handle).toBeVisible({ timeout: 10_000 });
    await handle.scrollIntoViewIfNeeded();

    async function performDrag(): Promise<void> {
      const source = await handle.boundingBox();
      const dest = await targetRow.boundingBox();
      if (!source || !dest) throw new Error(`Could not measure drag source/target for ${sourceName}`);

      await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
      await page.mouse.down();
      // PointerSensor needs a move past its 5px activation distance before tracking.
      await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2 + 8, { steps: 4 });
      await page.mouse.move(dest.x + dest.width / 2, dest.y + dest.height / 2, { steps: 12 });
      await page.waitForTimeout(80);
      await page.mouse.move(dest.x + dest.width / 2, dest.y + dest.height / 2, { steps: 4 });
      await page.waitForTimeout(60);

      // The drop fires the reorderTripNotes server action. Wait for that POST to resolve — the
      // transaction commits and revalidatePath runs before the response returns — so a later
      // reload cannot out-race persistence.
      const reorderResponse = waitForServerActionResponse(page, { pathIncludes: "/trips/" });
      await page.mouse.up();
      await reorderResponse;
    }

    await performDrag();
  }
);

When("I keyboard-move the note {string} down one position", async ({ page }, name: string) => {
  const handle = reorderHandle(page, name);
  await expect(handle).toBeVisible({ timeout: 10_000 });
  await handle.focus();
  await expect(handle).toBeFocused();

  await handle.press("Space");
  await handle.press("ArrowDown");

  // Enter drops the item, firing the reorder server action. Wait for that POST to resolve —
  // the transaction commits and revalidatePath runs before the response returns — so a later
  // reload cannot out-race persistence. Not required — a move that registers as a no-op fires no
  // POST, and the caller falls through to the position check.
  const reorderResponse = waitForServerActionResponse(page, { pathIncludes: "/trips/", required: false });
  await handle.press("Enter");
  await reorderResponse;
});

When("I lift the note {string} for keyboard reordering", async ({ page }, name: string) => {
  const handle = reorderHandle(page, name);
  await expect(handle).toBeVisible({ timeout: 10_000 });
  await handle.focus();
  await expect(handle).toBeFocused();
  await handle.press("Space");
});

When("I press Escape to cancel the reorder", async ({ page }) => {
  await page.keyboard.press("Escape");
});

When("I reload the Notes tab", async ({ page }) => {
  await page.reload();
  await page.waitForURL(/\/trips\/.+/);
  await page.getByRole("button", { name: "Notes" }).click();
});

Then("the reorder handle for {string} measures at least 44 by 44 pixels", async ({ page }, name: string) => {
  await expectControlAtLeast44px(reorderHandle(page, name));
});
