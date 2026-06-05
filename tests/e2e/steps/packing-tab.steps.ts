import { expect, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { packingItems } from "../../../src/db/schema";
import { type E2EDb, withE2EDb } from "../e2e-db";
import {
  E2E_PACKING_CONTEXTUAL_ADD_ITEMS,
  E2E_PACKING_DELETE_LABEL_ITEMS,
  E2E_PACKING_DRAG_EMPTY_UNGROUPED,
  E2E_PACKING_DRAG_ITEMS,
  E2E_PACKING_DRAG_TWO_SECTIONS,
  E2E_PACKING_INLINE_EDIT_ITEMS,
  E2E_PACKING_ITEMS,
  E2E_PACKING_ITEMS_WITH_LABELS,
  E2E_PACKING_RENAME_LABEL_ITEMS,
  E2E_PACKING_REORDER_ITEMS,
  E2E_PACKING_STRIKETHROUGH_ITEMS,
} from "../e2e-seed-data";
import { Given, Then, When } from "../fixtures";

async function openPackingTab(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Packing" }).click();
  await expect(page.getByRole("button", { name: "Add item", exact: true })).toBeVisible({ timeout: 10_000 });
}

// Insert one packing item and return its generated id. Wrapped to give an
// explicit return type — the self-referential labelId FK otherwise sends
// `.returning()` into circular type inference.
async function insertPackingItem(
  db: E2EDb,
  values: {
    tripId: string;
    name: string;
    isLabel: boolean;
    done: boolean;
    position: number;
    labelId: string | null;
  }
): Promise<string> {
  const rows = (await db.insert(packingItems).values(values).returning({ id: packingItems.id })) as { id: string }[];
  return rows[0].id;
}

async function seedPackingItems(db: E2EDb, tripId: string, itemsToSeed: typeof E2E_PACKING_ITEMS): Promise<void> {
  await db.delete(packingItems).where(eq(packingItems.tripId, tripId));
  // Positional grouping: each non-label item joins the most recent label.
  let currentLabelId: string | null = null;
  for (const item of itemsToSeed) {
    const id = await insertPackingItem(db, { ...item, tripId, labelId: item.isLabel ? null : currentLabelId });
    if (item.isLabel) currentLabelId = id;
  }
}

type GroupedSeedItem = { name: string; isLabel: boolean; done: boolean; position: number; under?: string };

// Explicit grouping: `under` links a non-label item to its section label by name;
// items without `under` are ungrouped. Lets us seed ungrouped items that sort
// after a section.
async function seedGroupedPackingItems(db: E2EDb, tripId: string, itemsToSeed: GroupedSeedItem[]): Promise<void> {
  await db.delete(packingItems).where(eq(packingItems.tripId, tripId));
  const labelIdsByName = new Map<string, string>();
  for (const item of itemsToSeed) {
    const labelId = item.under ? (labelIdsByName.get(item.under) ?? null) : null;
    const id = await insertPackingItem(db, {
      name: item.name,
      isLabel: item.isLabel,
      done: item.done,
      position: item.position,
      tripId,
      labelId: item.isLabel ? null : labelId,
    });
    if (item.isLabel) labelIdsByName.set(item.name, id);
  }
}

async function dragItemOntoTarget(page: Page, sourceName: string, target: ReturnType<Page["locator"]>): Promise<void> {
  const handle = page.getByTitle(`Reorder ${sourceName}`);
  await expect(handle).toBeVisible({ timeout: 10_000 });
  // The drag source must be inside the viewport: mouse.down() fires at raw page
  // coordinates with no auto-scroll, so an off-screen handle never receives the
  // pointerdown and the PointerSensor never activates. Scroll it into view and
  // re-measure both points (the target sits close enough to share the viewport).
  await handle.scrollIntoViewIfNeeded();
  const source = await handle.boundingBox();
  const dest = await target.boundingBox();
  if (!source || !dest) throw new Error(`Could not measure drag source/target for ${sourceName}`);

  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  // PointerSensor needs a move past its 5px activation distance before tracking.
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2 + 8, { steps: 4 });
  await page.mouse.move(dest.x + dest.width / 2, dest.y + dest.height / 2, { steps: 12 });

  // The live cross-container preview (onDragOver) reparents the dragged item,
  // which reflows the layout and moves the target out from under the cursor.
  // Re-hover the target a few times so the final position lands on a real `over`
  // even as the list settles, then release.
  let lastBox = dest;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.waitForTimeout(80);
    const box = await target.boundingBox();
    if (!box) {
      await page.waitForTimeout(100);
      continue;
    }
    lastBox = box;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 6 });
  }
  await page.mouse.move(lastBox.x + lastBox.width / 2, lastBox.y + lastBox.height / 2, { steps: 3 });
  await page.waitForTimeout(60);
  await page.mouse.up();
}

