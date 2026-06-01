import { expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import { events, days, trips, users, collaborators, itineraryNotes, itineraryChecklists } from "../../../src/db/schema";
import {
  E2E_USER,
  E2E_TRIP,
  E2E_EVENT_DELETE,
  E2E_EVENT_UNTIMED,
  E2E_EVENT_REORDER_FIRST,
  E2E_EVENT_REORDER_SECOND,
} from "../e2e-seed-data";
import { Given, When, Then, Before, After } from "../fixtures";

async function withE2EDb<T>(fn: (db: ReturnType<typeof drizzle>) => Promise<T>): Promise<T> {
  const client = postgres(process.env.E2E_DATABASE_URL!);
  const db = drizzle(client);
  try {
    return await fn(db);
  } finally {
    await client.end();
  }
}

async function getDay1Context(db: ReturnType<typeof drizzle>): Promise<{ tripId: string; dayId: string } | null> {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, E2E_USER.email));
  if (!user) return null;
  const [trip] = await db
    .select({ id: trips.id })
    .from(trips)
    .where(and(eq(trips.ownerId, user.id), eq(trips.startDate, E2E_TRIP.startDate)));
  if (!trip) return null;
  const [day1] = await db
    .select({ id: days.id })
    .from(days)
    .where(and(eq(days.tripId, trip.id), eq(days.dayNumber, 1)));
  if (!day1) return null;
  return { tripId: trip.id, dayId: day1.id };
}

let lastEventName: string | undefined;
let createdEventIds: string[] = [];
let eventIdByName: Map<string, string> = new Map();
let createdNoteIds: string[] = [];
let createdChecklistIds: string[] = [];
let lastChecklistId: string | undefined;
let emptyItineraryTripId: string | undefined;
let structuralTripId: string | undefined;

async function createStructuralTrip(
  tripName: string,
  tripDates: { startDate: string; endDate?: string },
  dayRows: { dayNumber: number; date: string; label: string }[],
  finalDayEventName?: string
): Promise<string | undefined> {
  return withE2EDb(async (db) => {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, E2E_USER.email));
    if (!user) return undefined;
    const [trip] = await db
      .insert(trips)
      .values({ ownerId: user.id, name: tripName, ...tripDates })
      .returning();
    await db.insert(collaborators).values({
      tripId: trip.id,
      userId: user.id,
      email: E2E_USER.email,
      name: E2E_USER.name,
      initials: E2E_USER.initials,
      role: "owner",
    });
    const insertedDays = await db
      .insert(days)
      .values(dayRows.map((day) => ({ tripId: trip.id, ...day })))
      .returning({ id: days.id, dayNumber: days.dayNumber });
    if (finalDayEventName) {
      const finalDay = insertedDays.find((day) => day.dayNumber === dayRows.length);
      if (finalDay) {
        await db.insert(events).values({
          dayId: finalDay.id,
          tripId: trip.id,
          name: finalDayEventName,
          position: 0,
        });
      }
    }
    return trip.id;
  });
}

async function openFirstDay(page: Page): Promise<void> {
  // Wait for day cards to render (unique to trip detail — toggle buttons contain "X stops")
  const firstDayToggle = page
    .locator("button")
    .filter({ hasText: /\d+ stops/ })
    .first();
  await expect(firstDayToggle).toBeVisible();

  // Expand if collapsed
  if ((await firstDayToggle.getAttribute("aria-expanded")) === "false") {
    await firstDayToggle.click();
  }

  // Confirm the day body is open by waiting for the add-event button
  await expect(page.getByRole("button", { name: /add a place/i }).first()).toBeVisible();
}

