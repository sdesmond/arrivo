import { expect, type Locator, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { days, events, trips } from "../../../src/db/schema";
import { formatCurrencyChipAmount } from "../../../src/lib/currencies";
import { withE2EDb } from "../e2e-db";
import {
  E2E_EVENT_DELETE,
  E2E_EVENT_REORDER_FIRST,
  E2E_EVENT_REORDER_SECOND,
  E2E_EVENT_UNTIMED,
  E2E_TRIP_FOURTH_DATE,
  E2E_TRIP_SECOND_DATE,
  E2E_TRIP_START_DATE,
  E2E_TRIP_THIRD_DATE,
  e2eTripDateTime,
} from "../e2e-seed-data";
import { waitForApiResponse } from "../api-response";
import { Given, When, Then, Before } from "../fixtures";

async function eventIdOf(row: Locator): Promise<string> {
  const rowId = await row.getAttribute("id");
  if (!rowId?.startsWith("event-")) throw new Error(`Unexpected event row id ${rowId}.`);
  return rowId.slice("event-".length);
}

/** Arm before the save gesture and await after it: reloading first would abort the still-in-flight PATCH. */
function armEventPatch(page: Page, eventId: string) {
  return waitForApiResponse(page, { method: "PATCH", path: `/api/v1/events/${eventId}` });
}

async function openFirstDay(page: Page): Promise<void> {
  const dayToggles = page.locator("button").filter({ hasText: /\d+ stops/ });
  const firstDayToggle = dayToggles.first();

  await expect(firstDayToggle).toBeVisible();

  if ((await firstDayToggle.getAttribute("aria-expanded")) === "false") {
    await firstDayToggle.click();
  }

  await expect(page.getByRole("button", { name: /add a place/i }).first()).toBeVisible();
}

async function clickDate(page: Page, isoDate: string): Promise<void> {
  const date = new Date(`${isoDate}T00:00:00`);
  const dataDay = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  const dateButton = page.locator(`button[data-day="${dataDay}"]`).first();

  for (let attempt = 0; attempt < 12; attempt += 1) {
    if ((await dateButton.count()) > 0 && (await dateButton.isVisible())) {
      await dateButton.click();
      return;
    }

    const nextMonthButton = page.locator(".rdp-button_next");
    if (await nextMonthButton.count()) {
      await nextMonthButton.click();
    }
  }

  throw new Error(`Could not find calendar date ${isoDate}`);
}

async function addEvent(page: Page, name: string): Promise<void> {
  await page
    .getByRole("button", { name: /add a place/i })
    .first()
    .click();
  await page.getByTitle("Add event").click();
  await page.getByPlaceholder("Event name").fill(name);
  await page.keyboard.press("Enter");
  await expect(page.locator('[id^="event-"]').filter({ hasText: name }).first()).toBeVisible({ timeout: 10_000 });
}

function getLatestChecklist(page: Page) {
  return page.locator('[id^="checklist-"]').last();
}

async function getChecklistId(checklist: Locator): Promise<string> {
  const elementId = await checklist.getAttribute("id");
  if (!elementId) throw new Error("Checklist id is missing.");
  return elementId.replace(/^checklist-/, "");
}

function formatDayHeading(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatRangeDate(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatRangeLabel(startDate: string, endDate: string): string {
  return `${formatRangeDate(startDate)} — ${formatRangeDate(endDate)}`;
}

const ACTION_BAR_GEOMETRY_MEASURED_EVENT = "Measured action bar";
const ACTION_BAR_GEOMETRY_ATTACH_EVENT = "Attach geometry row";
const ACTION_BAR_GEOMETRY_EXPENSE_AMOUNT = 15;
const ACTION_BAR_GEOMETRY_EXPENSE_CURRENCY = "USD";

function actionBarGeometryRow(page: Page, eventName: string): Locator {
  return page.locator('[id^="event-"]').filter({ hasText: eventName }).first();
}

async function expectControlAtLeast44px(control: Locator): Promise<void> {
  await expect(control).toBeVisible();
  const rect = await control.evaluate((element) => element.getBoundingClientRect());
  expect(rect.width).toBeGreaterThanOrEqual(44);
  expect(rect.height).toBeGreaterThanOrEqual(44);
}

async function changeTripDateRange(page: Page, startDate: string, endDate: string): Promise<void> {
  const dialog = page.getByRole("dialog");
  const dateTrigger = dialog
    .getByRole("button")
    .filter({ hasText: /\b[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}\b/ })
    .or(dialog.getByRole("button", { name: "Pick a date range" }))
    .first();
  await dateTrigger.click();
  await clickDate(page, startDate);
  if (startDate !== endDate) {
    await clickDate(page, endDate);
  }
}

Before({ tags: "@trip-with-untimed-event" }, async ({ scenario }) => {
  await scenario.materialize({
    user: { setCurrent: true },
    trip: {
      mother: "threeDayTrip",
      overrides: {
        events: [{ ...E2E_EVENT_UNTIMED, dayNumber: 1 }],
      },
      setCurrent: true,
    },
  });
});

Before({ tags: "@trip-with-deletable-event" }, async ({ scenario }) => {
  await scenario.materialize({
    user: { setCurrent: true },
    trip: {
      mother: "threeDayTrip",
      overrides: {
        events: [{ ...E2E_EVENT_DELETE, dayNumber: 1 }],
      },
      setCurrent: true,
    },
  });
});

Before({ tags: "@trip-with-reorder-events" }, async ({ scenario }) => {
  await scenario.materialize({
    user: { setCurrent: true },
    trip: {
      mother: "threeDayTrip",
      overrides: {
        events: [
          { ...E2E_EVENT_REORDER_FIRST, dayNumber: 1 },
          { ...E2E_EVENT_REORDER_SECOND, dayNumber: 1 },
        ],
      },
      setCurrent: true,
    },
  });
});

Before({ tags: "@day-append" }, async ({ scenario }) => {
  await scenario.materialize({
    user: { setCurrent: true },
    trip: {
      mother: "threeDayTrip",
      overrides: {
        trip: { name: "Append Day Trip", startDate: E2E_TRIP_START_DATE, endDate: E2E_TRIP_START_DATE },
        days: [{ dayNumber: 1, date: E2E_TRIP_START_DATE, label: "Day 1" }],
      },
      setCurrent: true,
    },
  });
});

Before({ tags: "@day-remove-empty" }, async ({ scenario }) => {
  await scenario.materialize({
    user: { setCurrent: true },
    trip: {
      mother: "threeDayTrip",
      overrides: {
        trip: { name: "Remove Empty Day Trip", startDate: E2E_TRIP_START_DATE, endDate: E2E_TRIP_SECOND_DATE },
        days: [
          { dayNumber: 1, date: E2E_TRIP_START_DATE, label: "Day 1" },
          { dayNumber: 2, date: E2E_TRIP_SECOND_DATE, label: "Day 2" },
        ],
      },
      setCurrent: true,
    },
  });
});

Before({ tags: "@dateless-trip" }, async ({ scenario }) => {
  await scenario.materialize({
    user: { setCurrent: true },
    trip: { mother: "datelessTrip", setCurrent: true },
  });
});

Before({ tags: "@dateless-trip-with-event" }, async ({ scenario }) => {
  await scenario.materialize({
    user: { setCurrent: true },
    trip: {
      mother: "datelessTrip",
      overrides: { events: [{ ...E2E_EVENT_UNTIMED, dayNumber: 1 }] },
      setCurrent: true,
    },
  });
});

Before({ tags: "@day-remove-populated" }, async ({ scenario }) => {
  await scenario.materialize({
    user: { setCurrent: true },
    trip: {
      mother: "threeDayTrip",
      overrides: {
        trip: { name: "Populated Final Day Trip", startDate: E2E_TRIP_START_DATE, endDate: E2E_TRIP_SECOND_DATE },
        days: [
          { dayNumber: 1, date: E2E_TRIP_START_DATE, label: "Day 1" },
          { dayNumber: 2, date: E2E_TRIP_SECOND_DATE, label: "Day 2" },
        ],
        events: [{ name: "Final day booking", position: 0, dayNumber: 2 }],
      },
      setCurrent: true,
    },
  });
});

Before({ tags: "@date-edit-extend-end" }, async ({ scenario }) => {
  await scenario.materialize({
    user: { setCurrent: true },
    trip: {
      mother: "threeDayTrip",
      overrides: {
        trip: { name: "Edit Range Extend Trip", startDate: E2E_TRIP_START_DATE, endDate: null },
        days: [{ dayNumber: 1, date: E2E_TRIP_START_DATE, label: "Day 1" }],
      },
      setCurrent: true,
    },
  });
});

Before({ tags: "@date-edit-extend-start" }, async ({ scenario }) => {
  await scenario.materialize({
    user: { setCurrent: true },
    trip: {
      mother: "threeDayTrip",
      overrides: {
        trip: { name: "Edit Range Earlier Trip", startDate: E2E_TRIP_SECOND_DATE, endDate: E2E_TRIP_THIRD_DATE },
        days: [
          { dayNumber: 1, date: E2E_TRIP_SECOND_DATE, label: "Day 1" },
          { dayNumber: 2, date: E2E_TRIP_THIRD_DATE, label: "Day 2" },
        ],
      },
      setCurrent: true,
    },
  });
});

Before({ tags: "@date-edit-shorten-empty" }, async ({ scenario }) => {
  await scenario.materialize({
    user: { setCurrent: true },
    trip: {
      mother: "threeDayTrip",
      overrides: {
        trip: { name: "Shorten Empty Range Trip", startDate: E2E_TRIP_START_DATE, endDate: E2E_TRIP_THIRD_DATE },
        days: [
          { dayNumber: 1, date: E2E_TRIP_START_DATE, label: "Day 1" },
          { dayNumber: 2, date: E2E_TRIP_SECOND_DATE, label: "Day 2" },
          { dayNumber: 3, date: E2E_TRIP_THIRD_DATE, label: "Day 3" },
        ],
      },
      setCurrent: true,
    },
  });
});

Before({ tags: "@date-edit-keep-unscheduled" }, async ({ scenario }) => {
  await scenario.materialize({
    user: { setCurrent: true },
    trip: {
      mother: "threeDayTrip",
      overrides: {
        trip: { name: "Keep Unscheduled Edit Trip", startDate: E2E_TRIP_START_DATE, endDate: E2E_TRIP_SECOND_DATE },
        days: [
          { dayNumber: 1, date: E2E_TRIP_START_DATE, label: "Day 1" },
          { dayNumber: 2, date: E2E_TRIP_SECOND_DATE, label: "Day 2" },
        ],
        events: [{ name: "Final day booking", position: 0, dayNumber: 2 }],
      },
      setCurrent: true,
    },
  });
});

Before({ tags: "@date-edit-delete-events" }, async ({ scenario }) => {
  await scenario.materialize({
    user: { setCurrent: true },
    trip: {
      mother: "threeDayTrip",
      overrides: {
        trip: { name: "Delete Displaced Events Trip", startDate: E2E_TRIP_START_DATE, endDate: E2E_TRIP_SECOND_DATE },
        days: [
          { dayNumber: 1, date: E2E_TRIP_START_DATE, label: "Day 1" },
          { dayNumber: 2, date: E2E_TRIP_SECOND_DATE, label: "Day 2" },
        ],
        events: [{ name: "Final day booking", position: 0, dayNumber: 2 }],
      },
      setCurrent: true,
    },
  });
});

Before({ tags: "@action-bar-geometry" }, async ({ scenario }) => {
  await scenario.materialize({
    user: { setCurrent: true },
    trip: {
      mother: "threeDayTrip",
      overrides: {
        events: [
          {
            name: ACTION_BAR_GEOMETRY_MEASURED_EVENT,
            position: 0,
            dayNumber: 1,
            startAt: e2eTripDateTime(0, "09:00:00"),
            endAt: e2eTripDateTime(0, "10:00:00"),
            locationName: "Senso-ji Temple",
            locationAddress: "2 Chome-3-1 Asakusa, Taito City, Tokyo",
            locationLat: 35.7148,
            locationLng: 139.7967,
          },
          {
            name: ACTION_BAR_GEOMETRY_ATTACH_EVENT,
            position: 1,
            dayNumber: 1,
          },
        ],
        documents: [
          {
            name: "Measured Doc",
            kind: "pdf",
            url: "https://example.com/measured-doc.pdf",
            eventName: ACTION_BAR_GEOMETRY_MEASURED_EVENT,
          },
        ],
        expenses: [
          {
            category: "activity",
            amount: ACTION_BAR_GEOMETRY_EXPENSE_AMOUNT,
            currency: ACTION_BAR_GEOMETRY_EXPENSE_CURRENCY,
            date: E2E_TRIP_START_DATE,
            eventName: ACTION_BAR_GEOMETRY_MEASURED_EVENT,
          },
        ],
      },
      setCurrent: true,
    },
  });
});

Given("I have an existing trip with days", async ({ page, scenario }) => {
  await scenario.signIn(page);
  await scenario.ensureCurrentTrip();
  await scenario.gotoCurrentTrip(page);
  await openFirstDay(page);
});

Given("I am on the trip detail page", async ({ page }) => {
  await expect(page).toHaveURL(/\/trips\/.+/);
});

When("I add a new event named {string}", async ({ page }, name: string) => {
  await addEvent(page, name);
});

Then("the day should contain {string}", async ({ page }, name: string) => {
  await expect(page.locator('[id^="event-"]').filter({ hasText: name }).first()).toBeVisible();
});

Given("a day has an event named {string}", async ({ page }, name: string) => {
  await addEvent(page, name);
});

When("I edit the event name to {string}", async ({ page }, newName: string) => {
  const row = page.locator('[id^="event-"]').last();
  const rowId = await row.getAttribute("id");
  const patch = armEventPatch(page, await eventIdOf(row));
  await row.hover();
  await row.locator("button").first().click();
  await page.locator(`#${rowId}`).getByRole("textbox").fill(newName);
  await page.keyboard.press("Enter");
  await patch;
});

When("I rename the event {string} to {string}", async ({ page }, name: string, newName: string) => {
  const row = page.locator('[id^="event-"]').filter({ hasText: name }).first();
  const rowId = await row.getAttribute("id");
  const patch = armEventPatch(page, await eventIdOf(row));
  await row.hover();
  await row.locator("button").first().click();
  await page.locator(`#${rowId}`).getByRole("textbox").fill(newName);
  await page.keyboard.press("Enter");
  await patch;
});

Then("the day should show {string}", async ({ page }, name: string) => {
  await expect(page.locator('[id^="event-"]').filter({ hasText: name }).first()).toBeVisible();
});

Given("a day has an event without a time", async ({ page }) => {
  const row = page.locator('[id^="event-"]').filter({ hasText: E2E_EVENT_UNTIMED.name }).first();
  await expect(row).toBeVisible();
});

When("I set the event location for {string} using the first lookup suggestion", async ({ page }, name: string) => {
  const row = page.locator('[id^="event-"]').filter({ hasText: name }).first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /add location/i }).click();
  const dialog = page.getByRole("dialog");
  const input = dialog.getByRole("combobox");
  await input.fill("Par");
  await expect(dialog.getByRole("listbox")).toBeVisible({ timeout: 10_000 });
  await dialog.getByRole("option").first().click();
  await expect(input).toHaveValue("Paris, France");
  await expect(input).not.toHaveAttribute("aria-busy", "true", { timeout: 15_000 });
  const patch = armEventPatch(page, await eventIdOf(row));
  await dialog.getByRole("button", { name: "Save" }).click();
  await patch;
  await expect(dialog).not.toBeVisible({ timeout: 10_000 });
  await expect(row.getByRole("button", { name: /Paris, France/ })).toBeVisible({ timeout: 10_000 });
});

When("I open the time picker and set a start time", async ({ page }) => {
  const row = page.locator('[id^="event-"]').filter({ hasText: E2E_EVENT_UNTIMED.name }).first();
  await row.getByRole("button", { name: "Add time" }).click();
  await page.locator('input[type="time"]').first().fill("09:00");
  const patch = armEventPatch(page, await eventIdOf(row));
  await page.getByRole("button", { name: "Save" }).click();
  await patch;
});

Then("the event should display the time", async ({ page }) => {
  const eventRow = page.locator('[id^="event-"]').filter({ hasText: E2E_EVENT_UNTIMED.name }).first();
  await expect(eventRow.getByText(/\d+:\d{2}\s*(AM|PM)/i)).toBeVisible();
});

Then(
  "the event {string} still shows a time and the location {string}",
  async ({ page }, name: string, address: string) => {
    await openFirstDay(page);
    const row = page.locator('[id^="event-"]').filter({ hasText: name }).first();
    await expect(row.getByText(/\d+:\d{2}\s*(AM|PM)/i)).toBeVisible();
    await expect(row.getByRole("button", { name: new RegExp(address) })).toBeVisible({ timeout: 10_000 });
  }
);

Then("the event {string} should show location {string}", async ({ page }, name: string, address: string) => {
  await openFirstDay(page);
  const row = page.locator('[id^="event-"]').filter({ hasText: name }).first();
  await expect(row.getByRole("button", { name: new RegExp(address) })).toBeVisible({ timeout: 10_000 });
});

Then("the event {string} location is persisted with coordinates", async ({ scenario }, name: string) => {
  const currentTrip = scenario.currentTrip;
  if (!currentTrip) throw new Error("Missing current scenario trip.");

  await withE2EDb(async (db) => {
    const [eventRow] = await db.select().from(events).where(eq(events.tripId, currentTrip.id));
    expect(eventRow).toBeDefined();
    expect(eventRow.name).toBe(name);
    expect(eventRow.locationName).toBeNull();
    expect(eventRow.locationAddress).toBe("Paris, France");
    expect(eventRow.locationLat).toBe(48.8534);
    expect(eventRow.locationLng).toBe(2.3488);
  });
});

When("I delete that event", async ({ page }) => {
  const row = page.locator('[id^="event-"]').last();
  await row.hover();
  await row.getByTitle("Delete event").click();
  await row.waitFor({ state: "detached", timeout: 10_000 });
});

When("I delete the event named {string}", async ({ page }, name: string) => {
  const row = page.locator('[id^="event-"]').filter({ hasText: name }).first();
  await row.hover();
  await row.getByTitle("Delete event").click();
  await row.waitFor({ state: "detached", timeout: 10_000 });
});

Then("the day should not contain {string}", async ({ page }, name: string) => {
  await expect(page.locator('[id^="event-"]').filter({ hasText: name })).toHaveCount(0);
});

Given("a day has events {string} and {string} in order", async ({ page }, first: string, second: string) => {
  await expect(page.locator('[id^="event-"]').filter({ hasText: first }).first()).toBeVisible();
  await expect(page.locator('[id^="event-"]').filter({ hasText: second }).first()).toBeVisible();
});

When("I drag {string} above {string}", async ({ page }, source: string, target: string) => {
  const sourceRow = page.locator('[id^="event-"]').filter({ hasText: source }).first();
  const targetRow = page.locator('[id^="event-"]').filter({ hasText: target }).first();
  await sourceRow.hover();
  const dragHandle = sourceRow.locator('[aria-roledescription="sortable"]');
  await expect(dragHandle).toBeAttached({ timeout: 10_000 });
  await dragHandle.scrollIntoViewIfNeeded();

  const handleBox = await dragHandle.boundingBox();
  const targetBox = await targetRow.boundingBox();
  if (!handleBox || !targetBox) throw new Error("Could not locate drag elements");

  const handleMidX = handleBox.x + handleBox.width / 2;
  const handleMidY = handleBox.y + handleBox.height / 2;
  const targetMidX = targetBox.x + targetBox.width / 2;
  const targetMidY = targetBox.y + targetBox.height / 2;

  await page.mouse.move(handleMidX, handleMidY);
  await page.mouse.down();
  await page.mouse.move(targetMidX, targetMidY, { steps: 10 });
  await page.mouse.up();
});

Then("the order should be {string} then {string}", async ({ page, scenario }, first: string, second: string) => {
  await expect(async () => {
    const firstRow = page.locator('[id^="event-"]').filter({ hasText: first }).first();
    const secondRow = page.locator('[id^="event-"]').filter({ hasText: second }).first();
    await expect(firstRow).toBeVisible();
    await expect(secondRow).toBeVisible();
    const firstBox = await firstRow.boundingBox();
    const secondBox = await secondRow.boundingBox();
    expect(firstBox).not.toBeNull();
    expect(secondBox).not.toBeNull();
    expect(firstBox!.y).toBeLessThan(secondBox!.y);
  }).toPass({ timeout: 10_000 });

  const currentTrip = scenario.currentTrip;
  if (!currentTrip) throw new Error("Current scenario trip is missing.");

  await expect(async () => {
    await withE2EDb(async (db) => {
      const orderedEvents = await db
        .select({ name: events.name, position: events.position })
        .from(events)
        .where(eq(events.tripId, currentTrip.id))
        .orderBy(events.position);

      expect(orderedEvents).toHaveLength(2);
      expect(orderedEvents[0].name).toBe(first);
      expect(orderedEvents[1].name).toBe(second);
    });
  }).toPass({ timeout: 10_000 });
});

When("I add a note {string}", async ({ page }, content: string) => {
  await page
    .getByRole("button", { name: /add a place/i })
    .first()
    .click();
  await page.getByTitle("Add note").click();
  await page.getByPlaceholder("Add a note…").fill(content);
  await page.keyboard.press("Enter");
  // The draft row stays mounted (id note-draft, its textarea matching hasText) until the saved note arrives, so wait
  // for the saved row; a following gesture would otherwise race the in-flight write.
  await expect(page.locator('[id^="note-"]:not(#note-draft)').filter({ hasText: content })).toBeVisible({
    timeout: 5_000,
  });
});

Then("the note {string} should be visible on the timeline", async ({ page }, content: string) => {
  await expect(page.locator('[id^="note-"]').filter({ hasText: content })).toBeVisible();
});

Then("the note {string} should not be visible", async ({ page }, content: string) => {
  await expect(page.locator('[id^="note-"]').filter({ hasText: content })).toHaveCount(0);
});

When("I edit the note {string} to {string}", async ({ page }, oldContent: string, newContent: string) => {
  const noteEl = page.locator('[id^="note-"]').filter({ hasText: oldContent }).first();
  await noteEl.getByRole("button", { name: oldContent }).click();
  const textarea = noteEl.locator("textarea");
  await textarea.fill(newContent);
  await page.keyboard.press("Enter");
});

When("I delete the note {string}", async ({ page }, content: string) => {
  const noteEl = page.locator('[id^="note-"]').filter({ hasText: content }).first();
  await noteEl.hover();
  await noteEl.getByTitle("Delete note").click();
});

When("I add a checklist with item {string}", async ({ page }, itemContent: string) => {
  await page
    .getByRole("button", { name: /add a place/i })
    .first()
    .click();
  await page.getByTitle("Add checklist").click();
  await page.getByPlaceholder("Add an item…").fill(itemContent);
  await page.keyboard.press("Enter");
  // The draft placeholder also matches `[id^="checklist-"]`, so wait for the item's own
  // content to render — proof the server-confirmed checklist replaced the draft.
  await expect(getLatestChecklist(page).getByText(itemContent)).toBeVisible({ timeout: 10_000 });
});

Then("the checklist should be visible on the timeline", async ({ page }) => {
  await expect(getLatestChecklist(page)).toBeVisible();
});

When("I check all items in the checklist", async ({ page }) => {
  const checklist = getLatestChecklist(page);
  const header = checklist.getByRole("button").first();
  const isExpanded = await checklist
    .locator('[placeholder="Add an item…"]')
    .isVisible()
    .catch(() => false);
  if (!isExpanded) {
    await header.click();
  }
  const uncheckedButtons = checklist.getByRole("button", { name: "Check item" });
  const uncheckedCount = await uncheckedButtons.count();
  for (let checkedCount = 1; checkedCount <= uncheckedCount; checkedCount += 1) {
    const itemRow = uncheckedButtons.first().locator("..");
    const itemId = await itemRow.getAttribute("data-checklist-item-id");
    if (!itemId) throw new Error("Checklist item id is missing.");
    const response = waitForApiResponse(page, { method: "PATCH", path: `/api/v1/checklist-items/${itemId}` });
    await uncheckedButtons.first().click();
    await response;
    if (checkedCount === uncheckedCount) {
      // The last check completes the checklist, which auto-collapses 600ms later and unmounts the
      // item rows, so a row count can miss that window under load. The header badge persists.
      await expect(checklist.getByLabel("Complete")).toBeVisible({ timeout: 10_000 });
    } else {
      await expect(checklist.getByRole("button", { name: "Uncheck item" })).toHaveCount(checkedCount, {
        timeout: 10_000,
      });
    }
  }
});

Then("the checklist should show the completion badge", async ({ page }) => {
  await expect(getLatestChecklist(page).getByLabel("Complete")).toBeVisible({ timeout: 10_000 });
});

When("I collapse the checklist", async ({ page }) => {
  const checklist = getLatestChecklist(page);
  const addInput = checklist.locator('[placeholder="Add an item…"]');
  if (await checklist.getByLabel("Complete").isVisible()) {
    // Completing a checklist auto-collapses it 600ms later (checklist-item.tsx). A header click
    // inside that window races the timer and can toggle it back open, so wait for the collapse.
    await expect(addInput).toBeHidden();
    return;
  }
  const isExpanded = await addInput.isVisible().catch(() => false);
  if (isExpanded) {
    await checklist.getByRole("button").first().click();
  }
});

Then("the checklist should be collapsed", async ({ page }) => {
  await expect(getLatestChecklist(page).locator('[placeholder="Add an item…"]')).not.toBeVisible();
});

When("I delete the checklist", async ({ page }) => {
  const checklist = getLatestChecklist(page);
  const checklistId = await getChecklistId(checklist);
  await checklist.hover();
  const response = waitForApiResponse(page, { method: "DELETE", path: `/api/v1/checklists/${checklistId}` });
  await checklist.getByTitle("Delete checklist").click();
  await response;
});

Then("the checklist stays deleted after reload", async ({ page }) => {
  await page.reload();
  await openFirstDay(page);
  await expect(page.locator('[id^="checklist-"]')).toHaveCount(0);
});

When("I rename the checklist to {string}", async ({ page }, title: string) => {
  const checklist = getLatestChecklist(page);
  const checklistId = await getChecklistId(checklist);
  const response = waitForApiResponse(page, { method: "PATCH", path: `/api/v1/checklists/${checklistId}` });
  await checklist.getByRole("button", { name: "Add title..." }).click();
  await checklist.getByLabel("Checklist title").fill(title);
  await page.keyboard.press("Enter");
  await response;
});

Then("the checklist shows the title {string} while its save is still in flight", async ({ page }, title: string) => {
  const checklist = getLatestChecklist(page);
  const checklistId = await getChecklistId(checklist);
  const endpoint = `**/api/v1/checklists/${checklistId}`;
  let releaseSave!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  let saveStarted = false;
  await page.route(endpoint, async (route) => {
    saveStarted = true;
    await gate;
    await route.continue();
  });
  const response = waitForApiResponse(page, { method: "PATCH", path: `/api/v1/checklists/${checklistId}` });
  try {
    await checklist.getByRole("button", { name: "Add title..." }).click();
    await checklist.getByLabel("Checklist title").fill(title);
    await page.keyboard.press("Enter");
    await expect.poll(() => saveStarted).toBe(true);
    await expect(checklist.getByText(title, { exact: true })).toBeVisible();
  } finally {
    releaseSave();
    await response;
    await page.unroute(endpoint);
  }
  await page.reload();
  await openFirstDay(page);
  await expect(getLatestChecklist(page).getByText(title, { exact: true }).first()).toBeVisible();
});

When("I clear the checklist title {string}", async ({ page }, title: string) => {
  const checklist = getLatestChecklist(page);
  const checklistId = await getChecklistId(checklist);
  // The reload collapsed the checklist; its title editor lives in the expanded body.
  if (!(await checklist.getByPlaceholder("Add an item…").isVisible())) {
    await checklist.getByRole("button").first().click();
  }
  const response = waitForApiResponse(page, { method: "PATCH", path: `/api/v1/checklists/${checklistId}` });
  await checklist.getByRole("button", { name: title, exact: true }).click();
  await checklist.getByLabel("Checklist title").fill("");
  await page.keyboard.press("Enter");
  await response;
});

Then("the checklist title {string} persists after reload", async ({ page }, title: string) => {
  await page.reload();
  await openFirstDay(page);
  await expect(getLatestChecklist(page).getByText(title, { exact: true }).first()).toBeVisible();
});

Then("the checklist has no title after reload", async ({ page }) => {
  await page.reload();
  await openFirstDay(page);
  await expect(page.locator('[id^="checklist-"]')).toHaveCount(1);
  await expect(getLatestChecklist(page).getByText("Checklist · item")).toBeVisible();
  await expect(getLatestChecklist(page).getByText("Packing", { exact: true })).toHaveCount(0);
});

When("checklist creation fails once for the draft {string}", async ({ page }, content: string) => {
  await page.route(
    "**/api/v1/trips/*/checklists",
    async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "server_error", message: "Checklist create failed" } }),
      });
    },
    { times: 1 }
  );
  await page
    .getByRole("button", { name: /add a place/i })
    .first()
    .click();
  await page.getByTitle("Add checklist").click();
  await page.getByPlaceholder("Add an item…").fill(content);
  await page.keyboard.press("Enter");
  await expect(page.getByText("Checklist create failed", { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder("Add an item…")).toHaveValue(content);
});

