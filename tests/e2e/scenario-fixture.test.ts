import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { TestInfo } from "@playwright/test";
import { days, packingTemplates, trips, users } from "../../src/db/schema";
import { cleanupScenarioFixtureContext, createScenarioFixtureContext } from "./scenario-fixture";
import { withE2EDb } from "./e2e-db";
import { THREE_DAY_TRIP_MOTHER, cloneTripMother, cloneUserMother } from "./e2e-seed-data";

function fakeTestInfo(title: string, testId: string): TestInfo {
  return { title, testId } as TestInfo;
}

describe("E2E scenario fixtures", () => {
  it("clones trip mothers without mutating the base object", () => {
    const clone = cloneTripMother("threeDayTrip", {
      trip: { name: "Mutated Trip" },
      days: [{ dayNumber: 1, date: "2026-09-01", label: "Day 1" }],
    });

    expect(clone.trip.name).toBe("Mutated Trip");
    expect(THREE_DAY_TRIP_MOTHER.trip.name).toBe("E2E Test Trip");
    expect(THREE_DAY_TRIP_MOTHER.days).toHaveLength(3);
  });

  it("creates unique names and emails per scenario context", async () => {
    const context = createScenarioFixtureContext(fakeTestInfo("Unique Fixture Scenario", "unique-fixture-scenario"));
    const firstName = context.uniqueName("Trip");
    const secondName = context.uniqueName("Trip");
    const firstEmail = context.uniqueEmail("user");
    const secondEmail = context.uniqueEmail("user");

    expect(firstName).not.toBe(secondName);
    expect(firstEmail).not.toBe(secondEmail);
    expect(firstEmail).toMatch(/@packt\.local$/);

    await cleanupScenarioFixtureContext(context);
  });

  it("materializes scenario-owned rows and cleans up only owned rows", async () => {
    const context = createScenarioFixtureContext(fakeTestInfo("Materialize And Cleanup", "materialize-and-cleanup"));
    const foreignUser = cloneUserMother("default");
    const foreignEmail = `foreign-${Date.now()}@packt.local`;

    const [foreignRow] = await withE2EDb(async (db) =>
      db
        .insert(users)
        .values({
          email: foreignEmail,
          name: foreignUser.user.name,
          passwordHash: "foreign-hash",
          dateFormat: foreignUser.user.dateFormat,
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
});
