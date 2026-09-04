import { expect, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { packingItems, tripPackingLists } from "../../../src/db/schema";
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
  // Wait for packing library to render — "New List" always appears (empty or populated)
  await expect(page.getByRole("button", { name: "New List" })).toBeVisible({ timeout: 10_000 });

  // Named list present → navigate into the first one so item-level steps work
  const firstRenameBtn = page.getByRole("button", { name: /^Rename "/ }).first();
  if (await firstRenameBtn.isVisible({ timeout: 500 }).catch(() => false)) {
    const ariaLabel = (await firstRenameBtn.getAttribute("aria-label")) ?? "";
    const listName = ariaLabel.replace(/^Rename "/, "").replace(/"$/, "");
    if (listName) {
      await page.getByText(listName, { exact: true }).first().click();
      await expect(page.getByRole("button", { name: "List options" })).toBeVisible({ timeout: 10_000 });
    }
  }
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
    listId: string | null;
  }
): Promise<string> {
  const rows = (await db.insert(packingItems).values(values).returning({ id: packingItems.id })) as { id: string }[];
  return rows[0].id;
}

async function createMainList(db: E2EDb, tripId: string): Promise<string> {
  await db.delete(tripPackingLists).where(eq(tripPackingLists.tripId, tripId));
  const rows = (await db
    .insert(tripPackingLists)
    .values({ tripId, name: "Main", position: 0 })
    .returning({ id: tripPackingLists.id })) as { id: string }[];
  if (!rows[0]) throw new Error("Failed to create packing list for seeding");
  return rows[0].id;
}

async function seedPackingItems(db: E2EDb, tripId: string, itemsToSeed: typeof E2E_PACKING_ITEMS): Promise<void> {
  await db.delete(packingItems).where(eq(packingItems.tripId, tripId));
  const listId = await createMainList(db, tripId);
  // Positional grouping: each non-label item joins the most recent label.
  let currentLabelId: string | null = null;
  for (const item of itemsToSeed) {
    const id = await insertPackingItem(db, { ...item, tripId, labelId: item.isLabel ? null : currentLabelId, listId });
    if (item.isLabel) currentLabelId = id;
  }
}

type GroupedSeedItem = { name: string; isLabel: boolean; done: boolean; position: number; under?: string };

// Explicit grouping: `under` links a non-label item to its section label by name;
// items without `under` are ungrouped. Lets us seed ungrouped items that sort
// after a section.
async function seedGroupedPackingItems(db: E2EDb, tripId: string, itemsToSeed: GroupedSeedItem[]): Promise<void> {
  await db.delete(packingItems).where(eq(packingItems.tripId, tripId));
  const listId = await createMainList(db, tripId);
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
      listId,
    });
    if (item.isLabel) labelIdsByName.set(item.name, id);
  }
}

async function dragItemOntoTarget(page: Page, sourceName: string, target: ReturnType<Page["locator"]>): Promise<void> {
  const targetContainer = target.locator("xpath=ancestor::*[@data-packing-container][1]");
  const sourceInTarget = targetContainer.locator('[data-packing-kind="item"]').filter({ hasText: sourceName });

  async function performDrag(): Promise<void> {
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

  await performDrag();

  if ((await sourceInTarget.count()) === 1) {
    return;
  }

  await page.waitForTimeout(120);
  await performDrag();
}

async function dragItemOntoUngrouped(page: Page, sourceName: string): Promise<void> {
  const handle = page.getByTitle(`Reorder ${sourceName}`);
  const ungrouped = page.locator('[data-packing-container="container:__ungrouped__"]');
  const emptyDropzone = ungrouped.locator("[data-packing-empty-dropzone]");
  const addItemInput = ungrouped.getByPlaceholder("Add item…");
  const previewItem = ungrouped.locator('[data-packing-kind="item"]').filter({ hasText: sourceName });
  await expect(handle).toBeVisible({ timeout: 10_000 });
  await expect(ungrouped).toBeVisible({ timeout: 10_000 });
  await expect(addItemInput).toBeVisible({ timeout: 10_000 });

  const useEmptyDropzone = await emptyDropzone.isVisible().catch(() => false);
  const target = useEmptyDropzone ? emptyDropzone : addItemInput;

  await handle.scrollIntoViewIfNeeded();
  const source = await handle.boundingBox();
  let targetBox = await target.boundingBox();
  if (!source || !targetBox) throw new Error(`Could not measure drag source/target for ${sourceName}`);

  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2 + 8, { steps: 4 });

  for (let attemptIndex = 0; attemptIndex < 8; attemptIndex += 1) {
    const targetPointX = targetBox.x + targetBox.width / 2;
    const targetPointY = targetBox.y + Math.min(targetBox.height / 2, 24);
    await page.mouse.move(targetPointX, targetPointY, { steps: 8 });
    if ((await previewItem.count()) === 1) {
      await page.waitForTimeout(60);
      await page.mouse.up();
      return;
    }
    await page.waitForTimeout(90);
    const updatedTargetBox = await target.boundingBox();
    if (updatedTargetBox) targetBox = updatedTargetBox;
  }

  await expect(previewItem).toHaveCount(1, { timeout: 2_000 });
  await page.waitForTimeout(60);
  await page.mouse.up();
}