Then("retrying the draft creates exactly one checklist that persists after reload", async ({ page }) => {
  const tripId = new URL(page.url()).pathname.match(/\/trips\/([^/]+)/)?.[1];
  if (!tripId) throw new Error("Trip id is missing from the page URL.");
  const response = waitForApiResponse(page, { method: "POST", path: `/api/v1/trips/${tripId}/checklists` });
  await page.getByPlaceholder("Add an item…").press("Enter");
  await response;
  await expect(page.locator('[id^="checklist-"]')).toHaveCount(1);
  await expect(getLatestChecklist(page).getByText("Retry checklist")).toBeVisible();
  await page.reload();
  await openFirstDay(page);
  await expect(page.locator('[id^="checklist-"]')).toHaveCount(1);
});

const TIMELINE_ITEMS = '[id^="note-"], [id^="event-"], [id^="checklist-"]';

Then("one expanded checklist sits in the timeline and the order persists after reload", async ({ page }) => {
  await expect(page.locator('[id^="checklist-"]')).toHaveCount(1);
  await expect(getLatestChecklist(page).getByPlaceholder("Add an item…")).toBeVisible();
  const before = await page.locator(TIMELINE_ITEMS).evaluateAll((nodes) => nodes.map((node) => node.id));
  expect(before.filter((id) => id.startsWith("checklist-"))).toHaveLength(1);
  await page.reload();
  await openFirstDay(page);
  await expect(page.locator('[id^="checklist-"]')).toHaveCount(1);
  const after = await page.locator(TIMELINE_ITEMS).evaluateAll((nodes) => nodes.map((node) => node.id));
  expect(after).toEqual(before);
  // The only "Add a place" gap appends, so each saved item lands after the previous one.
  expect(after.map((id) => id.split("-")[0])).toEqual(["note", "event", "checklist"]);
});