async function dragItemIntoUngroupedArea(page: Page, sourceName: string): Promise<void> {
  const handle = page.getByTitle(`Reorder ${sourceName}`);
  const ungrouped = page.locator('[data-packing-container="container:__ungrouped__"]');
  await expect(handle).toBeVisible({ timeout: 10_000 });
  await expect(ungrouped).toBeVisible({ timeout: 10_000 });
  await handle.scrollIntoViewIfNeeded();

  const source = await handle.boundingBox();
  const destination = await ungrouped.boundingBox();
  if (!source || !destination) {
    throw new Error(`Could not measure Ungrouped drop area for ${sourceName}`);
  }

  const targetX = destination.x + destination.width / 2;
  const targetY = destination.y + Math.max(destination.height - 16, destination.height / 2);

  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2 + 8, { steps: 4 });
  await page.mouse.move(targetX, targetY, { steps: 18 });

  let lastDropX = targetX;
  let lastDropY = targetY;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.waitForTimeout(80);
    const box = await ungrouped.boundingBox();
    if (!box) {
      await page.waitForTimeout(100);
      continue;
    }
    lastDropX = box.x + box.width / 2;
    lastDropY = box.y + Math.max(box.height - 16, box.height / 2);
    await page.mouse.move(lastDropX, lastDropY, { steps: 6 });
  }
  await page.mouse.move(lastDropX, lastDropY, { steps: 3 });

  await page.waitForTimeout(60);
  await page.mouse.up();
}

When("I open the Packing tab", async ({ page }) => {
  await openPackingTab(page);
});

Then("I should see the empty packing state", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Your packing list is empty" })).toBeVisible();
});

When("I add a packing item named {string}", async ({ page }, name: string) => {
  await page.getByRole("textbox", { name: "Packing item name" }).fill(name);
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await expect(page.locator('[data-packing-kind="item"]').filter({ hasText: name }).first()).toBeVisible({
    timeout: 10_000,
  });
});

When("I add a packing label named {string}", async ({ page }, name: string) => {
  await page.getByRole("textbox", { name: "Packing item name" }).fill(name);
  await page.getByRole("button", { name: "Add label" }).click();
  await expect(page.locator('[data-packing-kind="label"]').filter({ hasText: name }).first()).toBeVisible({
    timeout: 10_000,
  });
});

Then("the packing list should contain {string}", async ({ page }, name: string) => {
  await expect(page.locator("[data-packing-kind]").filter({ hasText: name }).first()).toBeVisible();
});

Then("the packing list should show the label {string}", async ({ page }, name: string) => {
  const labelRow = page.locator('[data-packing-kind="label"]').filter({ hasText: name }).first();
  await expect(labelRow).toBeVisible();
  await expect(labelRow.getByRole("heading", { name })).toBeVisible();
});

When("I delete the packing entry named {string}", async ({ page }, name: string) => {
  await page
    .getByRole("button", { name: `Remove ${name}` })
    .first()
    .click();
  await expect(page.locator("[data-packing-kind]").filter({ hasText: name })).toHaveCount(0, { timeout: 10_000 });
});

Then("the packing list should not contain {string}", async ({ page }, name: string) => {
  await expect(page.locator("[data-packing-kind]").filter({ hasText: name })).toHaveCount(0);
});

When("I reload the trip page", async ({ page }) => {
  await page.reload();
  await page.waitForURL(/\/trips\/.+/);
  await openPackingTab(page);
});

