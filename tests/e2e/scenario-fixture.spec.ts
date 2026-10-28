import { eq } from "drizzle-orm";
import { expect } from "@playwright/test";
import { test } from "./fixtures";
import { sql } from "drizzle-orm";
import { days, documents, events, expenses, packingTemplates, trips, users } from "../../src/db/schema";
import { cleanupScenarioFixtureContext, createScenarioFixtureContext } from "./scenario-fixture";
import { withE2EDb } from "./e2e-db";
import { E2E_TRIP_START_DATE, THREE_DAY_TRIP_MOTHER, cloneTripMother, cloneUserMother } from "./e2e-seed-data";
import { validateUsername } from "../../src/lib/username";

// Self-tests for the scenario-fixture infrastructure (mothers, unique naming, materialize/cleanup).
// These run as their own Playwright project (see playwright.config.ts) rather than a second Vitest
// process: the DB-backed cases need the live arrivo_e2e schema, and running them under Playwright —
// after global-setup has migrated and seeded the DB — keeps them out of the hermetic unit/coverage
// Vitest run and avoids two concurrent Vitest processes racing Vite's shared temp dir.
test.describe("E2E scenario fixtures", () => {
  test("materializes unfinished accounts without a password", async ({ scenario }) => {
    const result = await scenario.materialize({
      user: { setCurrent: false, overrides: { user: { setupComplete: false } } },
    });
    const [created] = await withE2EDb((database) =>
      database.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, result.user!.id))
    );
    expect(created.passwordHash).toBeNull();
  });
  test("selects the regular worker database before scenario queries", async ({ bootstrapDatabase }) => {
    expect(bootstrapDatabase).toBe(false);
    const expectedName = new URL(process.env.E2E_DATABASE_URL!).pathname.slice(1);
    expect(expectedName.endsWith("_bootstrap")).toBe(false);
    const result = await withE2EDb((db) => db.execute(sql`select current_database() as name`));
    expect(result[0].name).toBe(expectedName);
  });
  test("materializes the requested instance role", async () => {
    const context = createScenarioFixtureContext(test.info());
    try {
      const result = await context.materialize({ user: { overrides: { user: { role: "admin" } } } });
      const [created] = await withE2EDb((db) =>
        db.select({ role: users.role }).from(users).where(eq(users.id, result.user!.id))
      );
      expect(created.role).toBe("admin");
    } finally {
      await cleanupScenarioFixtureContext(context);
    }
  });
  test("clones trip mothers without mutating the base object", () => {
    const clone = cloneTripMother("threeDayTrip", {
      trip: { name: "Mutated Trip" },
      days: [{ dayNumber: 1, date: E2E_TRIP_START_DATE, label: "Day 1" }],
    });

    expect(clone.trip.name).toBe("Mutated Trip");
    expect(THREE_DAY_TRIP_MOTHER.trip.name).toBe("E2E Test Trip");
    expect(THREE_DAY_TRIP_MOTHER.days).toHaveLength(3);
  });

  test("creates unique names and valid usernames per scenario context", async () => {
    const context = createScenarioFixtureContext(test.info());
    const firstName = context.uniqueName("Trip");
    const secondName = context.uniqueName("Trip");
    const firstUsername = context.uniqueUsername("E2E Scenario User With A Long Name");
    const secondUsername = context.uniqueUsername("E2E Scenario User With A Long Name");

    expect(firstName).not.toBe(secondName);
    expect(firstUsername).not.toBe(secondUsername);
    expect(validateUsername(firstUsername)).toBeNull();

    await cleanupScenarioFixtureContext(context);
  });

  test("materializes scenario-owned rows and cleans up only owned rows", async () => {
    const context = createScenarioFixtureContext(test.info());
    const foreignUser = cloneUserMother("default");
    const foreignUsername = `foreign-${Date.now()}`;

    const [foreignRow] = await withE2EDb(async (db) =>
      db
        .insert(users)
        .values({
          username: foreignUsername,
          name: foreignUser.user.name,
          passwordHash: "foreign-hash",
          dateFormat: foreignUser.user.dateFormat,
          currency: foreignUser.user.currency ?? "USD",
        })
        .returning({ id: users.id })
    );

    const result = await context.materialize({
      user: { setCurrent: true },
      trip: {
        mother: "threeDayTrip",
        overrides: {
          trip: { name: "Scenario Fixture Trip" },
        },
        setCurrent: true,
      },
      template: {
        mother: "emptyTemplate",
        overrides: {
          template: { name: "Scenario Fixture Template" },
        },
      },
    });

    expect(result.user?.id).toBeTruthy();
    expect(result.trip?.id).toBeTruthy();
    expect(result.template?.id).toBeTruthy();

    await withE2EDb(async (db) => {
      const [createdUser] = await db.select({ id: users.id }).from(users).where(eq(users.id, result.user!.id));
      const [createdTrip] = await db.select({ id: trips.id }).from(trips).where(eq(trips.id, result.trip!.id));
      const createdDays = await db.select({ id: days.id }).from(days).where(eq(days.tripId, result.trip!.id));
      const [createdTemplate] = await db
        .select({ id: packingTemplates.id })
        .from(packingTemplates)
        .where(eq(packingTemplates.id, result.template!.id));
      const [unownedUser] = await db.select({ id: users.id }).from(users).where(eq(users.id, foreignRow.id));

      expect(createdUser).toBeTruthy();
      expect(createdTrip).toBeTruthy();
      expect(createdDays).toHaveLength(3);
      expect(createdTemplate).toBeTruthy();
      expect(unownedUser).toBeTruthy();
    });

    await cleanupScenarioFixtureContext(context);

    await withE2EDb(async (db) => {
      const deletedUsers = await db.select({ id: users.id }).from(users).where(eq(users.id, result.user!.id));
      const deletedTrips = await db.select({ id: trips.id }).from(trips).where(eq(trips.id, result.trip!.id));
      const deletedTemplates = await db
        .select({ id: packingTemplates.id })
        .from(packingTemplates)
        .where(eq(packingTemplates.id, result.template!.id));
      const [survivingForeignUser] = await db.select({ id: users.id }).from(users).where(eq(users.id, foreignRow.id));

      expect(deletedUsers).toHaveLength(0);
      expect(deletedTrips).toHaveLength(0);
      expect(deletedTemplates).toHaveLength(0);
      expect(survivingForeignUser).toBeTruthy();

      await db.delete(users).where(eq(users.id, foreignRow.id));
    });
  });

  test("links documents and expenses to a named event via eventName, while an unlinked expense stays trip-level", async () => {
    const context = createScenarioFixtureContext(test.info());

    try {
      const result = await context.materialize({
        user: { setCurrent: true },
        trip: {
          mother: "threeDayTrip",
          overrides: {
            trip: { name: "Event Linkage Fixture Trip" },
            events: [{ name: "Linked Event", position: 0, dayNumber: 1 }],
            documents: [
              { name: "Linked Doc", kind: "pdf", url: "https://example.com/linked-doc.pdf", eventName: "Linked Event" },
            ],
            expenses: [
              {
                category: "activity",
                amount: 10,
                currency: "USD",
                date: E2E_TRIP_START_DATE,
                eventName: "Linked Event",
              },
              { category: "activity", amount: 20, currency: "USD", date: E2E_TRIP_START_DATE },
            ],
          },
          setCurrent: true,
        },
      });

      expect(result.trip?.id).toBeTruthy();

      await withE2EDb(async (db) => {
        const [linkedEvent] = await db.select({ id: events.id }).from(events).where(eq(events.tripId, result.trip!.id));
        expect(linkedEvent).toBeTruthy();

        const tripDocuments = await db.select().from(documents).where(eq(documents.eventId, linkedEvent.id));
        expect(tripDocuments).toHaveLength(1);
        expect(tripDocuments[0].name).toBe("Linked Doc");
        expect(tripDocuments[0].eventId).toBe(linkedEvent.id);

        const tripExpenses = await db.select().from(expenses).where(eq(expenses.tripId, result.trip!.id));
        expect(tripExpenses).toHaveLength(2);
        const linkedExpense = tripExpenses.find((expense) => expense.amount === "10.00");
        const unlinkedExpense = tripExpenses.find((expense) => expense.amount === "20.00");
        expect(linkedExpense?.eventId).toBe(linkedEvent.id);
        expect(unlinkedExpense?.eventId).toBeNull();
      });
    } finally {
      await cleanupScenarioFixtureContext(context);
    }
  });

  test("rejects event-linked rows without exactly one matching event", async () => {
    const context = createScenarioFixtureContext(test.info());

    try {
      await expect(
        context.materialize({
          trip: {
            mother: "threeDayTrip",
            overrides: {
              documents: [
                {
                  name: "Missing Event Doc",
                  kind: "pdf",
                  url: "https://example.com/missing-event.pdf",
                  eventName: "Missing Event",
                },
              ],
            },
          },
        })
      ).rejects.toThrow('Cannot seed document for missing event "Missing Event".');

      await expect(
        context.materialize({
          trip: {
            mother: "threeDayTrip",
            overrides: {
              events: [
                { name: "Duplicate Event", position: 0, dayNumber: 1 },
                { name: "Duplicate Event", position: 1, dayNumber: 1 },
              ],
              expenses: [
                {
                  category: "activity",
                  amount: 10,
                  currency: "USD",
                  date: E2E_TRIP_START_DATE,
                  eventName: "Duplicate Event",
                },
              ],
            },
          },
        })
      ).rejects.toThrow('Cannot seed expense for duplicate event name "Duplicate Event".');
    } finally {
      await cleanupScenarioFixtureContext(context);
    }
  });
});