async function clickDate(page: Page, isoDate: string): Promise<void> {
  const date = new Date(`${isoDate}T00:00:00`);
  const dataDay = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  const dateButton = page.locator(`button[data-day="${dataDay}"]`).first();

  for (let attempt = 0; attempt < 12; attempt++) {
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
  const idsBefore = new Set(
    await page.locator('[id^="event-"]').evaluateAll((els: Element[]) => els.map((el) => el.id))
  );
  await page
    .getByRole("button", { name: /add a place/i })
    .first()
    .click();
  await page.getByTitle("Add event").click();
  await page.getByPlaceholder("Event name").fill(name);
  await page.keyboard.press("Enter");
  const newEventRow = page.locator('[id^="event-"]').filter({ hasText: name }).first();
  await expect(newEventRow).toBeVisible({ timeout: 10_000 });
  const newId = await newEventRow.getAttribute("id");
  if (!newId) throw new Error(`Could not capture the created event id for "${name}".`);
  if (!idsBefore.has(newId)) {
    createdEventIds.push(newId);
  }
  eventIdByName.set(name, newId);
}

Before(async () => {
  lastEventName = undefined;
  createdEventIds = [];
  eventIdByName = new Map();
  createdNoteIds = [];
  createdChecklistIds = [];
  lastChecklistId = undefined;
  structuralTripId = undefined;
});

Before({ tags: "@reseed-day-delete" }, async () => {
  await withE2EDb(async (db) => {
    const ctx = await getDay1Context(db);
    if (!ctx) return;
    await db.delete(events).where(and(eq(events.tripId, ctx.tripId), eq(events.name, E2E_EVENT_DELETE.name)));
    await db.insert(events).values({
      dayId: ctx.dayId,
      tripId: ctx.tripId,
      name: E2E_EVENT_DELETE.name,
      position: E2E_EVENT_DELETE.position,
    });
  });
});

Before({ tags: "@seed-untimed-event" }, async () => {
  await withE2EDb(async (db) => {
    const ctx = await getDay1Context(db);
    if (!ctx) return;
    await db.delete(events).where(and(eq(events.tripId, ctx.tripId), eq(events.name, E2E_EVENT_UNTIMED.name)));
    await db.insert(events).values({
      dayId: ctx.dayId,
      tripId: ctx.tripId,
      name: E2E_EVENT_UNTIMED.name,
      position: E2E_EVENT_UNTIMED.position,
    });
  });
});

Before({ tags: "@seed-reorder-events" }, async () => {
  await withE2EDb(async (db) => {
    const ctx = await getDay1Context(db);
    if (!ctx) return;
    for (const seed of [E2E_EVENT_REORDER_FIRST, E2E_EVENT_REORDER_SECOND]) {
      await db.delete(events).where(and(eq(events.tripId, ctx.tripId), eq(events.name, seed.name)));
      await db
        .insert(events)
        .values({ dayId: ctx.dayId, tripId: ctx.tripId, name: seed.name, position: seed.position });
    }
  });
});

Before({ tags: "@itinerary-empty" }, async () => {
  await withE2EDb(async (db) => {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, E2E_USER.email));
    if (!user) return;
    const [trip] = await db
      .insert(trips)
      .values({ ownerId: user.id, name: "Empty Itinerary Trip", startDate: "2026-08-01", endDate: "2026-08-03" })
      .returning();
    await db.insert(collaborators).values({
      tripId: trip.id,
      userId: user.id,
      email: E2E_USER.email,
      name: E2E_USER.name,
      initials: E2E_USER.initials,
      role: "owner",
    });
    emptyItineraryTripId = trip.id;
  });
});

Before({ tags: "@day-append" }, async () => {
  structuralTripId = await createStructuralTrip("Append Day Trip", { startDate: "2026-08-01" }, [
    { dayNumber: 1, date: "2026-08-01", label: "Day 1" },
  ]);
});

Before({ tags: "@day-remove-empty" }, async () => {
  structuralTripId = await createStructuralTrip(
    "Remove Empty Day Trip",
    { startDate: "2026-08-01", endDate: "2026-08-02" },
    [
      { dayNumber: 1, date: "2026-08-01", label: "Day 1" },
      { dayNumber: 2, date: "2026-08-02", label: "Day 2" },
    ]
  );
});

Before({ tags: "@day-remove-only" }, async () => {
  structuralTripId = await createStructuralTrip("Only Day Trip", { startDate: "2026-08-01" }, [
    { dayNumber: 1, date: "2026-08-01", label: "Day 1" },
  ]);
});

Before({ tags: "@day-remove-populated" }, async () => {
  structuralTripId = await createStructuralTrip(
    "Populated Final Day Trip",
    { startDate: "2026-08-01", endDate: "2026-08-02" },
    [
      { dayNumber: 1, date: "2026-08-01", label: "Day 1" },
      { dayNumber: 2, date: "2026-08-02", label: "Day 2" },
    ],
    "Final day booking"
  );
});