Then(
  "the packing list order should be {string} then {string} then {string}",
  async ({ page }, first: string, second: string, third: string) => {
    await expect(async () => {
      const names = await page.locator("[data-packing-name]").allTextContents();
      expect(names.map((name) => name.trim())).toEqual([first, second, third]);
    }).toPass({ timeout: 10_000 });
  }
);

Given("I have pre-seeded packing items for the trip", async ({ page, scenario }) => {
  const currentTrip = scenario.currentTrip;
  if (!currentTrip) throw new Error("Current scenario trip is missing.");
  await withE2EDb(async (db) => {
    await seedPackingItems(db, currentTrip.id, E2E_PACKING_ITEMS);
  });
  await page.goto(page.url());
  await page.waitForURL(/\/trips/);
});

Given("I have pre-seeded packing items with labels for the trip", async ({ page, scenario }) => {
  const currentTrip = scenario.currentTrip;
  if (!currentTrip) throw new Error("Current scenario trip is missing.");
  await withE2EDb(async (db) => {
    await seedPackingItems(db, currentTrip.id, E2E_PACKING_ITEMS_WITH_LABELS);
  });
  await page.goto(page.url());
  await page.waitForURL(/\/trips/);
});

Given("I have pre-seeded packing reorder items for the trip", async ({ page, scenario }) => {
  const currentTrip = scenario.currentTrip;
  if (!currentTrip) throw new Error("Current scenario trip is missing.");
  await withE2EDb(async (db) => {
    await seedPackingItems(db, currentTrip.id, E2E_PACKING_REORDER_ITEMS);
  });
  await page.goto(page.url());
  await page.waitForURL(/\/trips/);
});

Given("the packing item {string} is already checked", async ({ page, scenario }, name: string) => {
  const currentTrip = scenario.currentTrip;
  if (!currentTrip) throw new Error("Current scenario trip is missing.");
  await withE2EDb(async (db) => {
    await db
      .update(packingItems)
      .set({ done: true })
      .where(and(eq(packingItems.tripId, currentTrip.id), eq(packingItems.name, name)));
  });
  await page.goto(page.url());
  await page.waitForURL(/\/trips/);
});

When("I check the packing item named {string}", async ({ page }, name: string) => {
  await page.getByRole("checkbox", { name: `Pack ${name}` }).click();
  await expect(page.getByRole("checkbox", { name: `Pack ${name}` })).toHaveAttribute("aria-checked", "true", {
    timeout: 10_000,
  });
});

When("I uncheck the packing item named {string}", async ({ page }, name: string) => {
  await page.getByRole("checkbox", { name: `Pack ${name}` }).click();
  await expect(page.getByRole("checkbox", { name: `Pack ${name}` })).toHaveAttribute("aria-checked", "false", {
    timeout: 10_000,
  });
});

When("I keyboard-move the item {string} down one position", async ({ page }, name: string) => {
  const dragHandle = page.getByTitle(`Reorder ${name}`);
  await expect(dragHandle).toBeVisible();
  await dragHandle.focus();

  // dnd-kit's KeyboardSensor only starts listening for arrow keys once the
  // drag-start has committed (and the droppable rects are measured). Firing
  // ArrowDown before that leaves the move computing against itself, so the item
  // is "dropped over" its own position and nothing reorders — the sporadic
  // failure. Gate the keys on dnd-kit's live region: it announces a pickup, then
  // immediately an over-self ("...moved over droppable area {sameId}"). Wait for
  // that active state, then for ArrowDown to move the item over a *different*
  // droppable before committing with Enter.
  const liveRegion = page.getByRole("status").filter({ hasText: "draggable item" });

  await page.keyboard.press("Space");
  await expect(liveRegion).toContainText("was moved over", { timeout: 10_000 });
  const pickupText = (await liveRegion.textContent()) ?? "";
  const activeId = pickupText.match(/[0-9a-f-]{36}/i)?.[0] ?? "";

  await page.keyboard.press("ArrowDown");
  await expect(liveRegion).not.toContainText(`area ${activeId}`, { timeout: 10_000 });

  await page.keyboard.press("Enter");
});