Then("the checklist should not be visible on the timeline", async ({ page }) => {
  await expect(page.locator('[id^="checklist-"]')).toHaveCount(0);
});

When("I add a day to the itinerary", async ({ page }) => {
  await page.getByRole("button", { name: "Add Day" }).click();
  await expect(page.getByText(formatDayHeading(E2E_TRIP_SECOND_DATE))).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/\b2 days\b/)).toBeVisible();
  await expect(page.getByText(formatRangeLabel(E2E_TRIP_START_DATE, E2E_TRIP_SECOND_DATE))).toBeVisible();
});

Then("the appended day and advanced end date are persisted", async ({ scenario }) => {
  const currentTrip = scenario.currentTrip;
  if (!currentTrip) throw new Error("Missing current scenario trip.");

  await withE2EDb(async (db) => {
    const tripDays = await db.select().from(days).where(eq(days.tripId, currentTrip.id));
    const [trip] = await db.select().from(trips).where(eq(trips.id, currentTrip.id));
    expect(tripDays).toHaveLength(2);
    expect(tripDays.find((day) => day.dayNumber === 2)?.date).toBe(E2E_TRIP_SECOND_DATE);
    expect(trip.endDate).toBe(E2E_TRIP_SECOND_DATE);
  });
});

When("I remove the final empty day", async ({ page }) => {
  await page.getByTitle("Remove day").last().click();
  await expect(page.getByText(formatDayHeading(E2E_TRIP_SECOND_DATE))).not.toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/\b1 day\b/)).toBeVisible();
});