Before({ tags: "@date-edit-extend-end" }, async () => {
  structuralTripId = await createStructuralTrip("Edit Range Extend Trip", { startDate: "2026-08-01" }, [
    { dayNumber: 1, date: "2026-08-01", label: "Day 1" },
  ]);
});

Before({ tags: "@date-edit-extend-start" }, async () => {
  structuralTripId = await createStructuralTrip(
    "Edit Range Earlier Trip",
    { startDate: "2026-08-02", endDate: "2026-08-03" },
    [
      { dayNumber: 1, date: "2026-08-02", label: "Day 1" },
      { dayNumber: 2, date: "2026-08-03", label: "Day 2" },
    ]
  );
});

Before({ tags: "@date-edit-shorten-empty" }, async () => {
  structuralTripId = await createStructuralTrip(
    "Shorten Empty Range Trip",
    { startDate: "2026-08-01", endDate: "2026-08-03" },
    [
      { dayNumber: 1, date: "2026-08-01", label: "Day 1" },
      { dayNumber: 2, date: "2026-08-02", label: "Day 2" },
      { dayNumber: 3, date: "2026-08-03", label: "Day 3" },
    ]
  );
});

Before({ tags: "@date-edit-keep-unscheduled" }, async () => {
  structuralTripId = await createStructuralTrip(
    "Keep Unscheduled Edit Trip",
    { startDate: "2026-08-01", endDate: "2026-08-02" },
    [
      { dayNumber: 1, date: "2026-08-01", label: "Day 1" },
      { dayNumber: 2, date: "2026-08-02", label: "Day 2" },
    ],
    "Final day booking"
  );
});

Before({ tags: "@date-edit-delete-events" }, async () => {
  structuralTripId = await createStructuralTrip(
    "Delete Displaced Events Trip",
    { startDate: "2026-08-01", endDate: "2026-08-02" },
    [
      { dayNumber: 1, date: "2026-08-01", label: "Day 1" },
      { dayNumber: 2, date: "2026-08-02", label: "Day 2" },
    ],
    "Final day booking"
  );
});

After({ tags: "@itinerary-empty" }, async () => {
  if (!emptyItineraryTripId) return;
  await withE2EDb(async (db) => {
    await db.delete(trips).where(eq(trips.id, emptyItineraryTripId!));
  });
  emptyItineraryTripId = undefined;
});

After(async () => {
  const eventUuids = createdEventIds.map((id) => id.replace(/^event-/, ""));
  const noteUuids = createdNoteIds.map((id) => id.replace(/^note-/, ""));
  const checklistUuids = createdChecklistIds.map((id) => id.replace(/^checklist-/, ""));

  createdEventIds = [];
  createdNoteIds = [];
  createdChecklistIds = [];
  lastChecklistId = undefined;
  lastEventName = undefined;
  eventIdByName = new Map();

  const client = postgres(process.env.E2E_DATABASE_URL!);
  const db = drizzle(client);
  try {
    for (const uuid of eventUuids) {
      await db.delete(events).where(eq(events.id, uuid));
    }
    for (const uuid of noteUuids) {
      await db.delete(itineraryNotes).where(eq(itineraryNotes.id, uuid));
    }
    for (const uuid of checklistUuids) {
      await db.delete(itineraryChecklists).where(eq(itineraryChecklists.id, uuid));
    }
    if (structuralTripId) {
      await db.delete(trips).where(eq(trips.id, structuralTripId));
      structuralTripId = undefined;
    }
  } finally {
    await client.end();
  }
});

Given("I have an existing trip with days", async ({ page }) => {
  if (structuralTripId) {
    await page.goto(`/trips/${structuralTripId}`);
  } else {
    const context = await withE2EDb(getDay1Context);
    if (!context) throw new Error("Seeded E2E trip not found");
    await page.goto(`/trips/${context.tripId}`);
  }
  await page.waitForURL(/\/trips\/.+/);
  await openFirstDay(page);
});

Given("I am on the trip detail page", async ({ page }) => {
  await expect(page).toHaveURL(/\/trips\/.+/);
});

When("I add a new event named {string}", async ({ page }, name: string) => {
  await addEvent(page, name);
});

