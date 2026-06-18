import { expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { days, events, trips } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import {
  E2E_EVENT_DELETE,
  E2E_EVENT_REORDER_FIRST,
  E2E_EVENT_REORDER_SECOND,
  E2E_EVENT_UNTIMED,
} from "../e2e-seed-data";
import { Given, When, Then, Before } from "../fixtures";

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
        trip: { name: "Append Day Trip", startDate: "2026-08-01", endDate: "2026-08-01" },
        days: [{ dayNumber: 1, date: "2026-08-01", label: "Day 1" }],
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
        trip: { name: "Remove Empty Day Trip", startDate: "2026-08-01", endDate: "2026-08-02" },
        days: [
          { dayNumber: 1, date: "2026-08-01", label: "Day 1" },
          { dayNumber: 2, date: "2026-08-02", label: "Day 2" },
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

Before({ tags: "@day-remove-populated" }, async ({ scenario }) => {
  await scenario.materialize({
    user: { setCurrent: true },
    trip: {
      mother: "threeDayTrip",
      overrides: {
        trip: { name: "Populated Final Day Trip", startDate: "2026-08-01", endDate: "2026-08-02" },
        days: [
          { dayNumber: 1, date: "2026-08-01", label: "Day 1" },
          { dayNumber: 2, date: "2026-08-02", label: "Day 2" },
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
        trip: { name: "Edit Range Extend Trip", startDate: "2026-08-01", endDate: null },
        days: [{ dayNumber: 1, date: "2026-08-01", label: "Day 1" }],
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
        trip: { name: "Edit Range Earlier Trip", startDate: "2026-08-02", endDate: "2026-08-03" },
        days: [
          { dayNumber: 1, date: "2026-08-02", label: "Day 1" },
          { dayNumber: 2, date: "2026-08-03", label: "Day 2" },
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
        trip: { name: "Shorten Empty Range Trip", startDate: "2026-08-01", endDate: "2026-08-03" },
        days: [
          { dayNumber: 1, date: "2026-08-01", label: "Day 1" },
          { dayNumber: 2, date: "2026-08-02", label: "Day 2" },
          { dayNumber: 3, date: "2026-08-03", label: "Day 3" },
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
        trip: { name: "Keep Unscheduled Edit Trip", startDate: "2026-08-01", endDate: "2026-08-02" },
        days: [
          { dayNumber: 1, date: "2026-08-01", label: "Day 1" },
          { dayNumber: 2, date: "2026-08-02", label: "Day 2" },
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
        trip: { name: "Delete Displaced Events Trip", startDate: "2026-08-01", endDate: "2026-08-02" },
        days: [
          { dayNumber: 1, date: "2026-08-01", label: "Day 1" },
          { dayNumber: 2, date: "2026-08-02", label: "Day 2" },
        ],
        events: [{ name: "Final day booking", position: 0, dayNumber: 2 }],
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
  await row.hover();
  await row.locator("button").first().click();
  await page.locator(`#${rowId}`).getByRole("textbox").fill(newName);
  await page.keyboard.press("Enter");
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
  await dialog.getByRole("button", { name: "Save" }).click();
});

When("I open the time picker and set a start time", async ({ page }) => {
  const row = page.locator('[id^="event-"]').filter({ hasText: E2E_EVENT_UNTIMED.name }).first();
  await row.getByRole("button", { name: "Add time" }).click();
  await page.locator('input[type="time"]').first().fill("09:00");
  await page.getByRole("button", { name: "Save" }).click();
});

Then("the event should display the time", async ({ page }) => {
  const eventRow = page.locator('[id^="event-"]').filter({ hasText: E2E_EVENT_UNTIMED.name }).first();
  await expect(eventRow.getByText(/\d+:\d{2}\s*(AM|PM)/i)).toBeVisible();
});

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
  await expect(page.locator('[id^="note-"]').filter({ hasText: content })).toBeVisible({ timeout: 5_000 });
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
  await expect(getLatestChecklist(page)).toBeVisible({ timeout: 5_000 });
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
    await uncheckedButtons.first().click();
    await expect(checklist.getByRole("button", { name: "Uncheck item" })).toHaveCount(checkedCount, {
      timeout: 10_000,
    });
  }
});

Then("the checklist should show the completion badge", async ({ page }) => {
  await expect(getLatestChecklist(page).getByLabel("Complete")).toBeVisible({ timeout: 10_000 });
});

When("I collapse the checklist", async ({ page }) => {
  const checklist = getLatestChecklist(page);
  const addInput = checklist.locator('[placeholder="Add an item…"]');
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
  await checklist.hover();
  await checklist.getByTitle("Delete checklist").click();
});

Then("the checklist should not be visible on the timeline", async ({ page }) => {
  await expect(page.locator('[id^="checklist-"]')).toHaveCount(0);
});

When("I add a day to the itinerary", async ({ page }) => {
  await page.getByRole("button", { name: "Add Day" }).click();
  await expect(page.getByText("Sun, Aug 2")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/\b2 days\b/)).toBeVisible();
  await expect(page.getByText("Aug 1, 2026 — Aug 2, 2026")).toBeVisible();
});

Then("the appended day and advanced end date are persisted", async ({ scenario }) => {
  const currentTrip = scenario.currentTrip;
  if (!currentTrip) throw new Error("Missing current scenario trip.");

  await withE2EDb(async (db) => {
    const tripDays = await db.select().from(days).where(eq(days.tripId, currentTrip.id));
    const [trip] = await db.select().from(trips).where(eq(trips.id, currentTrip.id));
    expect(tripDays).toHaveLength(2);
    expect(tripDays.find((day) => day.dayNumber === 2)?.date).toBe("2026-08-02");
    expect(trip.endDate).toBe("2026-08-02");
  });
});

When("I remove the final empty day", async ({ page }) => {
  await page.getByTitle("Remove day").last().click();
  await expect(page.getByText("Sun, Aug 2")).not.toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/\b1 day\b/)).toBeVisible();
});

Then("only the preceding day remains scheduled", async ({ scenario }) => {
  const currentTrip = scenario.currentTrip;
  if (!currentTrip) throw new Error("Missing current scenario trip.");

  await withE2EDb(async (db) => {
    const tripDays = await db.select().from(days).where(eq(days.tripId, currentTrip.id));
    const [trip] = await db.select().from(trips).where(eq(trips.id, currentTrip.id));
    expect(tripDays).toHaveLength(1);
    expect(trip.endDate).toBe("2026-08-01");
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
  await expect(page.getByText("Sun, Aug 2")).not.toBeVisible({ timeout: 10_000 });
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
    expect(trip.endDate).toBe("2026-08-01");
  });
});

When(
  "I change the trip date range to {string} through {string}",
  async ({ page }, startDate: string, endDate: string) => {
    const dialog = page.getByRole("dialog");
    const dateTrigger = dialog
      .getByRole("button")
      .filter({ hasText: /\b[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}\b/ })
      .first();
    await dateTrigger.click();
    await clickDate(page, startDate);
    if (startDate !== endDate) {
      await clickDate(page, endDate);
    }
  }
);

When("I save the trip date change", async ({ page }) => {
  await page.getByRole("button", { name: "Save changes" }).click();
});

Then("the edited trip includes the appended scheduled days", async ({ page, scenario }) => {
  const currentTrip = scenario.currentTrip;
  if (!currentTrip) throw new Error("Missing current scenario trip.");

  await expect(page.getByText("Mon, Aug 3")).toBeVisible({ timeout: 10_000 });
  await withE2EDb(async (db) => {
    const tripDays = await db.select().from(days).where(eq(days.tripId, currentTrip.id));
    const [trip] = await db.select().from(trips).where(eq(trips.id, currentTrip.id));
    expect(tripDays).toHaveLength(3);
    expect(trip.endDate).toBe("2026-08-03");
  });
});

Then("the edited trip includes the prepended scheduled days", async ({ page, scenario }) => {
  const currentTrip = scenario.currentTrip;
  if (!currentTrip) throw new Error("Missing current scenario trip.");

  await expect(page.getByText("Sat, Aug 1")).toBeVisible({ timeout: 10_000 });
  await withE2EDb(async (db) => {
    const tripDays = await db.select().from(days).where(eq(days.tripId, currentTrip.id));
    const [trip] = await db.select().from(trips).where(eq(trips.id, currentTrip.id));
    expect(tripDays).toHaveLength(3);
    expect(tripDays.find((day) => day.dayNumber === 1)?.date).toBe("2026-08-01");
    expect(trip.startDate).toBe("2026-08-01");
  });
});

Then("the empty removed days are deleted without a warning", async ({ page, scenario }) => {
  const currentTrip = scenario.currentTrip;
  if (!currentTrip) throw new Error("Missing current scenario trip.");

  await expect(page.getByRole("alertdialog")).not.toBeVisible();
  await expect(page.getByText("Sun, Aug 3")).not.toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/\b1 day\b/)).toBeVisible({ timeout: 10_000 });
  await withE2EDb(async (db) => {
    const tripDays = await db.select().from(days).where(eq(days.tripId, currentTrip.id));
    const [trip] = await db.select().from(trips).where(eq(trips.id, currentTrip.id));
    expect(tripDays).toHaveLength(1);
    expect(trip.endDate).toBe("2026-08-01");
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
    expect(remainingEvents[0].displacedDate).toBe("2026-08-02");
  });
});

When("I delete the displaced events", async ({ page }) => {
  await page.getByRole("button", { name: "Remove Events" }).click();
  await expect(page.getByRole("alertdialog")).not.toBeVisible({ timeout: 10_000 });
});

Then("the removed day's events are deleted after the date change", async ({ page, scenario }) => {
  const currentTrip = scenario.currentTrip;
  if (!currentTrip) throw new Error("Missing current scenario trip.");

  await expect(page.getByText("Sun, Aug 2")).not.toBeVisible({ timeout: 10_000 });
  await withE2EDb(async (db) => {
    const tripDays = await db.select().from(days).where(eq(days.tripId, currentTrip.id));
    const remainingEvents = await db.select().from(events).where(eq(events.tripId, currentTrip.id));
    const [trip] = await db.select().from(trips).where(eq(trips.id, currentTrip.id));
    expect(tripDays).toHaveLength(1);
    expect(remainingEvents).toHaveLength(0);
    expect(trip.endDate).toBe("2026-08-01");
  });
});