Then("only the preceding day remains scheduled", async ({ scenario }) => {
  const currentTrip = scenario.currentTrip;
  if (!currentTrip) throw new Error("Missing current scenario trip.");

  await withE2EDb(async (db) => {
    const tripDays = await db.select().from(days).where(eq(days.tripId, currentTrip.id));
    const [trip] = await db.select().from(trips).where(eq(trips.id, currentTrip.id));
    expect(tripDays).toHaveLength(1);
    expect(trip.endDate).toBe(E2E_TRIP_START_DATE);
  });
});

Then("the remove day control is not visible", async ({ page }) => {
  await expect(page.getByTitle("Remove day")).not.toBeVisible();
});

When("I add a day to a dateless itinerary", async ({ page }) => {
  await page.getByRole("button", { name: "Add Day" }).click();
  await expect(page.getByText("Day 2")).toBeVisible({ timeout: 10_000 });
});

Then("Day 2 is appended without a date", async ({ scenario }) => {
  const currentTrip = scenario.currentTrip;
  if (!currentTrip) throw new Error("Missing current scenario trip.");

  await withE2EDb(async (db) => {
    const tripDays = await db.select().from(days).where(eq(days.tripId, currentTrip.id));
    expect(tripDays).toHaveLength(2);
    expect(tripDays.find((day) => day.dayNumber === 2)?.date).toBeNull();
  });
});