Then("the packing item {string} should be at position {int}", async ({ page }, name: string, expectedIndex: number) => {
  await expect(async () => {
    const names = await page.locator("[data-packing-name]").allTextContents();
    const index = names.map((itemName) => itemName.trim()).indexOf(name);
    expect(index).toBe(expectedIndex);
  }).toPass({ timeout: 10_000 });
});

Then("the packing item {string} should be checked", async ({ page }, name: string) => {
  await expect(page.getByRole("checkbox", { name: `Pack ${name}` })).toHaveAttribute("aria-checked", "true");
});

Then("the packing item {string} should be unchecked", async ({ page }, name: string) => {
  await expect(page.getByRole("checkbox", { name: `Pack ${name}` })).toHaveAttribute("aria-checked", "false");
});

// ── Story 1.4 — Strikethrough seeds & steps ──────────────────────────────────

Given("I have pre-seeded packing items with label and items for strikethrough", async ({ page, scenario }) => {
  const currentTrip = scenario.currentTrip;
  if (!currentTrip) throw new Error("Current scenario trip is missing.");
  await withE2EDb(async (db) => {
    await seedPackingItems(db, currentTrip.id, E2E_PACKING_STRIKETHROUGH_ITEMS);
  });
  await page.goto(page.url());
  await page.waitForURL(/\/trips/);
});

Then("the section label {string} should not have strikethrough", async ({ page }, name: string) => {
  const heading = page.getByRole("heading", { name });
  await expect(heading).toBeVisible();
  await expect(heading).not.toHaveClass(/line-through/);
});

Then("the section label {string} should have strikethrough", async ({ page }, name: string) => {
  const heading = page.getByRole("heading", { name });
  await expect(heading).toBeVisible();
  await expect(heading).toHaveClass(/line-through/, { timeout: 10_000 });
});

// ── Story 1.4 — Contextual add seeds & steps ─────────────────────────────────

Given("I have pre-seeded packing items for contextual add", async ({ page, scenario }) => {
  const currentTrip = scenario.currentTrip;
  if (!currentTrip) throw new Error("Current scenario trip is missing.");
  await withE2EDb(async (db) => {
    await seedPackingItems(db, currentTrip.id, E2E_PACKING_CONTEXTUAL_ADD_ITEMS);
  });
  await page.goto(page.url());
  await page.waitForURL(/\/trips/);
});

When("I add an item {string} under the section {string}", async ({ page }, itemName: string, sectionName: string) => {
  const input = page.getByPlaceholder(`add to ${sectionName}`);
  await expect(input).toBeVisible({ timeout: 10_000 });
  await input.fill(itemName);
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-packing-kind="item"]').filter({ hasText: itemName }).first()).toBeVisible({
    timeout: 10_000,
  });
});

When("I add an ungrouped item named {string}", async ({ page }, itemName: string) => {
  const input = page.getByPlaceholder("Add item…");
  await expect(input).toBeVisible({ timeout: 10_000 });
  await input.fill(itemName);
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-packing-kind="item"]').filter({ hasText: itemName }).first()).toBeVisible({
    timeout: 10_000,
  });
});

Then("{string} should appear after {string} in the list", async ({ page }, afterName: string, beforeName: string) => {
  await expect(async () => {
    const names = await page.locator("[data-packing-name]").allTextContents();
    const trimmed = names.map((name) => name.trim());
    const beforeIdx = trimmed.indexOf(beforeName);
    const afterIdx = trimmed.indexOf(afterName);
    expect(beforeIdx).toBeGreaterThanOrEqual(0);
    expect(afterIdx).toBeGreaterThan(beforeIdx);
  }).toPass({ timeout: 10_000 });
});

// ── Story 1.4 — Inline edit seeds & steps ────────────────────────────────────

Given("I have pre-seeded packing items for inline editing", async ({ page, scenario }) => {
  const currentTrip = scenario.currentTrip;
  if (!currentTrip) throw new Error("Current scenario trip is missing.");
  await withE2EDb(async (db) => {
    await seedPackingItems(db, currentTrip.id, E2E_PACKING_INLINE_EDIT_ITEMS);
  });
  await page.goto(page.url());
  await page.waitForURL(/\/trips/);
});