async function dragItemIntoUngroupedArea(page: Page, sourceName: string): Promise<void> {
  const ungroupedItem = page
    .locator('[data-packing-container="container:__ungrouped__"]')
    .locator('[data-packing-kind="item"]')
    .filter({ hasText: sourceName });

  for (let attemptIndex = 0; attemptIndex < 2; attemptIndex += 1) {
    await dragItemOntoUngrouped(page, sourceName);
    await page.waitForTimeout(150);
    if ((await ungroupedItem.count()) === 1) {
      return;
    }
  }

  await expect(ungroupedItem).toHaveCount(1, { timeout: 2_000 });
}

async function getPackingItemIndex(page: Page, name: string): Promise<number> {
  const names = await page.locator("[data-packing-name]").allTextContents();
  return names.map((itemName) => itemName.trim()).indexOf(name);
}

async function waitForPackingItemPosition(
  page: Page,
  name: string,
  expectedIndex: number,
  timeout = 10_000
): Promise<void> {
  await expect(async () => {
    const index = await getPackingItemIndex(page, name);
    expect(index).toBe(expectedIndex);
  }).toPass({ timeout });
}

async function keyboardMovePackingItemDownOnePosition(page: Page, name: string): Promise<void> {
  const dragHandle = page.getByTitle(`Reorder ${name}`);
  const statusEl = page.getByRole("status").filter({ hasText: "was moved over" });

  for (let attemptIndex = 0; attemptIndex < 3; attemptIndex += 1) {
    await expect(dragHandle).toBeVisible({ timeout: 10_000 });
    await dragHandle.focus();
    await expect(dragHandle).toBeFocused();

    await dragHandle.press("Space");
    await expect(statusEl).toContainText("was moved over", { timeout: 10_000 });
    const pickupText = (await statusEl.textContent()) ?? "";
    const activeId = pickupText.match(/[0-9a-f-]{36}/i)?.[0] ?? "";

    await dragHandle.press("ArrowDown");
    await expect(async () => {
      const statusText = (await statusEl.textContent()) ?? "";
      expect(statusText.toLowerCase()).toContain("was moved over");
      if (activeId) {
        expect(statusText).not.toContain(`area ${activeId}`);
      }
    }).toPass({ timeout: 10_000 });

    // Enter drops the item, firing the reorder server action. Wait for that POST
    // to resolve — the transaction commits and revalidatePath runs before the
    // response returns — so a later reload cannot out-race persistence. A move
    // that registers as a no-op fires no POST, so tolerate a timeout and fall
    // through to the position check / retry.
    const reorderResponse = page
      .waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/trips/"), {
        timeout: 5_000,
      })
      .catch(() => null);
    await dragHandle.press("Enter");
    await reorderResponse;

    try {
      await waitForPackingItemPosition(page, name, 1, 3_000);
      return;
    } catch (error) {
      if (attemptIndex === 2) {
        throw error;
      }
    }
  }
}

When("I open the Packing tab", async ({ page }) => {
  await openPackingTab(page);
});

Then("I should see the empty packing state", async ({ page }) => {
  await expect(page.getByText("No packing lists yet")).toBeVisible();
  await expect(page.getByRole("button", { name: "New List" })).toBeVisible();
});

async function ensureInsidePackingList(page: Page): Promise<void> {
  const addItemPlaceholder = page.getByPlaceholder("Add item…");
  if (await addItemPlaceholder.isVisible({ timeout: 500 }).catch(() => false)) return;

  // No lists — create one
  await page.getByRole("button", { name: "New List" }).click();
  await page.getByLabel("Packing list name").fill("Main");
  await page.getByRole("button", { name: "Create" }).click();
  // Wait for form to close (server revalidation may return us to library view)
  await expect(page.getByRole("button", { name: "Create" })).not.toBeVisible({ timeout: 10_000 });

  // If server re-render reset us back to library, click into the newly created list
  if (!(await addItemPlaceholder.isVisible({ timeout: 1_000 }).catch(() => false))) {
    await page.getByText("Main", { exact: true }).first().click();
    await expect(addItemPlaceholder).toBeVisible({ timeout: 10_000 });
  }
}

When("I add a packing item named {string}", async ({ page }, name: string) => {
  await ensureInsidePackingList(page);
  await page.getByPlaceholder("Add item…").fill(name);
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-packing-kind="item"]').filter({ hasText: name }).first()).toBeVisible({
    timeout: 10_000,
  });
});

When("I add a packing label named {string}", async ({ page }, name: string) => {
  await ensureInsidePackingList(page);
  await page.getByRole("button", { name: "List options" }).click();
  await page.getByText("New section").click();
  await page.getByPlaceholder("New section…").fill(name);
  await page.keyboard.press("Enter");
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
  await keyboardMovePackingItemDownOnePosition(page, name);
});

Then("the packing item {string} should be at position {int}", async ({ page }, name: string, expectedIndex: number) => {
  await waitForPackingItemPosition(page, name, expectedIndex);
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
  await page.getByRole("button", { name: "Keep Items" }).click();
  await expect(page.locator('[data-packing-kind="label"]').filter({ hasText: name })).toHaveCount(0, {
    timeout: 10_000,
  });
});

When("I delete the section label {string} and its items", async ({ page }, name: string) => {
  await openSectionDeleteDialog(page, name);
  await page.getByRole("button", { name: "Delete Items" }).click();
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