When("I click Set trip dates", async ({ page }) => {
  await page.getByRole("button", { name: /set trip dates/i }).click();
});

Then("the trip edit sheet is open", async ({ page }) => {
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText("Edit Trip")).toBeVisible();
});

When("I request removal of the populated final day", async ({ page }) => {
  await page.getByTitle("Remove day").last().click();
});

Then("planned content deletion is disclosed", async ({ page }) => {
  await expect(page.getByText(/planned content will be deleted/i)).toBeVisible();
});

When("I confirm destructive day removal", async ({ page }) => {
  await page.getByRole("button", { name: "Remove Day", exact: true }).click();
  await expect(page.getByText(formatDayHeading(E2E_TRIP_SECOND_DATE))).not.toBeVisible({ timeout: 10_000 });
});

Then("the populated final day and its content are deleted", async ({ scenario }) => {
  const currentTrip = scenario.currentTrip;
  if (!currentTrip) throw new Error("Missing current scenario trip.");

  await withE2EDb(async (db) => {
    const tripDays = await db.select().from(days).where(eq(days.tripId, currentTrip.id));
    const remainingEvents = await db.select().from(events).where(eq(events.tripId, currentTrip.id));
    const [trip] = await db.select().from(trips).where(eq(trips.id, currentTrip.id));
    expect(tripDays).toHaveLength(1);
    expect(remainingEvents).toHaveLength(0);
    expect(trip.endDate).toBe(E2E_TRIP_START_DATE);
  });
});

When(
  "I change the trip date range to {string} through {string}",
  async ({ page }, startDate: string, endDate: string) => {
    await changeTripDateRange(page, startDate, endDate);
  }
);

When("I change the trip date range to the default future trip dates", async ({ page }) => {
  await changeTripDateRange(page, E2E_TRIP_START_DATE, E2E_TRIP_THIRD_DATE);
});

When("I shorten the trip date range to the first future trip day", async ({ page }) => {
  await changeTripDateRange(page, E2E_TRIP_START_DATE, E2E_TRIP_START_DATE);
});

When("I shift the trip date range one day later", async ({ page }) => {
  await changeTripDateRange(page, E2E_TRIP_SECOND_DATE, E2E_TRIP_FOURTH_DATE);
});

When("I save the trip date change", async ({ page }) => {
  await page.getByRole("button", { name: "Save changes" }).click();
});

Then("the edited trip includes the appended scheduled days", async ({ page, scenario }) => {
  const currentTrip = scenario.currentTrip;
  if (!currentTrip) throw new Error("Missing current scenario trip.");

  await expect(page.getByText(formatDayHeading(E2E_TRIP_THIRD_DATE))).toBeVisible({ timeout: 10_000 });
  await withE2EDb(async (db) => {
    const tripDays = await db.select().from(days).where(eq(days.tripId, currentTrip.id));
    const [trip] = await db.select().from(trips).where(eq(trips.id, currentTrip.id));
    expect(tripDays).toHaveLength(3);
    expect(trip.endDate).toBe(E2E_TRIP_THIRD_DATE);
  });
});