When("I rename the packing item {string} to {string}", async ({ page }, oldName: string, newName: string) => {
  const nameEl = page.locator("[data-packing-name]").filter({ hasText: oldName }).first();
  await expect(nameEl).toBeVisible({ timeout: 10_000 });
  await nameEl.click();
  const input = page.locator(`input[value="${oldName}"]`);
  await expect(input).toBeVisible({ timeout: 5_000 });
  await input.fill(newName);
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-packing-name]").filter({ hasText: newName }).first()).toBeVisible({
    timeout: 10_000,
  });
});

Then("the packing item {string} should be visible", async ({ page }, name: string) => {
  await expect(page.locator('[data-packing-kind="item"]').filter({ hasText: name }).first()).toBeVisible();
});

// ── Story 1.4 — Rename label seeds & steps ───────────────────────────────────

Given("I have pre-seeded a section label for renaming", async ({ page, scenario }) => {
  const currentTrip = scenario.currentTrip;
  if (!currentTrip) throw new Error("Current scenario trip is missing.");
  await withE2EDb(async (db) => {
    await seedPackingItems(db, currentTrip.id, E2E_PACKING_RENAME_LABEL_ITEMS);
  });
  await page.goto(page.url());
  await page.waitForURL(/\/trips/);
});

When("I rename the section label {string} to {string}", async ({ page }, oldName: string, newName: string) => {
  const heading = page.getByRole("heading", { name: oldName });
  await expect(heading).toBeVisible({ timeout: 10_000 });
  await heading.click();
  const input = page.locator(`input[value="${oldName}"]`);
  await expect(input).toBeVisible({ timeout: 5_000 });
  await input.fill(newName);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: newName })).toBeVisible({ timeout: 10_000 });
});

Then("the section label {string} should be visible", async ({ page }, name: string) => {
  await expect(page.getByRole("heading", { name })).toBeVisible();
});

// ── Story 1.4 — Delete label seeds & steps ───────────────────────────────────

Given("I have pre-seeded a section label with items beneath it", async ({ page, scenario }) => {
  const currentTrip = scenario.currentTrip;
  if (!currentTrip) throw new Error("Current scenario trip is missing.");
  await withE2EDb(async (db) => {
    await seedPackingItems(db, currentTrip.id, E2E_PACKING_DELETE_LABEL_ITEMS);
  });
  await page.goto(page.url());
  await page.waitForURL(/\/trips/);
});

async function openSectionDeleteDialog(page: Page, name: string): Promise<void> {
  const heading = page.getByRole("heading", { name });
  await expect(heading).toBeVisible({ timeout: 10_000 });
  await heading.click();
  const deleteBtn = page.getByRole("button", { name: "Delete label" });
  await expect(deleteBtn).toBeVisible({ timeout: 5_000 });
  await deleteBtn.click();
  await expect(page.getByText(`Delete ${name}?`)).toBeVisible({ timeout: 5_000 });
}

When("I delete the section label {string} and move its items to Ungrouped", async ({ page }, name: string) => {
  await openSectionDeleteDialog(page, name);
  await page.getByRole("button", { name: "Move items to Ungrouped" }).click();
  await expect(page.locator('[data-packing-kind="label"]').filter({ hasText: name })).toHaveCount(0, {
    timeout: 10_000,
  });
});

When("I delete the section label {string} and its items", async ({ page }, name: string) => {
  await openSectionDeleteDialog(page, name);
  await page.getByRole("button", { name: "Delete section and items" }).click();
  await expect(page.locator('[data-packing-kind="label"]').filter({ hasText: name })).toHaveCount(0, {
    timeout: 10_000,
  });
});

Then("the section label {string} should not be visible", async ({ page }, name: string) => {
  await expect(page.locator('[data-packing-kind="label"]').filter({ hasText: name })).toHaveCount(0);
});

// ── Drag-and-drop regression seeds & steps ───────────────────────────────────

