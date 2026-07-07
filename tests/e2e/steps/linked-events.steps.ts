import { expect, type Page } from "@playwright/test";
import { asc, eq } from "drizzle-orm";
import { days } from "../../../src/db/schema";
import {
  E2E_TRIP_START_DATE,
  E2E_TRIP_SECOND_DATE,
  E2E_TRIP_THIRD_DATE,
  e2eTripDate,
  e2eTripDateTime,
} from "../e2e-seed-data";
import type { DaySeed, EventSeed, ReservationSeed, TripMotherOverrides } from "../e2e-seed-data";
import { withE2EDb } from "../e2e-db";
import { Given, Then, When } from "../fixtures";

const EXTENSION_PROVIDER = "Extension Hotel";
const LINKED_EVENTS_DAYS = [
  { dayNumber: 1, date: E2E_TRIP_START_DATE, label: "Day 1" },
  { dayNumber: 2, date: E2E_TRIP_SECOND_DATE, label: "Day 2" },
  { dayNumber: 3, date: E2E_TRIP_THIRD_DATE, label: "Day 3" },
] satisfies DaySeed[];

function buildLinkedEventsTripOverrides(overrides: TripMotherOverrides = {}): TripMotherOverrides {
  return {
    trip: {
      startDate: E2E_TRIP_START_DATE,
      endDate: E2E_TRIP_THIRD_DATE,
      ...overrides.trip,
    },
    days: overrides.days ?? LINKED_EVENTS_DAYS,
    events: overrides.events as EventSeed[] | undefined,
    reservations: overrides.reservations as ReservationSeed[] | undefined,
    documents: overrides.documents,
    packingItems: overrides.packingItems,
    notes: overrides.notes,
    checklists: overrides.checklists,
  };
}

// Mirror getFloatingNow: take a Date's local wall-clock components and emit them
// as a UTC ISO string. Keeps seeded reservation times aligned with the Now Card's
// timezone-independent comparison.
function toFloatingIso(date: Date): string {
  return new Date(
    Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      date.getHours(),
      date.getMinutes(),
      date.getSeconds(),
      date.getMilliseconds()
    )
  ).toISOString();
}

async function ensureDayExpanded(page: Page, dayIndex: number): Promise<void> {
  const dayToggle = page.getByRole("button", { name: /stops?$/ }).nth(dayIndex - 1);
  const expanded = await dayToggle.getAttribute("aria-expanded");
  if (expanded === "false") {
    await dayToggle.click();
  }
}

async function openAddLodgingReservationDrawer(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Reservations", exact: true }).click();
  await page.getByRole("button", { name: "Add Reservation" }).click();
  await page.getByRole("menuitem", { name: "Lodging" }).click();
  await expect(page.getByText("Add Lodging Reservation")).toBeVisible({ timeout: 10_000 });
}

async function saveReservation(page: Page): Promise<void> {
  const saveButton = page.getByRole("button", { name: "Save" });
  await saveButton.focus();
  await saveButton.press("Enter");
  await expect(page.getByText("Add Lodging Reservation")).not.toBeVisible({ timeout: 10_000 });
}

async function selectCalendarDate(page: Page, ariaLabel: string, dateString: string): Promise<void> {
  const [yearString, monthString, dayString] = dateString.split("-");
  const year = Number(yearString);
  const month = Number(monthString);
  const day = Number(dayString);
  const today = new Date();
  const targetMonthIndex = year * 12 + (month - 1);
  const currentMonthIndex = today.getUTCFullYear() * 12 + today.getUTCMonth();
  const stepCount = targetMonthIndex - currentMonthIndex;
  const navButtonName = stepCount >= 0 ? /Go to the Next Month/i : /Go to the Previous Month/i;
  const targetDataDay = `${month}/${day}/${year}`;

  await page.getByLabel(ariaLabel).click();
  const popover = page.locator('[data-slot="popover-content"]').last();
  for (let attempt = 0; attempt < Math.abs(stepCount); attempt++) {
    if ((await popover.locator(`[data-day="${targetDataDay}"]`).count()) > 0) {
      break;
    }
    await popover.getByRole("button", { name: navButtonName }).click();
  }

  const targetDay = popover.locator(`[data-day="${targetDataDay}"]`).first();
  await expect(targetDay).toBeVisible({ timeout: 10_000 });
  await targetDay.click();
}

Given(
  "the trip has a Lodging reservation with Check-in on Day 1 and Check-out on Day 2",
  async ({ page, scenario }) => {
    await scenario.materialize({
      trip: {
        mother: "threeDayTrip",
        overrides: buildLinkedEventsTripOverrides({
          reservations: [
            {
              type: "lodging",
              provider: "Torel Avantgarde",
              startAt: e2eTripDateTime(0, "15:00:00"),
              endAt: e2eTripDateTime(1, "11:00:00"),
            },
          ],
        }),
        setCurrent: true,
      },
    });

    await scenario.gotoCurrentTrip(page);
  }
);