Then("the day should contain {string}", async ({ page }, name: string) => {
  const id = eventIdByName.get(name);
  const row = id ? page.locator(`#${id}`) : page.locator('[id^="event-"]').filter({ hasText: name }).first();
  await expect(row).toBeVisible();
});

Given("a day has an event named {string}", async ({ page }, name: string) => {
  lastEventName = name;
  await addEvent(page, name);
});

When("I edit the event name to {string}", async ({ page }, newName: string) => {
  const id = eventIdByName.get(lastEventName!);
  const row = id ? page.locator(`#${id}`) : page.locator('[id^="event-"]').filter({ hasText: lastEventName! }).first();
  const rowId = await row.getAttribute("id");
  await row.hover();
  await row.getByTitle("Edit name").click();
  await page.locator(`#${rowId}`).getByRole("textbox").fill(newName);
  await page.keyboard.press("Enter");
});

Then("the day should show {string}", async ({ page }, name: string) => {
  // Use tracked ID — the event was renamed so text changed but ID is stable
  const lastId = createdEventIds[createdEventIds.length - 1];
  const row = lastId ? page.locator(`#${lastId}`) : page.locator('[id^="event-"]').filter({ hasText: name }).first();
  await expect(row).toContainText(name);
});

Given("a day has an event without a time", async ({ page }) => {
  // Event is seeded directly in the DB via the @seed-untimed-event Before hook,
  // so the page rendered by the Background already contains it. Looking it up
  // here avoids racing the create-event server action against the time-picker flow.
  const name = E2E_EVENT_UNTIMED.name;
  lastEventName = name;
  const row = page.locator('[id^="event-"]').filter({ hasText: name }).first();
  await expect(row).toBeVisible();
  const rowId = await row.getAttribute("id");
  if (rowId) eventIdByName.set(name, rowId);
});

When("I open the time picker and set a start time", async ({ page }) => {
  const id = eventIdByName.get(lastEventName!);
  const row = id ? page.locator(`#${id}`) : page.locator('[id^="event-"]').filter({ hasText: lastEventName! }).first();
  await row.getByRole("button", { name: "Add time" }).click();
  await page.locator('input[type="time"]').first().fill("09:00");
  await page.getByRole("button", { name: "Save" }).click();
});

Then("the event should display the time", async ({ page }) => {
  const id = eventIdByName.get(lastEventName!);
  const eventRow = id
    ? page.locator(`#${id}`)
    : page.locator('[id^="event-"]').filter({ hasText: lastEventName! }).first();
  await expect(eventRow.getByText(/\d+:\d{2}\s*(AM|PM)/i)).toBeVisible();
});

When("I delete that event", async ({ page }) => {
  const id = eventIdByName.get(lastEventName!);
  const row = id ? page.locator(`#${id}`) : page.locator('[id^="event-"]').filter({ hasText: lastEventName! }).first();
  await row.hover();
  await row.getByTitle("Delete event").click();
  await row.waitFor({ state: "detached", timeout: 10000 });
  // Remove from tracking — deleted, no need for After cleanup
  if (id) {
    createdEventIds = createdEventIds.filter((eid) => eid !== id);
    eventIdByName.delete(lastEventName!);
  }
});

When("I delete the event named {string}", async ({ page }, name: string) => {
  const row = page.locator('[id^="event-"]').filter({ hasText: name }).first();
  await row.hover();
  await row.getByTitle("Delete event").click();
  await row.waitFor({ state: "detached", timeout: 10000 });
});

Then("the day should not contain {string}", async ({ page }, name: string) => {
  await expect(page.locator('[id^="event-"]').filter({ hasText: name })).toHaveCount(0);
});

Given("a day has events {string} and {string} in order", async ({ page }, first: string, second: string) => {
  // Events are seeded at fixed positions in the DB via the @seed-reorder-events
  // Before hook, so the Background's navigation already rendered them in order.
  // Looking them up here avoids racing two create-event server actions before
  // the drag operation begins.
  for (const name of [first, second]) {
    const row = page.locator('[id^="event-"]').filter({ hasText: name }).first();
    await expect(row).toBeVisible();
    const rowId = await row.getAttribute("id");
    if (rowId) eventIdByName.set(name, rowId);
  }
});