Given("I have pre-seeded a section with items and ungrouped items", async ({ page, scenario }) => {
  const currentTrip = scenario.currentTrip;
  if (!currentTrip) throw new Error("Current scenario trip is missing.");
  await withE2EDb(async (db) => {
    await seedGroupedPackingItems(db, currentTrip.id, E2E_PACKING_DRAG_ITEMS);
  });
  await page.goto(page.url());
  await page.waitForURL(/\/trips/);
});

Given("I have pre-seeded a section with no ungrouped items", async ({ page, scenario }) => {
  const currentTrip = scenario.currentTrip;
  if (!currentTrip) throw new Error("Current scenario trip is missing.");
  await withE2EDb(async (db) => {
    await seedGroupedPackingItems(db, currentTrip.id, E2E_PACKING_DRAG_EMPTY_UNGROUPED);
  });
  await page.goto(page.url());
  await page.waitForURL(/\/trips/);
});

Given("I have pre-seeded two packing sections", async ({ page, scenario }) => {
  const currentTrip = scenario.currentTrip;
  if (!currentTrip) throw new Error("Current scenario trip is missing.");
  await withE2EDb(async (db) => {
    await seedGroupedPackingItems(db, currentTrip.id, E2E_PACKING_DRAG_TWO_SECTIONS);
  });
  await page.goto(page.url());
  await page.waitForURL(/\/trips/);
});

When("I drag the packing item {string} into the Ungrouped area", async ({ page }, name: string) => {
  await dragItemIntoUngroupedArea(page, name);
});

When("I pointer-drag the packing item {string} into the Ungrouped area", async ({ page }, name: string) => {
  await dragItemIntoUngroupedArea(page, name);
});

When(
  "I drag the packing item {string} onto the packing item {string}",
  async ({ page }, name: string, target: string) => {
    const targetRow = page.locator('[data-packing-kind="item"]').filter({ hasText: target }).first();
    await dragItemOntoTarget(page, name, targetRow);
  }
);

When(
  "I pointer-drag the packing item {string} onto the packing item {string}",
  async ({ page }, name: string, target: string) => {
    const targetRow = page.locator('[data-packing-kind="item"]').filter({ hasText: target }).first();
    await dragItemOntoTarget(page, name, targetRow);
  }
);

Then("the packing item {string} should be in the Ungrouped section", async ({ page }, name: string) => {
  const ungrouped = page.locator('[data-packing-container="container:__ungrouped__"]');
  await expect(async () => {
    await expect(ungrouped.locator('[data-packing-kind="item"]').filter({ hasText: name })).toHaveCount(1);
  }).toPass({ timeout: 10_000 });
});

Then("the packing item {string} should be in the {string} section", async ({ page }, name: string, section: string) => {
  const sectionContainer = page
    .locator("[data-packing-container]")
    .filter({ has: page.getByRole("heading", { name: section }) });
  await expect(async () => {
    await expect(sectionContainer.locator('[data-packing-kind="item"]').filter({ hasText: name })).toHaveCount(1);
  }).toPass({ timeout: 10_000 });
});

Then("the section {string} should have no items", async ({ page }, section: string) => {
  const sectionContainer = page
    .locator("[data-packing-container]")
    .filter({ has: page.getByRole("heading", { name: section }) });
  await expect(sectionContainer.locator('[data-packing-kind="item"]')).toHaveCount(0);
});

Then("the trip card for {string} should show {string}", async ({ page }, tripName: string, progress: string) => {
  const card = page.locator("a").filter({ hasText: tripName }).first();
  await expect(card).toContainText(progress);
});

When("I open the trip and go to the Packing tab", async ({ page, scenario }) => {
  const tripName = scenario.currentTrip?.name;
  if (!tripName) throw new Error("Current scenario trip is missing.");
  const tripLink = page.locator("a").filter({ hasText: tripName }).first();
  await tripLink.click();
  await page.waitForURL(/\/trips\/.+/);
  await openPackingTab(page);
});

When("I return to the trips list", async ({ page }) => {
  await page.locator("#main-content").getByRole("link", { name: "Trips" }).click();
  await page.waitForURL("/trips");
});