Given(
  "the trip has a Lodging reservation with Check-in on Day 1 and draggable events {string} and {string} on Day 1",
  async ({ page, scenario }, firstEventName: string, secondEventName: string) => {
    await scenario.materialize({
      trip: {
        mother: "threeDayTrip",
        overrides: buildLinkedEventsTripOverrides({
          reservations: [
            {
              type: "lodging",
              provider: "Torel Avantgarde",
              startAt: e2eTripDateTime(0, "15:00:00"),
              endAt: e2eTripDateTime(1, "11:00:00"),
            },
          ],
          events: [
            { name: firstEventName, position: 0, dayNumber: 1 },
            { name: secondEventName, position: 1, dayNumber: 1 },
          ],
        }),
        setCurrent: true,
      },
    });

    await scenario.gotoCurrentTrip(page);
    await ensureDayExpanded(page, 1);
  }
);

Given("the trip has a Flight reservation with Delta departing and arriving on Day 1", async ({ page, scenario }) => {
  await scenario.materialize({
    trip: {
      mother: "threeDayTrip",
      overrides: buildLinkedEventsTripOverrides({
        reservations: [
          {
            type: "flight",
            provider: "Delta",
            startAt: e2eTripDateTime(0, "18:00:00"),
            endAt: e2eTripDateTime(1, "02:00:00"),
          },
        ],
      }),
      setCurrent: true,
    },
  });

  await scenario.gotoCurrentTrip(page);
});

Given("I start from the default future three-day trip", async ({ page, scenario }) => {
  await scenario.materialize({
    trip: {
      mother: "threeDayTrip",
      overrides: buildLinkedEventsTripOverrides({
        reservations: [],
      }),
      setCurrent: true,
    },
  });

  await scenario.gotoCurrentTrip(page);
});

Given("the trip has a Lodging reservation whose Check-in is {string}", async ({ scenario }, window: string) => {
  const now = new Date();
  // The Now Card classifies events against a "floating" now (local wall-clock
  // reinterpreted as UTC — see getFloatingNow). Seed times the same way so the
  // comparison is timezone-independent; a true-UTC instant would shift by the
  // machine offset and read as the wrong window west of UTC. A 5-minute margin
  // absorbs the gap until the page sets its mock-date cookie.
  const checkInAt =
    window === "now" ? new Date(now.getTime() - 5 * 60 * 1000) : new Date(now.getTime() + 60 * 60 * 1000);
  const startAt = toFloatingIso(checkInAt);
  const endAt = toFloatingIso(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  const tripStartDate = toFloatingIso(now).slice(0, 10);
  const tripEndDate = toFloatingIso(new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000)).slice(0, 10);
  await scenario.materialize({
    trip: {
      mother: "threeDayTrip",
      overrides: {
        trip: {
          startDate: tripStartDate,
          endDate: tripEndDate,
        },
        reservations: [
          {
            type: "lodging",
            provider: "Torel Avantgarde",
            startAt,
            endAt,
          },
        ],
      },
      setCurrent: true,
    },
  });
});

When("I view the Itinerary tab", async ({ page }) => {
  const itineraryTab = page.getByRole("button", { name: "Itinerary" });
  if ((await itineraryTab.count()) > 0) {
    await itineraryTab.click();
  }
});

When("I view the trip list", async ({ page }) => {
  await page.context().addCookies([
    {
      name: "__packt_mock_date__",
      value: encodeURIComponent(new Date().toISOString()),
      url: "http://localhost:3001",
    },
  ]);
  await page.goto("/trips");
});

Then(
  "the Now Card shows the {string} Linked Event with the {string} pill and {string} badge",
  async ({ page }, eventName: string, pill: string, badgeText: string) => {
    const nowCard = page.locator('[data-testid="now-card"]');
    await expect(nowCard).toContainText(eventName);
    await expect(nowCard).toContainText(pill);
    await expect(nowCard).toContainText(badgeText);
  }
);

When(
  "I add a Lodging reservation from {string} at {string} to {string} at {string}",
  async ({ page }, startDate: string, startTime: string, endDate: string, endTime: string) => {
    await openAddLodgingReservationDrawer(page);
    await page.getByLabel("Provider *").fill(EXTENSION_PROVIDER);
    await selectCalendarDate(page, "Check-in date", startDate);
    await page.getByLabel("Check-in time").fill(startTime);
    await selectCalendarDate(page, "Check-out date", endDate);
    await page.getByLabel("Check-out time").fill(endTime);
    await saveReservation(page);
  }
);