Then("the edited trip includes the prepended scheduled days", async ({ page, scenario }) => {
  const currentTrip = scenario.currentTrip;
  if (!currentTrip) throw new Error("Missing current scenario trip.");

  await expect(page.getByText(formatDayHeading(E2E_TRIP_START_DATE))).toBeVisible({ timeout: 10_000 });
  await withE2EDb(async (db) => {
    const tripDays = await db.select().from(days).where(eq(days.tripId, currentTrip.id));
    const [trip] = await db.select().from(trips).where(eq(trips.id, currentTrip.id));
    expect(tripDays).toHaveLength(3);
    expect(tripDays.find((day) => day.dayNumber === 1)?.date).toBe(E2E_TRIP_START_DATE);
    expect(trip.startDate).toBe(E2E_TRIP_START_DATE);
  });
});

Then("the empty removed days are deleted without a warning", async ({ page, scenario }) => {
  const currentTrip = scenario.currentTrip;
  if (!currentTrip) throw new Error("Missing current scenario trip.");

  await expect(page.getByRole("alertdialog")).not.toBeVisible();
  await expect(page.getByText(formatDayHeading(E2E_TRIP_THIRD_DATE))).not.toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/\b1 day\b/)).toBeVisible({ timeout: 10_000 });
  await withE2EDb(async (db) => {
    const tripDays = await db.select().from(days).where(eq(days.tripId, currentTrip.id));
    const [trip] = await db.select().from(trips).where(eq(trips.id, currentTrip.id));
    expect(tripDays).toHaveLength(1);
    expect(trip.endDate).toBe(E2E_TRIP_START_DATE);
  });
});

Then("the trip edit warning explains the removed trip dates", async ({ page }) => {
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await expect(
    page.getByText(
      /Your new trip dates will remove events \(along with their notes and documents\) you had planned for/i
    )
  ).toBeVisible();
});

When("I keep the displaced events as unscheduled", async ({ page }) => {
  await page.getByRole("button", { name: "Keep Events" }).click();
  await expect(page.getByRole("alertdialog")).not.toBeVisible({ timeout: 10_000 });
});

Then("the removed day's events are persisted as unscheduled", async ({ page, scenario }) => {
  const currentTrip = scenario.currentTrip;
  if (!currentTrip) throw new Error("Missing current scenario trip.");

  await expect(page.getByText("Unscheduled Events")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Final day booking")).toBeVisible();
  await withE2EDb(async (db) => {
    const remainingEvents = await db.select().from(events).where(eq(events.tripId, currentTrip.id));
    const tripDays = await db.select().from(days).where(eq(days.tripId, currentTrip.id));
    expect(tripDays).toHaveLength(1);
    expect(remainingEvents).toHaveLength(1);
    expect(remainingEvents[0].dayId).toBeNull();
    expect(remainingEvents[0].displacedDate).toBe(E2E_TRIP_SECOND_DATE);
  });
});

When("I delete the displaced events", async ({ page }) => {
  await page.getByRole("button", { name: "Remove Events" }).click();
  await expect(page.getByRole("alertdialog")).not.toBeVisible({ timeout: 10_000 });
});

Then("the removed day's events are deleted after the date change", async ({ page, scenario }) => {
  const currentTrip = scenario.currentTrip;
  if (!currentTrip) throw new Error("Missing current scenario trip.");

  await expect(page.getByText(formatDayHeading(E2E_TRIP_SECOND_DATE))).not.toBeVisible({ timeout: 10_000 });
  await withE2EDb(async (db) => {
    const tripDays = await db.select().from(days).where(eq(days.tripId, currentTrip.id));
    const remainingEvents = await db.select().from(events).where(eq(events.tripId, currentTrip.id));
    const [trip] = await db.select().from(trips).where(eq(trips.id, currentTrip.id));
    expect(tripDays).toHaveLength(1);
    expect(remainingEvents).toHaveLength(0);
    expect(trip.endDate).toBe(E2E_TRIP_START_DATE);
  });
});

Given("the viewport is 375 by 812", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
});

Then(
  "the {string} row's Time, Cost, and Docs chips and Address segments each measure at least 44 by 44 pixels",
  async ({ page }, eventName: string) => {
    const row = actionBarGeometryRow(page, eventName);
    await expect(row).toBeVisible();

    await expectControlAtLeast44px(row.getByRole("button", { name: /9:00\s*AM/i }));
    await expectControlAtLeast44px(
      row.getByRole("button", {
        name: formatCurrencyChipAmount(ACTION_BAR_GEOMETRY_EXPENSE_AMOUNT, ACTION_BAR_GEOMETRY_EXPENSE_CURRENCY),
      })
    );
    await expectControlAtLeast44px(row.getByRole("button", { name: /doc/i }));
    await expectControlAtLeast44px(row.getByRole("button", { name: /open directions to/i }));
    await expectControlAtLeast44px(row.getByRole("button", { name: "Edit location" }));
  }
);

Then(
  "the {string} row's Attach chip and empty Address button each measure at least 44 by 44 pixels",
  async ({ page }, eventName: string) => {
    const row = actionBarGeometryRow(page, eventName);
    await expect(row).toBeVisible();

    await expectControlAtLeast44px(row.getByRole("button", { name: "Attach", exact: true }));
    await expectControlAtLeast44px(row.getByRole("button", { name: /add location/i }));
  }
);

Then("the untimed event asks for trip dates before a time", async ({ page }) => {
  // A time is stored as a full timestamp, so a day without a date can't hold one; the chip says so
  // instead of opening a dialog whose save would be silently dropped.
  await expect(page.getByText("Set dates to add a time")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Add time$/ })).toHaveCount(0);
});

When("I open the first day", async ({ page }) => {
  await openFirstDay(page);
});

Then("exactly one checklist with item {string} persists after reload", async ({ page }, itemContent: string) => {
  await page.reload();
  await openFirstDay(page);
  // A reloaded checklist renders collapsed, so expand it to see its item.
  await expect(page.locator('[id^="checklist-"]')).toHaveCount(1);
  const checklist = getLatestChecklist(page);
  await checklist.getByRole("button").first().click();
  await expect(checklist.getByText(itemContent)).toBeVisible();
});

Then("checklist completion persists after reload", async ({ page }) => {
  await page.reload();
  await openFirstDay(page);
  await expect(getLatestChecklist(page).getByLabel("Complete")).toBeVisible();
});

When("I add a second checklist item {string}", async ({ page }, content: string) => {
  const checklist = getLatestChecklist(page);
  const checklistId = await getChecklistId(checklist);
  const response = waitForApiResponse(page, { method: "POST", path: `/api/v1/checklists/${checklistId}/items` });
  await checklist.getByPlaceholder("Add an item…").fill(content);
  await page.keyboard.press("Enter");
  await response;
  await expect(checklist.getByText(content, { exact: true })).toBeVisible();
});