When("I drag {string} above {string}", async ({ page }, source: string, target: string) => {
  const sourceId = eventIdByName.get(source);
  const targetId = eventIdByName.get(target);
  const sourceRow = sourceId
    ? page.locator(`#${sourceId}`)
    : page.locator('[id^="event-"]').filter({ hasText: source }).first();
  const targetRow = targetId
    ? page.locator(`#${targetId}`)
    : page.locator('[id^="event-"]').filter({ hasText: target }).first();

  // Hover source to ensure drag handle is in hover state
  await sourceRow.hover();
  const dragHandle = sourceRow.locator('[aria-roledescription="sortable"]');

  const handleBox = await dragHandle.boundingBox();
  const targetBox = await targetRow.boundingBox();

  if (!handleBox || !targetBox) throw new Error("Could not locate drag elements");

  const srcX = handleBox.x + handleBox.width / 2;
  const srcY = handleBox.y + handleBox.height / 2;
  const dstX = targetBox.x + targetBox.width / 2;
  const dstY = targetBox.y + Math.round(targetBox.height * 0.3);

  await page.mouse.move(srcX, srcY);
  await page.mouse.down();
  // Move past the 5px activation threshold
  await page.mouse.move(srcX, srcY + 7, { steps: 3 });
  // Move to target position with enough steps for dnd-kit collision detection
  await page.mouse.move(dstX, dstY, { steps: 25 });
  await page.mouse.up();
});

Then("the order should be {string} then {string}", async ({ page }, first: string, second: string) => {
  const firstId = eventIdByName.get(first);
  const secondId = eventIdByName.get(second);
  await expect(async () => {
    const ids = await page.locator('[id^="event-"]').evaluateAll((els: Element[]) => els.map((el) => el.id));
    const firstIdx = firstId ? ids.indexOf(firstId) : ids.findIndex((id) => id.includes(first));
    const secondIdx = secondId ? ids.indexOf(secondId) : ids.findIndex((id) => id.includes(second));
    expect(firstIdx).toBeGreaterThanOrEqual(0);
    expect(secondIdx).toBeGreaterThanOrEqual(0);
    expect(firstIdx).toBeLessThan(secondIdx);
  }).toPass({ timeout: 10000 });
});

When("I add a note {string}", async ({ page }, content: string) => {
  const idsBefore = new Set(
    await page.locator('[id^="note-"]').evaluateAll((els: Element[]) => els.map((el) => el.id))
  );
  await page
    .getByRole("button", { name: /add a place/i })
    .first()
    .click();
  await page.getByTitle("Add note").click();
  await page.getByPlaceholder("Add a note…").fill(content);
  await page.keyboard.press("Enter");
  await expect(async () => {
    const idsAfter = await page.locator('[id^="note-"]').evaluateAll((els: Element[]) => els.map((el) => el.id));
    expect(idsAfter.length).toBeGreaterThan(idsBefore.size);
  }).toPass({ timeout: 5000 });
  const idsAfter = await page.locator('[id^="note-"]').evaluateAll((els: Element[]) => els.map((el) => el.id));
  const newId = idsAfter.find((id) => !idsBefore.has(id));
  if (newId) createdNoteIds.push(newId);
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
  const noteId = await noteEl.getAttribute("id");
  await noteEl.hover();
  await noteEl.getByTitle("Delete note").click();
  if (noteId) createdNoteIds = createdNoteIds.filter((id) => id !== noteId);
});

When("I add a checklist with item {string}", async ({ page }, itemContent: string) => {
  const idsBefore = new Set(
    await page.locator('[id^="checklist-"]').evaluateAll((els: Element[]) => els.map((el) => el.id))
  );
  await page
    .getByRole("button", { name: /add a place/i })
    .first()
    .click();
  await page.getByTitle("Add checklist").click();
  await page.getByPlaceholder("Add an item…").fill(itemContent);
  await page.keyboard.press("Enter");
  await expect(async () => {
    const idsAfter = await page.locator('[id^="checklist-"]').evaluateAll((els: Element[]) => els.map((el) => el.id));
    expect(idsAfter.length).toBeGreaterThan(idsBefore.size);
  }).toPass({ timeout: 5000 });
  const idsAfter = await page.locator('[id^="checklist-"]').evaluateAll((els: Element[]) => els.map((el) => el.id));
  const newId = idsAfter.find((id) => !idsBefore.has(id));
  if (newId) {
    createdChecklistIds.push(newId);
    lastChecklistId = newId;
  }
});