When(
  "I add a Lodging reservation from the day before the trip at {string} to trip day 1 at {string}",
  async ({ page }, startTime: string, endTime: string) => {
    await openAddLodgingReservationDrawer(page);
    await page.getByLabel("Provider *").fill(EXTENSION_PROVIDER);
    await selectCalendarDate(page, "Check-in date", e2eTripDate(-1));
    await page.getByLabel("Check-in time").fill(startTime);
    await selectCalendarDate(page, "Check-out date", E2E_TRIP_START_DATE);
    await page.getByLabel("Check-out time").fill(endTime);
    await saveReservation(page);
  }
);

When(
  "I add a Lodging reservation from the day after the trip at {string} to two days after the trip at {string}",
  async ({ page }, startTime: string, endTime: string) => {
    await openAddLodgingReservationDrawer(page);
    await page.getByLabel("Provider *").fill(EXTENSION_PROVIDER);
    await selectCalendarDate(page, "Check-in date", e2eTripDate(3));
    await page.getByLabel("Check-in time").fill(startTime);
    await selectCalendarDate(page, "Check-out date", e2eTripDate(4));
    await page.getByLabel("Check-out time").fill(endTime);
    await saveReservation(page);
  }
);

Then(
  "I see a {string} Linked Event on Day 1 with a Hotel icon and a {string} badge",
  async ({ page }, anchorLabel: string, badgeText: string) => {
    await ensureDayExpanded(page, 1);
    await expect(page.getByText(`${anchorLabel} — Torel Avantgarde`)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(badgeText).first()).toBeVisible({ timeout: 10_000 });
  }
);

Then(
  "I see a {string} Linked Event on Day 2 with a Hotel icon and a {string} badge",
  async ({ page }, anchorLabel: string, badgeText: string) => {
    await ensureDayExpanded(page, 2);
    await expect(page.getByText(`${anchorLabel} — Torel Avantgarde`)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(badgeText).first()).toBeVisible({ timeout: 10_000 });
  }
);

Then("I see a new Day {int} with a {string} Linked Event", async ({ page }, dayNumber: number, anchorLabel: string) => {
  await ensureDayExpanded(page, dayNumber);
  await expect(page.getByText(`Day ${dayNumber}`)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(`${anchorLabel} — ${EXTENSION_PROVIDER}`)).toBeVisible({ timeout: 10_000 });
});

Then("the previous Day {int} is now Day {int}", async ({ scenario }, oldDayNumber: number, newDayNumber: number) => {
  const currentTrip = scenario.currentTrip;
  if (!currentTrip) {
    throw new Error("Missing current scenario trip.");
  }
  if (!currentTrip.startDate) {
    throw new Error("Scenario trip has no startDate to compare against.");
  }

  await withE2EDb(async (database) => {
    const tripDays = await database
      .select({ dayNumber: days.dayNumber, date: days.date })
      .from(days)
      .where(eq(days.tripId, currentTrip.id))
      .orderBy(asc(days.dayNumber));

    const shiftedDay = tripDays.find((day) => day.dayNumber === newDayNumber);
    expect(shiftedDay?.date).toBe(currentTrip.startDate);
  });
});

Then(
  "I see a single {string} Linked Event on Day 1 with a Plane icon and a {string} badge",
  async ({ page }, provider: string, badgeText: string) => {
    await ensureDayExpanded(page, 1);
    await expect(page.getByText(provider, { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(badgeText).first()).toBeVisible({ timeout: 10_000 });
  }
);

Then(
  "I do not see separate {string} or {string} Linked Events on Day 1",
  async ({ page }, first: string, second: string) => {
    await ensureDayExpanded(page, 1);
    await expect(page.getByText(first, { exact: false })).not.toBeVisible();
    await expect(page.getByText(second, { exact: false })).not.toBeVisible();
  }
);

When("I tap the itinerary reservations CTA", async ({ page }) => {
  await page.getByRole("button", { name: /opens the Reservations tab/i }).click();
});

When("I tap the {string} Linked Event on Day 1", async ({ page }, anchorLabel: string) => {
  await ensureDayExpanded(page, 1);
  await page.getByRole("button", { name: new RegExp(`^${anchorLabel}.*Linked, opens Reservations`) }).click();
});

Then("I land on the Reservations tab with the reservation type picker open", async ({ page }) => {
  await expect(page).toHaveURL(/tab=res/);
  await expect(page.getByRole("menuitem", { name: "Lodging" })).toBeVisible({ timeout: 10_000 });
});

Then(
  "I land on the Reservations tab with the {string} section expanded and the {string} row highlighted",
  async ({ page }, typeLabel: string, providerName: string) => {
    await expect(page).toHaveURL(/tab=res/);
    await expect(
      page.getByRole("button", { name: new RegExp(`^${typeLabel}, \\d+ reservations?, expanded`) })
    ).toBeVisible({ timeout: 10_000 });

    const row = page.locator('[data-testid^="reservation-row-"]').filter({ hasText: providerName });
    await expect(row).toBeFocused({ timeout: 10_000 });
  }
);
