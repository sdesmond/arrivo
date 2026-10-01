import { expect, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { collaborators, days, events, expenses, itineraryNotes, trips, users } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { Given, When, Then } from "../fixtures";
import type { ScenarioFixtureContext, ScenarioTripRecord } from "../scenario-fixture";

const PLANNED_EVENT_NAME = "Tea ceremony";
const PLANNED_TRIP_START = "2026-10-01";
const PLANNED_TRIP_END = "2026-10-02";

// Materializes a trip owned by a different (freshly created) user, with the current scenario user
// added as a collaborator at the given role. Mirrors the raw-insert pattern used for pending
// invitations — assertTripAccess resolves role from the `collaborators` row, so the fixture needs a
// real second-owner trip rather than one materialized through the current-user-owned trip mother.
async function seedSharedTrip(
  scenario: ScenarioFixtureContext,
  tripName: string,
  ownerName: string,
  collaboratorRole: "viewer" | "editor" | "manager",
  withPlannedDay = false
): Promise<ScenarioTripRecord> {
  const invitee = await scenario.ensureCurrentUser();
  const ownerEmail = scenario.uniqueEmail(`owner-${ownerName}`);

  const trip = await withE2EDb(async (db) => {
    const passwordHash = await bcrypt.hash(process.env.E2E_PASSWORD!, 10);
    const [owner] = await db
      .insert(users)
      .values({ email: ownerEmail, name: ownerName, passwordHash })
      .returning({ id: users.id });

    const [tripRow] = await db
      .insert(trips)
      .values({
        ownerId: owner.id,
        name: tripName,
        // Event times need dated days, so the planned-day trip is scheduled; the plain one stays dateless.
        ...(withPlannedDay ? { startDate: PLANNED_TRIP_START, endDate: PLANNED_TRIP_END } : {}),
      })
      .returning({ id: trips.id, name: trips.name, startDate: trips.startDate, endDate: trips.endDate });

    const [dayOne] = await db
      .insert(days)
      .values({ tripId: tripRow.id, dayNumber: 1, date: withPlannedDay ? PLANNED_TRIP_START : null, label: "Day 1" })
      .returning({ id: days.id });

    if (withPlannedDay) {
      // A second day gives the last day a Remove control for editors; the first holds a fully filled
      // event (time, location, cost), an empty one, and a note, so both kinds of chip are exercised.
      await db.insert(days).values({ tripId: tripRow.id, dayNumber: 2, date: PLANNED_TRIP_END, label: "Day 2" });
      const [teaCeremony] = await db
        .insert(events)
        .values([
          {
            tripId: tripRow.id,
            dayId: dayOne.id,
            name: PLANNED_EVENT_NAME,
            startAt: new Date("2026-10-01T10:00:00.000Z"),
            endAt: new Date("2026-10-01T11:00:00.000Z"),
            locationName: "Gora Park",
            locationAddress: "1300 Gora, Hakone",
            position: 0,
          },
          { tripId: tripRow.id, dayId: dayOne.id, name: "Bamboo grove", position: 1 },
        ])
        .returning({ id: events.id });
      await db.insert(expenses).values({
        tripId: tripRow.id,
        eventId: teaCeremony.id,
        category: "activity",
        amount: "40.00",
        currency: "USD",
        date: "2026-10-01",
      });
      await db.insert(itineraryNotes).values({ dayId: dayOne.id, position: 2, content: "Bring cash" });
    }

    await db.insert(collaborators).values([
      {
        tripId: tripRow.id,
        userId: owner.id,
        email: ownerEmail,
        name: ownerName,
        initials: ownerName.slice(0, 2).toUpperCase(),
        role: "manager",
        isCreator: true,
      },
      {
        tripId: tripRow.id,
        userId: invitee.id,
        email: invitee.email,
        name: invitee.name,
        initials: invitee.initials,
        role: collaboratorRole,
        isCreator: false,
      },
    ]);

    // Deleting the owner cascades their trip and both collaborator rows.
    return { ownerId: owner.id, tripRow };
  });

  scenario.registerCleanup({ entity: "user", id: trip.ownerId });

  const tripRecord: ScenarioTripRecord = {
    id: trip.tripRow.id,
    name: trip.tripRow.name,
    startDate: trip.tripRow.startDate ?? null,
    endDate: trip.tripRow.endDate ?? null,
  };
  scenario.setCurrentTrip(tripRecord);
  return tripRecord;
}

Given(
  "I am a viewer on {string} owned by {string} with a planned day",
  async ({ scenario }, tripName: string, ownerName: string) => {
    await seedSharedTrip(scenario, tripName, ownerName, "viewer", true);
  }
);

Given(
  "I am an editor on {string} owned by {string} with a planned day",
  async ({ scenario }, tripName: string, ownerName: string) => {
    await seedSharedTrip(scenario, tripName, ownerName, "editor", true);
  }
);

Given("I am a viewer on {string} owned by {string}", async ({ scenario }, tripName, ownerName) => {
  await seedSharedTrip(scenario, tripName, ownerName, "viewer");
});

Given("I am an editor on {string} owned by {string}", async ({ scenario }, tripName, ownerName) => {
  await seedSharedTrip(scenario, tripName, ownerName, "editor");
});

Given("I am a manager on {string} owned by {string}", async ({ scenario }, tripName, ownerName) => {
  await seedSharedTrip(scenario, tripName, ownerName, "manager");
});

When("I go to the shared trip", async ({ page, scenario }) => {
  await scenario.gotoCurrentTrip(page);
});

Then("I see the trip heading {string}", async ({ page }, tripName: string) => {
  await expect(page.getByRole("heading", { level: 1, name: tripName })).toBeVisible();
});

Then("I see a {string} tab", async ({ page }, tabName: string) => {
  await expect(page.getByRole("button", { name: tabName, exact: true })).toBeVisible();
});

Then("I do not see a {string} tab", async ({ page }, tabName: string) => {
  await expect(page.getByRole("button", { name: tabName, exact: true })).toHaveCount(0);
});

Then("I do not see the cover options control", async ({ page }) => {
  await expect(page.getByTitle("Cover options")).toHaveCount(0);
});

When("I open trip options for {string}", async ({ page }, tripName: string) => {
  const tripCard = page.locator("a[href^='/trips/']").filter({ hasText: tripName }).first();
  await expect(tripCard).toBeVisible();
  await tripCard.getByTitle("Trip options").click();
});

function eventRow(page: Page, eventName: string) {
  // Event rows are `div.group`; ancestors that also contain the name come first in DOM order, so the
  // last match is the row itself.
  return page
    .locator("div.group")
    .filter({ has: page.getByText(eventName, { exact: true }) })
    .last();
}

When("I open the first itinerary day", async ({ page }) => {
  const firstDayToggle = page
    .locator("button[aria-expanded]")
    .filter({ hasText: /\d+ stops/ })
    .first();
  await expect(firstDayToggle).toBeVisible();
  if ((await firstDayToggle.getAttribute("aria-expanded")) === "false") {
    await firstDayToggle.click();
  }
  await expect(page.getByText(PLANNED_EVENT_NAME)).toBeVisible();
});

// Viewers never receive expense data (the budget is manager/editor-only), so the cost chip is absent.
Then("I see the event {string} with its time and location but no cost", async ({ page }, eventName: string) => {
  const row = eventRow(page, eventName);
  await expect(row.getByText(/\d{1,2}:\d{2} [AP]M/).first()).toBeVisible();
  await expect(row.getByRole("button", { name: /Open directions to Gora Park/ })).toBeVisible();
  await expect(row.getByText("$40.00")).toHaveCount(0);
});

Then("clicking the time of {string} opens no dialog", async ({ page }, eventName: string) => {
  await eventRow(page, eventName)
    .getByText(/\d{1,2}:\d{2} [AP]M/)
    .first()
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

Then("I see no itinerary edit controls", async ({ page }) => {
  await expect(page.getByText("Bring cash")).toBeVisible();
  for (const label of [/^Add time$/, /^Add location$/, /^Add cost$/, /^Attach$/, /^Add Day$/, /Set trip dates/]) {
    await expect(page.getByRole("button", { name: label })).toHaveCount(0);
  }
  await expect(page.getByRole("button", { name: /add a place/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit location" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Remove day" })).toHaveCount(0);
  await expect(page.getByTitle("Delete event")).toHaveCount(0);
  await expect(page.getByTitle("Delete note")).toHaveCount(0);
  await expect(page.getByTitle("Insert item here")).toHaveCount(0);
});

Then("I see the itinerary edit controls", async ({ page }) => {
  const emptyEvent = eventRow(page, "Bamboo grove");
  await expect(emptyEvent.getByRole("button", { name: "Add time" })).toBeVisible();
  await expect(emptyEvent.getByTitle("Attach document")).toBeVisible();
  await expect(eventRow(page, PLANNED_EVENT_NAME).getByRole("button", { name: "Edit location" })).toBeVisible();
  await expect(page.getByTitle("Delete event").first()).toBeAttached();
  await expect(page.getByRole("button", { name: /add a place/i }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Day" })).toBeVisible();
});