Then("the checklist should be visible on the timeline", async ({ page }) => {
  await expect(page.locator(`#${lastChecklistId}`)).toBeVisible();
});

When("I check all items in the checklist", async ({ page }) => {
  const clEl = page.locator(`#${lastChecklistId}`);
  // Expand if collapsed
  const header = clEl.getByRole("button").first();
  const isExpanded = await clEl
    .locator('[placeholder="Add an item…"]')
    .isVisible()
    .catch(() => false);
  if (!isExpanded) {
    await header.click();
  }
  const checkboxes = clEl.locator('button[title="Check item"]');
  const count = await checkboxes.count();
  for (let i = 0; i < count; i++) {
    await checkboxes.first().click();
  }
});

Then("the checklist should show the completion badge", async ({ page }) => {
  const clEl = page.locator(`#${lastChecklistId}`);
  await expect(clEl.locator('[aria-label="Complete"]')).toBeVisible({ timeout: 3000 });
});

When("I collapse the checklist", async ({ page }) => {
  const clEl = page.locator(`#${lastChecklistId}`);
  // After completion ceremony, checklist auto-collapses; if still expanded, click header
  const addInput = clEl.locator('[placeholder="Add an item…"]');
  const isExpanded = await addInput.isVisible().catch(() => false);
  if (isExpanded) {
    await clEl.getByRole("button").first().click();
  }
});

Then("the checklist should be collapsed", async ({ page }) => {
  const clEl = page.locator(`#${lastChecklistId}`);
  await expect(clEl.locator('[placeholder="Add an item…"]')).not.toBeVisible();
});

When("I delete the checklist", async ({ page }) => {
  const clEl = page.locator(`#${lastChecklistId}`);
  await clEl.hover();
  await clEl.getByTitle("Delete checklist").click();
  if (lastChecklistId) {
    createdChecklistIds = createdChecklistIds.filter((id) => id !== lastChecklistId);
    lastChecklistId = undefined;
  }
});

Then("the checklist should not be visible on the timeline", async ({ page }) => {
  if (lastChecklistId) {
    await expect(page.locator(`#${lastChecklistId}`)).not.toBeVisible({ timeout: 5000 });
  } else {
    await expect(page.locator('[id^="checklist-"]')).toHaveCount(0);
  }
});

Given("I navigate to the trip with no itinerary", async ({ page }) => {
  await page.goto(`/trips/${emptyItineraryTripId}`);
  await expect(page.getByText("No itinerary yet")).toBeVisible({ timeout: 10_000 });
});

Then("the itinerary empty state shows buttons for adding events, notes, and checklists", async ({ page }) => {
  await expect(page.getByTitle("Add event")).toBeVisible();
  await expect(page.getByTitle("Add note")).toBeVisible();
  await expect(page.getByTitle("Add checklist")).toBeVisible();
});

When("I add a day to the itinerary", async ({ page }) => {
  await page.getByRole("button", { name: "Add Day" }).click();
  await expect(page.getByText("Sun, Aug 2")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/\b2 days\b/)).toBeVisible();
  await expect(page.getByText("Aug 1, 2026 — Aug 2, 2026")).toBeVisible();
});