Then("rapid checklist toggles stay visible and persist in FIFO order", async ({ page }) => {
  const row = page.locator("[data-checklist-item-id]").filter({ hasText: "Rapid toggle" });
  const itemId = await row.getAttribute("data-checklist-item-id");
  const writes: boolean[] = [];
  let completed = 0;
  let inFlight = 0;
  let peakInFlight = 0;
  let releaseWrite!: () => void;
  const writeGate = new Promise<void>((resolve) => {
    releaseWrite = resolve;
  });
  let releaseRefresh!: () => void;
  const refreshGate = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  let refreshStarted = false;
  const endpoint = `**/api/v1/checklist-items/${itemId}`;
  await page.route(endpoint, async (route) => {
    inFlight += 1;
    peakInFlight = Math.max(peakInFlight, inFlight);
    writes.push(route.request().postDataJSON().isChecked as boolean);
    if (writes.length === 1) await writeGate;
    const response = await route.fetch();
    inFlight -= 1;
    await route.fulfill({ response });
    completed += 1;
  });
  const routePath = `**${new URL(page.url()).pathname}*`;
  await page.route(routePath, async (route) => {
    if (route.request().headers()["rsc"] === "1") {
      refreshStarted = true;
      await refreshGate;
    }
    await route.continue();
  });
  try {
    await row.getByRole("button", { name: "Check item", exact: true }).click();
    await expect(row.getByRole("button", { name: "Uncheck item", exact: true })).toBeVisible();
    await row.getByRole("button", { name: "Uncheck item", exact: true }).click();
    await expect(row.getByRole("button", { name: "Check item", exact: true })).toBeVisible();
    await row.getByRole("button", { name: "Check item", exact: true }).click();
    await expect(row.getByRole("button", { name: "Uncheck item", exact: true })).toBeVisible();
    await expect.poll(() => writes.length).toBe(1);
    releaseWrite();
    await expect.poll(() => refreshStarted).toBe(true);
    expect(writes).toEqual([true]);
    await expect(row.getByRole("button", { name: "Uncheck item", exact: true })).toBeVisible();
    releaseRefresh();
    await expect.poll(() => completed).toBe(3);
    expect(writes).toEqual([true, false, true]);
    expect(peakInFlight).toBe(1);
  } finally {
    releaseWrite();
    releaseRefresh();
    await page.unroute(endpoint);
    await page.unroute(routePath);
  }
  await page.reload();
  await openFirstDay(page);
  await getLatestChecklist(page).getByRole("button").first().click();
  await expect(row.getByRole("button", { name: "Uncheck item", exact: true })).toBeVisible();
});

Then("another checklist item can save while the first write is blocked", async ({ page }) => {
  const first = page.locator("[data-checklist-item-id]").filter({ hasText: "Independent first" });
  const second = page.locator("[data-checklist-item-id]").filter({ hasText: "Independent second" });
  const firstId = await first.getAttribute("data-checklist-item-id");
  const secondId = await second.getAttribute("data-checklist-item-id");
  let releaseFirst!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let firstStarted = false;
  await page.route(`**/api/v1/checklist-items/${firstId}`, async (route) => {
    firstStarted = true;
    await gate;
    await route.continue();
  });
  const firstResponse = waitForApiResponse(page, { method: "PATCH", path: `/api/v1/checklist-items/${firstId}` });
  try {
    await first.getByRole("button", { name: "Check item", exact: true }).click();
    await expect.poll(() => firstStarted).toBe(true);
    const secondResponse = waitForApiResponse(page, { method: "PATCH", path: `/api/v1/checklist-items/${secondId}` });
    await second.getByRole("button", { name: "Check item", exact: true }).click();
    await secondResponse;
  } finally {
    releaseFirst();
    await firstResponse;
    await page.unroute(`**/api/v1/checklist-items/${firstId}`);
  }
});

Then("a failed checklist toggle rolls back and the next click persists", async ({ page }) => {
  const row = page.locator("[data-checklist-item-id]").filter({ hasText: "Recover toggle" });
  const itemId = await row.getAttribute("data-checklist-item-id");
  const endpoint = `**/api/v1/checklist-items/${itemId}`;
  await page.route(
    endpoint,
    async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "server_error", message: "Checklist write failed" },
        }),
      });
    },
    { times: 1 }
  );
  await row.getByRole("button", { name: "Check item", exact: true }).click();
  await expect(page.getByText("Checklist write failed", { exact: true })).toBeVisible();
  await expect(row.getByRole("button", { name: "Check item", exact: true })).toBeVisible();
  const response = waitForApiResponse(page, { method: "PATCH", path: `/api/v1/checklist-items/${itemId}` });
  await row.getByRole("button", { name: "Check item", exact: true }).click();
  await response;
  await page.reload();
  await openFirstDay(page);
  await getLatestChecklist(page).getByRole("button").first().click();
  await expect(row.getByRole("button", { name: "Uncheck item", exact: true })).toBeVisible();
});

function checklistItemRow(page: Page, content: string): Locator {
  return page.locator("[data-checklist-item-id]").filter({ has: page.getByText(content, { exact: true }) });
}

async function checklistItemId(page: Page, content: string): Promise<string> {
  const itemId = await checklistItemRow(page, content).getAttribute("data-checklist-item-id");
  if (!itemId) throw new Error(`Checklist item "${content}" has no id.`);
  return itemId;
}

async function reloadAndOpenLatestChecklist(page: Page): Promise<Locator> {
  await page.reload();
  await openFirstDay(page);
  const checklist = getLatestChecklist(page);
  if (!(await checklist.getByPlaceholder("Add an item…").isVisible()))
    await checklist.getByRole("button").first().click();
  await expect(checklist.getByPlaceholder("Add an item…")).toBeVisible();
  return checklist;
}

When("I edit the checklist item {string} to {string}", async ({ page }, current: string, next: string) => {
  const row = checklistItemRow(page, current);
  const itemId = await checklistItemId(page, current);
  const response = waitForApiResponse(page, { method: "PATCH", path: `/api/v1/checklist-items/${itemId}` });
  await row.getByRole("button", { name: current, exact: true }).click();
  await page.getByLabel("Checklist item content").fill(next);
  await page.keyboard.press("Enter");
  await response;
  await expect(checklistItemRow(page, next)).toBeVisible();
});

When("I check the checklist item {string}", async ({ page }, content: string) => {
  const itemId = await checklistItemId(page, content);
  const response = waitForApiResponse(page, { method: "PATCH", path: `/api/v1/checklist-items/${itemId}` });
  await checklistItemRow(page, content).getByRole("button", { name: "Check item", exact: true }).click();
  await response;
  await expect(
    checklistItemRow(page, content).getByRole("button", { name: "Uncheck item", exact: true })
  ).toBeVisible();
});

When("I uncheck the checklist item {string}", async ({ page }, content: string) => {
  const itemId = await checklistItemId(page, content);
  const response = waitForApiResponse(page, { method: "PATCH", path: `/api/v1/checklist-items/${itemId}` });
  await checklistItemRow(page, content).getByRole("button", { name: "Uncheck item", exact: true }).click();
  await response;
  await expect(checklistItemRow(page, content).getByRole("button", { name: "Check item", exact: true })).toBeVisible();
});

When("I delete the checklist item {string}", async ({ page }, content: string) => {
  const row = checklistItemRow(page, content);
  const itemId = await checklistItemId(page, content);
  const response = waitForApiResponse(page, { method: "DELETE", path: `/api/v1/checklist-items/${itemId}` });
  await row.hover();
  await row.getByTitle("Delete item").click();
  await response;
  await expect(checklistItemRow(page, content)).toHaveCount(0);
});

Then("the checklist items read {string} in order after reload", async ({ page }, expected: string) => {
  const checklist = await reloadAndOpenLatestChecklist(page);
  const rows = checklist.locator("[data-checklist-item-id]");
  await expect(rows).toHaveCount(expected.split(", ").length);
  expect(await rows.evaluateAll((elements) => elements.map((element) => element.textContent?.trim()))).toEqual(
    expected.split(", ")
  );
});