Then("the appended day and advanced end date are persisted", async () => {
  await withE2EDb(async (db) => {
    const tripDays = await db.select().from(days).where(eq(days.tripId, structuralTripId!));
    const [trip] = await db.select().from(trips).where(eq(trips.id, structuralTripId!));
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

Then("only the preceding day remains scheduled", async () => {
  await withE2EDb(async (db) => {
    const tripDays = await db.select().from(days).where(eq(days.tripId, structuralTripId!));
    const [trip] = await db.select().from(trips).where(eq(trips.id, structuralTripId!));
    expect(tripDays).toHaveLength(1);
    expect(trip.endDate).toBe("2026-08-01");
  });
});

When("I request removal of the only day and cancel", async ({ page }) => {
  await page.getByTitle("Remove day").click();
  await expect(page.getByText(/marks this trip as unscheduled/i)).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
});

Then("no day or date changes are persisted", async () => {
  await withE2EDb(async (db) => {
    const tripDays = await db.select().from(days).where(eq(days.tripId, structuralTripId!));
    const [trip] = await db.select().from(trips).where(eq(trips.id, structuralTripId!));
    expect(tripDays).toHaveLength(1);
    expect(trip.startDate).toBe("2026-08-01");
  });
});

When("I confirm removal of the only day", async ({ page }) => {
  await page.getByTitle("Remove day").click();
  await page.getByRole("button", { name: "Remove Day", exact: true }).click();
  await expect(page.getByText("No itinerary yet")).toBeVisible({ timeout: 10_000 });
});

Then("the trip is persisted and displayed as unscheduled", async ({ page }) => {
  await withE2EDb(async (db) => {
    const tripDays = await db.select().from(days).where(eq(days.tripId, structuralTripId!));
    const [trip] = await db.select().from(trips).where(eq(trips.id, structuralTripId!));
    expect(tripDays).toHaveLength(0);
    expect(trip.startDate).toBeNull();
    expect(trip.endDate).toBeNull();
  });
  await page.goto("/trips");
  await expect(page.getByRole("heading", { name: "Unscheduled" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Only Day Trip.*No dates.*unscheduled/i })).toBeVisible();
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

Then("the populated final day and its content are deleted", async () => {
  await withE2EDb(async (db) => {
    const tripDays = await db.select().from(days).where(eq(days.tripId, structuralTripId!));
    const remainingEvents = await db.select().from(events).where(eq(events.tripId, structuralTripId!));
    const [trip] = await db.select().from(trips).where(eq(trips.id, structuralTripId!));
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

Then("the edited trip includes the appended scheduled days", async ({ page }) => {
  await expect(page.getByText("Mon, Aug 3")).toBeVisible({ timeout: 10_000 });
  await withE2EDb(async (db) => {
    const tripDays = await db.select().from(days).where(eq(days.tripId, structuralTripId!));
    const [trip] = await db.select().from(trips).where(eq(trips.id, structuralTripId!));
    expect(tripDays).toHaveLength(3);
    expect(trip.endDate).toBe("2026-08-03");
  });
});

Then("the edited trip includes the prepended scheduled days", async ({ page }) => {
  await expect(page.getByText("Sat, Aug 1")).toBeVisible({ timeout: 10_000 });
  await withE2EDb(async (db) => {
    const tripDays = await db.select().from(days).where(eq(days.tripId, structuralTripId!));
    const [trip] = await db.select().from(trips).where(eq(trips.id, structuralTripId!));
    expect(tripDays).toHaveLength(3);
    expect(tripDays.find((day) => day.dayNumber === 1)?.date).toBe("2026-08-01");
    expect(trip.startDate).toBe("2026-08-01");
  });
});

Then("the empty removed days are deleted without a warning", async ({ page }) => {
  await expect(page.getByRole("alertdialog")).not.toBeVisible();
  await expect(page.getByText("Sun, Aug 3")).not.toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/\b1 day\b/)).toBeVisible({ timeout: 10_000 });
  await withE2EDb(async (db) => {
    const tripDays = await db.select().from(days).where(eq(days.tripId, structuralTripId!));
    const [trip] = await db.select().from(trips).where(eq(trips.id, structuralTripId!));
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

Then("the removed day's events are persisted as unscheduled", async ({ page }) => {
  await expect(page.getByText("Unscheduled Events")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Final day booking")).toBeVisible();
  await withE2EDb(async (db) => {
    const remainingEvents = await db.select().from(events).where(eq(events.tripId, structuralTripId!));
    const tripDays = await db.select().from(days).where(eq(days.tripId, structuralTripId!));
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

Then("the removed day's events are deleted after the date change", async ({ page }) => {
  await expect(page.getByText("Sun, Aug 2")).not.toBeVisible({ timeout: 10_000 });
  await withE2EDb(async (db) => {
    const tripDays = await db.select().from(days).where(eq(days.tripId, structuralTripId!));
    const remainingEvents = await db.select().from(events).where(eq(events.tripId, structuralTripId!));
    const [trip] = await db.select().from(trips).where(eq(trips.id, structuralTripId!));
    expect(tripDays).toHaveLength(1);
    expect(remainingEvents).toHaveLength(0);
    expect(trip.endDate).toBe("2026-08-01");
  });
});