Then("the checklist item {string} is {word} after reload", async ({ page }, content: string, state: string) => {
  await reloadAndOpenLatestChecklist(page);
  const label = state === "checked" ? "Uncheck item" : "Check item";
  await expect(checklistItemRow(page, content).getByRole("button", { name: label, exact: true })).toBeVisible();
});

Then("overlapping checklist item writes settle in intent order despite slow requests", async ({ page }) => {
  const names = { alpha: "Alpha", bravo: "Bravo", charlie: "Charlie" };
  const alphaId = await checklistItemId(page, names.alpha);
  const bravoId = await checklistItemId(page, names.bravo);
  const charlieId = await checklistItemId(page, names.charlie);
  const labels = new Map([
    [alphaId, "alpha"],
    [bravoId, "bravo"],
    [charlieId, "charlie"],
  ]);
  const log: string[] = [];
  let releaseAlpha!: () => void;
  let releaseBravo!: () => void;
  const alphaGate = new Promise<void>((resolve) => {
    releaseAlpha = resolve;
  });
  const bravoGate = new Promise<void>((resolve) => {
    releaseBravo = resolve;
  });
  let alphaHeld = false;
  let bravoHeld = false;
  const endpoint = "**/api/v1/checklist-items/*";
  await page.route(endpoint, async (route) => {
    const request = route.request();
    const label = labels.get(new URL(request.url()).pathname.split("/").pop() ?? "");
    const body = request.method() === "PATCH" ? JSON.stringify(request.postDataJSON()) : "";
    log.push(`${request.method()} ${label} ${body}`.trim());
    if (request.method() === "PATCH" && label === "alpha" && !alphaHeld) {
      alphaHeld = true;
      await alphaGate;
    }
    if (request.method() === "PATCH" && label === "bravo" && !bravoHeld) {
      bravoHeld = true;
      await bravoGate;
    }
    await route.continue();
  });
  const alphaCheck = waitForApiResponse(page, { method: "PATCH", path: `/api/v1/checklist-items/${alphaId}` });
  const bravoDelete = waitForApiResponse(page, { method: "DELETE", path: `/api/v1/checklist-items/${bravoId}` });
  try {
    // Alpha: a held check, then a queued edit. The UI shows both at once.
    await checklistItemRow(page, names.alpha).getByRole("button", { name: "Check item", exact: true }).click();
    await expect.poll(() => alphaHeld).toBe(true);
    await checklistItemRow(page, names.alpha).getByRole("button", { name: names.alpha, exact: true }).click();
    await page.getByLabel("Checklist item content").fill("Alpha edited");
    await page.keyboard.press("Enter");
    const alphaRow = checklistItemRow(page, "Alpha edited");
    await expect(alphaRow.getByRole("button", { name: "Uncheck item", exact: true })).toBeVisible();
    expect(log.filter((entry) => entry.includes(" alpha"))).toEqual(['PATCH alpha {"isChecked":true}']);
    // Bravo: a held edit, then a delete that must wait for it.
    await checklistItemRow(page, names.bravo).getByRole("button", { name: names.bravo, exact: true }).click();
    await page.getByLabel("Checklist item content").fill("Bravo edited");
    await page.keyboard.press("Enter");
    await expect.poll(() => bravoHeld).toBe(true);
    const bravoRow = checklistItemRow(page, "Bravo edited");
    await bravoRow.hover();
    await bravoRow.getByTitle("Delete item").click();
    await expect(checklistItemRow(page, "Bravo edited")).toHaveCount(0);
    expect(log.some((entry) => entry.startsWith("DELETE bravo"))).toBe(false);
    // Charlie is independent: it saves while alpha and bravo are both blocked.
    const charlieEdit = waitForApiResponse(page, { method: "PATCH", path: `/api/v1/checklist-items/${charlieId}` });
    await checklistItemRow(page, names.charlie).getByRole("button", { name: names.charlie, exact: true }).click();
    await page.getByLabel("Checklist item content").fill("Charlie edited");
    await page.keyboard.press("Enter");
    await charlieEdit;
    releaseBravo();
    await bravoDelete;
    releaseAlpha();
    await alphaCheck;
    await expect.poll(() => log.filter((entry) => entry.includes(" alpha")).length).toBe(2);
  } finally {
    releaseAlpha();
    releaseBravo();
    await page.unroute(endpoint);
  }
  expect(log.filter((entry) => entry.includes(" alpha"))).toEqual([
    'PATCH alpha {"isChecked":true}',
    'PATCH alpha {"content":"Alpha edited"}',
  ]);
  expect(log.filter((entry) => entry.includes(" bravo"))).toEqual([
    'PATCH bravo {"content":"Bravo edited"}',
    "DELETE bravo",
  ]);
  const checklist = await reloadAndOpenLatestChecklist(page);
  const rows = checklist.locator("[data-checklist-item-id]");
  expect(await rows.evaluateAll((elements) => elements.map((element) => element.textContent?.trim()))).toEqual([
    "Alpha edited",
    "Charlie edited",
  ]);
  await expect(
    checklistItemRow(page, "Alpha edited").getByRole("button", { name: "Uncheck item", exact: true })
  ).toBeVisible();
  await expect(
    checklistItemRow(page, "Charlie edited").getByRole("button", { name: "Check item", exact: true })
  ).toBeVisible();
});

Then("a failed checklist item edit and delete roll back and their retries persist", async ({ page }) => {
  const itemId = await checklistItemId(page, "Recover item");
  const endpoint = `**/api/v1/checklist-items/${itemId}`;
  const failure = {
    status: 500,
    contentType: "application/json",
    body: JSON.stringify({ error: { code: "server_error", message: "Checklist item write failed" } }),
  };
  await page.route(endpoint, (route) => route.fulfill(failure), { times: 1 });
  await checklistItemRow(page, "Recover item").getByRole("button", { name: "Recover item", exact: true }).click();
  await page.getByLabel("Checklist item content").fill("Recovered item");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Checklist item write failed", { exact: true })).toBeVisible();
  await expect(checklistItemRow(page, "Recover item")).toBeVisible();
  await expect(checklistItemRow(page, "Recovered item")).toHaveCount(0);
  const retry = waitForApiResponse(page, { method: "PATCH", path: `/api/v1/checklist-items/${itemId}` });
  await checklistItemRow(page, "Recover item").getByRole("button", { name: "Recover item", exact: true }).click();
  await page.getByLabel("Checklist item content").fill("Recovered item");
  await page.keyboard.press("Enter");
  await retry;
  await expect(checklistItemRow(page, "Recovered item")).toBeVisible();
  await page.route(endpoint, (route) => route.fulfill(failure), { times: 1 });
  const failedRow = checklistItemRow(page, "Recovered item");
  await failedRow.hover();
  await failedRow.getByTitle("Delete item").click();
  await expect(checklistItemRow(page, "Recovered item")).toBeVisible();
  const deleted = waitForApiResponse(page, { method: "DELETE", path: `/api/v1/checklist-items/${itemId}` });
  await failedRow.hover();
  await failedRow.getByTitle("Delete item").click();
  await deleted;
  const checklist = await reloadAndOpenLatestChecklist(page);
  expect(
    await checklist
      .locator("[data-checklist-item-id]")
      .evaluateAll((elements) => elements.map((element) => element.textContent?.trim()))
  ).toEqual(["Keep item"]);
});
